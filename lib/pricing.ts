export type SupplyUse={supplyId:string;name:string;quantity:string;unit:string;costPerUnit:string};
export type Sheet={name:string;batch:string;supplies:SupplyUse[];hours:string;printerId:string;printerName:string;printerWatts:string;printerKwh:string;printerHourly:string;minutes:string;labor:string;loss:string;commission:string;payment:string;tax:string;fixed:string;shipping:string;margin:string;price:string;productionDays:string};

export const blank:Sheet={name:'',batch:'',supplies:[],hours:'',printerId:'',printerName:'',printerWatts:'',printerKwh:'',printerHourly:'',minutes:'0',labor:'0',loss:'0',commission:'0',payment:'0',tax:'0',fixed:'0',shipping:'0',margin:'0',price:'0',productionDays:'0'};
export const example:Sheet={name:'Vaso Aurora (exemplo)',batch:'10',supplies:[],hours:'6',printerId:'',printerName:'',printerWatts:'',printerKwh:'',printerHourly:'',minutes:'30',labor:'24',loss:'5',commission:'0',payment:'0',tax:'0',fixed:'0',shipping:'0',margin:'35',price:'20',productionDays:'5'};

export function number(v:string){
 if(!/^\d+(?:[.,]\d+)?$/.test(v.trim()))return NaN;
 return Number(v.trim().replace(',','.'));
}

export function calculate(s:Sheet){
 const errors:Record<string,string>={};
 const n:Record<string,number>={};
 if(!s.name.trim())errors.name='Informe o nome do produto.';
 for(const k of ['batch','hours','printerWatts','printerKwh','printerHourly','minutes','labor','loss','commission','payment','tax','fixed','shipping','margin']){
  n[k]=number(s[k as keyof Sheet] as string);
  if(!Number.isFinite(n[k])||n[k]<0)errors[k]='Informe um número válido. Use 0 se não houver custo.';
 }
 if(!s.printerId||!s.printerName.trim())errors.printerId='Selecione a impressora utilizada.';
 if(!Number.isInteger(n.batch)||n.batch<1)errors.batch='Informe uma quantidade inteira maior que zero.';
 for(const k of ['loss','commission','payment','tax','margin'])if(n[k]>=100)errors[k]='Informe um percentual de 0 a menos de 100%.';
 const rates=(n.commission+n.payment+n.tax)/100;
 const margin=n.margin/100;
 if(rates+margin>=1)errors.margin='Margem + comissão + pagamento + impostos devem somar menos de 100%.';

 let supplies=0;
 s.supplies.forEach((item,i)=>{
  const quantity=number(item.quantity);
  const costPerUnit=number(item.costPerUnit);
  if(!item.supplyId||!item.name.trim())errors[`s${i}supply`]='Selecione um insumo cadastrado.';
  if(!Number.isFinite(quantity)||quantity<=0)errors[`s${i}quantity`]='Informe uma quantidade maior que zero.';
  if(!Number.isFinite(costPerUnit)||costPerUnit<0)errors[`s${i}cost`]='O valor do insumo precisa ser válido.';
  supplies+=quantity*costPerUnit;
 });

 if(s.price.trim()&&number(s.price)!==0&&(!Number.isFinite(number(s.price))||number(s.price)<0))errors.price='Informe um preço válido ou use 0 quando não houver valor definido.';
 if(s.productionDays.trim()&&number(s.productionDays)!==0&&(!Number.isInteger(number(s.productionDays))||number(s.productionDays)<1))errors.productionDays='Informe uma quantidade inteira de dias ou use 0 quando o prazo estiver a combinar.';
 if(Object.keys(errors).length)return {errors,result:null};
 const parts=[
  ['Insumos',supplies/n.batch],
  ['Reserva de perdas dos insumos',supplies*n.loss/100/n.batch],
  ['Energia',n.hours*n.printerWatts/1000*n.printerKwh/n.batch],
  ['Máquina',n.hours*n.printerHourly/n.batch],
  ['Trabalho manual',n.minutes/60*n.labor/n.batch],
 ] as [string,number][];
 const unit=parts.reduce((sum,p)=>sum+p[1],0);
 const expenses=n.fixed+n.shipping;
 const suggested=(unit+expenses)/(1-rates-margin);
 const informedPrice=s.price.trim()?number(s.price):0;
 const price=informedPrice>0?informedPrice:null;
 const contribution=price===null?null:price*(1-rates)-unit-expenses;
 if(![unit,suggested,...parts.map(p=>p[1])].every(Number.isFinite))return {errors:{batch:'Valores muito grandes para calcular. Revise a ficha.'},result:null};
 return {errors,result:{unit,batch:unit*n.batch,parts,suggested:Math.ceil(suggested*100-1e-9)/100,price,contribution,actualMargin:price===null?null:contribution!/price*100,rates,expenses}};
}

function legacySupplies(source:Record<string,unknown>):SupplyUse[]{
 const current=Array.isArray(source.supplies)?source.supplies:[];
 const result=current.filter(item=>item&&typeof item==='object'&&['supplyId','name','quantity','unit','costPerUnit'].every(k=>typeof (item as Record<string,unknown>)[k]==='string')) as SupplyUse[];
 if(Array.isArray(source.materials))source.materials.forEach((item,index)=>{
  if(!item||typeof item!=='object')return;
  const material=item as Record<string,unknown>;
  if(typeof material.name!=='string'||typeof material.grams!=='string'||typeof material.kgPrice!=='string'||!material.name.trim()||!Number.isFinite(number(material.grams))||!Number.isFinite(number(material.kgPrice)))return;
  result.push({supplyId:`legacy-material-${index}`,name:`${material.name} (ficha anterior)`,quantity:material.grams,unit:'g',costPerUnit:(number(material.kgPrice)/1000).toString()});
 });
 const batch=typeof source.batch==='string'?number(source.batch):NaN;
 for(const [key,name] of [['finish','Acabamento (ficha anterior)'],['pack','Embalagem (ficha anterior)']] as const){
  const value=typeof source[key]==='string'?number(source[key] as string):NaN;
  if(Number.isFinite(value)&&value>0&&Number.isFinite(batch)&&batch>0)result.push({supplyId:`legacy-${key}`,name,quantity:String(batch),unit:'un',costPerUnit:String(value)});
 }
 return result.slice(0,50);
}

export function normalizeSheet(v:unknown):Sheet|null{
 if(!v||typeof v!=='object')return null;
 const source=v as Record<string,unknown>;
 const scalarKeys=['name','batch','hours','minutes','labor','loss','commission','payment','tax','fixed','shipping','margin','price'];
 if(!scalarKeys.every(k=>typeof source[k]==='string'))return null;
 const supplies=legacySupplies(source);
 const hasNewPrinter=['printerId','printerName','printerWatts','printerKwh','printerHourly'].every(k=>typeof source[k]==='string');
 const hasLegacyPrinter=['watts','kwh','machine'].every(k=>typeof source[k]==='string')&&Boolean(String(source.watts).trim()||String(source.kwh).trim()||String(source.machine).trim());
 const printer=hasNewPrinter?{
  printerId:source.printerId as string,printerName:source.printerName as string,printerWatts:source.printerWatts as string,printerKwh:source.printerKwh as string,printerHourly:source.printerHourly as string,
 }:hasLegacyPrinter?{
  printerId:'legacy-printer',printerName:'Configuração anterior',printerWatts:source.watts as string,printerKwh:source.kwh as string,printerHourly:source.machine as string,
 }:{printerId:'',printerName:'',printerWatts:'',printerKwh:'',printerHourly:''};
 const productionDays=typeof source.productionDays==='string'?source.productionDays:blank.productionDays;
 const normalized=Object.assign({},blank,Object.fromEntries(scalarKeys.map(k=>[k,source[k]])),printer,{supplies,productionDays}) as Sheet;
 for(const key of ['minutes','labor','loss','commission','payment','tax','fixed','shipping','margin','price','productionDays'] as const)if(!normalized[key].trim())normalized[key]='0';
 return normalized;
}

export function validSheet(v:unknown):v is Sheet{return normalizeSheet(v)!==null;}
