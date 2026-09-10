# Protótipo Sonho em Camadas

Dados fictícios, mantidos somente na memória da página. Sem integração com Airtable, banco ou login próprio. A publicação Sites usa acesso privado do proprietário.

## Executar

`npm ci` e `npm run dev`. Para gerar versão estática: `npm run build`.

O script de build adia em 500 ms a saída do Vinext no Windows para permitir o encerramento dos handles nativos. Preserva o código de saída de erros. Não modifica dependências.

## Verificação realizada

- TypeScript sem erros.
- Custo unitário 8,736; congelamento na confirmação; produção 8 + 2; impedimento de entrega antecipada/repetida; pagamentos 40 + 170; rejeição de pagamento negativo ou acima do saldo.
- Rota local respondeu HTTP 200. Build estático concluído.
- Revisão visual e interações em navegador ainda dependem da revisão do usuário; não foi solicitada execução de testes de navegador.
- Ferramenta opcional WebMCP `read_demo_order` consulta o estado sem escrita. Sem contexto WebMCP disponível para validar registro e execução; não verificada em navegador.

Ver ESCOPO-V1.md para limites e roteiro de revisão.

## Etapa 2 — Ficha editável
A tela Produtos e custos permite preencher a ficha e salvar explicitamente uma ficha no armazenamento local do navegador. Pedidos fictícios não recebem seus dados. Validações numéricas, taxas, margem e salvamento/recuperação foram conferidos. Não há upload/importação ou banco. Rascunho não salvo é perdido ao recarregar.
