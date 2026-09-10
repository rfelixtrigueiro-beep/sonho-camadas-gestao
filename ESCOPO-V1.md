# Sonho em Camadas 3D — Escopo da primeira versão

Proposta para validação • 10 de setembro de 2026

## Objetivo
Concluir o ciclo produto → custo → pedido → produção → estoque → recebimento com rastreabilidade. Primeiro validar o protótipo com dados fictícios; depois implementar banco, acesso e piloto. Airtable continua operacional e não foi alterado.

## Entrega atual
Protótipo responsivo em português: painel, composição de custo editável, pedido com dois itens, confirmação com valores congelados, produção parcial, movimentos de estoque, entrega e recebimentos parciais. Dados somente na memória da página: recarregar ou reiniciar restaura o exemplo. Sem cadastro real, banco, login, integração ou migração.

O scaffold anterior foi inspecionado: usa Vinext, não Next.js padrão. Foram reaproveitados fontes e dependências selecionados em `prototipo/`, sem copiar node_modules, credenciais ou metadados antigos. A direção para o sistema definitivo permanece Next.js, TypeScript, Supabase, Tailwind e shadcn/ui. O GitHub privado ainda precisa ser vinculado e reconciliado; a publicação do protótipo usa um repositório separado.

## V1 operacional, após aprovação das telas
| Área | Incluído | Critério de aceite |
|---|---|---|
| Produtos e custos — C01–C07, C10 | Ficha versionada, materiais e etapas; energia, máquina, trabalho, acabamento, embalagem e perdas separados | Dividir apenas custos compartilhados; kg/g e h/min explícitos; sinalizar custos incompletos; preservar precisão e preço aprovado |
| Preços — C08–C09 | Canal com taxas percentuais e fixas, frete e desconto; margem distinta de markup | Bloquear soma de taxas e margem ≥ 100%; conciliar receita, custo e despesas |
| Pedidos e clientes — V01–V05 | Cliente único; itens com quantidade, preço e custo próprios; condições congeladas | Alterar catálogo não altera pedido confirmado; rateios conciliam com totais; estados independentes |
| Produção — P01–P06 | Ordem por item ou reposição; máquina, prazo, prioridade, estados, parciais e reimpressões; previsto e realizado | 10 previstas e 8 aprovadas deixam 2 pendentes; conclusão repetida não duplica efeitos; avisar conflito/manutenção |
| Estoque — E01–E03 (interno) | Livro de movimentos, físico/reservado/disponível e valorização; referência coerente entre materiais e filamentos | Origem rastreável; não permitir disponível negativo; perdas/ajustes exigem motivo |
| Recebimentos — V07 | Parcelas, vencimentos, pagamentos parciais e estornos rastreáveis | Venda 100 menos recebido 40 deixa 60; pagamento não conclui produção/entrega |
| Indicadores — R01 | Período explícito, vendas e recebimentos separados | Cancelados tratados conforme regra documentada; margem de contribuição não chamada de lucro |
| Acesso e recuperação — I03 | Login, permissões e backup de dados, vínculos e arquivos | Bloquear acesso não autorizado; ensaiar restauração antes do piloto |

## Depois do fluxo inicial
Orçamentos versionados (V06), consignações por parceiro/remessa/produto e financeiro do parceiro (G01–G02 e saldo em parceiros de E02), portal (G03), metas (R02), importação de fatiador (I01) e PDFs comerciais (I02). Estoque em parceiros não será considerado disponível no ateliê. Migração histórica terá conferência própria; nenhuma sincronização bidirecional inicial.

## Hipóteses fictícias demonstradas
- Lote: 10 vasos; PLA 240 g a R$ 100/kg e PETG 60 g a R$ 120/kg; 6 h compartilhadas; energia 0,1 kW a R$ 1/kWh; máquina R$ 2/h sem energia; trabalho manual 30 min a R$ 24/h por lote; acabamento R$ 1 e embalagem R$ 2 por peça.
- Perda de 5% somente sobre material teórico. Suporte já incluído nos gramas. Custo R$ 8,736 por vaso, exibido R$ 8,74. Não define a regra real do negócio.
- Preço aprovado R$ 20. Segundo item: chaveiro a R$ 5, custo R$ 2. Pedido: 10 vasos + 2 chaveiros = R$ 210. Canal direto sem despesas/descontos. Sinal R$ 40 deixa R$ 170.
- Confirmação congela preço/custo e reserva os 2 chaveiros disponíveis. Vasos começam sem estoque; são reservados ao aprovar a produção. Entrega integral exige todos os itens e baixa físico/reservado uma única vez.
- Produção mostra 8 + 2 aprovadas, sem simular falha física. Consumo real, sucata e reimpressões terão registro próprio; pendente não significa falha.
- Uma máquina e uma ordem. Agenda, manutenção, cancelamentos, estornos, clientes editáveis, múltiplos pedidos, rateios e consumo de filamentos não são interativos nesta entrega.

## Decisões de negócio a validar
1. Tempo e consumo atuais são por lote ou unidade? A ficha poderá misturar ambos?
2. Qual base de perdas, separação de suportes/descarte/falhas e margem por canal?
3. Reservar na confirmação ou após sinal? Consumir material no início ou apontamento? Permitir entrega parcial?
4. Proposta para desconto/despesas: ratear proporcionalmente ao valor bruto dos itens, atribuindo diferença de centavos ao último item. Validar antes de implementar.
5. Quais históricos têm preço/custo confiáveis? Como marcar desconhecidos sem recalcular vendas antigas?

## Roteiro para revisão
1. Em Produtos e custos, modificar PLA: custo/sugestão mudam e preço aprovado continua R$ 20.
2. Confirmar pedido de R$ 210; alterar catálogo e conferir custo congelado.
3. Iniciar produção; aprovar 8 e depois 2 peças. Conferir pendências e movimentos; não permitir conclusão duplicada.
4. Registrar R$ 40 e conferir saldo R$ 170. Registrar R$ 170 e conferir saldo zero. Rejeitar valores negativos ou acima do saldo.
5. Entregar os itens e conferir saída de 10 vasos e 2 chaveiros sem alterar pagamentos. Bloquear entrega repetida.
6. Percorrer navegação em celular e computador. Recarregar restaura cenário.

## Sequência de implantação
Validar telas/hipóteses → reconciliar GitHub e preparar aplicação definitiva → banco/permissões/transações → testes de regras críticas e recuperação → piloto com poucos registros → importação conferida e migração autorizada. Aprovar protótipo não equivale a sistema pronto para operação.

## Etapa 2 — Ficha editável
Implementada ficha independente da demonstração, com nome, vários filamentos, consumo por lote em gramas, preço por kg, quantidade do lote, horas, potência em W, energia/kWh, máquina/hora, trabalho manual em minutos, acabamento/embalagem por peça, reserva percentual de material, comissão, pagamento, impostos, tarifa fixa/frete por peça e margem. Preço pretendido opcional permite avaliar contribuição e margem efetiva.

Uma ficha pode ser salva explicitamente no navegador e recuperada ao recarregar. Não é catálogo, banco ou sincronização; salvar substitui a ficha anterior. Rascunhos ficam durante a navegação interna. Dados vazios bloqueiam cálculo, sem assumir zero. Ainda não há importação de fatiador/planilha. Pedidos de demonstração permanecem independentes.

Validação: TypeScript e cálculo automatizado (lote, conversões, valores vazios/negativos, margem+taxas >=100%, vírgula decimal, preço com taxas); navegador confirmou exemplo 8,74/13,44, vazio bloqueado e ficha recuperada após salvar/recarregar. Demais achados de usabilidade da versão 1 continuam no relatório.
