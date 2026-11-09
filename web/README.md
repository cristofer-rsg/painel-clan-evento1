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

- Next.js App Router + React + TypeScript (Node.js 20.19+; CI validado com Node.js 22)
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
- Consulta pública de desempenho com seis metas fixas (20 guerras, 7 ligas, 24 raides, 5.000 doações, 10.000 pontos de jogos e 250.000 moedas de capital), índice de 0 a 100 e somente jogadores ativos, conforme o acesso de jogador original.
- Visão administrativa separada e protegida, com índice proporcional ao maior resultado de cada categoria (até 100 por categoria, total máximo de 600), filtro de inativos e ordenação completa, conforme a aba administrativa original.
- Painel dos três membros mais recentes, a partir de `clan_member_entries`.
- Histórico mensal, com preferência pelos snapshots arquivados, cálculo alternativo quando não há snapshot e arquivamento automático do mês anterior na entrada administrativa (somente se ainda não houver snapshot e existirem lançamentos).
- Área administrativa protegida por senha server-side e cookie HttpOnly; gestão de jogadores, visão administrativa de desempenho, edição/exclusão de lançamentos e exportação Excel/CSV.
- Operações administrativas de escrita validam a origem da requisição.
- Workflow de validação executa auditoria das dependências de produção, teste de geração/leitura XLSX com ExcelJS e build Next.js.
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

- Portar a concessão automática dos pontos do Raide para uma rotina independente: o workflow `raid-auto.yml` atualiza `raid_attacks`, mas a inserção/atualização dos eventos `RAIDE_AUTO:` ainda é executada pelo `app.py` quando o administrador abre o Streamlit.
- Teste ponta a ponta com as variáveis reais do Supabase em um ambiente Preview (não substituído pelo CI).
- Comparação visual e de dados com o Streamlit original, incluindo meses arquivados, jogadores inativos e exportações.
- Teste funcional de login, expiração/logout, gestão de jogadores e edição/exclusão de lançamentos.
- Configuração e validação de um projeto Vercel Preview.
- Revisão final de segurança antes de qualquer implantação de produção.

O workflow de build comprova a compilação do Next.js, mas não substitui esses testes de integração. Nenhuma implantação Vercel foi criada, nenhum dado do Supabase foi alterado e nenhum merge foi realizado.

