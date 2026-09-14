'use client';
import {useEffect,useState} from 'react';
import {Eraser,PackagePlus,Save,X} from 'lucide-react';
import {blank,example,calculate,normalizeSheet,number,type Sheet,type SupplyUse} from '@/lib/pricing';
import {money} from '@/lib/demo';
import {supabase} from '@/lib/supabase';

type Unit='un'|'g'|'kg'|'ml'|'l'|'cm'|'m';
type CatalogSupply={id:string;nome:string;valor_compra:number;quantidade_compra:number;unidade_medida:Unit};
type SupplyForm={nome:string;valor_compra:string;quantidade_compra:string;unidade_medida:Unit};
const emptySupply:SupplyForm={nome:'',valor_compra:'',quantidade_compra:'',unidade_medida:'un'};
const units:[Unit,string][]=[['un','Unidade'],['g','Grama'],['kg','Quilograma'],['ml','Mililitro'],['l','Litro'],['cm','Centímetro'],['m','Metro']];
const key='sonho-product-sheet-v1';
const groups=[
 {title:'Lote e impressão',hint:'Informe o total de todas as placas do lote. O tempo compartilhado entra uma única vez.',fields:[['batch','Peças produzidas no lote'],['hours','Impressão do lote (horas)'],['watts','Potência média (W)'],['kwh','Energia (R$/kWh)'],['machine','Máquina sem energia (R$/hora)']]},
 {title:'Trabalho e acabamento',hint:'Trabalho manual é separado da impressão. Embalagem e acabamento são por peça.',fields:[['minutes','Trabalho manual do lote (minutos)'],['labor','Mão de obra (R$/hora)'],['finish','Acabamento por unidade (R$)'],['pack','Embalagem por unidade (R$)'],['loss','Reserva de perdas de material (%)']]},
 {title:'Canal de venda',hint:'Taxas percentuais incidem sobre o preço final efetivamente cobrado. Valores fixos e frete são por unidade vendida. Use 0 onde não se aplica.',fields:[['commission','Comissão (%)'],['payment','Taxa de pagamento (%)'],['tax','Impostos (%)'],['fixed','Tarifa fixa por unidade (R$)'],['shipping','Frete pago por você por unidade (R$)'],['margin','Margem desejada sobre a venda (%)'],['price','Preço final que pretende cobrar (R$) — opcional']]},
];

export default function ProductSheet({userId}:{userId:string}){
 const [sheet,setSheet]=useState<Sheet>(blank);
 const [catalog,setCatalog]=useState<CatalogSupply[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [status,setStatus]=useState('');
 const [saved,setSaved]=useState(false);
 const [saving,setSaving]=useState(false);
 const [registryOpen,setRegistryOpen]=useState(false);
 const [supplyForm,setSupplyForm]=useState<SupplyForm>(emptySupply);
 const [savingSupply,setSavingSupply]=useState(false);
 const {errors,result}=calculate(sheet);

 useEffect(()=>{let live=true;(async()=>{
  setStatus('Carregando ficha e insumos…');
  try{
   const [sheetResult,suppliesResult]=await Promise.all([
    supabase.from('farm_product_sheets').select('sheet').eq('id',userId).maybeSingle(),
    supabase.from('farm_supplies').select('id,nome,valor_compra,quantidade_compra,unidade_medida').eq('ativo',true).order('nome'),
   ]);
   if(sheetResult.error)throw sheetResult.error;
   if(live)setCatalog(suppliesResult.error?[]:(suppliesResult.data||[]) as CatalogSupply[]);
   const restored=normalizeSheet(sheetResult.data?.sheet);
   if(restored){if(live){setSheet(restored);setSaved(false);setStatus(suppliesResult.error?'Ficha recuperada, mas os insumos não puderam ser carregados.':'Ficha e insumos carregados. Revise os dados e clique em Salvar produto.')}localStorage.removeItem(key)}
   else{const legacy=localStorage.getItem(key);const parsed=legacy?normalizeSheet(JSON.parse(legacy)):null;if(parsed&&live){setSheet(parsed);setStatus('Encontramos sua ficha anterior. Revise os dados e clique em Salvar produto.')}else if(live)setStatus(suppliesResult.error?'Preencha uma nova ficha. Os insumos não puderam ser carregados.':'Preencha uma nova ficha.')}
  }catch{if(live)setStatus('Não foi possível carregar a ficha. Tente novamente.')}
  finally{if(live)setLoaded(true)}
 })();return()=>{live=false}},[userId]);

 const change=(k:keyof Sheet,v:string)=>{setSheet(current=>({...current,[k]:v}));setSaved(false);setStatus('Alterações ainda não salvas.')};
 const changeSupplies=(supplies:SupplyUse[])=>{setSheet(current=>({...current,supplies}));setSaved(false);setStatus('Alterações ainda não salvas.')};
 const costPerUnit=(supply:CatalogSupply)=>Number(supply.valor_compra)/Number(supply.quantidade_compra);

 async function createSupply(event:React.FormEvent){
  event.preventDefault();setSavingSupply(true);setStatus('Salvando insumo…');
  const {data,error}=await supabase.from('farm_supplies').insert({nome:supplyForm.nome.trim(),valor_compra:number(supplyForm.valor_compra),quantidade_compra:number(supplyForm.quantidade_compra),unidade_medida:supplyForm.unidade_medida}).select('id,nome,valor_compra,quantidade_compra,unidade_medida').single();
  if(error)setStatus(error.code==='23505'?'Já existe um insumo ativo com esse nome.':'Não foi possível cadastrar o insumo. Confira os dados.');
  else{setCatalog(current=>[...current,data as CatalogSupply].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')));setSupplyForm(emptySupply);setRegistryOpen(false);setStatus('Insumo cadastrado e disponível na calculadora.')}
  setSavingSupply(false);
 }

 function addSupply(supplyId:string){
  const supply=catalog.find(item=>item.id===supplyId);
  if(!supply||sheet.supplies.some(item=>item.supplyId===supply.id))return;
  changeSupplies([...sheet.supplies,{supplyId:supply.id,name:supply.nome,quantity:'',unit:supply.unidade_medida,costPerUnit:costPerUnit(supply).toString()}]);
 }

 async function saveProduct(){
  if(!result||saving)return;setSaving(true);setStatus('Salvando produto…');
  const {error:sheetError}=await supabase.from('farm_product_sheets').upsert({id:userId,sheet,updated_at:new Date().toISOString()},{onConflict:'id'});
  if(sheetError){setStatus('Não foi possível salvar a ficha. Nenhum produto foi criado.');setSaving(false);return}
  const id=`farm_${crypto.randomUUID()}`;
  const price=result.price??result.suggested;
  const materials=sheet.materials.map(material=>material.name.trim()).filter(Boolean).join(', ');
  const supplies=sheet.supplies.map(item=>item.name.trim()).filter(Boolean).join(', ');
  const notes=`Criado pela calculadora. Custo por unidade: ${money(result.unit)}. Lote calculado: ${sheet.batch} peça(s).${materials?` Filamentos: ${materials}.`:''}${supplies?` Insumos: ${supplies}.`:''}`;
  const {error:productError}=await supabase.from('farm_portfolio_products').insert({airtable_record_id:id,nome:sheet.name.trim(),categoria:null,categoria_id:null,preco_venda:price,tempo_producao_h:number(sheet.hours),estoque:0,ativo:true,observacoes:notes,exibir_portfolio:false,foto_urls:[]});
  if(productError){setStatus('A ficha foi salva, mas o produto não pôde ser criado no Portfólio. Tente novamente.');setSaving(false);return}
  localStorage.removeItem(key);setSaved(true);setStatus('Produto salvo e criado no Portfólio como não publicado.');setSaving(false);
 }

 async function clearSheet(){
  if(saving)return;setSaving(true);const cleared=structuredClone(blank);setSheet(cleared);setSaved(false);localStorage.removeItem(key);
  const {error}=await supabase.from('farm_product_sheets').upsert({id:userId,sheet:cleared,updated_at:new Date().toISOString()},{onConflict:'id'});
  setStatus(error?'A tela foi limpa, mas a ficha anterior pode reaparecer ao entrar novamente. Nenhum produto foi criado.':'Calculadora limpa. Nenhum produto foi criado no Portfólio.');setSaving(false);
 }

 function field(k:string,label:string){return <label key={k} htmlFor={`field-${k}`}>{label}<input id={`field-${k}`} inputMode="decimal" value={sheet[k as keyof Sheet] as string} onChange={event=>change(k as keyof Sheet,event.target.value)} aria-invalid={!!errors[k]} aria-describedby={errors[k]?`error-${k}`:undefined}/>{errors[k]&&<span className="field-error" id={`error-${k}`}>{errors[k]}</span>}</label>}

 return <div className="product-sheet">
  <section className="panel supply-registry">
   <div className="section-title"><div><h2>Cadastro de insumos</h2><p className="muted">Cadastre o valor pago e a medida da embalagem para reutilizar o custo na calculadora.</p></div><button className="secondary" onClick={()=>setRegistryOpen(!registryOpen)}>{registryOpen?<X size={17}/>:<PackagePlus size={17}/>} {registryOpen?'Fechar cadastro':'Cadastrar insumo'}</button></div>
   {registryOpen&&<form className="supply-form" onSubmit={createSupply}><label>Nome do insumo<input value={supplyForm.nome} onChange={event=>setSupplyForm({...supplyForm,nome:event.target.value})} required maxLength={120} placeholder="Ex.: Cola instantânea"/></label><label>Valor pago (R$)<input type="number" inputMode="decimal" min="0" step="0.01" value={supplyForm.valor_compra} onChange={event=>setSupplyForm({...supplyForm,valor_compra:event.target.value})} required placeholder="0,00"/></label><label>Quantidade da embalagem<input type="number" inputMode="decimal" min="0.0001" step="0.0001" value={supplyForm.quantidade_compra} onChange={event=>setSupplyForm({...supplyForm,quantidade_compra:event.target.value})} required placeholder="Ex.: 500"/></label><label>Unidade de medida<select value={supplyForm.unidade_medida} onChange={event=>setSupplyForm({...supplyForm,unidade_medida:event.target.value as Unit})}>{units.map(([value,label])=><option value={value} key={value}>{label} ({value})</option>)}</select></label><p className="field-hint supply-hint">Use a mesma unidade na compra e no consumo. Exemplo: um rolo de 1 kg pode ser cadastrado como 1.000 g.</p><button disabled={savingSupply}>{savingSupply?'Salvando…':'Salvar insumo'}</button></form>}
   <div className="supply-summary" aria-label="Insumos cadastrados">{catalog.length===0?<p className="muted">Nenhum insumo cadastrado.</p>:catalog.map(supply=><article key={supply.id}><strong>{supply.nome}</strong><span>{money(Number(supply.valor_compra))} por {Number(supply.quantidade_compra).toLocaleString('pt-BR')} {supply.unidade_medida}</span><small>{money(costPerUnit(supply))} por {supply.unidade_medida}</small></article>)}</div>
  </section>

  <section className="panel"><div className="section-title"><div><h2>Ficha do seu produto</h2><p className="muted">Preencha os dados para calcular o custo e o preço sugerido.</p></div><span className="badge">{saved?'Produto criado':'Rascunho'}</span></div><p className="callout">Ao salvar, a ficha fica protegida na sua conta e o produto é criado no Portfólio como não publicado. Depois você poderá adicionar categoria, foto, tamanho e link do arquivo.</p><div className="actions"><button disabled={!loaded||!result||saving||saved} onClick={()=>void saveProduct()}><Save size={17}/>{saving?'Salvando…':saved?'Produto salvo':'Salvar produto'}</button><button className="secondary" disabled={!loaded||saving} onClick={()=>void clearSheet()}><Eraser size={17}/> Limpar</button><button className="secondary" disabled={saving} onClick={()=>{setSheet(structuredClone(example));setSaved(false);setStatus('Exemplo carregado para edição.')}}>Carregar exemplo fictício</button></div><p role="status" className="notice">{status}</p><label htmlFor="product-name">Nome do produto<input id="product-name" value={sheet.name} onChange={event=>change('name',event.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name?'name-error':undefined}/>{errors.name&&<span className="field-error" id="name-error">{errors.name}</span>}</label></section>

  <div className="calculator-layout"><section className="panel calculator-result" aria-live="polite"><p className="eyebrow">RESULTADO DA FICHA</p><h2>{sheet.name||'Seu produto'}</h2>{!result?<><p className="callout">Cálculo incompleto. Revise os campos indicados abaixo. Campo vazio não significa custo zero.</p><p>{Object.keys(errors).length} {Object.keys(errors).length===1?'campo precisa':'campos precisam'} de revisão.</p></>:<><div className="result-pair"><div><small>Custo por unidade</small><strong>{money(result.unit)}</strong></div><div><small>Preço mínimo para a margem desejada</small><strong>{money(result.suggested)}</strong></div></div><dl>{result.parts.map(([name,value])=><div key={name}><dt>{name}</dt><dd>{money(value)}</dd></div>)}<div><dt>Custo do lote</dt><dd>{money(result.batch)}</dd></div><div><dt>Tarifa fixa + frete por unidade</dt><dd>{money(result.expenses)}</dd></div>{result.price!==null&&<><div><dt>Preço informado</dt><dd>{money(result.price)}</dd></div><div><dt>Taxas no preço informado</dt><dd>{money(result.price*result.rates)}</dd></div><div><dt>Contribuição por unidade</dt><dd>{money(result.contribution!)}</dd></div><div><dt>Margem no preço informado</dt><dd>{result.actualMargin!.toLocaleString('pt-BR',{maximumFractionDigits:2})}%</dd></div></>}</dl>{result.contribution!==null&&result.contribution<0&&<p className="field-error">O preço informado não cobre os custos e as despesas desta ficha.</p>}<p className="footnote">Margem é a parcela da venda que sobra após os custos e taxas informados; não é lucro líquido do negócio. A sugestão é arredondada para cima no centavo. Nenhum preço é aprovado automaticamente.</p></>}</section>

   <div className="calculator-fields">
    <section className="panel"><h2>Materiais do lote</h2><p className="muted">Consumo em gramas, incluindo suportes e purga. Preço de compra por kg. Não some a mesma perda novamente na reserva percentual.</p>{sheet.materials.map((material,index)=><fieldset key={index} className="material-card"><legend>Filamento {index+1}</legend>{([['name','Material, marca e cor'],['grams','Consumo do lote (g)'],['kgPrice','Preço de compra (R$/kg)']] as const).map(([fieldName,label])=><label key={fieldName}>{label}<input inputMode={fieldName==='name'?'text':'decimal'} value={material[fieldName]} onChange={event=>{setSheet(current=>({...current,materials:current.materials.map((old,itemIndex)=>itemIndex===index?{...old,[fieldName]:event.target.value}:old)}));setSaved(false);setStatus('Alterações ainda não salvas.')}} aria-invalid={!!errors[`m${index}${fieldName}`]} aria-describedby={errors[`m${index}${fieldName}`]?`material-error-${index}-${fieldName}`:undefined}/>{errors[`m${index}${fieldName}`]&&<span className="field-error" id={`material-error-${index}-${fieldName}`}>{errors[`m${index}${fieldName}`]}</span>}</label>)}<button className="secondary" disabled={sheet.materials.length===1} onClick={()=>{setSheet(current=>({...current,materials:current.materials.filter((_,itemIndex)=>itemIndex!==index)}));setSaved(false);setStatus('Material removido do rascunho.')}}>Remover filamento {index+1}</button></fieldset>)}<button className="secondary" disabled={sheet.materials.length>=50} onClick={()=>{setSheet(current=>({...current,materials:[...current.materials,{name:'',grams:'',kgPrice:''}]}));setSaved(false);setStatus('Novo filamento adicionado. Preencha os campos.')}}>Adicionar filamento</button></section>

    <section className="panel calculator-supplies"><h2>Insumos do lote</h2><p className="muted">Selecione um insumo cadastrado e informe a quantidade utilizada no lote inteiro.</p><label className="supply-picker">Adicionar insumo<select value="" onChange={event=>{addSupply(event.target.value);event.target.value=''}}><option value="">Selecione um insumo</option>{catalog.filter(supply=>!sheet.supplies.some(item=>item.supplyId===supply.id)).map(supply=><option key={supply.id} value={supply.id}>{supply.nome} · {money(costPerUnit(supply))}/{supply.unidade_medida}</option>)}</select></label>{sheet.supplies.length===0?<p className="callout">Nenhum insumo adicional neste cálculo.</p>:sheet.supplies.map((item,index)=><fieldset className="supply-use-card" key={item.supplyId}><legend>{item.name}</legend><p>{money(number(item.costPerUnit))} por {item.unit}</p><label>Quantidade usada no lote ({item.unit})<input inputMode="decimal" value={item.quantity} onChange={event=>changeSupplies(sheet.supplies.map((old,itemIndex)=>itemIndex===index?{...old,quantity:event.target.value}:old))} aria-invalid={!!errors[`s${index}quantity`]}/>{errors[`s${index}quantity`]&&<span className="field-error">{errors[`s${index}quantity`]}</span>}</label><button className="secondary" onClick={()=>changeSupplies(sheet.supplies.filter((_,itemIndex)=>itemIndex!==index))}>Remover insumo</button></fieldset>)}</section>

    {groups.map(group=><section className="panel" key={group.title}><h2>{group.title}</h2><p className="muted">{group.hint}</p><div className="fields">{group.fields.map(([fieldName,label])=>field(fieldName,label))}</div>{group.title==='Trabalho e acabamento'&&<p className="footnote">Reserva de perdas aplicada somente ao custo teórico dos materiais. Não é um registro de falhas reais. Preço sugerido = (custo unitário + tarifa fixa + frete) ÷ (1 − taxas percentuais − margem desejada).</p>}</section>)}
   </div>
  </div>
 </div>;
}
