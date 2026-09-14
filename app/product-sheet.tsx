'use client';
import {useEffect,useState} from 'react';
import {Eraser,PackagePlus,Printer,Save,X} from 'lucide-react';
import {blank,example,calculate,normalizeSheet,number,type Sheet,type SupplyUse} from '@/lib/pricing';
import {money} from '@/lib/demo';
import {supabase} from '@/lib/supabase';

type Unit='un'|'g'|'kg'|'ml'|'l'|'cm'|'m';
type CatalogSupply={id:string;nome:string;valor_compra:number;quantidade_compra:number;unidade_medida:Unit;ativo:boolean};
type CatalogPrinter={id:string;nome:string;potencia_watts:number;tarifa_energia_kwh:number;custo_maquina_hora:number;ativo:boolean};
type SupplyForm={nome:string;valor_compra:string;quantidade_compra:string;unidade_medida:Unit};
type PrinterForm={nome:string;potencia_watts:string;tarifa_energia_kwh:string;custo_maquina_hora:string};
const emptySupply:SupplyForm={nome:'',valor_compra:'',quantidade_compra:'',unidade_medida:'un'};
const emptyPrinter:PrinterForm={nome:'',potencia_watts:'',tarifa_energia_kwh:'',custo_maquina_hora:''};
const units:[Unit,string][]=[['un','Unidade'],['g','Grama'],['kg','Quilograma'],['ml','Mililitro'],['l','Litro'],['cm','Centímetro'],['m','Metro']];
const key='sonho-product-sheet-v1';
const sortByStatusAndName=<T extends {ativo:boolean;nome:string}>(items:T[])=>items.sort((a,b)=>Number(b.ativo)-Number(a.ativo)||a.nome.localeCompare(b.nome,'pt-BR'));
const groups=[
 {title:'Trabalho',hint:'Informe apenas o tempo de trabalho manual. Os materiais de acabamento e embalagem devem ser adicionados como insumos.',fields:[['minutes','Trabalho manual do lote (minutos)'],['labor','Mão de obra (R$/hora)'],['loss','Reserva de perdas dos insumos (%)']]},
 {title:'Canal de venda',hint:'Taxas percentuais incidem sobre o preço final efetivamente cobrado. Valores fixos e frete são por unidade vendida. Use 0 onde não se aplica.',fields:[['commission','Comissão (%)'],['payment','Taxa de pagamento (%)'],['tax','Impostos (%)'],['fixed','Tarifa fixa por unidade (R$)'],['shipping','Frete pago por você por unidade (R$)'],['margin','Margem desejada sobre a venda (%)'],['price','Preço final que pretende cobrar (R$) — opcional']]},
];

export default function ProductSheet({userId}:{userId:string}){
 const [sheet,setSheet]=useState<Sheet>(blank);
 const [catalog,setCatalog]=useState<CatalogSupply[]>([]);
 const [printers,setPrinters]=useState<CatalogPrinter[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [status,setStatus]=useState('');
 const [saved,setSaved]=useState(false);
 const [saving,setSaving]=useState(false);
 const [registryOpen,setRegistryOpen]=useState(false);
 const [printerRegistryOpen,setPrinterRegistryOpen]=useState(false);
 const [supplyForm,setSupplyForm]=useState<SupplyForm>(emptySupply);
 const [printerForm,setPrinterForm]=useState<PrinterForm>(emptyPrinter);
 const [editingSupplyId,setEditingSupplyId]=useState<string|null>(null);
 const [editingPrinterId,setEditingPrinterId]=useState<string|null>(null);
 const [savingSupply,setSavingSupply]=useState(false);
 const [savingPrinter,setSavingPrinter]=useState(false);
 const {errors,result}=calculate(sheet);

 useEffect(()=>{let live=true;void (async()=>{
  setStatus('Carregando ficha, insumos e impressoras…');
  try{
   const [sheetResult,suppliesResult,printersResult]=await Promise.all([
    supabase.from('farm_product_sheets').select('sheet').eq('id',userId).maybeSingle(),
    supabase.from('farm_supplies').select('id,nome,valor_compra,quantidade_compra,unidade_medida,ativo').order('nome'),
    supabase.from('farm_printers').select('id,nome,potencia_watts,tarifa_energia_kwh,custo_maquina_hora,ativo').order('nome'),
   ]);
   if(sheetResult.error)throw sheetResult.error;
   if(live){
    setCatalog(suppliesResult.error?[]:sortByStatusAndName([...(suppliesResult.data||[])] as CatalogSupply[]));
    setPrinters(printersResult.error?[]:sortByStatusAndName([...(printersResult.data||[])] as CatalogPrinter[]));
   }
   const restored=normalizeSheet(sheetResult.data?.sheet);
   if(restored){if(live){setSheet(restored);setSaved(false);setStatus(suppliesResult.error||printersResult.error?'Ficha recuperada, mas algum cadastro não pôde ser carregado.':'Ficha, insumos e impressoras carregados.')}localStorage.removeItem(key)}
   else{const legacy=localStorage.getItem(key);const parsed=legacy?normalizeSheet(JSON.parse(legacy)):null;if(parsed&&live){setSheet(parsed);setStatus('Encontramos sua ficha anterior. Revise os dados antes de salvar.')}else if(live)setStatus('Preencha uma nova ficha.')}
  }catch{if(live)setStatus('Não foi possível carregar a ficha. Tente novamente.')}
  finally{if(live)setLoaded(true)}
 })();return()=>{live=false}},[userId]);

 const change=(k:keyof Sheet,v:string)=>{setSheet(current=>({...current,[k]:v}));setSaved(false);setStatus('Alterações ainda não salvas.')};
 const changeSupplies=(supplies:SupplyUse[])=>{setSheet(current=>({...current,supplies}));setSaved(false);setStatus('Alterações ainda não salvas.')};
 const costPerUnit=(supply:CatalogSupply)=>Number(supply.valor_compra)/Number(supply.quantidade_compra);

 async function createSupply(event:React.SyntheticEvent<HTMLFormElement>){
  event.preventDefault();setSavingSupply(true);setStatus('Salvando insumo…');
  const values={nome:supplyForm.nome.trim(),valor_compra:number(supplyForm.valor_compra),quantidade_compra:number(supplyForm.quantidade_compra),unidade_medida:supplyForm.unidade_medida,atualizado_em:new Date().toISOString()};
  const request=editingSupplyId?supabase.from('farm_supplies').update(values).eq('id',editingSupplyId):supabase.from('farm_supplies').insert(values);
  const {data,error}=await request.select('id,nome,valor_compra,quantidade_compra,unidade_medida,ativo').single();
  if(error)setStatus(error.code==='23505'?'Já existe um insumo ativo com esse nome.':`Não foi possível salvar o insumo (${error.code||'erro do banco'}).`);
  else{setCatalog(current=>sortByStatusAndName(editingSupplyId?current.map(item=>item.id===editingSupplyId?data as CatalogSupply:item):[...current,data as CatalogSupply]));setSupplyForm(emptySupply);setEditingSupplyId(null);setRegistryOpen(false);setStatus(editingSupplyId?'Insumo atualizado. Novas seleções usarão o novo valor.':'Insumo cadastrado e disponível na calculadora.')}
  setSavingSupply(false);
 }

 async function createPrinter(event:React.SyntheticEvent<HTMLFormElement>){
  event.preventDefault();setSavingPrinter(true);setStatus('Salvando impressora…');
  const values={nome:printerForm.nome.trim(),potencia_watts:number(printerForm.potencia_watts),tarifa_energia_kwh:number(printerForm.tarifa_energia_kwh),custo_maquina_hora:number(printerForm.custo_maquina_hora),updated_at:new Date().toISOString()};
  const request=editingPrinterId?supabase.from('farm_printers').update(values).eq('id',editingPrinterId):supabase.from('farm_printers').insert(values);
  const {data,error}=await request.select('id,nome,potencia_watts,tarifa_energia_kwh,custo_maquina_hora,ativo').single();
  if(error)setStatus(error.code==='23505'?'Já existe uma impressora ativa com esse nome.':'Não foi possível cadastrar a impressora. Confira os dados.');
  else{setPrinters(current=>sortByStatusAndName(editingPrinterId?current.map(item=>item.id===editingPrinterId?data as CatalogPrinter:item):[...current,data as CatalogPrinter]));setPrinterForm(emptyPrinter);setEditingPrinterId(null);setPrinterRegistryOpen(false);setStatus(editingPrinterId?'Impressora atualizada. Selecione-a novamente para aplicar os novos valores.':'Impressora cadastrada e disponível na calculadora.')}
  setSavingPrinter(false);
 }

 function editSupply(supply:CatalogSupply){
  setSupplyForm({nome:supply.nome,valor_compra:String(supply.valor_compra),quantidade_compra:String(supply.quantidade_compra),unidade_medida:supply.unidade_medida});setEditingSupplyId(supply.id);setRegistryOpen(true);setStatus(`Editando o insumo ${supply.nome}.`);
 }

 function editPrinter(printer:CatalogPrinter){
  setPrinterForm({nome:printer.nome,potencia_watts:String(printer.potencia_watts),tarifa_energia_kwh:String(printer.tarifa_energia_kwh),custo_maquina_hora:String(printer.custo_maquina_hora)});setEditingPrinterId(printer.id);setPrinterRegistryOpen(true);setStatus(`Editando a impressora ${printer.nome}.`);
 }

 async function toggleSupply(supply:CatalogSupply){
  const ativo=!supply.ativo;setStatus(`${ativo?'Ativando':'Desativando'} insumo…`);
  const {data,error}=await supabase.from('farm_supplies').update({ativo,atualizado_em:new Date().toISOString()}).eq('id',supply.id).select('id,nome,valor_compra,quantidade_compra,unidade_medida,ativo').single();
  if(error)setStatus(error.code==='23505'?'Já existe outro insumo ativo com esse nome.':'Não foi possível alterar o status do insumo.');
  else{setCatalog(current=>sortByStatusAndName(current.map(item=>item.id===supply.id?data as CatalogSupply:item)));setStatus(`Insumo ${ativo?'ativado e disponível na calculadora':'desativado'}.`)}
 }

 async function togglePrinter(printer:CatalogPrinter){
  const ativo=!printer.ativo;setStatus(`${ativo?'Ativando':'Desativando'} impressora…`);
  const {data,error}=await supabase.from('farm_printers').update({ativo,updated_at:new Date().toISOString()}).eq('id',printer.id).select('id,nome,potencia_watts,tarifa_energia_kwh,custo_maquina_hora,ativo').single();
  if(error)setStatus(error.code==='23505'?'Já existe outra impressora ativa com esse nome.':'Não foi possível alterar o status da impressora.');
  else{setPrinters(current=>sortByStatusAndName(current.map(item=>item.id===printer.id?data as CatalogPrinter:item)));setStatus(`Impressora ${ativo?'ativada e disponível na calculadora':'desativada'}.`)}
 }

 function addSupply(supplyId:string){
  const supply=catalog.find(item=>item.id===supplyId&&item.ativo);
  if(!supply||sheet.supplies.some(item=>item.supplyId===supply.id))return;
  changeSupplies([...sheet.supplies,{supplyId:supply.id,name:supply.nome,quantity:'',unit:supply.unidade_medida,costPerUnit:costPerUnit(supply).toString()}]);
 }

 function selectPrinter(printerId:string){
  const printer=printers.find(item=>item.id===printerId&&item.ativo);
  setSheet(current=>printer?{...current,printerId:printer.id,printerName:printer.nome,printerWatts:String(printer.potencia_watts),printerKwh:String(printer.tarifa_energia_kwh),printerHourly:String(printer.custo_maquina_hora)}:{...current,printerId:'',printerName:'',printerWatts:'',printerKwh:'',printerHourly:''});
  setSaved(false);setStatus(printer?'Impressora selecionada. Potência e custos foram aplicados.':'Selecione a impressora utilizada.');
 }

 function loadExample(){
  const sample=structuredClone(example);
  const printer=printers[0];
  if(printer)Object.assign(sample,{printerId:printer.id,printerName:printer.nome,printerWatts:String(printer.potencia_watts),printerKwh:String(printer.tarifa_energia_kwh),printerHourly:String(printer.custo_maquina_hora)});
  setSheet(sample);setSaved(false);setStatus('Exemplo carregado. Adicione os insumos usados no lote.');
 }

 async function saveProduct(){
  if(!result||saving)return;setSaving(true);setStatus('Salvando produto…');
  const {error:sheetError}=await supabase.from('farm_product_sheets').upsert({id:userId,sheet,updated_at:new Date().toISOString()},{onConflict:'id'});
  if(sheetError){setStatus('Não foi possível salvar a ficha. Nenhum produto foi criado.');setSaving(false);return}
  const id=`farm_${crypto.randomUUID()}`;
  const price=result.price??result.suggested;
  const supplies=sheet.supplies.map(item=>item.name.trim()).filter(Boolean).join(', ');
  const notes=`Criado pela calculadora. Custo por unidade: ${money(result.unit)}. Lote calculado: ${sheet.batch} peça(s). Impressora: ${sheet.printerName}.${supplies?` Insumos: ${supplies}.`:''}`;
  const {error:productError}=await supabase.from('farm_portfolio_products').insert({airtable_record_id:id,nome:sheet.name.trim(),categoria:null,categoria_id:null,preco_venda:price,tempo_producao_h:number(sheet.hours),estoque:0,ativo:true,observacoes:notes,exibir_portfolio:false,foto_urls:[]});
  if(productError){setStatus('A ficha foi salva, mas o produto não pôde ser criado no Portfólio. Tente novamente.');setSaving(false);return}
  localStorage.removeItem(key);setSaved(true);setStatus('Produto salvo, criado no Portfólio como não publicado e adicionado ao Estoque com saldo zero.');setSaving(false);
 }

 async function clearSheet(){
  if(saving)return;setSaving(true);const cleared=structuredClone(blank);setSheet(cleared);setSaved(false);localStorage.removeItem(key);
  const {error}=await supabase.from('farm_product_sheets').upsert({id:userId,sheet:cleared,updated_at:new Date().toISOString()},{onConflict:'id'});
  setStatus(error?'A tela foi limpa, mas a ficha anterior pode reaparecer ao entrar novamente. Nenhum produto foi criado.':'Calculadora limpa. Nenhum produto foi criado no Portfólio.');setSaving(false);
 }

 function field(k:string,label:string){return <label key={k} htmlFor={`field-${k}`}>{label}<input id={`field-${k}`} inputMode="decimal" value={sheet[k as keyof Sheet] as string} onChange={event=>change(k as keyof Sheet,event.target.value)} aria-invalid={!!errors[k]} aria-describedby={errors[k]?`error-${k}`:undefined}/>{errors[k]&&<span className="field-error" id={`error-${k}`}>{errors[k]}</span>}</label>}

 return <div className="product-sheet">
  <section className="panel supply-registry">
   <div className="section-title"><div><h2>Cadastro de insumos</h2><p className="muted">Cadastre filamentos, argolas, colas, sacolas e outros itens usados nos produtos.</p></div><button className="secondary" onClick={()=>{if(registryOpen){setSupplyForm(emptySupply);setEditingSupplyId(null)}setRegistryOpen(!registryOpen)}}>{registryOpen?<X size={17}/>:<PackagePlus size={17}/>} {registryOpen?'Fechar cadastro':'Cadastrar insumo'}</button></div>
   {registryOpen&&<form className="supply-form" onSubmit={createSupply}><label>Nome do insumo<input value={supplyForm.nome} onChange={event=>setSupplyForm({...supplyForm,nome:event.target.value})} required maxLength={120} placeholder="Ex.: PLA dourado"/></label><label>Valor pago (R$)<input type="number" inputMode="decimal" min="0" step="0.01" value={supplyForm.valor_compra} onChange={event=>setSupplyForm({...supplyForm,valor_compra:event.target.value})} required placeholder="0,00"/></label><label>Quantidade da embalagem<input type="number" inputMode="decimal" min="0.0001" step="0.0001" value={supplyForm.quantidade_compra} onChange={event=>setSupplyForm({...supplyForm,quantidade_compra:event.target.value})} required placeholder="Ex.: 1.000"/></label><label>Unidade de medida<select value={supplyForm.unidade_medida} onChange={event=>setSupplyForm({...supplyForm,unidade_medida:event.target.value as Unit})}>{units.map(([value,label])=><option value={value} key={value}>{label} ({value})</option>)}</select></label><p className="field-hint supply-hint">{editingSupplyId?'Altere os dados e salve. Fichas anteriores mantêm o custo registrado.':'Para filamento, cadastre o rolo em gramas. Exemplo: R$ 120,00 por 1.000 g.'}</p><div className="registry-form-actions"><button disabled={savingSupply}>{savingSupply?'Salvando…':editingSupplyId?'Salvar alterações':'Salvar insumo'}</button>{editingSupplyId&&<button type="button" className="secondary" onClick={()=>{setSupplyForm(emptySupply);setEditingSupplyId(null);setRegistryOpen(false)}}>Cancelar edição</button>}</div></form>}
   <div className="supply-summary" aria-label="Insumos cadastrados">{catalog.length===0?<p className="muted">Nenhum insumo cadastrado.</p>:catalog.map(supply=><article key={supply.id} className={supply.ativo?'':'registry-inactive'}><div className="registry-card-title"><strong>{supply.nome}</strong><span className={`status-chip ${supply.ativo?'active':'inactive'}`}>{supply.ativo?'Ativo':'Inativo'}</span></div><span>{money(Number(supply.valor_compra))} por {Number(supply.quantidade_compra).toLocaleString('pt-BR')} {supply.unidade_medida}</span><small>{money(costPerUnit(supply))} por {supply.unidade_medida}</small><div className="registry-card-actions"><button className="secondary" onClick={()=>editSupply(supply)}>Editar</button><button className="secondary" onClick={()=>void toggleSupply(supply)}>{supply.ativo?'Desativar':'Ativar'}</button></div></article>)}</div>
  </section>

  <section className="panel printer-registry">
   <div className="section-title"><div><h2>Cadastro de impressoras</h2><p className="muted">A potência, a energia e o custo por hora serão aplicados automaticamente na calculadora.</p></div><button className="secondary" onClick={()=>{if(printerRegistryOpen){setPrinterForm(emptyPrinter);setEditingPrinterId(null)}setPrinterRegistryOpen(!printerRegistryOpen)}}>{printerRegistryOpen?<X size={17}/>:<Printer size={17}/>} {printerRegistryOpen?'Fechar cadastro':'Cadastrar impressora'}</button></div>
   {printerRegistryOpen&&<form className="printer-form" onSubmit={createPrinter}><label>Nome da impressora<input value={printerForm.nome} onChange={event=>setPrinterForm({...printerForm,nome:event.target.value})} required maxLength={120} placeholder="Ex.: Bambu Lab A1 Mini"/></label><label>Potência média (W)<input type="number" inputMode="decimal" min="0" step="0.01" value={printerForm.potencia_watts} onChange={event=>setPrinterForm({...printerForm,potencia_watts:event.target.value})} required/></label><label>Energia (R$/kWh)<input type="number" inputMode="decimal" min="0" step="0.0001" value={printerForm.tarifa_energia_kwh} onChange={event=>setPrinterForm({...printerForm,tarifa_energia_kwh:event.target.value})} required/></label><label>Máquina sem energia (R$/hora)<input type="number" inputMode="decimal" min="0" step="0.01" value={printerForm.custo_maquina_hora} onChange={event=>setPrinterForm({...printerForm,custo_maquina_hora:event.target.value})} required/></label><div className="registry-form-actions"><button disabled={savingPrinter}>{savingPrinter?'Salvando…':editingPrinterId?'Salvar alterações':'Salvar impressora'}</button>{editingPrinterId&&<button type="button" className="secondary" onClick={()=>{setPrinterForm(emptyPrinter);setEditingPrinterId(null);setPrinterRegistryOpen(false)}}>Cancelar edição</button>}</div></form>}
   <div className="printer-summary" aria-label="Impressoras cadastradas">{printers.length===0?<p className="muted">Nenhuma impressora cadastrada.</p>:printers.map(printer=><article key={printer.id} className={printer.ativo?'':'registry-inactive'}><div className="registry-card-title"><strong>{printer.nome}</strong><span className={`status-chip ${printer.ativo?'active':'inactive'}`}>{printer.ativo?'Ativa':'Inativa'}</span></div><span>{Number(printer.potencia_watts).toLocaleString('pt-BR')} W · {money(Number(printer.tarifa_energia_kwh))}/kWh</span><small>{money(Number(printer.custo_maquina_hora))} por hora de máquina</small><div className="registry-card-actions"><button className="secondary" onClick={()=>editPrinter(printer)}>Editar</button><button className="secondary" onClick={()=>void togglePrinter(printer)}>{printer.ativo?'Desativar':'Ativar'}</button></div></article>)}</div>
  </section>

  <section className="panel"><div className="section-title"><div><h2>Ficha do seu produto</h2><p className="muted">Preencha os dados para calcular o custo e o preço sugerido.</p></div><span className="badge">{saved?'Produto criado':'Rascunho'}</span></div><p className="callout">Ao salvar, a ficha fica protegida na sua conta e o produto é criado no Portfólio como não publicado.</p><div className="actions"><button disabled={!loaded||!result||saving||saved} onClick={()=>void saveProduct()}><Save size={17}/>{saving?'Salvando…':saved?'Produto salvo':'Salvar produto'}</button><button className="secondary" disabled={!loaded||saving} onClick={()=>void clearSheet()}><Eraser size={17}/> Limpar</button><button className="secondary" disabled={saving} onClick={loadExample}>Preencher exemplo</button></div><output className="notice">{status}</output><label htmlFor="product-name">Nome do produto<input id="product-name" value={sheet.name} onChange={event=>change('name',event.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name?'name-error':undefined}/>{errors.name&&<span className="field-error" id="name-error">{errors.name}</span>}</label></section>

  <div className="calculator-layout"><section className="panel calculator-result" aria-live="polite"><p className="eyebrow">RESULTADO DA FICHA</p><h2>{sheet.name||'Seu produto'}</h2>{!result?<><p className="callout">Cálculo incompleto. Revise os campos indicados abaixo. Campo vazio não significa custo zero.</p><p>{Object.keys(errors).length} {Object.keys(errors).length===1?'campo precisa':'campos precisam'} de revisão.</p></>:<><div className="result-pair"><div><small>Custo por unidade</small><strong>{money(result.unit)}</strong></div><div><small>Preço mínimo para a margem desejada</small><strong>{money(result.suggested)}</strong></div></div><dl>{result.parts.map(([name,value])=><div key={name}><dt>{name}</dt><dd>{money(value)}</dd></div>)}<div><dt>Custo do lote</dt><dd>{money(result.batch)}</dd></div><div><dt>Tarifa fixa + frete por unidade</dt><dd>{money(result.expenses)}</dd></div>{result.price!==null&&<><div><dt>Preço informado</dt><dd>{money(result.price)}</dd></div><div><dt>Taxas no preço informado</dt><dd>{money(result.price*result.rates)}</dd></div><div><dt>Contribuição por unidade</dt><dd>{money(result.contribution!)}</dd></div><div><dt>Margem no preço informado</dt><dd>{result.actualMargin!.toLocaleString('pt-BR',{maximumFractionDigits:2})}%</dd></div></>}</dl>{result.contribution!==null&&result.contribution<0&&<p className="field-error">O preço informado não cobre os custos e as despesas desta ficha.</p>}<p className="footnote">Margem é a parcela da venda que sobra após os custos e taxas informados. A sugestão é arredondada para cima no centavo.</p></>}</section>

   <div className="calculator-fields">
    <section className="panel calculator-supplies"><h2>Insumos do lote</h2><p className="muted">Adicione quantos insumos forem necessários e informe o consumo total do lote.</p><label className="supply-picker">Adicionar insumo<select value="" onChange={event=>{addSupply(event.target.value);event.target.value=''}}><option value="">Selecione um insumo</option>{catalog.filter(supply=>supply.ativo&&!sheet.supplies.some(item=>item.supplyId===supply.id)).map(supply=><option key={supply.id} value={supply.id}>{supply.nome} · {money(costPerUnit(supply))}/{supply.unidade_medida}</option>)}</select></label>{sheet.supplies.length===0?<p className="callout">Nenhum insumo adicionado. Use a lista acima para incluir PLA, argolas, embalagens e outros itens.</p>:sheet.supplies.map((item,index)=><fieldset className="supply-use-card" key={item.supplyId}><legend>{item.name}</legend><p>{money(number(item.costPerUnit))} por {item.unit}</p><label>Quantidade usada no lote ({item.unit})<input inputMode="decimal" value={item.quantity} onChange={event=>changeSupplies(sheet.supplies.map((old,itemIndex)=>itemIndex===index?{...old,quantity:event.target.value}:old))} aria-invalid={!!errors[`s${index}quantity`]}/>{errors[`s${index}quantity`]&&<span className="field-error">{errors[`s${index}quantity`]}</span>}</label><button className="secondary" onClick={()=>changeSupplies(sheet.supplies.filter((_,itemIndex)=>itemIndex!==index))}>Remover insumo</button></fieldset>)}</section>

    <section className="panel"><h2>Lote e impressão</h2><p className="muted">Selecione a impressora. A potência e os custos cadastrados serão usados automaticamente.</p><label className="printer-picker" htmlFor="printer-select">Impressora utilizada<select id="printer-select" value={sheet.printerId} onChange={event=>selectPrinter(event.target.value)} aria-invalid={!!errors.printerId}><option value="">Selecione a impressora</option>{sheet.printerId&&!printers.some(item=>item.id===sheet.printerId&&item.ativo)&&<option value={sheet.printerId}>{sheet.printerName} · configuração da ficha</option>}{printers.filter(printer=>printer.ativo).map(printer=><option key={printer.id} value={printer.id}>{printer.nome}</option>)}</select>{errors.printerId&&<span className="field-error">{errors.printerId}</span>}</label>{sheet.printerId&&<div className="printer-values"><span><small>Potência</small><strong>{number(sheet.printerWatts).toLocaleString('pt-BR')} W</strong></span><span><small>Energia</small><strong>{money(number(sheet.printerKwh))}/kWh</strong></span><span><small>Máquina</small><strong>{money(number(sheet.printerHourly))}/hora</strong></span></div>}<div className="fields">{field('batch','Peças produzidas no lote')}{field('hours','Impressão do lote (horas)')}</div></section>

    {groups.map(group=><section className="panel" key={group.title}><h2>{group.title}</h2><p className="muted">{group.hint}</p><div className="fields">{group.fields.map(([fieldName,label])=>field(fieldName,label))}</div>{group.title==='Trabalho'&&<p className="footnote">A reserva de perdas é aplicada ao custo de todos os insumos adicionados. Preço sugerido = (custo unitário + tarifa fixa + frete) ÷ (1 − taxas percentuais − margem desejada).</p>}</section>)}
   </div>
  </div>
 </div>;
}
