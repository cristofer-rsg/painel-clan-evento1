-- Captured read-only from GhostHunt production on 2026-11-13.
-- This file is applied only to the disposable PostgreSQL test service.
-- It is not a migration and must never be applied to production.

CREATE OR REPLACE FUNCTION public.auto_sync_clash_games(p_month_key text, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    item record;
    row_data record;
    current_active_month text;
    detected_start boolean := false;
    started_now boolean := false;
    tracked_count integer := 0;
    event_count integer := 0;
    event_row_id bigint;
    award integer;
    earned bigint;
    previous_value bigint;
begin
    if p_month_key is null or p_month_key !~ '^\d{4}-\d{2}$' then
        raise exception 'Mes invalido.';
    end if;

    if jsonb_typeof(p_snapshot) <> 'array'
       or jsonb_array_length(p_snapshot) = 0 then
        raise exception 'Snapshot vazio ou invalido.';
    end if;

    -- Evita duas execucoes simultaneas iniciarem o mesmo evento.
    select active_month
      into current_active_month
      from public.clash_games_auto_state
     where singleton = true
     for update;

    if not found then
        insert into public.clash_games_auto_state (singleton)
        values (true)
        on conflict (singleton) do nothing;

        select active_month
          into current_active_month
          from public.clash_games_auto_state
         where singleton = true
         for update;
    end if;

    -- Detecta o comeco quando qualquer jogador ja observado aumenta
    -- sua conquista Games Champion. O valor observado anteriormente
    -- sera usado como baseline, evitando contar o historico acumulado.
    if current_active_month is distinct from p_month_key then
        select exists (
            select 1
              from jsonb_to_recordset(p_snapshot)
                   as x(player_tag text, player text, achievement_value bigint)
              join public.clash_games_observer o
                on o.player_tag = x.player_tag
             where x.achievement_value > o.last_value
        )
        into detected_start;

        if not detected_start then
            -- Ainda nao comecaram: atualiza continuamente os valores
            -- de referencia de todos os jogadores ativos.
            for item in
                select *
                  from jsonb_to_recordset(p_snapshot)
                       as x(player_tag text, player text, achievement_value bigint)
            loop
                if item.player_tag is null or item.player is null
                   or item.achievement_value is null or item.achievement_value < 0 then
                    raise exception 'Registro de jogador/conquista invalido.';
                end if;

                insert into public.clash_games_observer (
                    player_tag, player, last_value, updated_at
                ) values (
                    item.player_tag, item.player, item.achievement_value, now()
                )
                on conflict (player_tag) do update
                    set player = excluded.player,
                        last_value = excluded.last_value,
                        updated_at = now();
            end loop;

            return jsonb_build_object(
                'status', 'waiting_for_games',
                'month_key', p_month_key,
                'players_observed', jsonb_array_length(p_snapshot)
            );
        end if;

        started_now := true;

        update public.clash_games_auto_state
           set active_month = p_month_key,
               event_started_at = now(),
               updated_at = now()
         where singleton = true;

        -- Baseline individual = ultimo valor observado antes do aumento.
        for item in
            select *
              from jsonb_to_recordset(p_snapshot)
                   as x(player_tag text, player text, achievement_value bigint)
        loop
            if item.player_tag is null or item.player is null
               or item.achievement_value is null or item.achievement_value < 0 then
                raise exception 'Registro de jogador/conquista invalido.';
            end if;

            select last_value into previous_value
              from public.clash_games_observer
             where player_tag = item.player_tag;

            insert into public.clash_games_tracking (
                month_key, player_tag, player, baseline_value,
                latest_value, points_earned, updated_at
            ) values (
                p_month_key,
                item.player_tag,
                item.player,
                coalesce(previous_value, item.achievement_value),
                item.achievement_value,
                greatest(0, item.achievement_value - coalesce(previous_value, item.achievement_value)),
                now()
            )
            on conflict (month_key, player_tag) do update
                set player = excluded.player,
                    latest_value = excluded.latest_value,
                    points_earned = excluded.points_earned,
                    updated_at = now();
        end loop;
    else
        -- Evento ja iniciado: atualiza jogadores existentes e inclui recrutas.
        for item in
            select *
              from jsonb_to_recordset(p_snapshot)
                   as x(player_tag text, player text, achievement_value bigint)
        loop
            if item.player_tag is null or item.player is null
               or item.achievement_value is null or item.achievement_value < 0 then
                raise exception 'Registro de jogador/conquista invalido.';
            end if;

            select last_value into previous_value
              from public.clash_games_observer
             where player_tag = item.player_tag;

            insert into public.clash_games_tracking (
                month_key, player_tag, player, baseline_value,
                latest_value, points_earned, updated_at
            ) values (
                p_month_key,
                item.player_tag,
                item.player,
                coalesce(previous_value, item.achievement_value),
                item.achievement_value,
                greatest(0, item.achievement_value - coalesce(previous_value, item.achievement_value)),
                now()
            )
            on conflict (month_key, player_tag) do update
                set player = excluded.player,
                    latest_value = excluded.latest_value,
                    points_earned = greatest(0, excluded.latest_value -
                        public.clash_games_tracking.baseline_value),
                    updated_at = now();
        end loop;
    end if;

    -- Atualiza o observador somente depois de calcular as diferencas.
    for item in
        select *
          from jsonb_to_recordset(p_snapshot)
               as x(player_tag text, player text, achievement_value bigint)
    loop
        insert into public.clash_games_observer (
            player_tag, player, last_value, updated_at
        ) values (
            item.player_tag, item.player, item.achievement_value, now()
        )
        on conflict (player_tag) do update
            set player = excluded.player,
                last_value = excluded.last_value,
                updated_at = now();
    end loop;

    -- Reconstroi somente os lancamentos automaticos desta edicao.
    delete from public.events e
     using public.clash_games_events g
     where g.month_key = p_month_key
       and e.id = g.event_id;

    delete from public.clash_games_events
     where month_key = p_month_key;

    for row_data in
        select player_tag, player, points_earned
          from public.clash_games_tracking
         where month_key = p_month_key
         order by player_tag
    loop
        earned := row_data.points_earned;
        award := case
            when earned >= 10000 then 25
            when earned >= 8000 then 20
            when earned >= 6000 then 15
            when earned >= 4000 then 10
            else 0
        end;

        if award > 0 then
            insert into public.events (
                player, category, activity, points, created_at
            ) values (
                row_data.player,
                'Jogos do Clã',
                case
                    when award = 25 then 'Atingiu 10.000 pontos (+25)'
                    when award = 20 then 'Atingiu 8.000 pontos (+20)'
                    when award = 15 then 'Atingiu 6.000 pontos (+15)'
                    else 'Atingiu 4.000 pontos (+10)'
                end,
                award,
                now()
            )
            returning id into event_row_id;

            insert into public.clash_games_events (
                month_key, player_tag, event_id, points
            ) values (
                p_month_key, row_data.player_tag, event_row_id, award
            );
            event_count := event_count + 1;
        end if;

        tracked_count := tracked_count + 1;
    end loop;

    return jsonb_build_object(
        'status', case when started_now then 'games_started_automatically' else 'tracking' end,
        'month_key', p_month_key,
        'players_tracked', tracked_count,
        'events_created', event_count,
        'started_now', started_now
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fill_event_player_tag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  matched_tag text;
begin
  if new.player_tag is null or trim(new.player_tag) = '' then
    select min(p.player_tag)
      into matched_tag
    from public.players p
    where p.player_tag is not null
      and lower(trim(p.name)) = lower(trim(new.player))
    group by lower(trim(p.name))
    having count(*) = 1;

    if matched_tag is not null then
      new.player_tag := matched_tag;
    end if;
  end if;
  return new;
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

CREATE OR REPLACE FUNCTION public.start_clash_games_tracking(p_month_key text, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    item record;
    inserted_count integer := 0;
begin
    if p_month_key is null or p_month_key !~ '^\d{4}-\d{2}$' then
        raise exception 'Mês inválido.';
    end if;
    if jsonb_typeof(p_snapshot) <> 'array' or jsonb_array_length(p_snapshot) = 0 then
        raise exception 'Snapshot inicial vazio ou inválido.';
    end if;

    -- Não sobrescreve uma captura já iniciada para evitar apagar progresso.
    if exists (
        select 1 from public.clash_games_tracking
        where month_key = p_month_key
    ) then
        raise exception 'Já existe uma captura inicial para este mês. Não foi alterada.';
    end if;

    for item in
        select * from jsonb_to_recordset(p_snapshot)
        as x(player_tag text, player text, achievement_value bigint)
    loop
        if item.player_tag is null or item.player is null
           or item.achievement_value is null or item.achievement_value < 0 then
            raise exception 'Registro de conquista inválido.';
        end if;

        insert into public.clash_games_tracking (
            month_key, player_tag, player, baseline_value,
            latest_value, points_earned, updated_at
        ) values (
            p_month_key, item.player_tag, item.player,
            item.achievement_value, item.achievement_value, 0, now()
        );
        inserted_count := inserted_count + 1;
    end loop;

    return jsonb_build_object(
        'month_key', p_month_key,
        'players_started', inserted_count
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_capital_gold_contribution(p_player_tag text, p_player text, p_total bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inserted_tag text;
  v_last_total bigint;
  v_delta bigint;
  v_canonical_player text;
begin
  if p_player_tag is null or btrim(p_player_tag) = ''
     or p_player is null or btrim(p_player) = ''
     or p_total is null or p_total < 0 then
    raise exception 'Dados inválidos para sincronização.';
  end if;

  select name into v_canonical_player
  from public.players
  where upper(btrim(player_tag)) = upper(btrim(p_player_tag))
  limit 1;

  if v_canonical_player is null then
    raise exception 'Jogador com tag % não encontrado em players; nenhum lançamento foi registrado.', p_player_tag;
  end if;

  insert into public.capital_gold_sync_snapshots (player_tag, player, api_total)
  values (upper(btrim(p_player_tag)), v_canonical_player, p_total);

  insert into public.capital_gold_sync_state
    (player_tag, player, last_total, baseline_total, baseline_at)
  values
    (upper(btrim(p_player_tag)), v_canonical_player, p_total, p_total, now())
  on conflict (player_tag) do nothing
  returning player_tag into v_inserted_tag;

  if v_inserted_tag is not null then
    return jsonb_build_object('status', 'baseline', 'player', v_canonical_player, 'total', p_total, 'points', 0);
  end if;

  select last_total into v_last_total
  from public.capital_gold_sync_state
  where player_tag = upper(btrim(p_player_tag))
  for update;

  v_delta := greatest(0, p_total - v_last_total);

  if v_delta > 0 then
    insert into public.events (player, category, activity, points)
    values (v_canonical_player, 'Capital do Clã', 'Doação automática de Ouro da Capital', v_delta);
  end if;

  update public.capital_gold_sync_state
  set player = v_canonical_player, last_total = p_total, updated_at = now()
  where player_tag = upper(btrim(p_player_tag));

  return jsonb_build_object('status', 'synced', 'player', v_canonical_player, 'total', p_total, 'points', v_delta);
end;
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

CREATE OR REPLACE FUNCTION public.sync_clash_games(p_month_key text, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    item record;
    row_data record;
    earned bigint;
    award integer;
    event_row_id bigint;
    tracked_count integer := 0;
    event_count integer := 0;
begin
    if p_month_key is null or p_month_key !~ '^\d{4}-\d{2}$' then
        raise exception 'Mês inválido.';
    end if;
    if jsonb_typeof(p_snapshot) <> 'array' then
        raise exception 'Snapshot inválido.';
    end if;
    if not exists (
        select 1 from public.clash_games_tracking
        where month_key = p_month_key
    ) then
        raise exception 'Captura inicial não encontrada. Inicie os Jogos do Clã primeiro.';
    end if;

    for item in
        select * from jsonb_to_recordset(p_snapshot)
        as x(player_tag text, player text, achievement_value bigint)
    loop
        if item.player_tag is null or item.achievement_value is null
           or item.achievement_value < 0 then
            raise exception 'Registro de conquista inválido.';
        end if;

        update public.clash_games_tracking
        set latest_value = item.achievement_value,
            points_earned = greatest(0, item.achievement_value - baseline_value),
            player = coalesce(item.player, player),
            updated_at = now()
        where month_key = p_month_key
          and player_tag = item.player_tag;
    end loop;

    -- Recria apenas os lançamentos automáticos dos Jogos do Clã deste mês.
    delete from public.events e
    using public.clash_games_events g
    where g.month_key = p_month_key
      and e.id = g.event_id;

    delete from public.clash_games_events
    where month_key = p_month_key;

    for row_data in
        select player_tag, player, points_earned
        from public.clash_games_tracking
        where month_key = p_month_key
        order by player_tag
    loop
        earned := row_data.points_earned;
        award := case
            when earned >= 10000 then 25
            when earned >= 8000 then 20
            when earned >= 6000 then 15
            when earned >= 4000 then 10
            else 0
        end;

        if award > 0 then
            insert into public.events (
                player, category, activity, points, created_at
            ) values (
                row_data.player,
                'Jogos do Clã',
                case
                    when award = 25 then 'Atingiu 10.000 pontos (+25)'
                    when award = 20 then 'Atingiu 8.000 pontos (+20)'
                    when award = 15 then 'Atingiu 6.000 pontos (+15)'
                    else 'Atingiu 4.000 pontos (+10)'
                end,
                award,
                now()
            )
            returning id into event_row_id;

            insert into public.clash_games_events (
                month_key, player_tag, event_id, points
            ) values (
                p_month_key, row_data.player_tag, event_row_id, award
            );
            event_count := event_count + 1;
        end if;
        tracked_count := tracked_count + 1;
    end loop;

    return jsonb_build_object(
        'month_key', p_month_key,
        'players_tracked', tracked_count,
        'events_created', event_count
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_player_monthly_clan_games(p_month_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_count integer := 0;
BEGIN
    IF p_month_key IS NULL
       OR p_month_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
        RAISE EXCEPTION 'Mês inválido.';
    END IF;

    INSERT INTO public.player_monthly_stats (
        month_key,
        player_tag,
        player,
        clan_games_points,
        updated_at
    )
    SELECT
        p_month_key,
        player_tag,
        player,
        GREATEST(0, points_earned)::integer,
        now()
    FROM public.clash_games_tracking
    WHERE month_key = p_month_key

    ON CONFLICT (month_key, player_tag)
    DO UPDATE SET
        player = EXCLUDED.player,
        clan_games_points = EXCLUDED.clan_games_points,
        updated_at = now();

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'month_key', p_month_key,
        'players_updated', v_count
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_player_monthly_donations(p_month_key text, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_players_updated integer := 0;
BEGIN
    IF p_month_key IS NULL
       OR p_month_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
        RAISE EXCEPTION 'Mês inválido: %', p_month_key;
    END IF;

    IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'p_snapshot precisa ser uma lista JSON';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_snapshot) AS x(
            player_tag text,
            player text,
            donations integer
        )
        GROUP BY player_tag
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existem jogadores duplicados no snapshot';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_snapshot) AS x(
            player_tag text,
            player text,
            donations integer
        )
        WHERE x.player_tag IS NULL
           OR x.player IS NULL
           OR x.donations IS NULL
           OR x.donations < 0
    ) THEN
        RAISE EXCEPTION 'Snapshot contém dados inválidos';
    END IF;

    -- A pontuação mensal deve refletir o acumulado preservado pelo RPC
    -- sync_clash_donations, e não o contador atual da temporada na API.
    INSERT INTO public.player_monthly_stats (
        month_key, player_tag, player, war_attacks, league_attacks,
        raid_attacks, donations, clan_games_points, updated_at
    )
    SELECT
        p_month_key,
        d.player_tag,
        d.player,
        0, 0, 0,
        LEAST(d.total_donated, 2147483647)::integer,
        0,
        now()
    FROM public.clash_donation_totals d
    INNER JOIN (
        SELECT DISTINCT x.player_tag
        FROM jsonb_to_recordset(p_snapshot) AS x(
            player_tag text,
            player text,
            donations integer
        )
    ) incoming ON incoming.player_tag = d.player_tag
    WHERE d.month_key = p_month_key
    ON CONFLICT (month_key, player_tag)
    DO UPDATE SET
        player = EXCLUDED.player,
        donations = EXCLUDED.donations,
        updated_at = now();

    GET DIAGNOSTICS v_players_updated = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'month_key', p_month_key,
        'players_updated', v_players_updated
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
