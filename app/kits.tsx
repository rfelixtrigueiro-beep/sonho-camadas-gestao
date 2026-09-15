'use client';
/* oxlint-disable next/no-img-element */
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Boxes,PackagePlus,Pencil,Power,Trash2,X} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {Dialog,DialogClose,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';

type KitSourceProduct={airtable_record_id:string;nome:string;preco_venda:number|null;foto_urls:string[];exibir_portfolio:boolean};
type KitItem={produto_id:string;produto_nome:string;foto_url:string|null;quantidade:number;preco_unitario:number};
type Kit={id:string;nome:string;foto_url:string|null;desconto_percentual:number;subtotal:number;preco_venda:number;preco_manual:boolean;exibir_portfolio:boolean;ativo:boolean;items:KitItem[]};

const reais=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const roundMoney=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
const storagePath=(url:string|null)=>{if(!url)return null;const marker='/storage/v1/object/public/portfolio/';const index=url.indexOf(marker);return index>=0?decodeURIComponent(url.slice(index+marker.length)):null};
const kitEnvironment=import.meta.env.BASE_URL.includes('/desenvolvimento/')?'desenvolvimento':'producao';
const environmentLabel=kitEnvironment==='desenvolvimento'?'desenvolvimento':'produção';

export default function Kits({administrator,userId,products}:{administrator:boolean;userId:string;products:KitSourceProduct[]}){
 const [kits,setKits]=useState<Kit[]>([]),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[formOpen,setFormOpen]=useState(false),[saving,setSaving]=useState(false),[selectedKit,setSelectedKit]=useState<Kit|null>(null),[editingKit,setEditingKit]=useState<Kit|null>(null);
 const [name,setName]=useState(''),[discount,setDiscount]=useState('0'),[published,setPublished]=useState(false),[quantities,setQuantities]=useState<Record<string,number>>({}),[photo,setPhoto]=useState<File|null>(null),[useManualPrice,setUseManualPrice]=useState(false),[manualPrice,setManualPrice]=useState('');
 const availableProducts=useMemo(()=>products.filter(product=>product.preco_venda!==null&&(administrator||product.exibir_portfolio)),[administrator,products]);
 const selectedProducts=useMemo(()=>availableProducts.filter(product=>(quantities[product.airtable_record_id]||0)>0),[availableProducts,quantities]);
 const discountNumber=Math.min(100,Math.max(0,Number(discount.replace(',','.'))||0));
 const manualPriceNumber=Number(manualPrice.replace(',','.'));
 const subtotal=roundMoney(selectedProducts.reduce((total,product)=>total+(product.preco_venda||0)*(quantities[product.airtable_record_id]||0),0));
 const automaticPrice=roundMoney(subtotal*(1-discountNumber/100));
 const finalPrice=useManualPrice&&Number.isFinite(manualPriceNumber)?roundMoney(manualPriceNumber):automaticPrice;

 const load=useCallback(async()=>{
  setLoading(true);
  let request=supabase.from('farm_product_kits').select('id,nome,foto_url,desconto_percentual,subtotal,preco_venda,preco_manual,exibir_portfolio,ativo').eq('ambiente',kitEnvironment).order('criado_em',{ascending:false});
  if(!administrator)request=request.eq('ativo',true).eq('exibir_portfolio',true);
  const kitsResult=await request;
  if(kitsResult.error){setMessage('Não foi possível carregar os kits.');setKits([]);setLoading(false);return}
  const rows=(kitsResult.data||[]) as Omit<Kit,'items'>[];
  if(rows.length===0){setKits([]);setLoading(false);return}
  const itemsResult=await supabase.from('farm_product_kit_items').select('kit_id,produto_id,produto_nome,foto_url,quantidade,preco_unitario').in('kit_id',rows.map(kit=>kit.id));
  if(itemsResult.error){setMessage('Não foi possível carregar os itens dos kits.');setKits([])}else{
   const items=(itemsResult.data||[]) as (KitItem&{kit_id:string})[];
   setKits(rows.map(kit=>({...kit,items:items.filter(item=>item.kit_id===kit.id)})));
  }
  setLoading(false);
 },[administrator]);

 useEffect(()=>{const timer=window.setTimeout(()=>{void load()},0);return()=>window.clearTimeout(timer)},[load]);

 function toggleProduct(productId:string,checked:boolean){setQuantities(current=>{const next={...current};if(checked)next[productId]=1;else delete next[productId];return next})}
 function changeQuantity(productId:string,value:number){setQuantities(current=>({...current,[productId]:Math.max(1,Math.floor(value)||1)}))}
 function clearForm(){setName('');setDiscount('0');setPublished(false);setQuantities({});setPhoto(null);setUseManualPrice(false);setManualPrice('');setEditingKit(null);setFormOpen(false)}
 function startEditing(kit:Kit){setName(kit.nome);setDiscount(String(kit.desconto_percentual));setPublished(kit.exibir_portfolio);setQuantities(Object.fromEntries(kit.items.map(item=>[item.produto_id,item.quantidade])));setPhoto(null);setUseManualPrice(kit.preco_manual);setManualPrice(kit.preco_manual?String(kit.preco_venda):'');setEditingKit(kit);setSelectedKit(null);setFormOpen(true);window.setTimeout(()=>document.querySelector('.kit-form')?.scrollIntoView({behavior:'smooth',block:'start'}),0)}

 async function saveKit(event:{preventDefault():void}){
  event.preventDefault();setMessage('');
  if(selectedProducts.length<2){setMessage('Selecione pelo menos dois produtos para formar o kit.');return}
  if(!useManualPrice&&(discountNumber<0||discountNumber>100)){setMessage('Informe um desconto entre 0% e 100%.');return}
  if(useManualPrice&&(!Number.isFinite(manualPriceNumber)||manualPriceNumber<0)){setMessage('Informe um preço direto válido para o kit.');return}
  setSaving(true);
  let kitId:string|null=editingKit?.id||null,uploadedPath:string|null=null;
  try{
   if(!kitId){
    const {data,error}=await supabase.from('farm_product_kits').insert({nome:name.trim(),categoria:'Kit',foto_url:null,desconto_percentual:useManualPrice?0:discountNumber,subtotal,preco_venda:finalPrice,preco_manual:useManualPrice,exibir_portfolio:published,ativo:true,ambiente:kitEnvironment,criado_por:userId}).select('id').single();
    if(error||!data)throw error||new Error('Kit sem identificador');
    kitId=(data as {id:string}).id;
   }
   let photoUrl=editingKit?.foto_url||null;
   if(photo){
    const extension=(photo.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase();
    uploadedPath=`kits/${kitId}/${crypto.randomUUID()}.${extension||'jpg'}`;
    const uploadResult=await supabase.storage.from('portfolio').upload(uploadedPath,photo,{contentType:photo.type||undefined,upsert:false});
    if(uploadResult.error)throw uploadResult.error;
    photoUrl=supabase.storage.from('portfolio').getPublicUrl(uploadedPath).data.publicUrl;
   }
   if(editingKit){
    const updateResult=await supabase.from('farm_product_kits').update({nome:name.trim(),foto_url:photoUrl,desconto_percentual:useManualPrice?0:discountNumber,subtotal,preco_venda:finalPrice,preco_manual:useManualPrice,exibir_portfolio:published,atualizado_em:new Date().toISOString()}).eq('id',kitId);
    if(updateResult.error)throw updateResult.error;
    const deleteItemsResult=await supabase.from('farm_product_kit_items').delete().eq('kit_id',kitId);
    if(deleteItemsResult.error)throw deleteItemsResult.error;
   }else if(photoUrl){
    const photoResult=await supabase.from('farm_product_kits').update({foto_url:photoUrl}).eq('id',kitId);
    if(photoResult.error)throw photoResult.error;
   }
   const kitItems=selectedProducts.map(product=>({kit_id:kitId,produto_id:product.airtable_record_id,produto_nome:product.nome,foto_url:product.foto_urls?.[0]||null,quantidade:quantities[product.airtable_record_id],preco_unitario:product.preco_venda||0}));
   const itemsResult=await supabase.from('farm_product_kit_items').insert(kitItems);
   if(itemsResult.error)throw itemsResult.error;
   if(editingKit&&uploadedPath){const oldPath=storagePath(editingKit.foto_url);if(oldPath)await supabase.storage.from('portfolio').remove([oldPath])}
   const action=editingKit?'atualizado':'criado';clearForm();setMessage(published?`Kit ${action} e publicado no ambiente de ${environmentLabel}.`:`Kit ${action} como oculto no ambiente de ${environmentLabel}.`);await load();
  }catch{
   if(uploadedPath)await supabase.storage.from('portfolio').remove([uploadedPath]);
   if(editingKit&&kitId){
    await supabase.from('farm_product_kits').update({nome:editingKit.nome,foto_url:editingKit.foto_url,desconto_percentual:editingKit.desconto_percentual,subtotal:editingKit.subtotal,preco_venda:editingKit.preco_venda,preco_manual:editingKit.preco_manual,exibir_portfolio:editingKit.exibir_portfolio}).eq('id',kitId);
    await supabase.from('farm_product_kit_items').delete().eq('kit_id',kitId);
    await supabase.from('farm_product_kit_items').insert(editingKit.items.map(item=>({kit_id:kitId,...item})));
   }else if(kitId)await supabase.from('farm_product_kits').delete().eq('id',kitId);
   setMessage('Não foi possível salvar o kit. Confira os dados e tente novamente.');
  }finally{setSaving(false)}
 }

 async function toggleActive(kit:Kit){
  const action=kit.ativo?'desativar':'reativar';
  if(!window.confirm(`Deseja ${action} o kit “${kit.nome}”?`))return;
  const {error}=await supabase.from('farm_product_kits').update({ativo:!kit.ativo,atualizado_em:new Date().toISOString()}).eq('id',kit.id);
  if(error)setMessage(`Não foi possível ${action} o kit.`);else{setSelectedKit(null);setMessage(kit.ativo?'Kit desativado. Ele não aparece para vendedores.':'Kit reativado com sucesso.');await load()}
 }

 async function deleteKit(kit:Kit){
  if(!window.confirm(`Excluir permanentemente o kit “${kit.nome}”? Esta ação não pode ser desfeita.`))return;
  const {error}=await supabase.from('farm_product_kits').delete().eq('id',kit.id);
  if(error){setMessage('Não foi possível excluir o kit.');return}
  const path=storagePath(kit.foto_url);if(path)await supabase.storage.from('portfolio').remove([path]);
  setSelectedKit(null);setMessage('Kit excluído permanentemente.');await load();
 }

 return <section className="kits-section" aria-label="Kits de produtos">
  <div className="kits-heading"><div><p className="eyebrow">COMBINAÇÕES DE PRODUTOS</p><h2>Kits</h2><p className="muted">Agrupe produtos do Portfólio e defina o preço por desconto ou valor direto.</p></div>{administrator&&<button onClick={()=>{if(formOpen)clearForm();else setFormOpen(true)}}>{formOpen?<X size={17}/>:<PackagePlus size={17}/>} {formOpen?'Fechar':'Criar kit'}</button>}</div>
  {administrator&&formOpen&&<form className="panel kit-form" onSubmit={saveKit}>
   <div className="kit-form-title"><h3>{editingKit?'Editar kit':'Novo kit'}</h3>{editingKit&&<span className="badge">Editando</span>}</div>
   <div className="fields"><label>Nome do kit<input value={name} onChange={event=>setName(event.target.value)} required maxLength={160} placeholder="Ex.: Kit Chaveiros Animais"/></label><label>Desconto (%)<input type="number" inputMode="decimal" min="0" max="100" step="0.01" value={discount} onChange={event=>setDiscount(event.target.value)} required={!useManualPrice} disabled={useManualPrice}/></label><label className="wide-field">Foto do kit<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={event=>setPhoto(event.target.files?.[0]||null)}/><small className="field-hint">{editingKit?.foto_url?'Escolha uma imagem somente se quiser substituir a foto atual.':'Esta foto será a capa do kit. Sem ela, o sistema mostrará a montagem dos produtos.'}</small></label></div>
   <fieldset className="kit-price-mode"><legend>Como definir o preço final?</legend><label><input type="radio" name="kit-price-mode" checked={!useManualPrice} onChange={()=>setUseManualPrice(false)}/> Aplicar desconto na soma</label><label><input type="radio" name="kit-price-mode" checked={useManualPrice} onChange={()=>setUseManualPrice(true)}/> Informar valor direto</label>{useManualPrice&&<label className="kit-manual-price">Preço direto do kit (R$)<input type="number" inputMode="decimal" min="0" step="0.01" value={manualPrice} onChange={event=>setManualPrice(event.target.value)} required/></label>}</fieldset>
   <fieldset className="kit-products"><legend>Produtos do kit</legend>{availableProducts.length===0?<p className="muted">Cadastre pelo menos dois produtos com preço de venda.</p>:availableProducts.map(product=>{const quantity=quantities[product.airtable_record_id]||0;return <div className={quantity>0?'kit-product selected':'kit-product'} key={product.airtable_record_id}><label><input type="checkbox" checked={quantity>0} onChange={event=>toggleProduct(product.airtable_record_id,event.target.checked)}/>{product.foto_urls?.[0]?<img src={product.foto_urls[0]} alt=""/>:<span className="kit-product-placeholder"><Boxes size={18}/></span>}<span><strong>{product.nome}</strong><small>{reais.format(product.preco_venda||0)}</small></span></label>{quantity>0&&<label className="kit-quantity">Quantidade<input type="number" min="1" step="1" value={quantity} onChange={event=>changeQuantity(product.airtable_record_id,Number(event.target.value))}/></label>}</div>})}</fieldset>
   <div className="kit-calculation"><div><span>Soma dos produtos</span><strong>{reais.format(subtotal)}</strong></div>{useManualPrice?<div><span>Preço informado diretamente</span><strong>{Number.isFinite(manualPriceNumber)&&manualPriceNumber>=0?reais.format(manualPriceNumber):'Informe o valor'}</strong></div>:<div><span>Desconto</span><strong>- {reais.format(roundMoney(subtotal-automaticPrice))}</strong></div>}<div className="kit-final"><span>Preço final do kit</span><strong>{reais.format(Math.max(0,finalPrice||0))}</strong></div></div>
   <fieldset className="portfolio-choice"><legend>Exibir o kit no Portfólio?</legend><label><input type="radio" name="kit-published" checked={published} onChange={()=>setPublished(true)}/> Sim</label><label><input type="radio" name="kit-published" checked={!published} onChange={()=>setPublished(false)}/> Não</label></fieldset>
   <div className="form-actions"><button disabled={saving||selectedProducts.length<2}>{saving?'Salvando…':editingKit?'Salvar alterações':'Salvar kit'}</button><button type="button" className="secondary" onClick={clearForm}>Cancelar</button></div>
  </form>}
  {message&&<output className="notice">{message}</output>}
  {loading?<p className="muted">Carregando kits…</p>:kits.length>0&&<div className="kits-grid">{kits.map(kit=><article className={kit.ativo?'kit-card':'kit-card disabled-kit'} key={kit.id}><button className="kit-card-hit" aria-label={`Ver detalhes de ${kit.nome}`} onClick={()=>setSelectedKit(kit)}/>{kit.foto_url?<div className="kit-cover"><img src={kit.foto_url} alt={`Foto do ${kit.nome}`} loading="lazy"/></div>:<div className="kit-collage">{kit.items.slice(0,4).map((item,index)=>item.foto_url?<img src={item.foto_url} alt="" key={`${item.produto_id}-${index}`}/>:<span key={`${item.produto_id}-${index}`}><Boxes size={22}/></span>)}</div>}<div className="kit-card-body"><div className="portfolio-card-top"><span className="badge">Kit</span>{administrator&&<small>{!kit.ativo?'Desativado':kit.exibir_portfolio?'Publicado':'Oculto'}</small>}</div><h3>{kit.nome}</h3><p>{kit.items.reduce((total,item)=>total+item.quantidade,0)} itens · {kit.preco_manual?'Preço direto':`${kit.desconto_percentual.toLocaleString('pt-BR')}% de desconto`}</p><div className="kit-card-price">{!kit.preco_manual&&<del>{reais.format(kit.subtotal)}</del>}<strong>{reais.format(kit.preco_venda)}</strong></div></div></article>)}</div>}
  <Dialog open={selectedKit!==null} onOpenChange={open=>{if(!open)setSelectedKit(null)}}><DialogContent className="kit-dialog" showCloseButton={false}><DialogClose className="product-dialog-close" aria-label="Fechar"><X size={19}/></DialogClose>{selectedKit&&<><DialogHeader><div className="kit-dialog-badges"><span className="badge">Kit</span>{administrator&&<span className={selectedKit.ativo?'status-chip-active':'status-chip-disabled'}>{selectedKit.ativo?'Ativo':'Desativado'}</span>}</div><DialogTitle>{selectedKit.nome}</DialogTitle><DialogDescription>Produtos e valores que compõem este kit.</DialogDescription></DialogHeader>{selectedKit.foto_url&&<div className="kit-dialog-cover"><img src={selectedKit.foto_url} alt={`Foto ampliada do ${selectedKit.nome}`}/></div>}<div className="kit-detail-items">{selectedKit.items.map(item=><div key={item.produto_id}>{item.foto_url?<img src={item.foto_url} alt=""/>:<span className="kit-product-placeholder"><Boxes size={18}/></span>}<span><strong>{item.produto_nome}</strong><small>{item.quantidade} × {reais.format(item.preco_unitario)}</small></span><b>{reais.format(item.quantidade*item.preco_unitario)}</b></div>)}</div><div className="kit-calculation"><div><span>Soma dos produtos</span><strong>{reais.format(selectedKit.subtotal)}</strong></div><div><span>{selectedKit.preco_manual?'Preço definido diretamente':`Desconto de ${selectedKit.desconto_percentual.toLocaleString('pt-BR')}%`}</span><strong>{selectedKit.preco_manual?reais.format(selectedKit.preco_venda):`- ${reais.format(selectedKit.subtotal-selectedKit.preco_venda)}`}</strong></div><div className="kit-final"><span>Preço final</span><strong>{reais.format(selectedKit.preco_venda)}</strong></div></div>{administrator&&<div className="kit-admin-actions"><button onClick={()=>startEditing(selectedKit)}><Pencil size={16}/> Editar kit</button><button className="secondary" onClick={()=>void toggleActive(selectedKit)}><Power size={16}/> {selectedKit.ativo?'Desativar':'Reativar'}</button><button className="danger-button" onClick={()=>void deleteKit(selectedKit)}><Trash2 size={16}/> Excluir</button></div>}</>}</DialogContent></Dialog>
 </section>
}
