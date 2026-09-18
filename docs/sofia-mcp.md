# Sofia MCP — MVP

Endpoint remoto:

`https://rxvrcvibouvfmvucsehx.supabase.co/functions/v1/sofia-mcp`

O conector usa OAuth 2.1 com PKCE do Supabase. Cada pessoa autoriza a IA com sua própria conta do sistema, e as políticas de acesso do banco continuam sendo aplicadas.

Em produção, todos os comandos da Sofia ficam bloqueados no ambiente `producao`. Aprovação, cancelamento e avanço de produção validam o ambiente do registro antes de executar a ação.

## Escopo do MVP

- visão geral da operação;
- consulta ao portfólio e estoque;
- consulta de pedidos e produção;
- consulta aos cadastros administrativos;
- consulta, abertura e gravação de fichas da calculadora;
- aprovação e cancelamento de pedidos;
- avanço de itens na produção.

Comandos de escrita exigem as mesmas permissões do sistema. Cancelamento de pedido é marcado como ação destrutiva para a plataforma solicitar confirmação antes da execução.

## Voz

A conversão de voz em texto é responsabilidade do ChatGPT ou da plataforma conectada. A Sofia recebe a intenção já estruturada e executa a ferramenta correspondente.

## Configuração OAuth ativa no Supabase

- servidor OAuth 2.1: ativo;
- registro dinâmico de clientes: ativo;
- página de autorização: `https://gestao.sonhoemcamadas3d.com.br/oauth/consent.html`.
