# Ghost Hunt Web — reconstrução para Vercel

Nova aplicação Next.js, independente do Streamlit atual. O diretório `web/` é o Root Directory do projeto Vercel de Preview.

## Princípios de migração

- Preservar o app Streamlit e a branch `main` durante desenvolvimento e validação.
- Reutilizar o Supabase existente; não recriar nem limpar tabelas.
- Manter os workflows GitHub Actions de sincronização ativos.
- Fazer toda operação privilegiada no servidor. A chave `SUPABASE_SECRET_KEY` nunca pode ser enviada ao navegador.
- Preservar as regras de pontuação existentes em `app.py` e nos sincronizadores Python.
- Interface mobile-first com azul-marinho, dourado, cartões escuros, pódio e identidade Ghost Hunt.
- Desenvolver e validar na branch `vercel-rebuild`; não fazer merge ou promover para produção sem aprovação explícita.

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

## Funcionalidades implementadas

- Painel público com pódio, ranking, pesquisa por nome/tag e expansão da classificação.
- Consulta pública de desempenho com seis metas fixas (20 guerras, 7 ligas, 24 raides, 5.000 doações, 10.000 pontos de jogos e 250.000 moedas de capital), índice de 0 a 100 e somente jogadores ativos, conforme o acesso de jogador original.
- Visão administrativa separada e protegida, com índice proporcional ao maior resultado de cada categoria (até 100 por categoria, total máximo de 600), filtro de inativos e ordenação completa, conforme a aba administrativa original.
- Painel dos três membros mais recentes, a partir de `clan_member_entries`.
- Histórico mensal, com preferência pelos snapshots arquivados, cálculo alternativo quando não há snapshot e arquivamento automático do mês anterior na entrada administrativa (somente se ainda não houver snapshot e existirem lançamentos).
- Área administrativa protegida por senha server-side e cookie HttpOnly; gestão de jogadores, visão administrativa de desempenho, edição/exclusão de lançamentos e exportação Excel/CSV.
- Operações administrativas de escrita validam a origem da requisição e a sessão JWT; alterações de cadastro identificam jogadores pela TAG quando disponível e recusam nomes ambíguos.\n- Reatribuição de lançamentos só permite jogadores ativos do clã e recusa destinos com nomes duplicados; o jogador histórico atual pode ser mantido.
- Workflow de validação executa testes unitários do planejador do Raide, auditoria das dependências de produção, teste de geração/leitura XLSX com ExcelJS e build Next.js.
- A lógica pura de planejamento dos pontos automáticos do Raide foi isolada em `scripts/raid_points.py`, sem acesso ao banco, com testes de idempotência para inserção, atualização de ataques, precedência de lançamentos manuais, consolidação de duplicatas, associação já resolvida pela TAG na prévia, fuso de Brasília e linhas repetidas no mesmo lote. O planejador deve receber o histórico completo de `events`, não apenas o mês atual, pois o fim de semana pode atravessar a virada mensal.
- Os workflows de sincronização existentes permanecem independentes.
- A branch `main` permanece preservada; desenvolvimento e validação web ocorrem em `vercel-rebuild`.

## Estado da implantação Preview — 09/11/2026

- Projeto Vercel `ghost-hunt-preview` criado e conectado ao repositório.
- Framework Next.js, Node.js 22 e Root Directory `web`.
- Implantação Preview da branch `vercel-rebuild` está READY no commit `605f0d42b287eb56e3ffda1e0ec41e5cdf458976`.
- URL da implantação validada: https://ghost-hunt-preview-bes4zwm5l-cristoferrsg-9877.vercel.app
- A proteção SSO da Vercel está habilitada para os previews protegidos.
- Variáveis de ambiente foram encontradas cadastradas no ambiente Preview; os valores secretos não foram lidos nem expostos.
- Login administrativo e carregamento da área administrativa foram testados pelo usuário.
- Gestão de jogadores foi conferida sem alterações nos dados.
- Consulta de lançamentos exibiu 499 registros; a categoria Guerra não aparece enquanto não houver lançamentos de guerra.
- Exportações Excel e CSV foram conferidas: 42 jogadores, 499 lançamentos no histórico, estrutura consistente e dados alinhados. Para doações, o ranking exibe pontos (1 ponto por 100 tropas), enquanto o desempenho exibe o total de tropas; exemplo validado: 380 tropas = 3 pontos.
- A tela de desempenho foi conferida após a correção do acumulador mensal: `¥√Snay_king¥√` aparece com 380 tropas doadas.
- CI de validação concluído com sucesso: testes do planejador, auditoria de dependências, TypeScript e build Next.js. Isso não substitui os testes de integração com o Supabase real.

## Atenção: deployment da branch main

O deployment de produção mais recente ficou em ERROR porque o projeto Vercel está configurado com Root Directory `web`, mas esse diretório não existe na branch `main`. O log da Vercel confirma: `The specified Root Directory "web" does not exist.`

Isso não afeta o Preview READY de `vercel-rebuild`. Não alterar a branch de produção, não fazer merge e não promover o Preview sem aprovação explícita. A versão Streamlit em `main` continua sendo a referência atual.

## Schema SQL legado

O arquivo raiz `supabase_schema.sql` não representa o schema completo usado pelo aplicativo atual: ele documenta apenas `players` e `events` em uma versão antiga e não inclui colunas/tabelas que o código atual consulta, como `player_tag`, `active`, `clan_member_entries`, `monthly_rankings` e `player_monthly_stats`. **Não execute esse SQL no projeto Supabase existente.** Antes de implementar novas consultas, faça uma inspeção somente de leitura do schema real no Supabase e valide colunas, constraints, índices e políticas RLS.

## Validações ainda pendentes

- Teste ponta a ponta das consultas Supabase em Preview e comparação sistemática com o Streamlit original, incluindo meses arquivados e jogadores inativos.
- Teste funcional de expiração da sessão e logout.\n- Teste de interface para salvar elegibilidade/WhatsApp com identificação por TAG e tentativa de reatribuição de lançamento para jogador inativo ou nome duplicado.
- Teste controlado e reversível das operações administrativas de escrita, sem apagar nem corromper registros reais.
- Revisão de segurança das rotas administrativas, incluindo validação de jogadores e identificação inequívoca por TAG/ID quando aplicável.
- O comando personalizado de Ignored Build Step foi removido para que os próximos commits na branch de Preview executem build normalmente; confirmar o comportamento no próximo deployment.
- Decidir separadamente como manter o projeto Preview isolado da branch `main`, sem alterar a produção atual.
- Integrar o planejador testado `scripts/raid_points.py` a um gravador Supabase independente, preservando a idempotência e tratando concorrência com o Streamlit. Por segurança, `raid_automation.py` e `raid-auto.yml` ainda não foram alterados; os eventos `RAIDE_AUTO:` continuam sendo gravados pelo `app.py`.
- Revisão final de segurança antes de qualquer implantação de produção.

O workflow de build comprova a compilação do Next.js, mas não substitui testes de integração. O Preview existe e está acessível com proteção SSO; produção não foi validada nem substituída.
