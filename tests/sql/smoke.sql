\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.players(name,player_tag,active) VALUES
 ('Teste Alpha','#TESTA',true),('Teste Beta','#TESTB',true),('Inativo','#TESTC',false);
-- League: negative events are recorded; replaying a source key is idempotent.
SELECT public.record_clash_league_events('[{"source_key":"test-war-1","player_tag":"#TESTA","player":"Teste Alpha","war_key":"war-test","activity":"Penalidade de teste","points":-5}]'::jsonb);
DO $$ BEGIN
  IF (SELECT count(*) FROM events WHERE category='Liga dos Clãs' AND points=-5) <> 1 THEN
    RAISE EXCEPTION 'Liga: evento negativo não foi registrado exatamente uma vez';
  END IF;
END;
$$;
SELECT public.record_clash_league_events('[{"source_key":"test-war-1","player_tag":"#TESTA","player":"Teste Alpha","war_key":"war-test","activity":"Penalidade de teste","points":-5}]'::jsonb);
DO $$ BEGIN
  IF (SELECT count(*) FROM events WHERE category='Liga dos Clãs' AND points=-5) <> 1 THEN
    RAISE EXCEPTION 'Liga: replay duplicou evento';
  END IF;
END;
$$;
-- Capital: first call establishes baseline; only positive delta creates points.
SELECT public.sync_capital_gold_contribution('#TESTA','Teste Alpha',100);
SELECT public.sync_capital_gold_contribution('#TESTA','Teste Alpha',130);
DO $$ BEGIN
  IF (SELECT count(*) FROM events WHERE category='Capital do Clã' AND points=30 AND player='Teste Alpha') <> 1 THEN
    RAISE EXCEPTION 'Capital: delta/canonical player incorreto';
  END IF;
END;
$$;
-- Monthly source aggregation is repeatable for the same source key.
SELECT public.sync_player_monthly_stat_sources(
 '[{"month_key":"2026-11","source_key":"war:test:1","player_tag":"#TESTA","player":"Teste Alpha","war_attacks":2,"league_attacks":0,"raid_attacks":0}]'::jsonb
);
SELECT public.sync_player_monthly_stat_sources(
 '[{"month_key":"2026-11","source_key":"war:test:1","player_tag":"#TESTA","player":"Teste Alpha","war_attacks":2,"league_attacks":0,"raid_attacks":0}]'::jsonb
);
DO $$ BEGIN
  IF (SELECT war_attacks FROM player_monthly_stats WHERE month_key='2026-11' AND player_tag='#TESTA') <> 2 THEN
    RAISE EXCEPTION 'Fontes mensais: replay duplicou soma';
  END IF;
END;
$$;
-- Donation counter reset: 10 -> 3 adds 3 to accumulated total (13).
SELECT public.sync_clash_donations('2026-11',
 '[{"player_tag":"#TESTA","player":"Teste Alpha","donations":10}]'::jsonb);
SELECT public.sync_clash_donations('2026-11',
 '[{"player_tag":"#TESTA","player":"Teste Alpha","donations":3}]'::jsonb);
DO $$ BEGIN
  IF (SELECT total_donated FROM clash_donation_totals WHERE month_key='2026-11' AND player_tag='#TESTA') <> 13 THEN
    RAISE EXCEPTION 'Doações: reinício do contador calculado incorretamente';
  END IF;
END;
$$;

-- Identity validation: a valid tag cannot be paired with another player's name.
DO $$
DECLARE rejected boolean;
BEGIN
  rejected := false;
  BEGIN
    PERFORM public.record_clash_league_events(
      '[{"source_key":"identity-mismatch-league","player_tag":"#TESTA","player":"Teste Beta","war_key":"war-test","activity":"Teste","points":5}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Liga aceitou tag/nome divergentes'; END IF;
  IF EXISTS (SELECT 1 FROM events WHERE activity='Teste') THEN
    RAISE EXCEPTION 'Liga gravou evento com identidade divergente';
  END IF;
END;
$$;

DO $$
DECLARE rejected boolean;
BEGIN
  rejected := false;
  BEGIN
    PERFORM public.sync_clash_donations('2026-11',
      '[{"player_tag":"#TESTA","player":"Teste Beta","donations":7}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Doações aceitaram tag/nome divergentes'; END IF;
  IF EXISTS (SELECT 1 FROM clash_donation_totals WHERE player_tag='#TESTA' AND month_key='2026-11' AND total_donated=7) THEN
    RAISE EXCEPTION 'Doações gravaram identidade divergente';
  END IF;
END;
$$;

DO $$
DECLARE rejected boolean;
BEGIN
  rejected := false;
  BEGIN
    PERFORM public.sync_player_monthly_stat_sources(
      '[{"month_key":"2026-11","source_key":"identity-mismatch-source","player_tag":"#TESTA","player":"Teste Beta","war_attacks":1,"league_attacks":0,"raid_attacks":0}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Fontes mensais aceitaram tag/nome divergentes'; END IF;
  IF EXISTS (SELECT 1 FROM player_monthly_stat_sources WHERE source_key='identity-mismatch-source') THEN
    RAISE EXCEPTION 'Fontes mensais gravaram identidade divergente';
  END IF;
END;
$$;

DO $$
DECLARE rejected boolean;
BEGIN
  rejected := false;
  BEGIN
    PERFORM public.sync_capital_gold_contribution('#TESTA','Teste Beta',200);
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Capital aceitou tag/nome divergentes'; END IF;
  IF EXISTS (SELECT 1 FROM capital_gold_sync_snapshots WHERE player_tag='#TESTA' AND api_total=200) THEN
    RAISE EXCEPTION 'Capital gravou identidade divergente';
  END IF;
END;
$$;


-- Clan Games: manual baseline, threshold award, monthly projection and replay.
SELECT public.start_clash_games_tracking('2026-11',
 '[{"player_tag":"#TESTB","player":"Teste Beta","achievement_value":100}]'::jsonb);
DO $$ BEGIN
  IF (SELECT baseline_value FROM clash_games_tracking WHERE month_key='2026-11' AND player_tag='#TESTB') <> 100 THEN
    RAISE EXCEPTION 'Jogos do Clã: baseline inicial incorreto';
  END IF;
END $$;
SELECT public.sync_clash_games('2026-11',
 '[{"player_tag":"#TESTB","player":"Teste Beta","achievement_value":4100}]'::jsonb);
DO $$ BEGIN
  IF (SELECT points_earned FROM clash_games_tracking WHERE month_key='2026-11' AND player_tag='#TESTB') <> 4000 THEN
    RAISE EXCEPTION 'Jogos do Clã: cálculo do progresso incorreto';
  END IF;
  IF (SELECT count(*) FROM events WHERE category='Jogos do Clã' AND player='Teste Beta' AND points=10) <> 1 THEN
    RAISE EXCEPTION 'Jogos do Clã: faixa de 4.000 pontos não gerou +10';
  END IF;
END $$;
SELECT public.sync_player_monthly_clan_games('2026-11');
SELECT public.sync_player_monthly_clan_games('2026-11');
DO $$ BEGIN
  IF (SELECT clan_games_points FROM player_monthly_stats WHERE month_key='2026-11' AND player_tag='#TESTB') <> 4000 THEN
    RAISE EXCEPTION 'Jogos do Clã: projeção mensal incorreta ou duplicada';
  END IF;
END $$;
DO $$ DECLARE rejected boolean := false; BEGIN
  BEGIN
    PERFORM public.start_clash_games_tracking('2026-11',
      '[{"player_tag":"#TESTB","player":"Teste Beta","achievement_value":200}]'::jsonb);
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Jogos do Clã: reinício sobrescreveu baseline existente'; END IF;
  IF (SELECT baseline_value FROM clash_games_tracking WHERE month_key='2026-11' AND player_tag='#TESTB') <> 100 THEN
    RAISE EXCEPTION 'Jogos do Clã: tentativa de reinício alterou baseline';
  END IF;
END $$;

-- Automatic Clan Games: observer baseline, automatic start on first increase.
SELECT public.auto_sync_clash_games('2026-12',
 '[{"player_tag":"#TESTA","player":"Teste Alpha","achievement_value":500}]'::jsonb);
DO $$ BEGIN
  IF (SELECT last_value FROM clash_games_observer WHERE player_tag='#TESTA') <> 500 THEN
    RAISE EXCEPTION 'Jogos automáticos: baseline de observação ausente';
  END IF;
END $$;
SELECT public.auto_sync_clash_games('2026-12',
 '[{"player_tag":"#TESTA","player":"Teste Alpha","achievement_value":4500}]'::jsonb);
DO $$ BEGIN
  IF (SELECT active_month FROM clash_games_auto_state WHERE singleton=true) <> '2026-12' THEN
    RAISE EXCEPTION 'Jogos automáticos: início não detectado';
  END IF;
  IF (SELECT baseline_value FROM clash_games_tracking WHERE month_key='2026-12' AND player_tag='#TESTA') <> 500 THEN
    RAISE EXCEPTION 'Jogos automáticos: baseline individual incorreto';
  END IF;
  IF (SELECT points_earned FROM clash_games_tracking WHERE month_key='2026-12' AND player_tag='#TESTA') <> 4000 THEN
    RAISE EXCEPTION 'Jogos automáticos: progresso inicial incorreto';
  END IF;
END $$;

-- Monthly donations projection uses accumulated total, not current API counter.
SELECT public.sync_player_monthly_donations('2026-11',
 '[{"player_tag":"#TESTA","player":"Teste Alpha","donations":3}]'::jsonb);
DO $$ BEGIN
  IF (SELECT donations FROM player_monthly_stats WHERE month_key='2026-11' AND player_tag='#TESTA') <> 13 THEN
    RAISE EXCEPTION 'Doações mensais: não utilizou o acumulado preservado';
  END IF;
END $$;

-- Trigger: fills a unique name match, but leaves ambiguous names untouched.
INSERT INTO public.players(name,player_tag,active) VALUES ('Homônimo','#TESTD',true),('Homônimo','#TESTE',true);
INSERT INTO public.events(player,category,activity,points)
VALUES ('Teste Beta','Teste trigger','tag única',1),('Homônimo','Teste trigger','nome ambíguo',1);
DO $$ BEGIN
  IF (SELECT player_tag FROM events WHERE activity='tag única') <> '#TESTB' THEN
    RAISE EXCEPTION 'Trigger: não preencheu tag de nome único';
  END IF;
  IF (SELECT player_tag FROM events WHERE activity='nome ambíguo') IS NOT NULL THEN
    RAISE EXCEPTION 'Trigger: escolheu tag para nome ambíguo';
  END IF;
END $$;

-- Explicitly verify all test writes are discarded.
ROLLBACK;
