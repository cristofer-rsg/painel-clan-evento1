# Ghost Hunt Web — reconstrução para Vercel

Nova aplicação Next.js, independente do Streamlit atual. O diretório `web/` será configurado como Root Directory do projeto na Vercel.

## Princípios de migração

- Preservar o app Streamlit e a branch `main` durante desenvolvimento e validação.
- Reutilizar o Supabase existente; não recriar nem limpar tabelas.
- Manter os workflows GitHub Actions de sincronização ativos.
- Fazer toda operação privilegiada no servidor. A chave `SUPABASE_SECRET_KEY` nunca pode ser enviada ao navegador.
- Preservar as regras de pontuação existentes em `app.py` e nos sincronizadores Python.
- Interface mobile-first com azul-marinho, dourado, cartões escuros, pódio e identidade Ghost Hunt.

## Stack

- Next.js App Router + React + TypeScript
- Supabase JS no servidor
- Sessão administrativa assinada e armazenada em cookie HttpOnly (próxima etapa)
- Vercel para hospedagem da interface e rotas HTTP
- GitHub Actions para sincronizações agendadas já existentes

## Variáveis de ambiente

Configure em Vercel > Project Settings > Environment Variables:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` — segredo de servidor, nunca usar prefixo NEXT_PUBLIC_
- `ADMIN_PASSWORD`
- `GHOST_HUNT_SESSION_SECRET` — segredo aleatório forte para assinar sessões
- `CLASH_API_TOKEN`
- `CLASH_CLAN_TAG` — padrão atual `#2GCGP0RQ9`

O arquivo `.env.example` documenta os nomes sem incluir valores.

## Atenção: schema SQL legado

O arquivo raiz `supabase_schema.sql` não representa mais o schema completo usado pelo aplicativo atual: ele documenta apenas `players` e `events` em uma versão antiga e não inclui colunas/tabelas que o código atual consulta, como `player_tag`, `active`, `clan_member_entries`, `monthly_rankings` e `player_monthly_stats`. **Não execute esse SQL no projeto Supabase existente.** Antes de implementar as consultas da nova aplicação, faça uma inspeção somente de leitura do schema real no Supabase e valide as colunas, constraints, índices e políticas RLS.

## Estado desta primeira entrega

- Estrutura do Next.js criada em `web/`.
- Identidade visual mobile-first responsiva.
- Painel inicial consulta `players` e `events` no servidor e calcula o ranking mensal com as regras atuais do `app.py`.
- A chave Supabase permanece exclusivamente no servidor.
- Endpoint de health check sem expor segredos.
- Schema real consultado em modo somente leitura; nenhuma tabela ou dado do Supabase foi alterado.
- Workflow independente de validação web; os workflows de sincronização existentes permanecem intocados.

## Próximas etapas obrigatórias

1. Implementar autenticação administrativa com cookie HttpOnly, expiração e proteção CSRF adequada; acesso de jogador permanece somente leitura.
2. Mapear e validar colunas e políticas das cinco tabelas existentes: `players`, `events`, `monthly_rankings`, `player_monthly_stats`, `clan_member_entries`.
3. Portar as funções de ranking, arquivamento mensal, histórico, desempenho e novos membros sem mudar as regras.
4. Criar operações administrativas protegidas para editar/excluir lançamentos e gerenciar jogadores.
5. Validar sincronização e exportação Excel/CSV.
6. Configurar Vercel com Root Directory `web`, testar em preview e comparar com Streamlit antes de qualquer troca de endereço.
