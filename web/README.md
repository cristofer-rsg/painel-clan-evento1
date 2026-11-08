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

## Estado desta primeira entrega

- Estrutura inicial do Next.js criada em `web/`.
- Primeira versão da identidade visual responsiva criada.
- Cliente Supabase administrativo isolado em módulo server-only.
- Endpoint de health check sem expor segredos.
- Nenhuma tabela ou dado do Supabase foi alterado.
- Nenhum workflow existente foi removido ou modificado.

## Próximas etapas obrigatórias

1. Implementar autenticação administrativa com cookie HttpOnly, expiração e proteção CSRF adequada; acesso de jogador permanece somente leitura.
2. Mapear e validar colunas e políticas das cinco tabelas existentes: `players`, `events`, `monthly_rankings`, `player_monthly_stats`, `clan_member_entries`.
3. Portar as funções de ranking, arquivamento mensal, histórico, desempenho e novos membros sem mudar as regras.
4. Criar operações administrativas protegidas para editar/excluir lançamentos e gerenciar jogadores.
5. Validar sincronização e exportação Excel/CSV.
6. Configurar Vercel com Root Directory `web`, testar em preview e comparar com Streamlit antes de qualquer troca de endereço.
