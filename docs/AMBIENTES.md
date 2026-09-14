# Ambientes do sistema

## Produção

- Branch: `main`
- Endereço: `https://rfelixtrigueiro-beep.github.io/sonho-camadas-gestao/`
- Recebe somente versões aprovadas pelo responsável do produto.

## Desenvolvimento

- Branch: `develop`
- Endereço: `https://rfelixtrigueiro-beep.github.io/sonho-camadas-gestao/desenvolvimento/`
- Recebe automaticamente as alterações em desenvolvimento para testes no computador e no celular.

## Processo de atualização

1. Criar e alterar funcionalidades na branch `develop`.
2. Publicar automaticamente no endereço de desenvolvimento.
3. Realizar os testes e apresentar a versão para aprovação.
4. Aguardar a aprovação explícita do responsável do produto.
5. Incorporar a versão aprovada na branch `main`.
6. Conferir a publicação em produção.

## Dados

Enquanto os dois ambientes utilizarem o mesmo projeto Supabase, testes que gravam dados devem usar registros identificados para teste ou estruturas isoladas. Funcionalidades novas que alterem o banco devem ser preparadas e validadas no ambiente de desenvolvimento antes da migração para produção.
