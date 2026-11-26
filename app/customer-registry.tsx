'use client';

import {useEffect,useState,type SyntheticEvent} from 'react';
import {supabase} from '@/lib/supabase';

type Customer={id:string;nome:string;telefone:string|null;email:string|null};
type CustomerOrder={id:string;cliente_id:string|null;cliente_nome:string};
type RegistryProps={environment:string;onChanged:()=>void};
const columns='id,nome,telefone,email';
const emptyCustomer={id:'',nome:'',telefone:'',email:''};

async function listCustomers(environment:string){
 const {data,error}=await supabase.from('farm_customers').select(columns).eq('ambiente',environment).order('nome').order('id');
 if(error)throw error;
 return data as Customer[];
}

export default function CustomerRegistry({environment,onChanged,version}:{version:number}&RegistryProps){
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [draft,setDraft]=useState<Customer|null>(null);
 const [query,setQuery]=useState('');
 const [message,setMessage]=useState('');
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);

 useEffect(()=>{
  let active=true;
  void listCustomers(environment).then(data=>{
   if(active){setCustomers(data);setLoading(false);}
  }).catch(()=>{
   if(active){setMessage('Não foi possível carregar os clientes. Atualize a página e tente novamente.');setLoading(false);}
  });
  return()=>{active=false};
 },[environment,version]);

 async function save(event:SyntheticEvent<HTMLFormElement>){
  event.preventDefault();
  if(!draft||saving)return;
  const name=draft.nome.trim();
  if(!name){setMessage('Informe o nome do cliente.');return}
  const values={nome:name,telefone:draft.telefone?.trim()||null,email:draft.email?.trim()||null};
  setSaving(true);
  setMessage('');
  try{
   const request=draft.id
    ?supabase.from('farm_customers').update(values).eq('id',draft.id).eq('ambiente',environment)
    :supabase.from('farm_customers').insert({...values,ambiente:environment});
   const {data,error}=await request.select(columns).single();
   if(error)throw error;
   setCustomers(current=>[...current.filter(item=>item.id!==data.id),data as Customer].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')));
   setMessage(draft.id?'Cliente atualizado. Os pedidos vinculados já usam o nome corrigido.':'Cliente cadastrado. Você pode vinculá-lo a um pedido.');
   setDraft(null);
   onChanged();
  }catch{setMessage('Não foi possível salvar o cliente. Confira os dados e tente novamente.')}
  finally{setSaving(false)}
 }

 const search=query.trim().toLocaleLowerCase('pt-BR');
 const visible=customers.filter(customer=>[customer.nome,customer.telefone,customer.email].some(value=>value?.toLocaleLowerCase('pt-BR').includes(search)));
 return <>
  <div className="section-title"><div><h3>Clientes</h3><p className="muted">Corrija o nome do cliente para atualizar os pedidos vinculados.</p></div>
   <button type="button" className="secondary" disabled={loading||saving} onClick={()=>{setDraft(emptyCustomer);setMessage('')}}>Novo cliente</button>
  </div>
  {draft&&<form className="registry-form" onSubmit={save}>
   <label>Nome do cliente<input value={draft.nome} maxLength={160} required onChange={event=>setDraft({...draft,nome:event.target.value})}/></label>
   <label>Telefone ou WhatsApp<input type="tel" value={draft.telefone??''} onChange={event=>setDraft({...draft,telefone:event.target.value})}/></label>
   <label>E-mail<input type="email" value={draft.email??''} onChange={event=>setDraft({...draft,email:event.target.value})}/></label>
   <div className="registry-form-actions"><button disabled={saving}>{saving?'Salvando…':'Salvar cliente'}</button>
    <button type="button" className="secondary" disabled={saving} onClick={()=>setDraft(null)}>Cancelar</button></div>
  </form>}
  {message&&<output className="notice">{message}</output>}
  <label>Buscar cliente<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Nome, telefone ou e-mail"/></label>
  <div className="printer-summary">
   {loading?<p>Carregando clientes…</p>:visible.length===0?<p className="muted">Nenhum cliente encontrado. Você também pode cadastrar um cliente pela lista de pedidos.</p>:visible.map(customer=><article key={customer.id}>
    <strong>{customer.nome}</strong><span>{[customer.telefone,customer.email].filter(Boolean).join(' · ')||'Sem contato informado'}</span>
    <div className="registry-card-actions"><button type="button" className="secondary" disabled={saving} onClick={()=>{setDraft(customer);setMessage('')}}>Editar cliente</button></div>
   </article>)}
  </div>
 </>;
}

export function OrderCustomerAction({order,environment,onChanged}:RegistryProps&{order:CustomerOrder}){
 const [open,setOpen]=useState(false);
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [selected,setSelected]=useState('');
 const [name,setName]=useState(order.cliente_nome);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const panelId=`order-customer-${order.id}`;

 async function toggle(){
  if(open){setOpen(false);return}
  setOpen(true);
  setMessage('');
  setSelected('');
  setName(order.cliente_nome);
  if(order.cliente_id)return;
  setBusy(true);
  try{setCustomers(await listCustomers(environment))}
  catch{setMessage('Não foi possível consultar o cadastro. Feche e tente novamente.')}
  finally{setBusy(false)}
 }

 async function save(event:SyntheticEvent<HTMLFormElement>){
  event.preventDefault();
  if((!selected&&!name.trim())||busy)return;
  setBusy(true);
  setMessage('');
  try{
   if(order.cliente_id){
    const {error}=await supabase.from('farm_customers').update({nome:name.trim()})
     .eq('id',order.cliente_id).eq('ambiente',environment).select('id').single();
    if(error)throw error;
   }else{
    const {error}=await supabase.rpc('farm_link_order_customer',{p_order_id:order.id,p_environment:environment,p_customer_id:selected||null,p_name:selected?null:name.trim()});
    if(error)throw error;
   }
   setOpen(false);
   onChanged();
  }catch{setMessage('Não foi possível atualizar o cliente. Atualize o pedido e tente novamente.')}
  finally{setBusy(false)}
 }

 return <div className={open?'order-receipts is-open':'order-receipts'}>
  <button type="button" className="secondary" aria-expanded={open} aria-controls={panelId} disabled={busy} onClick={()=>void toggle()}>{open?'Fechar cliente':'Corrigir cliente'}</button>
  <section id={panelId} className="order-receipts-panel" hidden={!open} aria-label="Cliente do pedido">
   {open&&<form onSubmit={save}>
    {order.cliente_id
     ?<p className="muted">O nome também será atualizado nos demais pedidos vinculados a este cliente.</p>
     :<label>Cliente cadastrado<select value={selected} disabled={busy} onChange={event=>setSelected(event.target.value)}>
      <option value="">Criar cadastro para este pedido</option>
      {customers.map(customer=><option key={customer.id} value={customer.id}>{customer.nome}{customer.telefone?` · ${customer.telefone}`:''}</option>)}
     </select></label>}
    {!selected&&<label>Nome correto do cliente<input value={name} required maxLength={160} disabled={busy} onChange={event=>setName(event.target.value)}/></label>}
    {message&&<output className="notice">{message}</output>}
    <button type="submit" disabled={busy}>{busy?'Aguarde…':order.cliente_id?'Salvar nome':selected?'Vincular cliente':'Cadastrar e corrigir pedido'}</button>
   </form>}
  </section>
 </div>;
}
