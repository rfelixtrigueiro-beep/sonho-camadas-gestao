'use client';
import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {supabase} from '@/lib/supabase';

type InventoryProduct={airtable_record_id:string;nome:string;estoque:number|null;categoria:string|null;exibir_portfolio:boolean};

export default function Inventory(){
 const [products,setProducts]=useState<InventoryProduct[]>([]);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');

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

 return <section className="panel inventory-panel">
  <div className="section-title"><div><h2>Estoque de produtos</h2><p className="muted">Produtos criados na calculadora entram automaticamente com saldo zero.</p></div><div className="inventory-heading-actions"><span className="badge">{products.length} {products.length===1?'produto':'produtos'}</span><button className="secondary" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={16}/>{loading?'Atualizando…':'Atualizar'}</button></div></div>
  <output className="notice">{message}</output>
  {loading?<div className="empty"><p>Carregando estoque…</p></div>:products.length===0?<div className="empty"><p>Nenhum produto cadastrado no estoque.</p></div>:<section className="table-scroll" aria-label="Estoque de produtos cadastrados"><Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Categoria</TableHead><TableHead>Físico</TableHead><TableHead>Reservado</TableHead><TableHead>Disponível</TableHead></TableRow></TableHeader><TableBody>{products.map(product=>{const stock=product.estoque??0;return <TableRow key={product.airtable_record_id}><TableCell><strong>{product.nome}</strong>{!product.exibir_portfolio&&<small className="inventory-hidden-label">Oculto no Portfólio</small>}</TableCell><TableCell>{product.categoria||'Sem categoria'}</TableCell><TableCell>{stock}</TableCell><TableCell>0</TableCell><TableCell>{stock}</TableCell></TableRow>})}</TableBody></Table></section>}
  <p className="footnote">A reserva de pedidos será integrada ao estoque operacional em uma próxima etapa. Neste momento, reservado permanece zero.</p>
 </section>;
}
