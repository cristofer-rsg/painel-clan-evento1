-- Enforce the 10,000-point per-player Clan Games cap.
-- Keep lifetime Games Champion totals as the source, but cap the per-event delta.
DO $migration$
DECLARE
  v_definition text;
  v_updated text;
  v_monthly_definition text;
  v_monthly_updated text;
BEGIN
  SELECT pg_get_functiondef('public.auto_sync_clash_games(text,jsonb)'::regprocedure)
    INTO v_definition;

  v_updated := replace(
    v_definition,
    'greatest(0, item.achievement_value - coalesce(previous_value, item.achievement_value))',
    'least(10000, greatest(0, item.achievement_value - coalesce(previous_value, item.achievement_value)))'
  );
  v_updated := replace(
    v_updated,
    'greatest(0, excluded.latest_value - public.clash_games_tracking.baseline_value)',
    'least(10000, greatest(0, excluded.latest_value - public.clash_games_tracking.baseline_value))'
  );

  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Não foi possível localizar os cálculos de pontos em auto_sync_clash_games.';
  END IF;

  EXECUTE v_updated;

  SELECT pg_get_functiondef('public.sync_player_monthly_clan_games(text)'::regprocedure)
    INTO v_monthly_definition;
  v_monthly_updated := replace(
    v_monthly_definition,
    'GREATEST(0, points_earned)::integer',
    'LEAST(10000, GREATEST(0, points_earned))::integer'
  );

  IF v_monthly_updated = v_monthly_definition THEN
    RAISE EXCEPTION 'Não foi possível localizar o cálculo mensal de pontos dos Jogos do Clã.';
  END IF;

  EXECUTE v_monthly_updated;
END
$migration$;

UPDATE public.clash_games_tracking
SET points_earned = LEAST(10000, GREATEST(0, points_earned)),
    updated_at = now()
WHERE points_earned > 10000;

UPDATE public.player_monthly_stats s
SET clan_games_points = LEAST(10000, GREATEST(0, t.points_earned)),
    updated_at = now()
FROM public.clash_games_tracking t
WHERE t.month_key = s.month_key
  AND upper(btrim(t.player_tag)) = upper(btrim(s.player_tag))
  AND s.clan_games_points IS DISTINCT FROM LEAST(10000, GREATEST(0, t.points_earned));
