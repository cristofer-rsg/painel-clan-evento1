# Ghost Hunt — política de alterações e publicações

## Fonte oficial
- `main` é a única fonte de código autorizada para produção.
- Branches de desenvolvimento nunca devem ser publicadas diretamente em produção.
- Antes de iniciar uma tarefa, atualizar a referência local/de trabalho a partir da `main` atual.
- Não mesclar branches antigas inteiras. Recuperações devem ser seletivas, arquivo a arquivo, com revisão das dependências.

## Antes de alterar
1. Registrar o SHA da produção e criar uma branch de backup nomeada `backup/production-AAAA-MM-DD`.
2. Criar branch exclusiva para a tarefa.
3. Identificar arquivos, rotas, componentes, tabelas, políticas RLS, workflows e integrações afetados.
4. Registrar o comportamento atual que precisa continuar funcionando.
5. Não executar alterações no banco de dados nem apagar dados sem plano de migração, backup e autorização explícita.

## Antes de integrar
1. Abrir Pull Request para `main`.
2. Revisar o diff completo e os arquivos removidos/renomeados.
3. Exigir o workflow `ghost-hunt-ci` aprovado.
4. Testar a prévia no celular e nas áreas afetadas.
5. Confirmar que a branch está atualizada com `main`.
6. Não aprovar se houver falha, regressão não explicada ou teste pendente.

## Publicação
1. Mesclar somente a PR aprovada.
2. A Vercel deve publicar o commit de `main`, nunca uma branch de desenvolvimento.
3. Conferir que o SHA publicado corresponde ao SHA aprovado.
4. Verificar o estado READY e os domínios de produção.
5. Executar smoke tests das rotas e funções alteradas.
6. Registrar o SHA final e a implantação.

## Reversão
- Se houver regressão, interromper novas mudanças.
- Reverter a PR ou promover a implantação estável anterior, conforme a natureza do problema.
- Se houver migração de banco, aplicar plano de reversão compatível; rollback de código não desfaz automaticamente alterações no banco.
- Confirmar dados, autenticação, sincronizações e rotas antes de retomar.

## Regras permanentes
- Nunca publicar uma branch antiga por cima da `main`.
- Nunca tratar apenas o status READY como prova de funcionamento.
- Nunca alterar funcionalidades fora do escopo sem diagnóstico e autorização.
- Nunca declarar testes manuais que não foram realmente executados.
- Toda alteração deve ter plano de reversão e evidência de validação.
