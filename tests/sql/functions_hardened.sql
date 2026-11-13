CREATE OR REPLACE FUNCTION public.record_clash_war_events(p_events jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    item jsonb;
    inserted_key text;
    new_event_id text;
    inserted_count integer := 0;
begin
    if jsonb_typeof(p_events) <> 'array' then
        raise exception 'p_events precisa ser um array JSON';
    end if;


    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_events) x(source_key text,player text,player_tag text,category text,activity text,points integer)
      LEFT JOIN players p ON upper(trim(p.player_tag))=upper(trim(x.player_tag))
      WHERE nullif(trim(x.source_key),'') IS NULL OR nullif(trim(x.player),'') IS NULL OR nullif(trim(x.player_tag),'') IS NULL
      OR nullif(trim(x.category),'') IS NULL OR nullif(trim(x.activity),'') IS NULL OR x.points IS NULL
      OR p.player_tag IS NULL OR p.active IS DISTINCT FROM true OR lower(trim(p.name))<>lower(trim(x.player)))
      THEN RAISE EXCEPTION 'Lote de guerra inválido ou identidade divergente'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_events) x(source_key text) GROUP BY source_key HAVING count(*)>1)
      THEN RAISE EXCEPTION 'source_key duplicada no lote de guerra'; END IF;
    for item in select value from jsonb_array_elements(p_events)
    loop
        if nullif(item->>'source_key', '') is null
           or nullif(item->>'player', '') is null
           or nullif(item->>'category', '') is null
           or nullif(item->>'activity', '') is null
           or (item->>'points') is null then
            raise exception 'Evento automático incompleto: %', item;
        end if;

        inserted_key := null;
        insert into public.clash_war_automation
            (source_key, war_key, player_tag)
        values
            (item->>'source_key', item->>'war_key', item->>'player_tag')
        on conflict (source_key) do nothing
        returning source_key into inserted_key;

        if inserted_key is not null then
            insert into public.events (player, category, activity, points)
            values (
                item->>'player',
                item->>'category',
                item->>'activity',
                (item->>'points')::integer
            )
            returning id::text into new_event_id;

            update public.clash_war_automation
            set event_id = new_event_id
            where source_key = inserted_key;

            inserted_count := inserted_count + 1;
        end if;
    end loop;

    return jsonb_build_object('inserted', inserted_count);
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_clash_league_events(p_events jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    item JSONB;
    v_key TEXT;
    v_tag TEXT;
    v_player TEXT;
    v_war TEXT;
    v_activity TEXT;
    v_points INTEGER;
    v_event_id TEXT;
    v_inserted INTEGER := 0;
    v_skipped INTEGER := 0;
BEGIN
    IF jsonb_typeof(p_events) <> 'array' THEN
        RAISE EXCEPTION 'Formato de eventos inválido';
    END IF;


    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_events) x(source_key text,player_tag text,player text,war_key text)
      JOIN players p ON upper(trim(p.player_tag))=upper(trim(x.player_tag))
      WHERE lower(trim(p.name))<>lower(trim(x.player)))
      THEN RAISE EXCEPTION 'Nome do jogador não corresponde à tag'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_events) x(source_key text,player_tag text,player text,war_key text)
      LEFT JOIN players p ON upper(trim(p.player_tag))=upper(trim(x.player_tag)) AND p.active=true WHERE p.player_tag IS NULL)
      THEN RAISE EXCEPTION 'Jogador da Liga inexistente ou inativo'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_events) x(source_key text) GROUP BY source_key HAVING count(*)>1)
      THEN RAISE EXCEPTION 'source_key duplicada no lote da Liga'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('clan_evento_league_monthly_cap'));

    FOR item IN SELECT value FROM jsonb_array_elements(p_events)
    LOOP
        v_key := item->>'source_key';
        v_tag := item->>'player_tag';
        v_player := item->>'player';
        v_war := item->>'war_key';
        v_activity := item->>'activity';
        v_points := COALESCE((item->>'points')::INTEGER, 0);

        IF COALESCE(v_key, '') = ''
           OR COALESCE(v_tag, '') = ''
           OR COALESCE(v_player, '') = ''
           OR COALESCE(v_war, '') = '' THEN
            RAISE EXCEPTION 'Dados incompletos no evento';
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.clash_league_automation WHERE source_key = v_key
        ) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.player_tag = v_tag AND p.active = TRUE
        ) THEN
            INSERT INTO public.clash_league_automation(source_key, war_key, player_tag, event_id)
            VALUES (v_key, v_war, v_tag, NULL)
            ON CONFLICT (source_key) DO NOTHING;
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        v_event_id := NULL;

        -- Pontos positivos e negativos são lançados; zero apenas marca a origem.
        IF v_points <> 0 THEN
            INSERT INTO public.events(player, category, activity, points)
            VALUES (v_player, 'Liga dos Clãs', v_activity, v_points)
            RETURNING id::TEXT INTO v_event_id;
            v_inserted := v_inserted + 1;
        ELSE
            v_skipped := v_skipped + 1;
        END IF;

        INSERT INTO public.clash_league_automation(source_key, war_key, player_tag, event_id)
        VALUES (v_key, v_war, v_tag, v_event_id)
        ON CONFLICT (source_key) DO NOTHING;
    END LOOP;

    RETURN jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_clash_donations(p_month_key text, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    item record;
    ranking record;
    new_event_id bigint;
    tracked_count integer;
    events_count integer := 0;
BEGIN
    IF p_month_key IS NULL
       OR p_month_key !~ '^\d{4}-\d{2}$' THEN
        RAISE EXCEPTION 'Mês inválido.';
    END IF;

    IF jsonb_typeof(p_snapshot) <> 'array' THEN
        RAISE EXCEPTION 'Snapshot de doações inválido.';
    END IF;


    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_snapshot) x(player_tag text,player text,donations bigint)
      LEFT JOIN players p ON upper(trim(p.player_tag))=upper(trim(x.player_tag))
      WHERE nullif(trim(x.player_tag),'') IS NULL OR nullif(trim(x.player),'') IS NULL OR x.donations IS NULL OR x.donations<0
      OR p.player_tag IS NULL OR lower(trim(p.name))<>lower(trim(x.player)))
      THEN RAISE EXCEPTION 'Snapshot de doações inválido ou identidade divergente'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_snapshot) x(player_tag text) GROUP BY upper(trim(player_tag)) HAVING count(*)>1)
      THEN RAISE EXCEPTION 'Tags duplicadas no snapshot de doações'; END IF;
    -- Atualiza o acumulado mensal usando a diferença entre consultas.
    -- Se o contador da temporada reiniciar, considera o valor atual
    -- como um novo incremento.
    FOR item IN
        SELECT *
        FROM jsonb_to_recordset(p_snapshot)
             AS x(player_tag text, player text, donations bigint)
    LOOP
        IF item.player_tag IS NULL
           OR item.player IS NULL
           OR item.donations IS NULL
           OR item.donations < 0 THEN
            RAISE EXCEPTION 'Registro de doação inválido.';
        END IF;

        INSERT INTO public.clash_donation_totals (
            month_key,
            player_tag,
            player,
            total_donated,
            last_api_donations,
            updated_at
        )
        VALUES (
            p_month_key,
            item.player_tag,
            item.player,
            item.donations,
            item.donations,
            now()
        )
        ON CONFLICT (month_key, player_tag) DO UPDATE
        SET total_donated =
                public.clash_donation_totals.total_donated
                + CASE
                    WHEN excluded.last_api_donations
                         >= public.clash_donation_totals.last_api_donations
                    THEN excluded.last_api_donations
                         - public.clash_donation_totals.last_api_donations
                    ELSE excluded.last_api_donations
                  END,
            last_api_donations = excluded.last_api_donations,
            player = excluded.player,
            updated_at = now();
    END LOOP;

    -- Remove somente os eventos automáticos anteriores deste mês.
    DELETE FROM public.events e
    USING public.clash_donation_events d
    WHERE d.month_key = p_month_key
      AND e.id = d.event_id;

    DELETE FROM public.clash_donation_events
    WHERE month_key = p_month_key;

    -- Gera um registro com a quantidade real de tropas doadas.
    -- Somente jogadores ativos participam.
    FOR ranking IN
        SELECT
            d.player_tag,
            d.player,
            d.total_donated
        FROM public.clash_donation_totals d
        INNER JOIN public.players p
            ON p.player_tag = d.player_tag
        WHERE d.month_key = p_month_key
          AND d.total_donated > 0
          AND p.active = TRUE
        ORDER BY d.player_tag
    LOOP
        INSERT INTO public.events (
            player,
            category,
            activity,
            points,
            created_at
        )
        VALUES (
            ranking.player,
            'Doações',
            'TROPAS_DOADAS: sincronização automática mensal',
            LEAST(ranking.total_donated, 2147483647)::integer,
            now()
        )
        RETURNING id INTO new_event_id;

        INSERT INTO public.clash_donation_events (
            month_key,
            player_tag,
            event_id,
            points
        )
        VALUES (
            p_month_key,
            ranking.player_tag,
            new_event_id,
            LEAST(ranking.total_donated, 2147483647)::integer
        );

        events_count := events_count + 1;
    END LOOP;

    SELECT COUNT(*)
    INTO tracked_count
    FROM public.clash_donation_totals
    WHERE month_key = p_month_key;

    RETURN jsonb_build_object(
        'month_key', p_month_key,
        'players_tracked', tracked_count,
        'events_created', events_count
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_player_monthly_stat_sources(p_sources jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_month text;
    v_tag text;
    v_player text;
BEGIN
    IF jsonb_typeof(p_sources) <> 'array' THEN
        RAISE EXCEPTION 'p_sources precisa ser uma lista JSON';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_sources) x(month_key text,source_key text,player_tag text,player text,war_attacks integer,league_attacks integer,raid_attacks integer)
      LEFT JOIN public.players p ON upper(trim(p.player_tag))=upper(trim(x.player_tag))
      WHERE x.month_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])

    INSERT INTO public.player_monthly_stat_sources (
        month_key, source_key, player_tag, player,
        war_attacks, league_attacks, raid_attacks, updated_at
    )
    SELECT
        x.month_key,
        x.source_key,
        x.player_tag,
        x.player,
        x.war_attacks,
        x.league_attacks,
        x.raid_attacks,
        now()
    FROM jsonb_to_recordset(p_sources) AS x(
        month_key text,
        source_key text,
        player_tag text,
        player text,
        war_attacks integer,
        league_attacks integer,
        raid_attacks integer
    )
    ON CONFLICT (month_key, source_key)
    DO UPDATE SET
        player_tag = EXCLUDED.player_tag,
        player = EXCLUDED.player,
        war_attacks = EXCLUDED.war_attacks,
        league_attacks = EXCLUDED.league_attacks,
        raid_attacks = EXCLUDED.raid_attacks,
        updated_at = now();

    FOR v_month, v_tag, v_player IN
        SELECT DISTINCT month_key, player_tag, player
        FROM public.player_monthly_stat_sources
        WHERE (month_key, player_tag) IN (
            SELECT DISTINCT
                value->>'month_key',
                value->>'player_tag'
            FROM jsonb_array_elements(p_sources)
        )
    LOOP
        INSERT INTO public.player_monthly_stats (
            month_key, player_tag, player,
            war_attacks, league_attacks, raid_attacks, updated_at
        )
        SELECT
            v_month,
            v_tag,
            v_player,
            COALESCE(SUM(war_attacks), 0),
            COALESCE(SUM(league_attacks), 0),
            COALESCE(SUM(raid_attacks), 0),
            now()
        FROM public.player_monthly_stat_sources
        WHERE month_key = v_month
          AND player_tag = v_tag
        ON CONFLICT (month_key, player_tag)
        DO UPDATE SET
            player = EXCLUDED.player,
            war_attacks = EXCLUDED.war_attacks,
            league_attacks = EXCLUDED.league_attacks,
            raid_attacks = EXCLUDED.raid_attacks,
            updated_at = now();
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'sources_received', jsonb_array_length(p_sources)
    );
END;
$function$;
         OR nullif(trim(x.source_key),'') IS NULL OR nullif(trim(x.player_tag),'') IS NULL
         OR nullif(trim(x.player),'') IS NULL OR p.player_tag IS NULL
         OR lower(trim(p.name))<>lower(trim(x.player))
         OR coalesce(x.war_attacks,0)<0 OR coalesce(x.league_attacks,0)<0 OR coalesce(x.raid_attacks,0)<0
    ) THEN RAISE EXCEPTION 'Fontes mensais inválidas ou identidade divergente'; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_sources) x(month_key text,source_key text)
      GROUP BY month_key,source_key HAVING count(*)>1
    ) THEN RAISE EXCEPTION 'Fonte mensal duplicada no lote'; END IF;


    INSERT INTO public.player_monthly_stat_sources (
        month_key, source_key, player_tag, player,
        war_attacks, league_attacks, raid_attacks, updated_at
    )
    SELECT
        x.month_key,
        x.source_key,
        x.player_tag,
        x.player,
        x.war_attacks,
        x.league_attacks,
        x.raid_attacks,
        now()
    FROM jsonb_to_recordset(p_sources) AS x(
        month_key text,
        source_key text,
        player_tag text,
        player text,
        war_attacks integer,
        league_attacks integer,
        raid_attacks integer
    )
    ON CONFLICT (month_key, source_key)
    DO UPDATE SET
        player_tag = EXCLUDED.player_tag,
        player = EXCLUDED.player,
        war_attacks = EXCLUDED.war_attacks,
        league_attacks = EXCLUDED.league_attacks,
        raid_attacks = EXCLUDED.raid_attacks,
        updated_at = now();

    FOR v_month, v_tag, v_player IN
        SELECT DISTINCT month_key, player_tag, player
        FROM public.player_monthly_stat_sources
        WHERE (month_key, player_tag) IN (
            SELECT DISTINCT
                value->>'month_key',
                value->>'player_tag'
            FROM jsonb_array_elements(p_sources)
        )
    LOOP
        INSERT INTO public.player_monthly_stats (
            month_key, player_tag, player,
            war_attacks, league_attacks, raid_attacks, updated_at
        )
        SELECT
            v_month,
            v_tag,
            v_player,
            COALESCE(SUM(war_attacks), 0),
            COALESCE(SUM(league_attacks), 0),
            COALESCE(SUM(raid_attacks), 0),
            now()
        FROM public.player_monthly_stat_sources
        WHERE month_key = v_month
          AND player_tag = v_tag
        ON CONFLICT (month_key, player_tag)
        DO UPDATE SET
            player = EXCLUDED.player,
            war_attacks = EXCLUDED.war_attacks,
            league_attacks = EXCLUDED.league_attacks,
            raid_attacks = EXCLUDED.raid_attacks,
            updated_at = now();
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'sources_received', jsonb_array_length(p_sources)
    );
END;
$function$;