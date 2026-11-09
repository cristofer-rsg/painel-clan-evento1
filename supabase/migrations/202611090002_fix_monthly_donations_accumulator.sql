-- Keep monthly donation performance aligned with the preserved monthly accumulator.
-- The Clash API counter can reset during a season; it is not the monthly total.
CREATE OR REPLACE FUNCTION public.sync_player_monthly_donations(
    p_month_key text,
    p_snapshot jsonb
)
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
