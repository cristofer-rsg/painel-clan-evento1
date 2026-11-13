\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.players(name,player_tag,active) VALUES
 ('Teste Alpha','#TESTA',true),('Teste Beta','#TESTB',true),('Inativo','#TESTC',false);
-- War automation: negative events, replay idempotency and atomic rejection.
SELECT public.record_clash_war_events(
 '[{"source_key":"war-negative-1","war_key":"war-test","player_tag":"#TESTA","player":"Teste Alpha","category":"Guerras","activity":"Penalidade guerra teste","points":-5}]'::jsonb
);
SELECT public.record_clash_war_events(
 '[{"source_key":"war-negative-1","war_key":"war-test","player_tag":"#TESTA","player":"Teste Alpha","category":"Guerras","activity":"Penalidade guerra teste","points":-5}]'::jsonb
);
DO $$
DECLARE rejected boolean := false;
BEGIN
  IF (SELECT count(*) FROM events WHERE activity='Penalidade guerra teste' AND points=-5) <> 1 THEN
    RAISE EXCEPTION 'Guerras: evento negativo duplicado ou ausente';
  END IF;
  BEGIN
    PERFORM public.record_clash_war_events(
      '[{"source_key":"war-atomic-ok","war_key":"war-test","player_tag":"#TESTA","player":"Teste Alpha","category":"Guerras","activity":"war atomic first","points":5},
        {"source_key":"war-atomic-bad","war_key":"war-test","player_tag":"#TESTA","player":"Teste Alpha","category":"Guerras","points":5}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Guerras: aceitou item incompleto'; END IF;
  IF EXISTS (SELECT 1 FROM clash_war_automation WHERE source_key='war-atomic-ok')
     OR EXISTS (SELECT 1 FROM events WHERE activity='war atomic first') THEN
    RAISE EXCEPTION 'Guerras: lote inválido deixou gravação parcial';
  END IF;
END $$;

-- War automation identity probe: production function trusts player name, not the tag.
DO $$
BEGIN
  PERFORM public.record_clash_war_events(
    '[{"source_key":"war-identity-mismatch","war_key":"war-test","player_tag":"#TESTA","player":"Teste Beta","category":"Guerras","activity":"War identity mismatch","points":5}]'::jsonb
  );
  IF NOT EXISTS (SELECT 1 FROM events WHERE activity='War identity mismatch' AND player='Teste Beta') THEN
    RAISE EXCEPTION 'Auditoria Guerras: divergência de tag/nome não reproduzida';
  END IF;
  RAISE NOTICE 'FINDING: record_clash_war_events aceita tag #TESTA com nome Teste Beta.';
END $$;

-- Weekend Raid: awards, replay, inactive players, invalid payload and monthly cap.
SELECT public.apply_automatic_raid_points(
 '[{"player":"Teste Alpha","player_tag":"#TESTA","weekend_key":"2026-11-07","month_key":"2026-11","attacks":5,"weekend_label":"Fim de semana teste"}]'::jsonb
);
SELECT public.apply_automatic_raid_points(
 '[{"player":"Teste Alpha","player_tag":"#TESTA","weekend_key":"2026-11-07","month_key":"2026-11","attacks":5,"weekend_label":"Replay teste"}]'::jsonb
);
DO $$
DECLARE rejected_attacks boolean := false; rejected_month boolean := false;
BEGIN
  IF (SELECT count(*) FROM raid_point_awards WHERE player_tag='#TESTA' AND weekend_key='2026-11-07') <> 1 THEN
    RAISE EXCEPTION 'Raide: replay duplicou premiação';
  END IF;
  IF (SELECT count(*) FROM events WHERE player='Teste Alpha' AND category='Raide de Fim de Semana' AND activity LIKE 'RAIDE_AUTO:2026-11-07:%') <> 1 THEN
    RAISE EXCEPTION 'Raide: evento automático duplicado';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(public.apply_automatic_raid_points(
    '[{"player":"Inativo","player_tag":"#TESTC","weekend_key":"2026-11-14","month_key":"2026-11","attacks":5}]'::jsonb
  )->'results') WHERE value->>'status'='not_active') <> 1 THEN
    RAISE EXCEPTION 'Raide: jogador inativo não foi ignorado';
  END IF;
  BEGIN
    PERFORM public.apply_automatic_raid_points(
      '[{"player":"Teste Alpha","player_tag":"#TESTA","weekend_key":"2026-11-14","month_key":"2026-11","attacks":4}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN rejected_attacks := true;
  END;
  BEGIN
    PERFORM public.apply_automatic_raid_points(
      '[{"player":"Teste Alpha","player_tag":"#TESTA","weekend_key":"2026-11-14","month_key":"2026-12","attacks":5}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN rejected_month := true;
  END;
  IF NOT rejected_attacks OR NOT rejected_month THEN
    RAISE EXCEPTION 'Raide: não rejeitou ataques insuficientes ou mês incompatível';
  END IF;
END $$;

-- Four previous five-point awards block a fifth award in the same month.
DO $$
DECLARE e1 bigint; e2 bigint; e3 bigint; e4 bigint; result_json jsonb;
BEGIN
  INSERT INTO events(player,category,activity,points) VALUES
    ('Teste Beta','Raide de Fim de Semana','legacy raid cap 1',5) RETURNING id INTO e1;
  INSERT INTO events(player,category,activity,points) VALUES
    ('Teste Beta','Raide de Fim de Semana','legacy raid cap 2',5) RETURNING id INTO e2;
  INSERT INTO events(player,category,activity,points) VALUES
    ('Teste Beta','Raide de Fim de Semana','legacy raid cap 3',5) RETURNING id INTO e3;
  INSERT INTO events(player,category,activity,points) VALUES
    ('Teste Beta','Raide de Fim de Semana','legacy raid cap 4',5) RETURNING id INTO e4;
  INSERT INTO raid_point_awards(player_tag,player,weekend_key,month_key,points,attacks,event_id) VALUES
    ('#TESTB','Teste Beta','2026-10-31','2026-11',5,5,e1),
    ('#TESTB','Teste Beta','2026-11-07','2026-11',5,5,e2),
    ('#TESTB','Teste Beta','2026-11-14','2026-11',5,5,e3),
    ('#TESTB','Teste Beta','2026-11-21','2026-11',5,5,e4);
  result_json := public.apply_automatic_raid_points(
    '[{"player":"Teste Beta","player_tag":"#TESTB","weekend_key":"2026-11-28","month_key":"2026-11","attacks":5}]'::jsonb
  );
  IF result_json->'results'->0->>'status' <> 'monthly_limit' THEN
    RAISE EXCEPTION 'Raide: limite mensal de 20 pontos não foi aplicado';
  END IF;
  IF EXISTS (SELECT 1 FROM raid_point_awards WHERE player_tag='#TESTB' AND weekend_key='2026-11-28') THEN
    RAISE EXCEPTION 'Raide: concedeu quinta premiação no mês';
  END IF;
END $$;

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

-- Automatic donation reconciliation must preserve manual events in the same category.
INSERT INTO public.events(player,category,activity,points)
VALUES ('Teste Alpha','Doações','Lançamento manual preservado',7);
SELECT public.sync_clash_donations('2026-11',
 '[{"player_tag":"#TESTA","player":"Teste Alpha","donations":3}]'::jsonb);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM events WHERE activity='Lançamento manual preservado' AND points=7) THEN
    RAISE EXCEPTION 'Doações: sincronização removeu evento manual';
  END IF;
  IF (SELECT count(*) FROM clash_donation_events WHERE month_key='2026-11' AND player_tag='#TESTA') <> 1 THEN
    RAISE EXCEPTION 'Doações: vínculo automático duplicado';
  END IF;
END $$;

-- Identity audit against the exact production definitions.
-- The first three checks deliberately record current unsafe behavior as findings;
-- they do not disguise these findings as passing security controls.
DO $$
BEGIN
  PERFORM public.record_clash_league_events(
    '[{"source_key":"identity-mismatch-league","player_tag":"#TESTA","player":"Teste Beta","war_key":"war-test","activity":"Teste identidade liga","points":5}]'::jsonb
  );
  IF NOT EXISTS (SELECT 1 FROM events WHERE activity='Teste identidade liga' AND player='Teste Beta') THEN
    RAISE EXCEPTION 'Auditoria Liga: comportamento observado mudou; revisar o teste';
  END IF;
  RAISE NOTICE 'FINDING: Liga aceita tag #TESTA com nome Teste Beta e registra pontuação na identidade divergente.';
END;
$$;

DO $$
BEGIN
  PERFORM public.sync_clash_donations('2026-11',
    '[{"player_tag":"#TESTA","player":"Teste Beta","donations":7}]'::jsonb
  );
  IF NOT EXISTS (SELECT 1 FROM clash_donation_totals WHERE player_tag='#TESTA' AND month_key='2026-11' AND player='Teste Beta') THEN
    RAISE EXCEPTION 'Auditoria Doações: comportamento observado mudou; revisar o teste';
  END IF;
  RAISE NOTICE 'FINDING: Doações aceita tag #TESTA com nome Teste Beta.';
END;
$$;

DO $$
BEGIN
  PERFORM public.sync_player_monthly_stat_sources(
    '[{"month_key":"2026-11","source_key":"identity-mismatch-source","player_tag":"#TESTA","player":"Teste Beta","war_attacks":1,"league_attacks":0,"raid_attacks":0}]'::jsonb
  );
  IF NOT EXISTS (SELECT 1 FROM player_monthly_stat_sources WHERE source_key='identity-mismatch-source' AND player_tag='#TESTA' AND player='Teste Beta') THEN
    RAISE EXCEPTION 'Auditoria fontes mensais: comportamento observado mudou; revisar o teste';
  END IF;
  RAISE NOTICE 'FINDING: Fontes mensais aceita e persiste tag/nome divergentes.';
END;
$$;

-- Capital canonicalizes the supplied name from the tag, rather than trusting it.
DO $$
BEGIN
  PERFORM public.sync_capital_gold_contribution('#TESTA','Teste Beta',200);
  IF NOT EXISTS (SELECT 1 FROM capital_gold_sync_snapshots WHERE player_tag='#TESTA' AND api_total=200 AND player='Teste Alpha') THEN
    RAISE EXCEPTION 'Capital: não canonicalizou o nome pela tag';
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
INSERT INTO public.events(player,category,activity,points)
VALUES ('Teste Beta','Jogos do Clã','Lançamento manual preservado',7);
SELECT public.sync_clash_games('2026-11',
 '[{"player_tag":"#TESTB","player":"Teste Beta","achievement_value":4100}]'::jsonb);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM events WHERE activity='Lançamento manual preservado' AND player='Teste Beta' AND points=7) THEN
    RAISE EXCEPTION 'Jogos do Clã: sincronização removeu evento manual';
  END IF;
  IF (SELECT count(*) FROM clash_games_events WHERE month_key='2026-11' AND player_tag='#TESTB') <> 1 THEN
    RAISE EXCEPTION 'Jogos do Clã: vínculo automático duplicado';
  END IF;
  IF (SELECT points_earned FROM clash_games_tracking WHERE month_key='2026-11' AND player_tag='#TESTB') <> 4000 THEN
    RAISE EXCEPTION 'Jogos do Clã: cálculo do progresso incorreto';
  END IF;
  IF (SELECT count(*) FROM events WHERE category='Jogos do Clã' AND player='Teste Beta' AND points=10) <> 1 THEN
    RAISE EXCEPTION 'Jogos do Clã: faixa de 4.000 pontos não gerou exatamente +10';
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
  IF (SELECT donations FROM player_monthly_stats WHERE month_key='2026-11' AND player_tag='#TESTA') <> 17 THEN
    RAISE EXCEPTION 'Doações mensais: não utilizou o acumulado preservado após teste de divergência de identidade';
  END IF;
END $$;

-- Trigger: fills a unique name match, but leaves ambiguous names untouched.
INSERT INTO public.players(name,player_tag,active) VALUES ('Homônimo','#TESTD',true),(' homônimo ','#TESTE',true);
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


-- Expanded negative-path, atomicity and payload-integrity tests.

-- League: an invalid later item must roll back an earlier valid item in the same call.
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.record_clash_league_events(
      '[{"source_key":"atomic-league-ok","player_tag":"#TESTA","player":"Teste Alpha","war_key":"w-atomic","activity":"atomic league first","points":5},
        {"source_key":"","player_tag":"#TESTA","player":"Teste Alpha","war_key":"w-atomic","activity":"atomic league invalid","points":5}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Liga: aceitou lote com item inválido'; END IF;
  IF EXISTS (SELECT 1 FROM events WHERE activity='atomic league first')
     OR EXISTS (SELECT 1 FROM clash_league_automation WHERE source_key='atomic-league-ok') THEN
    RAISE EXCEPTION 'Liga: lote inválido deixou gravação parcial';
  END IF;
END $$;

-- Donations: a negative later item must roll back the first player's write.
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.sync_clash_donations('2026-10',
      '[{"player_tag":"#TESTA","player":"Teste Alpha","donations":9},
        {"player_tag":"#TESTB","player":"Teste Beta","donations":-1}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Doações: aceitou valor negativo'; END IF;
  IF EXISTS (SELECT 1 FROM clash_donation_totals WHERE month_key='2026-10') THEN
    RAISE EXCEPTION 'Doações: lote inválido deixou acumulado parcial';
  END IF;
END $$;

-- Manual Clan Games baseline: a duplicate tag in one snapshot must not leave a partial baseline.
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.start_clash_games_tracking('2026-10',
      '[{"player_tag":"#TESTA","player":"Teste Alpha","achievement_value":10},
        {"player_tag":"#TESTA","player":"Teste Alpha","achievement_value":20}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Jogos do Clã: aceitou tag duplicada no baseline'; END IF;
  IF EXISTS (SELECT 1 FROM clash_games_tracking WHERE month_key='2026-10') THEN
    RAISE EXCEPTION 'Jogos do Clã: baseline duplicado deixou gravação parcial';
  END IF;
END $$;

-- Monthly sources: invalid later row must reject the entire batch before writes.
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.sync_player_monthly_stat_sources(
      '[{"month_key":"2026-11","source_key":"atomic-source-ok","player_tag":"#TESTA","player":"Teste Alpha","war_attacks":1,"league_attacks":0,"raid_attacks":0},
        {"month_key":"2026-11","source_key":"atomic-source-bad","player_tag":"#TESTB","player":"Teste Beta","war_attacks":-1,"league_attacks":0,"raid_attacks":0}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Fontes mensais: aceitou ataque negativo'; END IF;
  IF EXISTS (SELECT 1 FROM player_monthly_stat_sources WHERE source_key IN ('atomic-source-ok','atomic-source-bad')) THEN
    RAISE EXCEPTION 'Fontes mensais: lote inválido deixou gravação parcial';
  END IF;
END $$;

-- Monthly sources: duplicate source keys in one payload must be rejected atomically.
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.sync_player_monthly_stat_sources(
      '[{"month_key":"2026-11","source_key":"duplicate-source","player_tag":"#TESTA","player":"Teste Alpha","war_attacks":1,"league_attacks":0,"raid_attacks":0},
        {"month_key":"2026-11","source_key":"duplicate-source","player_tag":"#TESTA","player":"Teste Alpha","war_attacks":2,"league_attacks":0,"raid_attacks":0}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Fontes mensais: aceitou chave de origem duplicada'; END IF;
  IF EXISTS (SELECT 1 FROM player_monthly_stat_sources WHERE source_key='duplicate-source') THEN
    RAISE EXCEPTION 'Fontes mensais: chave duplicada deixou gravação parcial';
  END IF;
END $$;

-- Monthly donation projection rejects duplicate player tags and invalid calendar months.
DO $$
DECLARE rejected_duplicate boolean := false; rejected_month boolean := false;
BEGIN
  BEGIN
    PERFORM public.sync_player_monthly_donations('2026-11',
      '[{"player_tag":"#TESTA","player":"Teste Alpha","donations":1},
        {"player_tag":"#TESTA","player":"Teste Alpha","donations":2}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN rejected_duplicate := true;
  END;
  BEGIN
    PERFORM public.sync_player_monthly_donations('2026-13','[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN rejected_month := true;
  END;
  IF NOT rejected_duplicate OR NOT rejected_month THEN
    RAISE EXCEPTION 'Doações mensais: não rejeitou duplicidade ou mês impossível';
  END IF;
END $$;

-- Capital: negative totals must not create snapshots or points.
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.sync_capital_gold_contribution('#TESTA','Teste Alpha',-1);
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Capital: aceitou total negativo'; END IF;
  IF EXISTS (SELECT 1 FROM capital_gold_sync_snapshots WHERE player_tag='#TESTA' AND api_total < 0) THEN
    RAISE EXCEPTION 'Capital: gravou total negativo';
  END IF;
END $$;

-- Monthly Clan Games projection rejects impossible calendar months.
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.sync_player_monthly_clan_games('2026-13');
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Projeção de Jogos do Clã: aceitou mês impossível'; END IF;
END $$;


-- Additional production-gap probes: these assert and report the current behavior.
DO $$
BEGIN
  PERFORM public.sync_clash_donations('2026-13',
    '[{"player_tag":"#TESTA","player":"Teste Alpha","donations":1}]'::jsonb
  );
  IF NOT EXISTS (SELECT 1 FROM clash_donation_totals WHERE month_key='2026-13' AND player_tag='#TESTA') THEN
    RAISE EXCEPTION 'Auditoria Doações: mês impossível não reproduzido';
  END IF;
  RAISE NOTICE 'FINDING: sync_clash_donations aceita mês impossível 2026-13.';
END $$;

DO $$
BEGIN
  PERFORM public.sync_clash_donations('2026-14',
    '[{"player_tag":"#TESTA","player":"Teste Alpha","donations":10},
      {"player_tag":"#TESTA","player":"Teste Alpha","donations":20}]'::jsonb
  );
  IF (SELECT total_donated FROM clash_donation_totals WHERE month_key='2026-14' AND player_tag='#TESTA') <> 20 THEN
    RAISE EXCEPTION 'Auditoria Doações: duplicidade não reproduzida';
  END IF;
  RAISE NOTICE 'FINDING: sync_clash_donations aceita tag duplicada no mesmo snapshot e processa sequencialmente as entradas sem rejeitar o payload duplicado.';
END $$;

DO $$
BEGIN
  PERFORM public.start_clash_games_tracking('2026-13',
    '[{"player_tag":"#TESTC","player":"Inativo","achievement_value":25}]'::jsonb
  );
  IF NOT EXISTS (SELECT 1 FROM clash_games_tracking WHERE month_key='2026-13' AND player_tag='#TESTC') THEN
    RAISE EXCEPTION 'Auditoria Jogos do Clã: mês/tag inativa não reproduzido';
  END IF;
  RAISE NOTICE 'FINDING: start_clash_games_tracking aceita mês impossível e jogador inativo/sem validação de identidade.';
END $$;

DO $$
BEGIN
  PERFORM public.auto_sync_clash_games('2026-13',
    '[{"player_tag":"#TESTB","player":"Teste Beta","achievement_value":500}]'::jsonb
  );
  PERFORM public.auto_sync_clash_games('2026-13',
    '[{"player_tag":"#TESTB","player":"Teste Beta","achievement_value":501}]'::jsonb
  );
  IF NOT EXISTS (SELECT 1 FROM clash_games_tracking WHERE month_key='2026-13' AND player_tag='#TESTB') THEN
    RAISE EXCEPTION 'Auditoria Jogos automáticos: mês impossível não reproduzido';
  END IF;
  RAISE NOTICE 'FINDING: auto_sync_clash_games aceita mês impossível 2026-13 e não valida identidade do jogador.';
END $$;

-- The production Games sync accepts a tag with another player's name.
DO $$
BEGIN
  PERFORM public.sync_clash_games('2026-11',
    '[{"player_tag":"#TESTB","player":"Teste Alpha","achievement_value":4200}]'::jsonb
  );
  IF NOT EXISTS (SELECT 1 FROM clash_games_tracking WHERE month_key='2026-11' AND player_tag='#TESTB' AND player='Teste Alpha') THEN
    RAISE EXCEPTION 'Auditoria Jogos do Clã: divergência de identidade não reproduzida';
  END IF;
  RAISE NOTICE 'FINDING: sync_clash_games permite sobrescrever nome canônico com nome divergente.';
END $$;

-- Capital accepts an inactive roster member; record as a business-rule gap.
DO $$
BEGIN
  PERFORM public.sync_capital_gold_contribution('#TESTC','Inativo',50);
  IF NOT EXISTS (SELECT 1 FROM capital_gold_sync_state WHERE player_tag='#TESTC') THEN
    RAISE EXCEPTION 'Auditoria Capital: comportamento de jogador inativo não reproduzido';
  END IF;
  RAISE NOTICE 'FINDING: sync_capital_gold_contribution aceita jogador inativo.';
END $$;

-- Explicitly verify all test writes are discarded.
ROLLBACK;
