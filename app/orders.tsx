'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {CalendarDays,Clock3,FilterX,RefreshCw,Search,ShoppingBag,UserRoundCheck} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import './orders.css';

type OrderItem={produto_nome:string};
type Order={id:string;numero:number;cliente_nome:string;vendedor_id:string;vendedor_nome:string;data_pedido:string;prazo_solicitado:string|null;valor_total:number;status:string;items:OrderItem[]};
type RawOrder=Omit<Order,'items'>&{itens:OrderItem[]|null};

const reais=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const orderEnvironment=import.meta.env.BASE_URL.includes('/desenvolvimento/')?'desenvolvimento':'producao';
const pricingStatuses=new Set(['aguardando_precificacao','em_precificacao','precificado','aguardando_confirmacao_vendedor']);
const statusLabels:Record<string,string>={
 rascunho:'Rascunho',aguardando_precificacao:'Aguardando precificação',em_precificacao:'Em precificação',precificado:'Precificado',aguardando_confirmacao_vendedor:'Aguardando confirmação',aguardando_aprovacao:'Aguardando aprovação',devolvido_ajuste:'Devolvido para ajuste',reprovado:'Reprovado',aprovado:'Aprovado',em_producao:'Em produção',pronto:'Pronto',entregue:'Entregue',cancelado:'Cancelado'
};
const statusOptions=Object.entries(statusLabels);
const formatDate=(value:string|null)=>value?new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR'):'Não informado';
const orderNumber=(value:number)=>`#${String(value).padStart(4,'0')}`;

export default function Orders({administrator,userId}:{administrator:boolean;userId:string}){
 const [orders,setOrders]=useState<Order[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[status,setStatus]=useState('todos'),[seller,setSeller]=useState('todos'),[period,setPeriod]=useState('todos');
 const [today]=useState(()=>new Date());

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  let request=supabase.from('farm_orders').select('id,numero,cliente_nome,vendedor_id,vendedor_nome,data_pedido,prazo_solicitado,valor_total,status,itens:farm_order_items(produto_nome)').eq('ambiente',orderEnvironment).order('data_pedido',{ascending:false}).order('numero',{ascending:false});
  if(!administrator)request=request.eq('vendedor_id',userId);
  const {data,error:loadError}=await request;
  if(loadError){setOrders([]);setError('Não foi possível carregar os pedidos. Tente novamente.')}else setOrders(((data||[]) as unknown as RawOrder[]).map(order=>({...order,numero:Number(order.numero),valor_total:Number(order.valor_total),items:order.itens||[]})));
  setLoading(false);
 },[administrator,userId]);

 useEffect(()=>{const timer=window.setTimeout(()=>{void load()},0);return()=>window.clearTimeout(timer)},[load]);

 const sellers=useMemo(()=>Array.from(new Map(orders.map(order=>[order.vendedor_id,order.vendedor_nome])).entries()).sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')),[orders]);
 const visible=useMemo(()=>{
  const normalized=query.trim().toLocaleLowerCase('pt-BR').replace(/^#/,'');
  const days=period==='todos'?null:Number(period);
  const cutoff=days?new Date(today.getTime()-days*86400000).toISOString().slice(0,10):null;
  return orders.filter(order=>{
   const searchText=[order.numero,order.cliente_nome,...order.items.map(item=>item.produto_nome)].join(' ').toLocaleLowerCase('pt-BR');
   return (!normalized||searchText.includes(normalized))&&(status==='todos'||order.status===status)&&(seller==='todos'||order.vendedor_id===seller)&&(!cutoff||order.data_pedido>=cutoff);
  });
 },[orders,period,query,seller,status,today]);
 const approvalCount=orders.filter(order=>order.status==='aguardando_aprovacao').length;
 const pricingCount=orders.filter(order=>pricingStatuses.has(order.status)).length;
 const hasFilters=query!==''||status!=='todos'||seller!=='todos'||period!=='todos';
 const clearFilters=()=>{setQuery('');setStatus('todos');setSeller('todos');setPeriod('todos')};

 return <section className="orders-module" aria-label="Lista de pedidos">
  <div className="order-metrics">
   <article><span className="order-metric-icon"><ShoppingBag size={20}/></span><div><small>Pedidos encontrados</small><strong>{visible.length}</strong></div></article>
   <article><span className="order-metric-icon warning"><UserRoundCheck size={20}/></span><div><small>Aguardando aprovação</small><strong>{approvalCount}</strong></div></article>
   <article><span className="order-metric-icon pricing"><Clock3 size={20}/></span><div><small>Em fluxo de precificação</small><strong>{pricingCount}</strong></div></article>
  </div>
  <section className="panel orders-panel">
   <div className="orders-title"><div><h2>Lista de pedidos</h2><p className="muted">Pesquise e acompanhe os pedidos {administrator?'de toda a equipe':'registrados por você'}.</p></div><button className="secondary" disabled={loading} onClick={()=>void load()}><RefreshCw size={16}/>{loading?'Atualizando…':'Atualizar'}</button></div>
   <div className="order-filters">
    <label className="order-search"><span>Pesquisar</span><span className="order-input-wrap"><Search size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Número, cliente ou produto"/></span></label>
    <label>Status<select value={status} onChange={event=>setStatus(event.target.value)}><option value="todos">Todos os status</option>{statusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    {administrator&&<label>Vendedor<select value={seller} onChange={event=>setSeller(event.target.value)}><option value="todos">Todos os vendedores</option>{sellers.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>}
    <label>Período<select value={period} onChange={event=>setPeriod(event.target.value)}><option value="todos">Todo o período</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select></label>
    {hasFilters&&<button className="secondary clear-order-filters" onClick={clearFilters}><FilterX size={16}/> Limpar filtros</button>}
   </div>
   {error&&<p className="global-alert" role="alert">{error}</p>}
   {loading?<div className="orders-empty"><p>Carregando pedidos…</p></div>:visible.length===0?<div className="orders-empty"><ShoppingBag size={30}/><h3>{hasFilters?'Nenhum pedido encontrado':'Nenhum pedido cadastrado'}</h3><p>{hasFilters?'Altere ou limpe os filtros para ampliar a consulta.':'Os pedidos aparecerão aqui quando forem registrados.'}</p></div>:<ul className="order-list">{visible.map(order=>{const overdue=Boolean(order.prazo_solicitado&&order.prazo_solicitado<today.toISOString().slice(0,10)&&!['entregue','cancelado','reprovado'].includes(order.status));return <li className="order-row" key={order.id}>
    <div className="order-main"><strong>{orderNumber(order.numero)}</strong><span>{order.cliente_nome}</span><small>{order.items.length?order.items.map(item=>item.produto_nome).join(', '):'Itens ainda não informados'}</small></div>
    <div className="order-field"><small>Vendedor</small><strong>{order.vendedor_nome}</strong></div>
    <div className="order-field"><small>Data</small><strong>{formatDate(order.data_pedido)}</strong></div>
    <div className={overdue?'order-field overdue':'order-field'}><small>Prazo</small><strong><CalendarDays size={14}/>{formatDate(order.prazo_solicitado)}</strong></div>
    <div className="order-field order-value"><small>Total</small><strong>{reais.format(order.valor_total)}</strong></div>
    <span className={`order-status status-${order.status}`}>{statusLabels[order.status]||order.status}</span>
   </li>})}</ul>}
   {!loading&&visible.length>0&&<p className="order-results">Exibindo {visible.length} de {orders.length} {orders.length===1?'pedido':'pedidos'}.</p>}
  </section>
 </section>
}
