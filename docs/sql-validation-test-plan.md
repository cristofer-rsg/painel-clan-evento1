# Plano de testes isolados das funções SQL

## Escopo e limites

Este trabalho prepara testes para as funções de sincronização do GhostHunt usando PostgreSQL descartável no CI.

- Não conectar ao Supabase de produção.
- Não executar funções de sincronização em produção.
- Não alterar dados, funções, permissões ou configurações do banco de produção.
- Não publicar o aplicativo.
- Usar somente jogadores e tags fictícios nos testes.
- Toda gravação de teste ocorre no banco temporário do job e é descartada ao final.
- O harness não testa nem altera políticas de acesso ou configurações de segurança de linhas.

## Funções no escopo

1. `record_clash_league_events(jsonb)`
2. `sync_player_monthly_stat_sources(jsonb)`
3. `sync_clash_donations(text, jsonb)`
4. `auto_sync_clash_games(text, jsonb)`
5. `start_clash_games_tracking(text, jsonb)`
6. `sync_capital_gold_contribution(text, text, bigint)`
7. `sync_player_monthly_donations(text, jsonb)`
8. `sync_clash_games(text, jsonb)`
9. `sync_player_monthly_clan_games(text)`
10. `fill_event_player_tag()` (trigger)

## Matriz de testes planejada

### Validação comum de identidade e payload
- Tag inexistente.
- Jogador inativo quando a função exige jogador ativo.
- Tag válida com nome divergente do nome canônico.
- Tag vazia, nula ou malformada.
- Nome vazio ou divergente.
- Tag duplicada no mesmo snapshot.
- Chave de origem duplicada no mesmo lote.
- JSON nulo, objeto em vez de array, array vazio quando não permitido.
- Campos obrigatórios ausentes ou com tipo incompatível.
- Valores negativos, nulos e fora do limite do tipo SQL.
- Mês inválido, mês inexistente (ex.: 2026-13) e formato incompleto.

### Integridade e atomicidade
- Lote com primeiro item válido e segundo item inválido: nenhuma gravação parcial.
- Repetição do mesmo lote: não duplicar eventos nem pontos.
- Atualização do mesmo source key: comportamento idempotente esperado.
- Referências de evento sempre apontam para evento existente.
- Reprocessamento não apaga eventos manuais nem eventos de outro mês.
- Valores negativos de pontuação legítimos continuam preservados quando aplicável.

### Regras específicas
- Liga: eventos positivos, negativos e zero; jogador inativo; source key repetida.
- Doações: incremento normal, reinício do contador da API, duplicidade de tag e consistência do acumulado mensal.
- Jogos do Clã: baseline, início automático após aumento, jogador novo, snapshot duplicado e reconstrução dos eventos automáticos.
- Capital: baseline inicial, incremento, valor sem aumento, tag desconhecida e nome fornecido diferente do nome canônico.
- Estatísticas mensais: soma de fontes, atualização de fonte existente, duplicidade de chave e valores inválidos.
- Trigger de tag: nome único, nome ambíguo, tag já informada e ausência de correspondência.

## Pré-requisitos antes de tornar o CI executável

1. Registrar no repositório uma cópia versionada das definições SQL exatas das funções sob teste, capturadas por leitura do banco e revisadas em diff.
2. Criar um schema mínimo de fixture com as tabelas, constraints, índices e triggers realmente exigidos por essas funções.
3. Confirmar que o fixture não contém dados reais, segredos, URLs privadas ou credenciais.
4. Subir PostgreSQL como serviço temporário do GitHub Actions.
5. Aplicar fixture e definições SQL ao banco temporário e executar os casos automatizados.
6. Fazer o job falhar se qualquer teste falhar; descartar o banco ao final.

## Observação sobre o estado atual

O repositório ainda não contém uma baseline completa do schema necessário nem as definições dessas funções em migrações versionadas. Por isso, este documento é uma especificação de testes e não afirma que as funções reais já foram testadas automaticamente. O próximo passo técnico é preparar e revisar o fixture e a captura versionada das funções antes de adicionar um job que possa dar um resultado confiável.
