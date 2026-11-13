# Auditoria SQL isolada — GhostHunt

## Execução
- GitHub Actions: https://github.com/cristofer-rsg/painel-clan-evento1/actions/runs/43344670344
- PostgreSQL 16 descartável.
- Funções carregadas a partir de `pg_get_functiondef` do projeto GhostHunt em 2026-11-13.
- Todos os testes usam transação com `ROLLBACK`, exceto o script de concorrência, que cria e remove seus próprios dados no banco descartável.
- Nenhuma migração, DDL, DML, política RLS ou implantação foi executada no projeto de produção.

## Cobertura executada
- Guerras: eventos negativos, chave idempotente, lote incompleto/atomicidade e execução concorrente.
- Liga: pontos negativos, repetição de chave, lote inválido/atomicidade e execução concorrente.
- Doações: contador reiniciado, replay, projeção mensal, preservação de evento manual, rejeição de valor negativo e atomicidade.
- Jogos do Clã: baseline manual, proteção contra reinício, cálculo de faixas, projeção mensal/replay, baseline automático, início automático, preservação de evento manual e atomicidade.
- Capital: baseline, delta, nome canônico, rejeição de total negativo, concorrência e jogador inativo.
- Raide: premiação, replay, jogador inativo, mínimo de ataques, mês incompatível e limite mensal.
- Fontes mensais: agregação, replay, identidade divergente, chave duplicada, valores inválidos e atomicidade.
- Trigger: preenchimento por nome único e não escolha quando o nome é ambíguo.

## Achados reproduzidos — não aprovados para produção

Os testes passaram como bateria de reprodução, mas registraram os seguintes comportamentos inseguros nas funções reais capturadas:

1. `record_clash_war_events` aceita tag e nome de jogadores diferentes.
2. `record_clash_league_events` aceita tag e nome diferentes e pode atribuir pontos ao nome enviado.
3. `sync_clash_donations` aceita tag/nome divergentes.
4. `sync_player_monthly_stat_sources` aceita e persiste tag/nome divergentes.
5. `sync_clash_games` permite substituir o nome armazenado por nome divergente para a tag.
6. `start_clash_games_tracking` aceita mês impossível no formato `YYYY-MM` e não valida identidade/atividade.
7. `auto_sync_clash_games` aceita mês impossível e não valida identidade/atividade.
8. `sync_clash_donations` aceita mês impossível e não rejeita tag duplicada no mesmo snapshot.
9. `sync_capital_gold_contribution` aceita jogador inativo.
10. Dez funções `SECURITY DEFINER` continuam executáveis por `anon` e `authenticated`, com `search_path=public`.
11. `clan_sync_state` e `capital_gold_sync_snapshots` estão com RLS desativado e permitem, no mínimo, SELECT e INSERT a `anon` e `authenticated`.

## Limites
- O sucesso da suíte significa que as reproduções e verificações implementadas passaram; não significa que os achados de segurança foram corrigidos.
- Não foram executados testes ponta a ponta contra as automações em produção, contra a interface web, nem testes de carga prolongados.
- Concorrência foi exercitada para Capital e Liga; não equivale a um teste de estresse geral de todas as funções.
- A suíte não altera produção. Os achados que envolvem RLS e privilégios permanecem deliberadamente sem correção, conforme a decisão anterior de não mexer no RLS.
