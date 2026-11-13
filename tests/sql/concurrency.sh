#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-tester}"
PSQL=(psql -h localhost -U tester -d ghosthunt_test -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" -c "INSERT INTO public.players(name, player_tag, active) VALUES ('Concorrente', '#CONCURRENT', TRUE);"
"${PSQL[@]}" -c "SELECT public.sync_capital_gold_contribution('#CONCURRENT','Concorrente',100);"

# Two simultaneous snapshots must serialize on the per-player state row.
"${PSQL[@]}" -c "SELECT public.sync_capital_gold_contribution('#CONCURRENT','Concorrente',150);" >/tmp/capital-a.log 2>&1 &
a=$!
"${PSQL[@]}" -c "SELECT public.sync_capital_gold_contribution('#CONCURRENT','Concorrente',200);" >/tmp/capital-b.log 2>&1 &
b=$!
wait "$a"
wait "$b"

"${PSQL[@]}" -c "SELECT public.record_clash_league_events('[{\"source_key\":\"concurrent-league-key\",\"player_tag\":\"#CONCURRENT\",\"player\":\"Concorrente\",\"war_key\":\"concurrent-war\",\"activity\":\"Concorrência\",\"points\":5}]'::jsonb);" >/tmp/league-a.log 2>&1 &
a=$!
"${PSQL[@]}" -c "SELECT public.record_clash_league_events('[{\"source_key\":\"concurrent-league-key\",\"player_tag\":\"#CONCURRENT\",\"player\":\"Concorrente\",\"war_key\":\"concurrent-war\",\"activity\":\"Concorrência\",\"points\":5}]'::jsonb);" >/tmp/league-b.log 2>&1 &
b=$!
wait "$a"
wait "$b"

"${PSQL[@]}" <<'SQL'
DO $$
BEGIN
  IF (SELECT last_total FROM public.capital_gold_sync_state WHERE player_tag='#CONCURRENT') <> 200 THEN
    RAISE EXCEPTION 'Concorrência Capital: total final incorreto';
  END IF;
  IF (SELECT COALESCE(SUM(points),0) FROM public.events WHERE player='Concorrente' AND category='Capital do Clã') <> 100 THEN
    RAISE EXCEPTION 'Concorrência Capital: delta duplicado ou perdido';
  END IF;
  IF (SELECT count(*) FROM public.events WHERE player='Concorrente' AND category='Liga dos Clãs' AND activity='Concorrência') <> 1 THEN
    RAISE EXCEPTION 'Concorrência Liga: chave de origem duplicou evento';
  END IF;
  IF (SELECT count(*) FROM public.clash_league_automation WHERE source_key='concurrent-league-key') <> 1 THEN
    RAISE EXCEPTION 'Concorrência Liga: chave de origem duplicada';
  END IF;
END $$;
DELETE FROM public.events WHERE player='Concorrente';
DELETE FROM public.clash_league_automation WHERE source_key='concurrent-league-key';
DELETE FROM public.capital_gold_sync_state WHERE player_tag='#CONCURRENT';
DELETE FROM public.capital_gold_sync_snapshots WHERE player_tag='#CONCURRENT';
DELETE FROM public.players WHERE player_tag='#CONCURRENT';
SQL
echo "Concurrent Capital and League tests passed."
