# Sofia MCP — MVP

Endpoint remoto:

`https://rxvrcvibouvfmvucsehx.supabase.co/functions/v1/sofia-mcp`

O conector usa OAuth 2.1 com PKCE do Supabase. Cada pessoa autoriza a IA com sua própria conta do sistema, e as políticas de acesso do banco continuam sendo aplicadas.

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

## Configuração pendente no Supabase

1. ativar o servidor OAuth 2.1;
2. usar como página de autorização `https://gestao.sonhoemcamadas3d.com.br/oauth/consent/`;
3. habilitar registro dinâmico de clientes para permitir a conexão pelo ChatGPT.
