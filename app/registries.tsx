'use client';
import {useCallback,useEffect,useState} from 'react';
import {Box,PackagePlus,Printer,RefreshCw,UsersRound,X} from 'lucide-react';
import {money} from '@/lib/demo';
import {number} from '@/lib/pricing';
import {supabase} from '@/lib/supabase';
import SellerRegistry,{type Seller,type SellerUser} from './seller-registry';
import './registries.css';

type Unit='un'|'g'|'kg'|'ml'|'l'|'cm'|'m';
type Supply={id:string;nome:string;valor_compra:number;quantidade_compra:number;unidade_medida:Unit;ativo:boolean};
type PrinterItem={id:string;nome:string;potencia_watts:number;tarifa_energia_kwh:number;custo_maquina_hora:number;ativo:boolean};
type SupplyForm={nome:string;valor_compra:string;quantidade_compra:string;unidade_medida:Unit};
type PrinterForm={nome:string;potencia_watts:string;tarifa_energia_kwh:string;custo_maquina_hora:string};
type RegistryTab='supplies'|'printers'|'sellers';

const emptySupply:SupplyForm={nome:'',valor_compra:'',quantidade_compra:'',unidade_medida:'un'};
const emptyPrinter:PrinterForm={nome:'',potencia_watts:'',tarifa_energia_kwh:'',custo_maquina_hora:''};
const units:[Unit,string][]=[['un','Unidade'],['g','Grama'],['kg','Quilograma'],['ml','Mililitro'],['l','Litro'],['cm','Centímetro'],['m','Metro']];
const environment=import.meta.env.BASE_URL.includes('/desenvolvimento/')?'desenvolvimento':'producao';
const sortByStatusAndName=<T extends {ativo:boolean;nome:string}>(items:T[])=>items.sort((a,b)=>Number(b.ativo)-Number(a.ativo)||a.nome.localeCompare(b.nome,'pt-BR'));

export default function Registries({onCatalogChanged}:{onCatalogChanged:()=>void}){
 const [tab,setTab]=useState<RegistryTab>('supplies');
 const [supplies,setSupplies]=useState<Supply[]>([]),[printers,setPrinters]=useState<PrinterItem[]>([]),[sellers,setSellers]=useState<Seller[]>([]),[users,setUsers]=useState<SellerUser[]>([]);
 const [loading,setLoading]=useState(true),[status,setStatus]=useState('');
 const [supplyOpen,setSupplyOpen]=useState(false),[printerOpen,setPrinterOpen]=useState(false);
 const [supplyForm,setSupplyForm]=useState<SupplyForm>(emptySupply),[printerForm,setPrinterForm]=useState<PrinterForm>(emptyPrinter);
 const [editingSupplyId,setEditingSupplyId]=useState<string|null>(null),[editingPrinterId,setEditingPrinterId]=useState<string|null>(null);
 const [savingSupply,setSavingSupply]=useState(false),[savingPrinter,setSavingPrinter]=useState(false);

 const load=useCallback(async()=>{
  setLoading(true);setStatus('');
  const [suppliesResult,printersResult,sellersResult,usersResult]=await Promise.all([
   supabase.from('farm_supplies').select('id,nome,valor_compra,quantidade_compra,unidade_medida,ativo').order('nome'),
   supabase.from('farm_printers').select('id,nome,potencia_watts,tarifa_energia_kwh,custo_maquina_hora,ativo').order('nome'),
   supabase.from('farm_sellers').select('id,nome,telefone,email,usuario_id,ativo').eq('ambiente',environment).order('nome'),
   supabase.from('farm_profiles').select('id,name,email').eq('role','vendedor').eq('active',true).order('name'),
  ]);
  if(suppliesResult.error||printersResult.error||sellersResult.error||usersResult.error)setStatus('Não foi possível carregar todos os cadastros. Tente atualizar.');
  setSupplies(sortByStatusAndName([...(suppliesResult.data||[])] as Supply[]));
  setPrinters(sortByStatusAndName([...(printersResult.data||[])] as PrinterItem[]));
  setSellers((sellersResult.data||[]) as Seller[]);setUsers((usersResult.data||[]) as SellerUser[]);setLoading(false);
 },[]);

 useEffect(()=>{const timer=window.setTimeout(()=>{const saved=sessionStorage.getItem('farm.registryTab') as RegistryTab|null;if(saved&&['supplies','printers','sellers'].includes(saved))setTab(saved);void load()},0);return()=>window.clearTimeout(timer)},[load]);
 function chooseTab(next:RegistryTab){setTab(next);sessionStorage.setItem('farm.registryTab',next)}
 const costPerUnit=(supply:Supply)=>Number(supply.valor_compra)/Number(supply.quantidade_compra);
 function resetSupply(){setSupplyForm(emptySupply);setEditingSupplyId(null);setSupplyOpen(false)}
 function resetPrinter(){setPrinterForm(emptyPrinter);setEditingPrinterId(null);setPrinterOpen(false)}

 async function saveSupply(event:React.SyntheticEvent<HTMLFormElement>){
  event.preventDefault();setSavingSupply(true);setStatus('Salvando insumo…');
  const values={nome:supplyForm.nome.trim(),valor_compra:number(supplyForm.valor_compra),quantidade_compra:number(supplyForm.quantidade_compra),unidade_medida:supplyForm.unidade_medida,atualizado_em:new Date().toISOString()};
  const request=editingSupplyId?supabase.from('farm_supplies').update(values).eq('id',editingSupplyId):supabase.from('farm_supplies').insert(values);
  const {data,error}=await request.select('id,nome,valor_compra,quantidade_compra,unidade_medida,ativo').single();
  if(error)setStatus(error.code==='23505'?'Já existe um insumo ativo com esse nome.':`Não foi possível salvar o insumo (${error.code||'erro do banco'}).`);
  else{setSupplies(current=>sortByStatusAndName(editingSupplyId?current.map(item=>item.id===editingSupplyId?data as Supply:item):[...current,data as Supply]));setStatus(editingSupplyId?'Insumo atualizado.':'Insumo cadastrado e disponível na calculadora.');resetSupply();onCatalogChanged()}
  setSavingSupply(false);
 }
 async function savePrinter(event:React.SyntheticEvent<HTMLFormElement>){
  event.preventDefault();setSavingPrinter(true);setStatus('Salvando impressora…');
  const values={nome:printerForm.nome.trim(),potencia_watts:number(printerForm.potencia_watts),tarifa_energia_kwh:number(printerForm.tarifa_energia_kwh),custo_maquina_hora:number(printerForm.custo_maquina_hora),updated_at:new Date().toISOString()};
  const request=editingPrinterId?supabase.from('farm_printers').update(values).eq('id',editingPrinterId):supabase.from('farm_printers').insert(values);
  const {data,error}=await request.select('id,nome,potencia_watts,tarifa_energia_kwh,custo_maquina_hora,ativo').single();
  if(error)setStatus(error.code==='23505'?'Já existe uma impressora ativa com esse nome.':'Não foi possível salvar a impressora. Confira os dados.');
  else{setPrinters(current=>sortByStatusAndName(editingPrinterId?current.map(item=>item.id===editingPrinterId?data as PrinterItem:item):[...current,data as PrinterItem]));setStatus(editingPrinterId?'Impressora atualizada.':'Impressora cadastrada e disponível na calculadora.');resetPrinter();onCatalogChanged()}
  setSavingPrinter(false);
 }
 function editSupply(item:Supply){setSupplyForm({nome:item.nome,valor_compra:String(item.valor_compra),quantidade_compra:String(item.quantidade_compra),unidade_medida:item.unidade_medida});setEditingSupplyId(item.id);setSupplyOpen(true);window.setTimeout(()=>document.querySelector('.supply-form')?.scrollIntoView({behavior:'smooth',block:'center'}),0)}
 function editPrinter(item:PrinterItem){setPrinterForm({nome:item.nome,potencia_watts:String(item.potencia_watts),tarifa_energia_kwh:String(item.tarifa_energia_kwh),custo_maquina_hora:String(item.custo_maquina_hora)});setEditingPrinterId(item.id);setPrinterOpen(true);window.setTimeout(()=>document.querySelector('.printer-form')?.scrollIntoView({behavior:'smooth',block:'center'}),0)}
 async function toggleSupply(item:Supply){const ativo=!item.ativo;const {data,error}=await supabase.from('farm_supplies').update({ativo,atualizado_em:new Date().toISOString()}).eq('id',item.id).select('id,nome,valor_compra,quantidade_compra,unidade_medida,ativo').single();if(error)setStatus(error.code==='23505'?'Já existe outro insumo ativo com esse nome.':'Não foi possível alterar o status do insumo.');else{setSupplies(current=>sortByStatusAndName(current.map(currentItem=>currentItem.id===item.id?data as Supply:currentItem)));setStatus(`Insumo ${ativo?'ativado':'desativado'}.`);onCatalogChanged()}}
 async function togglePrinter(item:PrinterItem){const ativo=!item.ativo;const {data,error}=await supabase.from('farm_printers').update({ativo,updated_at:new Date().toISOString()}).eq('id',item.id).select('id,nome,potencia_watts,tarifa_energia_kwh,custo_maquina_hora,ativo').single();if(error)setStatus(error.code==='23505'?'Já existe outra impressora ativa com esse nome.':'Não foi possível alterar o status da impressora.');else{setPrinters(current=>sortByStatusAndName(current.map(currentItem=>currentItem.id===item.id?data as PrinterItem:currentItem)));setStatus(`Impressora ${ativo?'ativada':'desativada'}.`);onCatalogChanged()}}

 const tabs:[RegistryTab,string,typeof Box,number][]=[['supplies','Insumos',PackagePlus,supplies.length],['printers','Impressoras',Printer,printers.length],['sellers','Vendedores',UsersRound,sellers.length]];
 return <section className="registries-module" aria-label="Cadastros da Farm">
  <div className="registry-overview" aria-label="Resumo dos cadastros">{tabs.map(([id,label,Icon,total])=><article key={id}><span><Icon size={20}/></span><div><small>{label}</small><strong>{loading?'—':total}</strong><em>{loading?'Carregando':`${id==='supplies'?supplies.filter(item=>item.ativo).length:id==='printers'?printers.filter(item=>item.ativo).length:sellers.filter(item=>item.ativo).length} em uso`}</em></div></article>)}</div>
  <section className="panel registry-workspace"><div className="registry-heading"><div><h2>Cadastros da Farm</h2><p className="muted">Escolha uma categoria para consultar, criar ou atualizar registros.</p></div><button className="secondary registry-refresh" disabled={loading} onClick={()=>void load()}><RefreshCw size={16}/>{loading?'Atualizando…':'Atualizar'}</button></div>
   <div className="registry-tabs" role="tablist" aria-label="Tipos de cadastro">{tabs.map(([id,label,Icon,total])=><button key={id} type="button" role="tab" aria-selected={tab===id} className={tab===id?'active':''} onClick={()=>chooseTab(id)}><Icon size={18}/><span>{label}</span><strong>{total}</strong></button>)}</div>
   {status&&<output className="notice" aria-live="polite">{status}</output>}
   <div role="tabpanel" hidden={tab!=='supplies'} className="registry-tab-panel"><div className="section-title"><div><h3>Insumos</h3><p className="muted">Filamentos, argolas, colas, sacolas e outros materiais usados nos produtos.</p></div><button className="secondary" onClick={()=>{if(supplyOpen)resetSupply();else setSupplyOpen(true)}}>{supplyOpen?<X size={17}/>:<PackagePlus size={17}/>} {supplyOpen?'Fechar':'Novo insumo'}</button></div>
    {supplyOpen&&<form className="supply-form registry-form" onSubmit={saveSupply}><label>Nome do insumo<input value={supplyForm.nome} onChange={event=>setSupplyForm({...supplyForm,nome:event.target.value})} required maxLength={120} placeholder="Ex.: PLA dourado"/></label><label>Valor pago (R$)<input type="number" inputMode="decimal" min="0" step="0.01" value={supplyForm.valor_compra} onChange={event=>setSupplyForm({...supplyForm,valor_compra:event.target.value})} required placeholder="0,00"/></label><label>Quantidade da embalagem<input type="number" inputMode="decimal" min="0.0001" step="0.0001" value={supplyForm.quantidade_compra} onChange={event=>setSupplyForm({...supplyForm,quantidade_compra:event.target.value})} required placeholder="Ex.: 1.000"/></label><label>Unidade de medida<select value={supplyForm.unidade_medida} onChange={event=>setSupplyForm({...supplyForm,unidade_medida:event.target.value as Unit})}>{units.map(([value,label])=><option value={value} key={value}>{label} ({value})</option>)}</select></label><p className="field-hint supply-hint">{editingSupplyId?'Altere os dados e salve. Fichas anteriores mantêm o custo registrado.':'Para filamento, cadastre o rolo em gramas. Exemplo: R$ 120,00 por 1.000 g.'}</p><div className="registry-form-actions"><button disabled={savingSupply}>{savingSupply?'Salvando…':editingSupplyId?'Salvar alterações':'Salvar insumo'}</button>{editingSupplyId&&<button type="button" className="secondary" onClick={resetSupply}>Cancelar edição</button>}</div></form>}
    <div className="supply-summary" aria-label="Insumos cadastrados">{supplies.length===0?<p className="muted">Nenhum insumo cadastrado.</p>:supplies.map(item=><article key={item.id} className={item.ativo?'':'registry-inactive'}><div className="registry-card-title"><strong>{item.nome}</strong><span className={`status-chip ${item.ativo?'active':'inactive'}`}>{item.ativo?'Ativo':'Inativo'}</span></div><span>{money(Number(item.valor_compra))} por {Number(item.quantidade_compra).toLocaleString('pt-BR')} {item.unidade_medida}</span><small>{money(costPerUnit(item))} por {item.unidade_medida}</small><div className="registry-card-actions"><button className="secondary" onClick={()=>editSupply(item)}>Editar</button><button className="secondary" onClick={()=>void toggleSupply(item)}>{item.ativo?'Desativar':'Ativar'}</button></div></article>)}</div>
   </div>
   <div role="tabpanel" hidden={tab!=='printers'} className="registry-tab-panel"><div className="section-title"><div><h3>Impressoras</h3><p className="muted">Os custos cadastrados serão aplicados automaticamente na calculadora.</p></div><button className="secondary" onClick={()=>{if(printerOpen)resetPrinter();else setPrinterOpen(true)}}>{printerOpen?<X size={17}/>:<Printer size={17}/>} {printerOpen?'Fechar':'Nova impressora'}</button></div>
    {printerOpen&&<form className="printer-form registry-form" onSubmit={savePrinter}><label>Nome da impressora<input value={printerForm.nome} onChange={event=>setPrinterForm({...printerForm,nome:event.target.value})} required maxLength={120} placeholder="Ex.: Bambu Lab A1 Mini"/></label><label>Potência média (W)<input type="number" inputMode="decimal" min="0" step="0.01" value={printerForm.potencia_watts} onChange={event=>setPrinterForm({...printerForm,potencia_watts:event.target.value})} required/></label><label>Energia (R$/kWh)<input type="number" inputMode="decimal" min="0" step="0.0001" value={printerForm.tarifa_energia_kwh} onChange={event=>setPrinterForm({...printerForm,tarifa_energia_kwh:event.target.value})} required/></label><label>Máquina sem energia (R$/hora)<input type="number" inputMode="decimal" min="0" step="0.01" value={printerForm.custo_maquina_hora} onChange={event=>setPrinterForm({...printerForm,custo_maquina_hora:event.target.value})} required/></label><div className="registry-form-actions"><button disabled={savingPrinter}>{savingPrinter?'Salvando…':editingPrinterId?'Salvar alterações':'Salvar impressora'}</button>{editingPrinterId&&<button type="button" className="secondary" onClick={resetPrinter}>Cancelar edição</button>}</div></form>}
    <div className="printer-summary" aria-label="Impressoras cadastradas">{printers.length===0?<p className="muted">Nenhuma impressora cadastrada.</p>:printers.map(item=><article key={item.id} className={item.ativo?'':'registry-inactive'}><div className="registry-card-title"><strong>{item.nome}</strong><span className={`status-chip ${item.ativo?'active':'inactive'}`}>{item.ativo?'Ativa':'Inativa'}</span></div><span>{Number(item.potencia_watts).toLocaleString('pt-BR')} W · {money(Number(item.tarifa_energia_kwh))}/kWh</span><small>{money(Number(item.custo_maquina_hora))} por hora de máquina</small><div className="registry-card-actions"><button className="secondary" onClick={()=>editPrinter(item)}>Editar</button><button className="secondary" onClick={()=>void togglePrinter(item)}>{item.ativo?'Desativar':'Ativar'}</button></div></article>)}</div>
   </div>
   <div role="tabpanel" hidden={tab!=='sellers'} className="registry-tab-panel"><SellerRegistry sellers={sellers} users={users} onChanged={load}/></div>
  </section>
 </section>;
}
