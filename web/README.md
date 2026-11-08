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
- Sessão administrativa JWT assinada com cookie HttpOnly, SameSite Strict e expiração de 8 horas
- Vercel para hospedagem da interface e rotas HTTP
- GitHub Actions para sincronizações agendadas já existentes

## Variáveis de ambiente da aplicação web

Configure em Vercel > Project Settings > Environment Variables:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` — segredo de servidor, nunca usar prefixo `NEXT_PUBLIC_`
- `ADMIN_PASSWORD`
- `GHOST_HUNT_SESSION_SECRET` — segredo aleatório forte com pelo menos 32 caracteres

As credenciais de Clash of Clans permanecem nos GitHub Secrets utilizados pelos workflows Python existentes. A aplicação Next.js não executa nem substitui essas automações.

## Estado da reconstrução

- Painel público com pódio, ranking, pesquisa por nome/tag e expansão da classificação.
- Indicadores mensais com metas originais do Índice de Atividade Ghost Hunt (20 guerras, 7 liga, 24 raide, 5.000 doações, 10.000 jogos e 250.000 moedas de capital), com resultado máximo de 100%.
- Painel dos três membros mais recentes, a partir de `clan_member_entries`.
- Histórico mensal, com preferência pelos snapshots arquivados e cálculo alternativo quando não há snapshot.
- Área administrativa protegida por senha server-side e cookie HttpOnly; gestão de jogadores, edição/exclusão de lançamentos e exportação Excel/CSV.
- Operações administrativas de escrita validam a origem da requisição.
- Workflow de validação Next.js executa instalação de dependências e build.
- Os workflows de sincronização existentes permanecem independentes e intocados.
- A branch `main` permanece preservada; desenvolvimento e validação ocorrem em `vercel-rebuild`.

## Preparação de implantação (ainda não executada)

1. Criar um projeto Vercel conectado ao repositório e selecionar `web` como Root Directory.
2. Configurar somente as quatro variáveis de ambiente listadas acima, em Preview antes de Production.
3. Publicar uma implantação Preview separada e testar login, consultas Supabase, histórico, exportação e operações administrativas.
4. Comparar os dados e resultados com o Streamlit original.
5. Só então decidir sobre domínio e produção; não fazer merge ou troca de endereço sem aprovação explícita.

## Atenção: schema SQL legado

O arquivo raiz `supabase_schema.sql` não representa mais o schema completo usado pelo aplicativo atual: ele documenta apenas `players` e `events` em uma versão antiga e não inclui colunas/tabelas que o código atual consulta, como `player_tag`, `active`, `clan_member_entries`, `monthly_rankings` e `player_monthly_stats`. **Não execute esse SQL no projeto Supabase existente.** Antes de implementar as consultas da nova aplicação, faça uma inspeção somente de leitura do schema real no Supabase e valide as colunas, constraints, índices e políticas RLS.

## Validações ainda pendentes

- Teste ponta a ponta com as variáveis reais do Supabase em um ambiente Preview.
- Comparação visual e de dados com o Streamlit original, incluindo meses arquivados, jogadores inativos e exportações.
- Teste funcional de login, expiração/logout, gestão de jogadores e edição/exclusão de lançamentos.
- Configuração e validação de um projeto Vercel Preview.
- Revisão final de segurança antes de qualquer implantação de produção.

O workflow de build comprova a compilação do Next.js, mas não substitui esses testes de integração. Nenhuma implantação Vercel foi criada, nenhum dado do Supabase foi alterado e nenhum merge foi realizado.

