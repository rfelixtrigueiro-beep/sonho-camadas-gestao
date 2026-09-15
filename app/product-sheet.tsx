'use client';
import {useEffect,useState} from 'react';
import {Eraser,Save} from 'lucide-react';
import {blank,example,calculate,normalizeSheet,number,type Sheet,type SupplyUse} from '@/lib/pricing';
import {money} from '@/lib/demo';
import {supabase} from '@/lib/supabase';

type Unit='un'|'g'|'kg'|'ml'|'l'|'cm'|'m';
type CatalogSupply={id:string;nome:string;valor_compra:number;quantidade_compra:number;unidade_medida:Unit;ativo:boolean};
type CatalogPrinter={id:string;nome:string;potencia_watts:number;tarifa_energia_kwh:number;custo_maquina_hora:number;ativo:boolean};
const key='sonho-product-sheet-v1';
const sortByStatusAndName=<T extends {ativo:boolean;nome:string}>(items:T[])=>items.sort((a,b)=>Number(b.ativo)-Number(a.ativo)||a.nome.localeCompare(b.nome,'pt-BR'));
const groups=[
 {title:'Trabalho',hint:'Informe apenas o tempo de trabalho manual. Os materiais de acabamento e embalagem devem ser adicionados como insumos.',fields:[['minutes','Trabalho manual do lote (minutos)'],['labor','Mão de obra (R$/hora)'],['loss','Reserva de perdas dos insumos (%)']]},
 {title:'Canal de venda',hint:'Taxas percentuais incidem sobre o preço final efetivamente cobrado. Valores fixos e frete são por unidade vendida. Use 0 onde não se aplica.',fields:[['commission','Comissão (%)'],['payment','Taxa de pagamento (%)'],['tax','Impostos (%)'],['fixed','Tarifa fixa por unidade (R$)'],['shipping','Frete pago por você por unidade (R$)'],['margin','Margem desejada sobre a venda (%)'],['price','Preço final que pretende cobrar (R$) — opcional']]},
];

export default function ProductSheet({userId,catalogVersion=0}:{userId:string;catalogVersion?:number}){
 const draftKey=`farm.productSheetDraft.${userId}`;
 const [sheet,setSheet]=useState<Sheet>(blank);
 const [catalog,setCatalog]=useState<CatalogSupply[]>([]);
 const [printers,setPrinters]=useState<CatalogPrinter[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [status,setStatus]=useState('');
 const [saved,setSaved]=useState(false);
 const [saving,setSaving]=useState(false);
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
   const storedDraft=sessionStorage.getItem(draftKey);const draft=storedDraft?normalizeSheet(JSON.parse(storedDraft)):null;
   const restored=draft||normalizeSheet(sheetResult.data?.sheet);
   if(restored){if(live){setSheet(restored);setSaved(false);setStatus(draft?'Rascunho recuperado nesta janela.':suppliesResult.error||printersResult.error?'Ficha recuperada, mas algum cadastro não pôde ser carregado.':'Ficha, insumos e impressoras carregados.')}localStorage.removeItem(key)}
   else{const legacy=localStorage.getItem(key);const parsed=legacy?normalizeSheet(JSON.parse(legacy)):null;if(parsed&&live){setSheet(parsed);setStatus('Encontramos sua ficha anterior. Revise os dados antes de salvar.')}else if(live)setStatus('Preencha uma nova ficha.')}
  }catch{if(live)setStatus('Não foi possível carregar a ficha. Tente novamente.')}
  finally{if(live)setLoaded(true)}
 })();return()=>{live=false}},[userId,draftKey,catalogVersion]);

 useEffect(()=>{if(loaded&&!saved)sessionStorage.setItem(draftKey,JSON.stringify(sheet))},[draftKey,loaded,saved,sheet]);

 const change=(k:keyof Sheet,v:string)=>{setSheet(current=>({...current,[k]:v}));setSaved(false);setStatus('Alterações ainda não salvas.')};
 const changeSupplies=(supplies:SupplyUse[])=>{setSheet(current=>({...current,supplies}));setSaved(false);setStatus('Alterações ainda não salvas.')};
 const costPerUnit=(supply:CatalogSupply)=>Number(supply.valor_compra)/Number(supply.quantidade_compra);

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
  localStorage.removeItem(key);sessionStorage.removeItem(draftKey);setSaved(true);setStatus('Produto salvo, criado no Portfólio como não publicado e adicionado ao Estoque com saldo zero.');setSaving(false);
 }

 async function clearSheet(){
  if(saving)return;setSaving(true);const cleared=structuredClone(blank);setSheet(cleared);setSaved(false);localStorage.removeItem(key);sessionStorage.setItem(draftKey,JSON.stringify(cleared));
  const {error}=await supabase.from('farm_product_sheets').upsert({id:userId,sheet:cleared,updated_at:new Date().toISOString()},{onConflict:'id'});
  setStatus(error?'A tela foi limpa, mas a ficha anterior pode reaparecer ao entrar novamente. Nenhum produto foi criado.':'Calculadora limpa. Nenhum produto foi criado no Portfólio.');setSaving(false);
 }

 function field(k:string,label:string){return <label key={k} htmlFor={`field-${k}`}>{label}<input id={`field-${k}`} inputMode="decimal" value={sheet[k as keyof Sheet] as string} onChange={event=>change(k as keyof Sheet,event.target.value)} aria-invalid={!!errors[k]} aria-describedby={errors[k]?`error-${k}`:undefined}/>{errors[k]&&<span className="field-error" id={`error-${k}`}>{errors[k]}</span>}</label>}

 return <div className="product-sheet">
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
