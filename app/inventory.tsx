'use client';
import {useEffect,useState} from 'react';
import {Check, Pencil, RefreshCw, X} from 'lucide-react';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {supabase} from '@/lib/supabase';

type InventoryProduct={airtable_record_id:string;nome:string;estoque:number|null;categoria:string|null;exibir_portfolio:boolean};

export default function Inventory(){
 const [products,setProducts]=useState<InventoryProduct[]>([]);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');
 const [editingId,setEditingId]=useState<string|null>(null);
 const [stockValue,setStockValue]=useState('0');
 const [savingId,setSavingId]=useState<string|null>(null);

 async function refresh(){
  setLoading(true);setMessage('');
  const {data,error}=await supabase.from('farm_portfolio_products').select('airtable_record_id,nome,estoque,categoria,exibir_portfolio').eq('ativo',true).order('nome');
  if(error){setProducts([]);setMessage('Não foi possível carregar o estoque. Tente novamente.')}else{setProducts((data||[]) as InventoryProduct[]);setMessage('Estoque atualizado.')}
  setLoading(false);
 }

 useEffect(()=>{
  let active=true;
  void supabase.from('farm_portfolio_products').select('airtable_record_id,nome,estoque,categoria,exibir_portfolio').eq('ativo',true).order('nome').then(({data,error})=>{
   if(!active)return;
   if(error){setProducts([]);setMessage('Não foi possível carregar o estoque. Tente novamente.')}else{setProducts((data||[]) as InventoryProduct[])}
   setLoading(false);
  });
  return()=>{active=false};
 },[]);

 function startEditing(product:InventoryProduct){setEditingId(product.airtable_record_id);setStockValue(String(product.estoque??0));setMessage('')}
 function cancelEditing(){setEditingId(null);setStockValue('0')}
 async function saveStock(product:InventoryProduct){
  const nextStock=Number(stockValue);
  if(!Number.isInteger(nextStock)||nextStock<0){setMessage('Informe uma quantidade inteira igual ou maior que zero.');return}
  setSavingId(product.airtable_record_id);setMessage('');
  const {data,error}=await supabase.from('farm_portfolio_products').update({estoque:nextStock,atualizado_em:new Date().toISOString()}).eq('airtable_record_id',product.airtable_record_id).select('airtable_record_id,estoque').single();
  if(error||!data)setMessage('Não foi possível alterar o estoque. Tente novamente.');
  else{const savedStock=Number(data.estoque);setProducts(current=>current.map(item=>item.airtable_record_id===product.airtable_record_id?{...item,estoque:savedStock}:item));setMessage(`${product.nome}: estoque atualizado para ${savedStock} ${savedStock===1?'unidade':'unidades'}.`);cancelEditing()}
  setSavingId(null);
 }

 return <section className="panel inventory-panel">
  <div className="section-title"><div><h2>Estoque de produtos</h2><p className="muted">Produtos criados na calculadora entram automaticamente com saldo zero.</p></div><div className="inventory-heading-actions"><span className="badge">{products.length} {products.length===1?'produto':'produtos'}</span><button className="secondary" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={16}/>{loading?'Atualizando…':'Atualizar'}</button></div></div>
  <output className="notice">{message}</output>
  {loading?<div className="empty"><p>Carregando estoque…</p></div>:products.length===0?<div className="empty"><p>Nenhum produto cadastrado no estoque.</p></div>:<section className="table-scroll" aria-label="Estoque de produtos cadastrados"><Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Categoria</TableHead><TableHead>Físico</TableHead><TableHead>Reservado</TableHead><TableHead>Disponível</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{products.map(product=>{const stock=product.estoque??0,isEditing=editingId===product.airtable_record_id;return <TableRow key={product.airtable_record_id}><TableCell><strong>{product.nome}</strong>{!product.exibir_portfolio&&<small className="inventory-hidden-label">Oculto no Portfólio</small>}</TableCell><TableCell>{product.categoria||'Sem categoria'}</TableCell><TableCell>{stock}</TableCell><TableCell>0</TableCell><TableCell>{stock}</TableCell><TableCell>{isEditing?<div className="inventory-stock-editor"><label><span>Nova quantidade</span><input type="number" inputMode="numeric" min="0" step="1" value={stockValue} onChange={event=>setStockValue(event.target.value)}/></label><button type="button" disabled={savingId===product.airtable_record_id} onClick={()=>void saveStock(product)}><Check size={15}/>{savingId===product.airtable_record_id?'Salvando…':'Salvar'}</button><button type="button" className="secondary" disabled={savingId===product.airtable_record_id} onClick={cancelEditing}><X size={15}/>Cancelar</button></div>:<button type="button" className="secondary inventory-edit-button" onClick={()=>startEditing(product)}><Pencil size={15}/>Alterar estoque</button>}</TableCell></TableRow>})}</TableBody></Table></section>}
  <p className="footnote">A reserva de pedidos será integrada ao estoque operacional em uma próxima etapa. Neste momento, reservado permanece zero.</p>
 </section>;
}
