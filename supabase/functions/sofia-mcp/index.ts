import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient, type SupabaseClient} from 'npm:@supabase/supabase-js@2.116.0';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY=Deno.env.get('SUPABASE_ANON_KEY')!;
const MCP_URL=`${SUPABASE_URL}/functions/v1/sofia-mcp`;
const RESOURCE_METADATA=`${MCP_URL}/.well-known/oauth-protected-resource`;
const AUTHORIZATION_SERVER=`${SUPABASE_URL}/auth/v1`;
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type, mcp-protocol-version','access-control-allow-methods':'GET, POST, OPTIONS'};

type Json=Record<string,unknown>;
type Profile={id:string;name:string;email:string;role:'administrador'|'vendedor';active:boolean};
type Tool={name:string;description:string;inputSchema:Json;annotations?:Json};

const environmentSchema={type:'string',enum:['desenvolvimento','producao'],description:'Ambiente a consultar. Use desenvolvimento durante testes e producao para dados oficiais.'};
const tools:Tool[]=[
 {name:'visao_geral',description:'Mostra os totais atuais de portfólio, estoque, pedidos e produção.',inputSchema:{type:'object',properties:{ambiente:environmentSchema},required:['ambiente'],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'buscar_portfolio',description:'Busca produtos e kits no portfólio por nome ou categoria. O link do arquivo de impressão só é retornado para administradores.',inputSchema:{type:'object',properties:{busca:{type:'string'},categoria:{type:'string'},incluir_ocultos:{type:'boolean',default:false}},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'consultar_estoque',description:'Consulta o saldo físico dos produtos cadastrados.',inputSchema:{type:'object',properties:{busca:{type:'string'},somente_baixo:{type:'boolean',default:false},limite_baixo:{type:'integer',minimum:0,default:3}},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'listar_pedidos',description:'Lista pedidos com itens, valores e status respeitando o acesso do usuário.',inputSchema:{type:'object',properties:{ambiente:environmentSchema,status:{type:'string'},limite:{type:'integer',minimum:1,maximum:100,default:20}},required:['ambiente'],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'consultar_producao',description:'Consulta a esteira de produção e o estágio atual de cada item.',inputSchema:{type:'object',properties:{ambiente:environmentSchema,status:{type:'string',enum:['analise_produto','aguardando_producao','em_impressao','acabamento','pronto','cancelado']},limite:{type:'integer',minimum:1,maximum:100,default:30}},required:['ambiente'],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'listar_cadastros',description:'Lista insumos, impressoras ou vendedores ativos. Disponível para administradores.',inputSchema:{type:'object',properties:{tipo:{type:'string',enum:['insumos','impressoras','vendedores']},ambiente:environmentSchema,incluir_inativos:{type:'boolean',default:false}},required:['tipo','ambiente'],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'listar_simulacoes',description:'Lista fichas de cálculo salvas na calculadora.',inputSchema:{type:'object',properties:{ambiente:environmentSchema,busca:{type:'string'},limite:{type:'integer',minimum:1,maximum:100,default:20}},required:['ambiente'],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'abrir_simulacao',description:'Abre uma ficha de cálculo completa pelo identificador.',inputSchema:{type:'object',properties:{id:{type:'string',format:'uuid'}},required:['id'],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'salvar_simulacao',description:'Salva uma ficha de cálculo sem criar produto. Disponível para administradores.',inputSchema:{type:'object',properties:{ambiente:environmentSchema,nome:{type:'string',minLength:1,maxLength:160},ficha:{type:'object'},resultado:{type:'object'}},required:['ambiente','nome','ficha','resultado'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false}},
 {name:'aprovar_pedido',description:'Aprova um pedido. Baixa o estoque disponível e abre produção para o restante. Disponível para administradores.',inputSchema:{type:'object',properties:{pedido_id:{type:'string',format:'uuid'}},required:['pedido_id'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false}},
 {name:'cancelar_pedido',description:'Cancela um pedido e devolve ao estoque as quantidades já baixadas.',inputSchema:{type:'object',properties:{pedido_id:{type:'string',format:'uuid'},motivo:{type:'string',minLength:3,maxLength:500}},required:['pedido_id','motivo'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:true}},
 {name:'avancar_producao',description:'Move um item para a próxima etapa da produção. Disponível para administradores.',inputSchema:{type:'object',properties:{ordem_producao_id:{type:'string',format:'uuid'}},required:['ordem_producao_id'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false}},
];

const json=(body:unknown,status=200,headers:HeadersInit={})=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8',...headers}});
const rpcResult=(id:unknown,result:unknown)=>json({jsonrpc:'2.0',id,result});
const rpcError=(id:unknown,code:number,message:string,data?:unknown)=>json({jsonrpc:'2.0',id,error:{code,message,...(data===undefined?{}:{data})}});
const toolText=(data:unknown)=>({content:[{type:'text',text:JSON.stringify(data,null,2)}],structuredContent:{resultado:data}});
const toolError=(message:string)=>({content:[{type:'text',text:message}],isError:true});
const clamp=(value:unknown,fallback:number,max:number)=>Math.min(max,Math.max(1,Number(value)||fallback));
const adminOnly=(profile:Profile)=>{if(profile.role!=='administrador')throw new Error('Esta ação exige perfil de administrador.')};

async function invoke(name:string,args:Json,db:SupabaseClient,profile:Profile){
 const ambiente=String(args.ambiente||'desenvolvimento');
 if(name==='visao_geral'){
  const [products,orders,production,simulations]=await Promise.all([
   db.from('farm_portfolio_products').select('airtable_record_id,estoque',{count:'exact'}).eq('ativo',true),
   db.from('farm_orders').select('id,status',{count:'exact'}).eq('ambiente',ambiente),
   db.from('farm_production_orders').select('id,status',{count:'exact'}).eq('ambiente',ambiente).neq('status','pronto').neq('status','cancelado'),
   profile.role==='administrador'?db.from('farm_calculation_simulations').select('id',{count:'exact',head:true}).eq('ambiente',ambiente):Promise.resolve({count:null,error:null}),
  ]);
  const error=products.error||orders.error||production.error||simulations.error;if(error)throw error;
  const stock=(products.data||[]).reduce((sum,row)=>sum+Number(row.estoque||0),0);
  return {ambiente,produtos_ativos:products.count||0,unidades_em_estoque:stock,pedidos:orders.count||0,pedidos_por_status:Object.fromEntries(Object.entries((orders.data||[]).reduce<Record<string,number>>((acc,row)=>{acc[row.status]=(acc[row.status]||0)+1;return acc},{}))),itens_em_producao:production.count||0,simulacoes_salvas:simulations.count};
 }
 if(name==='buscar_portfolio'){
  const fields=profile.role==='administrador'?'airtable_record_id,nome,categoria,preco_venda,tempo_producao_h,estoque,largura_cm,altura_cm,link_produto,foto_urls,exibir_portfolio':'airtable_record_id,nome,categoria,preco_venda,tempo_producao_h,estoque,largura_cm,altura_cm,foto_urls,exibir_portfolio';
  let query=db.from('farm_portfolio_products').select(fields).eq('ativo',true).order('categoria').order('nome').limit(100);
  if(profile.role!=='administrador'||args.incluir_ocultos!==true)query=query.eq('exibir_portfolio',true);
  if(args.busca)query=query.ilike('nome',`%${String(args.busca).slice(0,120)}%`);
  if(args.categoria)query=query.ilike('categoria',String(args.categoria).slice(0,100));
  const {data,error}=await query;if(error)throw error;return {total:data?.length||0,produtos:data||[]};
 }
 if(name==='consultar_estoque'){
  let query=db.from('farm_portfolio_products').select('airtable_record_id,nome,categoria,estoque,exibir_portfolio').eq('ativo',true).order('estoque').order('nome').limit(150);
  if(args.busca)query=query.ilike('nome',`%${String(args.busca).slice(0,120)}%`);
  if(args.somente_baixo===true)query=query.lte('estoque',Math.max(0,Number(args.limite_baixo)||3));
  const {data,error}=await query;if(error)throw error;return {total:data?.length||0,produtos:data||[]};
 }
 if(name==='listar_pedidos'){
  let query=db.from('farm_orders').select('id,numero,cliente_nome,vendedor_nome,data_pedido,prazo_solicitado,forma_pagamento,subtotal,desconto_percentual,valor_total,status,observacoes,itens:farm_order_items(id,produto_id,produto_nome,quantidade,preco_unitario,tipo,detalhes,link_referencia,foto_urls,estoque_baixado,producao_necessaria)').eq('ambiente',ambiente).order('numero',{ascending:false}).limit(clamp(args.limite,20,100));
  if(args.status)query=query.eq('status',String(args.status));
  const {data,error}=await query;if(error)throw error;return {total:data?.length||0,pedidos:data||[]};
 }
 if(name==='consultar_producao'){
  adminOnly(profile);let query=db.from('farm_production_orders').select('id,pedido_id,produto_id,produto_nome,quantidade,status,detalhes,link_referencia,foto_urls,criado_em,pedido:farm_orders(numero,cliente_nome)').eq('ambiente',ambiente).order('criado_em',{ascending:false}).limit(clamp(args.limite,30,100));
  if(args.status)query=query.eq('status',String(args.status));const {data,error}=await query;if(error)throw error;return {total:data?.length||0,producao:data||[]};
 }
 if(name==='listar_cadastros'){
  adminOnly(profile);const tipo=String(args.tipo);let query;
  if(tipo==='insumos')query=db.from('farm_supplies').select('id,nome,valor_compra,quantidade_compra,unidade_medida,ativo').order('nome');
  else if(tipo==='impressoras')query=db.from('farm_printers').select('id,nome,potencia_watts,tarifa_energia_kwh,custo_maquina_hora,ativo').order('nome');
  else query=db.from('farm_sellers').select('id,nome,telefone,email,usuario_id,ativo').eq('ambiente',ambiente).order('nome');
  if(args.incluir_inativos!==true)query=query.eq('ativo',true);const {data,error}=await query;if(error)throw error;return {tipo,total:data?.length||0,registros:data||[]};
 }
 if(name==='listar_simulacoes'){
  adminOnly(profile);let query=db.from('farm_calculation_simulations').select('id,nome,result,created_at,updated_at').eq('ambiente',ambiente).order('updated_at',{ascending:false}).limit(clamp(args.limite,20,100));if(args.busca)query=query.ilike('nome',`%${String(args.busca).slice(0,120)}%`);const {data,error}=await query;if(error)throw error;return {total:data?.length||0,simulacoes:data||[]};
 }
 if(name==='abrir_simulacao'){
  adminOnly(profile);const {data,error}=await db.from('farm_calculation_simulations').select('*').eq('id',String(args.id)).single();if(error)throw error;return data;
 }
 if(name==='salvar_simulacao'){
  adminOnly(profile);const nome=String(args.nome||'').trim();if(!nome)throw new Error('Informe o nome da simulação.');const {data,error}=await db.from('farm_calculation_simulations').insert({ambiente,nome,sheet:args.ficha,result:args.result}).select('id,nome,ambiente,created_at').single();if(error)throw error;return {mensagem:'Simulação salva sem criar produto.',simulacao:data};
 }
 if(name==='aprovar_pedido'){
  adminOnly(profile);const {data,error}=await db.rpc('farm_approve_order',{p_order_id:String(args.pedido_id)});if(error)throw error;return {mensagem:'Pedido aprovado; estoque e produção atualizados pelas regras do sistema.',resultado:data};
 }
 if(name==='cancelar_pedido'){
  const motivo=String(args.motivo||'').trim();if(motivo.length<3)throw new Error('Informe o motivo do cancelamento.');const {data,error}=await db.rpc('farm_cancel_order',{p_order_id:String(args.pedido_id),p_reason:motivo});if(error)throw error;return {mensagem:'Pedido cancelado e estoque restituído conforme as regras do sistema.',resultado:data};
 }
 if(name==='avancar_producao'){
  adminOnly(profile);const id=String(args.ordem_producao_id);const {data:current,error:readError}=await db.from('farm_production_orders').select('id,pedido_id,produto_nome,status').eq('id',id).single();if(readError)throw readError;const next:Record<string,string>={analise_produto:'aguardando_producao',aguardando_producao:'em_impressao',em_impressao:'acabamento',acabamento:'pronto'};const newStatus=next[current.status];if(!newStatus)throw new Error('Esta ordem não possui uma próxima etapa.');const {error}=await db.from('farm_production_orders').update({status:newStatus,atualizado_em:new Date().toISOString()}).eq('id',id);if(error)throw error;if(newStatus==='pronto'){const {data:siblings}=await db.from('farm_production_orders').select('status').eq('pedido_id',current.pedido_id);if((siblings||[]).every(row=>row.status==='pronto'||row.status==='cancelado'))await db.from('farm_orders').update({status:'pronto',atualizado_em:new Date().toISOString()}).eq('id',current.pedido_id)}return {mensagem:`${current.produto_nome} avançou para ${newStatus}.`,status:newStatus};
 }
 throw new Error(`Ferramenta desconhecida: ${name}`);
}

Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 const url=new URL(request.url);
 if(url.pathname.endsWith('/.well-known/oauth-protected-resource'))return json({resource:MCP_URL,authorization_servers:[AUTHORIZATION_SERVER],bearer_methods_supported:['header'],scopes_supported:['openid','email','profile']});
 if(request.method==='GET')return json({name:'Sofia · Sonho em Camadas 3D',description:'MCP seguro para consultar e operar a Gestão Sonho em Camadas 3D.',protocol:'MCP Streamable HTTP',endpoint:MCP_URL});
 if(request.method!=='POST')return json({error:'Método não permitido.'},405);
 const authorization=request.headers.get('authorization')||'';const token=authorization.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)return json({error:'Autenticação necessária.'},401,{'www-authenticate':`Bearer resource_metadata="${RESOURCE_METADATA}"`});
 const db=createClient(SUPABASE_URL,SUPABASE_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:userError}=await db.auth.getUser(token);
 if(userError||!user)return json({error:'Sessão inválida ou expirada.'},401,{'www-authenticate':`Bearer error="invalid_token", resource_metadata="${RESOURCE_METADATA}"`});
 const {data:profile,error:profileError}=await db.from('farm_profiles').select('id,name,email,role,active').eq('id',user.id).single();
 if(profileError||!profile||!profile.active)return json({error:'Conta não aprovada ou sem acesso.'},403);
 let body:Json;try{body=await request.json()}catch{return rpcError(null,-32700,'JSON inválido.')}
 const id=body.id??null,method=String(body.method||'');
 if(method==='initialize')return rpcResult(id,{protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'sofia-sonho-em-camadas-3d',title:'Sofia · Sonho em Camadas 3D',version:'0.1.0'},instructions:'Use as ferramentas para responder em português. Confirme com o usuário antes de cancelar pedidos. Respeite o ambiente solicitado.'});
 if(method==='notifications/initialized')return new Response(null,{status:202,headers:cors});
 if(method==='ping')return rpcResult(id,{});
 if(method==='tools/list')return rpcResult(id,{tools});
 if(method==='tools/call'){
  const params=(body.params||{}) as Json,name=String(params.name||''),args=(params.arguments||{}) as Json;
  try{return rpcResult(id,toolText(await invoke(name,args,db,profile as Profile)))}catch(error){return rpcResult(id,toolError(error instanceof Error?error.message:'Não foi possível executar o comando.'))}
 }
 return rpcError(id,-32601,'Método não encontrado.');
});
