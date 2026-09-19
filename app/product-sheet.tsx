'use client';
import {useEffect,useState} from 'react';
import {Archive,Clock3,Eraser,FileText,FolderOpen,Save,Search,Trash2} from 'lucide-react';
import {blank,example,calculate,normalizeSheet,number,type Sheet,type SupplyUse} from '@/lib/pricing';
import {money} from '@/lib/demo';
import {supabase} from '@/lib/supabase';

type Unit='un'|'g'|'kg'|'ml'|'l'|'cm'|'m';
type CatalogSupply={id:string;nome:string;valor_compra:number;quantidade_compra:number;unidade_medida:Unit;ativo:boolean};
type CatalogPrinter={id:string;nome:string;potencia_watts:number;tarifa_energia_kwh:number;custo_maquina_hora:number;ativo:boolean};
type CalculationResult=NonNullable<ReturnType<typeof calculate>['result']>;
type CalculationSimulation={id:string;nome:string;sheet:Sheet;result:CalculationResult;created_at:string;updated_at:string};
type PdfImage={data:string;width:number;height:number};
const key='sonho-product-sheet-v1';
const environment=import.meta.env.BASE_URL.includes('/desenvolvimento/')?'desenvolvimento':'producao';
const sortByStatusAndName=<T extends {ativo:boolean;nome:string}>(items:T[])=>items.sort((a,b)=>Number(b.ativo)-Number(a.ativo)||a.nome.localeCompare(b.nome,'pt-BR'));
const groups=[
 {title:'Trabalho',hint:'Informe apenas o tempo de trabalho manual. Os materiais de acabamento e embalagem devem ser adicionados como insumos.',fields:[['minutes','Trabalho manual do lote (minutos)'],['labor','Mão de obra (R$/hora)'],['loss','Reserva de perdas dos insumos (%)']]},
 {title:'Canal de venda',hint:'Taxas percentuais incidem sobre o preço final efetivamente cobrado. Valores fixos e frete são por unidade vendida. Use 0 onde não se aplica.',fields:[['commission','Comissão (%)'],['payment','Taxa de pagamento (%)'],['tax','Impostos (%)'],['fixed','Tarifa fixa por unidade (R$)'],['shipping','Frete pago por você por unidade (R$)'],['margin','Margem desejada sobre a venda (%)'],['price','Preço final que pretende cobrar (R$) — opcional'],['productionDays','Dias para produção (opcional)']]},
];

async function loadPdfImage(url:string):Promise<PdfImage|null>{
 try{const image=new Image();image.src=url;await image.decode();const maxSize=900,scale=Math.min(1,maxSize/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const context=canvas.getContext('2d');if(!context)return null;context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);return{data:canvas.toDataURL('image/jpeg',.88),width:canvas.width,height:canvas.height}}catch{return null}
}

export default function ProductSheet({userId,catalogVersion=0}:{userId:string;catalogVersion?:number}){
 const draftKey=`farm.productSheetDraft.${userId}`;
 const editingKey=`farm.productSheetEditingSimulation.${userId}.${environment}`;
 const [sheet,setSheet]=useState<Sheet>(blank);
 const [catalog,setCatalog]=useState<CatalogSupply[]>([]);
 const [printers,setPrinters]=useState<CatalogPrinter[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [status,setStatus]=useState('');
 const [saved,setSaved]=useState(false);
 const [saving,setSaving]=useState(false);
 const [simulations,setSimulations]=useState<CalculationSimulation[]>([]);
 const [simulationSearch,setSimulationSearch]=useState('');
 const [simulationsLoading,setSimulationsLoading]=useState(true);
 const [simulationSaving,setSimulationSaving]=useState(false);
 const [quoteGenerating,setQuoteGenerating]=useState(false);
 const [editingSimulationId,setEditingSimulationId]=useState('');
 const [deletingSimulationId,setDeletingSimulationId]=useState('');
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
   const storedEditingSimulation=sessionStorage.getItem(editingKey)||'';if(live)setEditingSimulationId(storedEditingSimulation);
   const restored=draft||normalizeSheet(sheetResult.data?.sheet);
   if(restored){if(live){setSheet(restored);setSaved(false);setStatus(draft?'Rascunho recuperado nesta janela.':suppliesResult.error||printersResult.error?'Ficha recuperada, mas algum cadastro não pôde ser carregado.':'Ficha, insumos e impressoras carregados.')}localStorage.removeItem(key)}
   else{const legacy=localStorage.getItem(key);const parsed=legacy?normalizeSheet(JSON.parse(legacy)):null;if(parsed&&live){setSheet(parsed);setStatus('Encontramos sua ficha anterior. Revise os dados antes de salvar.')}else if(live)setStatus('Preencha uma nova ficha.')}
  }catch{if(live)setStatus('Não foi possível carregar a ficha. Tente novamente.')}
  finally{if(live)setLoaded(true)}
 })();return()=>{live=false}},[userId,draftKey,editingKey,catalogVersion]);

 useEffect(()=>{if(loaded&&!saved)sessionStorage.setItem(draftKey,JSON.stringify(sheet))},[draftKey,loaded,saved,sheet]);
 useEffect(()=>{if(!loaded)return;if(editingSimulationId)sessionStorage.setItem(editingKey,editingSimulationId);else sessionStorage.removeItem(editingKey)},[editingKey,editingSimulationId,loaded]);

 useEffect(()=>{let live=true;void (async()=>{setSimulationsLoading(true);const {data,error}=await supabase.from('farm_calculation_simulations').select('id,nome,sheet,result,created_at,updated_at').eq('user_id',userId).eq('ambiente',environment).order('updated_at',{ascending:false});if(live){setSimulations(error?[]:(data||[]) as CalculationSimulation[]);setSimulationsLoading(false);if(error)setStatus('A calculadora foi carregada, mas não foi possível buscar as simulações salvas.')}})();return()=>{live=false}},[userId]);

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
  setSheet(sample);setSaved(false);setEditingSimulationId('');sessionStorage.removeItem(editingKey);setStatus('Exemplo carregado. Adicione os insumos usados no lote.');
 }

 async function archiveSimulation(mode:'manual'|'product'){
  if(!result)return null;
  const {data,error}=await supabase.from('farm_calculation_simulations').insert({user_id:userId,ambiente:environment,nome:sheet.name.trim(),sheet,result,updated_at:new Date().toISOString()}).select('id,nome,sheet,result,created_at,updated_at').single();
  if(error||!data)return null;
  setSimulations(current=>[data as CalculationSimulation,...current]);
  if(mode==='manual')setStatus('Simulação salva. Nenhum produto foi criado no Portfólio ou no Estoque.');
  return data as CalculationSimulation;
 }

 async function saveSimulation(){
  if(!result||saving||simulationSaving)return;
  setSimulationSaving(true);setStatus('Salvando simulação…');
  const {error:sheetError}=await supabase.from('farm_product_sheets').upsert({id:userId,sheet,updated_at:new Date().toISOString()},{onConflict:'id'});
  if(sheetError){setStatus('Não foi possível salvar a ficha atual. Tente novamente.');setSimulationSaving(false);return}
  if(editingSimulationId){
   const {data,error}=await supabase.from('farm_calculation_simulations').update({nome:sheet.name.trim(),sheet,result,updated_at:new Date().toISOString()}).eq('id',editingSimulationId).eq('user_id',userId).eq('ambiente',environment).select('id,nome,sheet,result,created_at,updated_at').single();
   if(error||!data)setStatus('Não foi possível atualizar o cálculo salvo. Tente novamente.');
   else{setSimulations(current=>current.map(item=>item.id===editingSimulationId?data as CalculationSimulation:item).sort((a,b)=>new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()));setEditingSimulationId('');sessionStorage.removeItem(editingKey);setStatus('Cálculo salvo atualizado com sucesso. Nenhuma cópia foi criada.');}
   setSimulationSaving(false);return;
  }
  const savedSimulation=await archiveSimulation('manual');
  if(!savedSimulation)setStatus('Não foi possível arquivar a simulação. Tente novamente.');
  setSimulationSaving(false);
 }

 function openSimulation(simulation:CalculationSimulation){
  const restored=normalizeSheet(simulation.sheet);
  if(!restored){setStatus('Esta simulação não possui uma ficha válida.');return}
  setSheet(restored);setSaved(false);setEditingSimulationId(simulation.id);sessionStorage.setItem(draftKey,JSON.stringify(restored));sessionStorage.setItem(editingKey,simulation.id);setStatus(`Cálculo “${simulation.nome}” aberto para edição. Altere os dados e clique em Salvar alterações.`);window.scrollTo({top:0,behavior:'smooth'});
 }

 function cancelSimulationEditing(){setEditingSimulationId('');sessionStorage.removeItem(editingKey);setStatus('Edição do cálculo cancelada. Os dados atuais continuam na calculadora como rascunho.')}

 async function deleteSimulation(simulation:CalculationSimulation){
  if(deletingSimulationId||!window.confirm(`Excluir permanentemente a simulação “${simulation.nome}”? Esta ação não pode ser desfeita.`))return;
  setDeletingSimulationId(simulation.id);setStatus('Excluindo simulação…');
  const {error}=await supabase.from('farm_calculation_simulations').delete().eq('id',simulation.id).eq('user_id',userId).eq('ambiente',environment);
  if(error)setStatus('Não foi possível excluir a simulação. Tente novamente.');
  else{setSimulations(current=>current.filter(item=>item.id!==simulation.id));if(editingSimulationId===simulation.id){setEditingSimulationId('');sessionStorage.removeItem(editingKey);setStatus('Simulação excluída. Os dados continuam na calculadora como rascunho.')}else setStatus('Simulação excluída do histórico.');}
  setDeletingSimulationId('');
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
  const calculationSaved=await archiveSimulation('product');
  localStorage.removeItem(key);sessionStorage.removeItem(draftKey);sessionStorage.removeItem(editingKey);setEditingSimulationId('');setSaved(true);setStatus(calculationSaved?'Produto salvo e cálculo arquivado. O produto foi criado no Portfólio como não publicado e no Estoque com saldo zero.':'Produto criado no Portfólio e no Estoque, mas o cálculo não pôde ser arquivado.');setSaving(false);
 }

 async function clearSheet(){
  if(saving)return;setSaving(true);const cleared=structuredClone(blank);setSheet(cleared);setSaved(false);setEditingSimulationId('');localStorage.removeItem(key);sessionStorage.setItem(draftKey,JSON.stringify(cleared));sessionStorage.removeItem(editingKey);
  const {error}=await supabase.from('farm_product_sheets').upsert({id:userId,sheet:cleared,updated_at:new Date().toISOString()},{onConflict:'id'});
  setStatus(error?'A tela foi limpa, mas a ficha anterior pode reaparecer ao entrar novamente. Nenhum produto foi criado.':'Calculadora limpa. Nenhum produto foi criado no Portfólio.');setSaving(false);
 }

 async function generateQuote(){
  if(!result||quoteGenerating)return;
  setQuoteGenerating(true);setStatus('Gerando orçamento em PDF…');
  try{
   const {jsPDF}=await import('jspdf');
   const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
   const pageWidth=doc.internal.pageSize.getWidth(),margin=16,contentWidth=pageWidth-margin*2;
   const today=new Date(),validUntil=new Date(today);validUntil.setDate(validUntil.getDate()+7);
   const quantity=number(sheet.batch),unitPrice=result.price??result.suggested,total=unitPrice*quantity;
   const logoUrl=new URL(`${import.meta.env.BASE_URL}brand/Logo_Otimizada_Preta.png`,window.location.origin).href;
   const logo=await loadPdfImage(logoUrl);
   if(logo){const logoSize=25,ratio=Math.min(logoSize/logo.width,logoSize/logo.height),width=logo.width*ratio,height=logo.height*ratio;doc.addImage(logo.data,'JPEG',margin+(logoSize-width)/2,13+(logoSize-height)/2,width,height,undefined,'FAST')}
   doc.setTextColor(23,52,65);doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('ORÇAMENTO',margin+32,21);
   doc.setFontSize(11);doc.text('Sonho em Camadas 3D',margin+32,28);
   doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(86,101,115);doc.text('Ideias que ganham forma',margin+32,33);
   doc.setDrawColor(181,138,42);doc.setLineWidth(.7);doc.line(margin,42,pageWidth-margin,42);

   doc.setFontSize(9);doc.setTextColor(86,101,115);doc.text(`Emitido em: ${today.toLocaleDateString('pt-BR')}`,margin,51);doc.text(`Válido até: ${validUntil.toLocaleDateString('pt-BR')}`,pageWidth-margin,51,{align:'right'});
   doc.setFillColor(247,249,250);doc.setDrawColor(220,227,233);doc.roundedRect(margin,59,contentWidth,24,2,2,'FD');
   doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(86,101,115);doc.text('PRODUTO',margin+6,67);
   doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(23,52,65);doc.text(sheet.name.trim(),margin+6,75,{maxWidth:contentWidth-12});

   const tableY=94,colQuantity=112,colUnit=145,colTotal=pageWidth-margin;
   doc.setFillColor(23,52,65);doc.rect(margin,tableY,contentWidth,10,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('DESCRIÇÃO',margin+4,tableY+6.5);doc.text('QTD.',colQuantity,tableY+6.5,{align:'right'});doc.text('VALOR UNIT.',colUnit,tableY+6.5,{align:'right'});doc.text('TOTAL',colTotal-4,tableY+6.5,{align:'right'});
   doc.setFillColor(255,255,255);doc.setDrawColor(220,227,233);doc.rect(margin,tableY+10,contentWidth,17,'FD');doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(23,52,65);doc.text(sheet.name.trim(),margin+4,tableY+20,{maxWidth:82});doc.text(quantity.toLocaleString('pt-BR'),colQuantity,tableY+20,{align:'right'});doc.text(money(unitPrice),colUnit,tableY+20,{align:'right'});doc.setFont('helvetica','bold');doc.text(money(total),colTotal-4,tableY+20,{align:'right'});

   doc.setFillColor(237,245,244);doc.roundedRect(112,126,pageWidth-margin-112,22,2,2,'F');doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(18,100,84);doc.text('VALOR TOTAL',118,134);doc.setFont('helvetica','bold');doc.setFontSize(17);doc.text(money(total),pageWidth-margin-5,143,{align:'right'});
   doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(23,52,65);doc.text('Informações do orçamento',margin,165);
   doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(86,101,115);const informedProductionDays=sheet.productionDays.trim()?number(sheet.productionDays):0;const productionDays=informedProductionDays>0?informedProductionDays:null;const details=[`Quantidade: ${quantity.toLocaleString('pt-BR')} peça${quantity===1?'':'s'}.`,productionDays===null?'Prazo de produção: a combinar.':`Prazo de produção: ${productionDays.toLocaleString('pt-BR')} dia${productionDays===1?'':'s'}.`,`Impressora prevista: ${sheet.printerName}.`,'Condições de pagamento: a combinar.'];doc.text(details.map(item=>`• ${item}`),margin,174,{lineHeightFactor:1.7,maxWidth:contentWidth});
   doc.setDrawColor(220,227,233);doc.line(margin,274,pageWidth-margin,274);doc.setFontSize(7.5);doc.setTextColor(113,131,142);doc.text('Orçamento gerado pelo sistema de gestão Sonho em Camadas 3D.',margin,280);doc.text('Valores calculados a partir da ficha atual.',pageWidth-margin,280,{align:'right'});
   const filename=sheet.name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'produto';
   doc.save(`orcamento-${filename}-${today.toISOString().slice(0,10)}.pdf`);setStatus('Orçamento gerado e baixado. A ficha e o estoque não foram alterados.');
  }catch{setStatus('Não foi possível gerar o orçamento. Tente novamente.')}finally{setQuoteGenerating(false)}
 }

 function field(k:string,label:string){return <label key={k} htmlFor={`field-${k}`}>{label}<input id={`field-${k}`} inputMode="decimal" value={sheet[k as keyof Sheet] as string} onChange={event=>change(k as keyof Sheet,event.target.value)} aria-invalid={!!errors[k]} aria-describedby={errors[k]?`error-${k}`:undefined}/>{errors[k]&&<span className="field-error" id={`error-${k}`}>{errors[k]}</span>}</label>}

 return <div className="product-sheet">
  <section className="panel"><div className="section-title"><div><h2>Ficha do seu produto</h2><p className="muted">Preencha os dados para calcular o custo e o preço sugerido.</p></div><span className="badge">{saved?'Produto criado':editingSimulationId?'Editando cálculo':'Rascunho'}</span></div><p className="callout">{editingSimulationId?'Você está alterando um cálculo do histórico. Salve as alterações para atualizar o mesmo registro, sem criar uma cópia.':'Você pode arquivar somente a simulação, gerar um orçamento ou salvar o produto. Ao salvar o produto, o cálculo também será arquivado automaticamente.'}</p><div className="actions"><button disabled={!loaded||!result||saving||saved||simulationSaving||quoteGenerating} onClick={()=>void saveProduct()}><Save size={17}/>{saving?'Salvando…':saved?'Produto salvo':'Salvar produto'}</button><button className="secondary" disabled={!loaded||!result||saving||simulationSaving||quoteGenerating} onClick={()=>void saveSimulation()}><Archive size={17}/>{simulationSaving?'Salvando…':editingSimulationId?'Salvar alterações':'Salvar simulação'}</button>{editingSimulationId&&<button className="secondary" disabled={saving||simulationSaving||quoteGenerating} onClick={cancelSimulationEditing}>Cancelar edição</button>}<button className="secondary" disabled={!loaded||!result||saving||simulationSaving||quoteGenerating} onClick={()=>void generateQuote()}><FileText size={17}/>{quoteGenerating?'Gerando…':'Gerar orçamento'}</button><button className="secondary" disabled={!loaded||saving||simulationSaving||quoteGenerating} onClick={()=>void clearSheet()}><Eraser size={17}/> Limpar</button><button className="secondary" disabled={saving||simulationSaving||quoteGenerating} onClick={loadExample}>Preencher exemplo</button></div><output className="notice">{status}</output><label htmlFor="product-name">Nome do produto<input id="product-name" value={sheet.name} onChange={event=>change('name',event.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name?'name-error':undefined}/>{errors.name&&<span className="field-error" id="name-error">{errors.name}</span>}</label></section>

  <div className="calculator-layout"><section className="panel calculator-result" aria-live="polite"><p className="eyebrow">RESULTADO DA FICHA</p><h2>{sheet.name||'Seu produto'}</h2>{!result?<><p className="callout">Cálculo incompleto. Revise os campos indicados abaixo. Campo vazio não significa custo zero.</p><p>{Object.keys(errors).length} {Object.keys(errors).length===1?'campo precisa':'campos precisam'} de revisão.</p></>:<><div className="result-pair"><div><small>Custo por unidade</small><strong>{money(result.unit)}</strong></div><div><small>Preço mínimo para a margem desejada</small><strong>{money(result.suggested)}</strong></div></div><dl>{result.parts.map(([name,value])=><div key={name}><dt>{name}</dt><dd>{money(value)}</dd></div>)}<div><dt>Custo do lote</dt><dd>{money(result.batch)}</dd></div><div><dt>Tarifa fixa + frete por unidade</dt><dd>{money(result.expenses)}</dd></div>{result.price!==null&&<><div><dt>Preço informado</dt><dd>{money(result.price)}</dd></div><div><dt>Taxas no preço informado</dt><dd>{money(result.price*result.rates)}</dd></div><div><dt>Contribuição por unidade</dt><dd>{money(result.contribution!)}</dd></div><div><dt>Margem no preço informado</dt><dd>{result.actualMargin!.toLocaleString('pt-BR',{maximumFractionDigits:2})}%</dd></div></>}</dl>{result.contribution!==null&&result.contribution<0&&<p className="field-error">O preço informado não cobre os custos e as despesas desta ficha.</p>}<p className="footnote">Margem é a parcela da venda que sobra após os custos e taxas informados. A sugestão é arredondada para cima no centavo.</p></>}</section>

   <div className="calculator-fields">
    <section className="panel calculator-supplies"><h2>Insumos do lote</h2><p className="muted">Adicione quantos insumos forem necessários e informe o consumo total do lote.</p><label className="supply-picker">Adicionar insumo<select value="" onChange={event=>{addSupply(event.target.value);event.target.value=''}}><option value="">Selecione um insumo</option>{catalog.filter(supply=>supply.ativo&&!sheet.supplies.some(item=>item.supplyId===supply.id)).map(supply=><option key={supply.id} value={supply.id}>{supply.nome} · {money(costPerUnit(supply))}/{supply.unidade_medida}</option>)}</select></label>{sheet.supplies.length===0?<p className="callout">Nenhum insumo adicionado. Use a lista acima para incluir PLA, argolas, embalagens e outros itens.</p>:sheet.supplies.map((item,index)=><fieldset className="supply-use-card" key={item.supplyId}><legend>{item.name}</legend><p>{money(number(item.costPerUnit))} por {item.unit}</p><label>Quantidade usada no lote ({item.unit})<input inputMode="decimal" value={item.quantity} onChange={event=>changeSupplies(sheet.supplies.map((old,itemIndex)=>itemIndex===index?{...old,quantity:event.target.value}:old))} aria-invalid={!!errors[`s${index}quantity`]}/>{errors[`s${index}quantity`]&&<span className="field-error">{errors[`s${index}quantity`]}</span>}</label><button className="secondary" onClick={()=>changeSupplies(sheet.supplies.filter((_,itemIndex)=>itemIndex!==index))}>Remover insumo</button></fieldset>)}</section>

    <section className="panel"><h2>Lote e impressão</h2><p className="muted">Selecione a impressora. A potência e os custos cadastrados serão usados automaticamente.</p><label className="printer-picker" htmlFor="printer-select">Impressora utilizada<select id="printer-select" value={sheet.printerId} onChange={event=>selectPrinter(event.target.value)} aria-invalid={!!errors.printerId}><option value="">Selecione a impressora</option>{sheet.printerId&&!printers.some(item=>item.id===sheet.printerId&&item.ativo)&&<option value={sheet.printerId}>{sheet.printerName} · configuração da ficha</option>}{printers.filter(printer=>printer.ativo).map(printer=><option key={printer.id} value={printer.id}>{printer.nome}</option>)}</select>{errors.printerId&&<span className="field-error">{errors.printerId}</span>}</label>{sheet.printerId&&<div className="printer-values"><span><small>Potência</small><strong>{number(sheet.printerWatts).toLocaleString('pt-BR')} W</strong></span><span><small>Energia</small><strong>{money(number(sheet.printerKwh))}/kWh</strong></span><span><small>Máquina</small><strong>{money(number(sheet.printerHourly))}/hora</strong></span></div>}<div className="fields">{field('batch','Peças produzidas no lote')}{field('hours','Impressão do lote (horas)')}</div></section>

    {groups.map(group=><section className="panel" key={group.title}><h2>{group.title}</h2><p className="muted">{group.hint}</p><div className="fields">{group.fields.map(([fieldName,label])=>field(fieldName,label))}</div>{group.title==='Trabalho'&&<p className="footnote">A reserva de perdas é aplicada ao custo de todos os insumos adicionados. Preço sugerido = (custo unitário + tarifa fixa + frete) ÷ (1 − taxas percentuais − margem desejada).</p>}</section>)}
   </div>
  </div>
  <section className="panel simulation-library"><div className="section-title"><div><p className="eyebrow">HISTÓRICO DE CÁLCULOS</p><h2>Simulações salvas</h2><p className="muted">Busque, edite, atualize ou exclua uma ficha de cálculo.</p></div><span className="badge">{simulations.length}</span></div><label className="simulation-search" htmlFor="simulation-search"><Search size={17}/><span>Buscar simulação</span><input id="simulation-search" value={simulationSearch} onChange={event=>setSimulationSearch(event.target.value)} placeholder="Nome do produto"/></label>{simulationsLoading?<p className="muted">Carregando simulações…</p>:simulations.length===0?<p className="callout">Nenhuma simulação salva neste ambiente.</p>:<div className="simulation-list">{simulations.filter(item=>item.nome.toLocaleLowerCase('pt-BR').includes(simulationSearch.trim().toLocaleLowerCase('pt-BR'))).map(item=><article key={item.id}><div><strong>{item.nome}</strong><span><Clock3 size={14}/>{new Date(item.updated_at).toLocaleString('pt-BR')}</span></div><dl><div><dt>Custo unitário</dt><dd>{money(Number(item.result.unit))}</dd></div><div><dt>Preço sugerido</dt><dd>{money(Number(item.result.suggested))}</dd></div></dl><div className="simulation-actions"><button type="button" className="secondary" disabled={editingSimulationId===item.id||Boolean(deletingSimulationId)} onClick={()=>openSimulation(item)}><FolderOpen size={16}/>{editingSimulationId===item.id?'Em edição':'Editar cálculo'}</button><button type="button" className="simulation-delete" disabled={Boolean(deletingSimulationId)} onClick={()=>void deleteSimulation(item)}><Trash2 size={16}/>{deletingSimulationId===item.id?'Excluindo…':'Excluir'}</button></div></article>)}</div>}</section>
 </div>;
}
