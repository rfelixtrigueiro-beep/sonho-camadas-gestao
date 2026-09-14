export type Material={name:string;grams:string;kgPrice:string};
export type SupplyUse={supplyId:string;name:string;quantity:string;unit:string;costPerUnit:string};
export type Sheet={name:string;batch:string;materials:Material[];supplies:SupplyUse[];hours:string;watts:string;kwh:string;machine:string;minutes:string;labor:string;finish:string;pack:string;loss:string;commission:string;payment:string;tax:string;fixed:string;shipping:string;margin:string;price:string};

export const blank:Sheet={name:'',batch:'',materials:[{name:'',grams:'',kgPrice:''}],supplies:[],hours:'',watts:'',kwh:'',machine:'',minutes:'',labor:'',finish:'',pack:'',loss:'',commission:'',payment:'',tax:'',fixed:'',shipping:'',margin:'',price:''};
export const example:Sheet={name:'Vaso Aurora (exemplo)',batch:'10',materials:[{name:'PLA',grams:'240',kgPrice:'100'},{name:'PETG',grams:'60',kgPrice:'120'}],supplies:[],hours:'6',watts:'100',kwh:'1',machine:'2',minutes:'30',labor:'24',finish:'1',pack:'2',loss:'5',commission:'0',payment:'0',tax:'0',fixed:'0',shipping:'0',margin:'35',price:'20'};

export function number(v:string){
 if(!/^\d+(?:[.,]\d+)?$/.test(v.trim()))return NaN;
 return Number(v.trim().replace(',','.'));
}

export function calculate(s:Sheet){
 const errors:Record<string,string>={};
 const n:Record<string,number>={};
 if(!s.name.trim())errors.name='Informe o nome do produto.';
 for(const k of Object.keys(blank).filter(k=>!['name','materials','supplies','price'].includes(k))){
  n[k]=number(s[k as keyof Sheet] as string);
  if(!Number.isFinite(n[k])||n[k]<0)errors[k]='Informe um número válido. Use 0 se não houver custo.';
 }
 if(!Number.isInteger(n.batch)||n.batch<1)errors.batch='Informe uma quantidade inteira maior que zero.';
 for(const k of ['loss','commission','payment','tax','margin'])if(n[k]>=100)errors[k]='Informe um percentual de 0 a menos de 100%.';
 const rates=(n.commission+n.payment+n.tax)/100;
 const margin=n.margin/100;
 if(rates+margin>=1)errors.margin='Margem + comissão + pagamento + impostos devem somar menos de 100%.';

 let material=0;
 s.materials.forEach((m,i)=>{
  if(!m.name.trim())errors[`m${i}name`]='Identifique o filamento.';
  for(const key of ['grams','kgPrice'] as const)if(!Number.isFinite(number(m[key])))errors[`m${i}${key}`]='Informe um valor válido, inclusive 0 quando aplicável.';
  material+=number(m.grams)/1000*number(m.kgPrice);
 });
 if(!s.materials.length)errors.materials='Adicione ao menos um material.';

 let supplies=0;
 s.supplies.forEach((item,i)=>{
  const quantity=number(item.quantity);
  const costPerUnit=number(item.costPerUnit);
  if(!item.supplyId||!item.name.trim())errors[`s${i}supply`]='Selecione um insumo cadastrado.';
  if(!Number.isFinite(quantity)||quantity<=0)errors[`s${i}quantity`]='Informe uma quantidade maior que zero.';
  if(!Number.isFinite(costPerUnit)||costPerUnit<0)errors[`s${i}cost`]='O valor do insumo precisa ser válido.';
  supplies+=quantity*costPerUnit;
 });

 if(s.price.trim()&&(!Number.isFinite(number(s.price))||number(s.price)<=0))errors.price='Informe um preço maior que zero ou deixe vazio.';
 if(Object.keys(errors).length)return {errors,result:null};
 const parts=[
  ['Material',material/n.batch],
  ['Reserva de perdas',material*n.loss/100/n.batch],
  ['Insumos cadastrados',supplies/n.batch],
  ['Energia',n.hours*n.watts/1000*n.kwh/n.batch],
  ['Máquina',n.hours*n.machine/n.batch],
  ['Trabalho manual',n.minutes/60*n.labor/n.batch],
  ['Acabamento',n.finish],
  ['Embalagem',n.pack],
 ] as [string,number][];
 const unit=parts.reduce((sum,p)=>sum+p[1],0);
 const expenses=n.fixed+n.shipping;
 const suggested=(unit+expenses)/(1-rates-margin);
 const price=s.price.trim()?number(s.price):null;
 const contribution=price===null?null:price*(1-rates)-unit-expenses;
 if(![unit,suggested,...parts.map(p=>p[1])].every(Number.isFinite))return {errors:{batch:'Valores muito grandes para calcular. Revise a ficha.'},result:null};
 return {errors,result:{unit,batch:unit*n.batch,parts,suggested:Math.ceil(suggested*100-1e-9)/100,price,contribution,actualMargin:price===null?null:contribution!/price*100,rates,expenses}};
}

export function normalizeSheet(v:unknown):Sheet|null{
 if(!v||typeof v!=='object')return null;
 const s=v as Partial<Sheet>;
 const scalarKeys=Object.keys(blank).filter(k=>!['materials','supplies'].includes(k));
 const validScalars=scalarKeys.every(k=>typeof s[k as keyof Sheet]==='string');
 const validMaterials=Array.isArray(s.materials)&&s.materials.length>0&&s.materials.length<=50&&s.materials.every(m=>m&&['name','grams','kgPrice'].every(k=>typeof m[k as keyof Material]==='string'));
 const validSupplies=s.supplies===undefined||(Array.isArray(s.supplies)&&s.supplies.length<=50&&s.supplies.every(item=>item&&['supplyId','name','quantity','unit','costPerUnit'].every(k=>typeof item[k as keyof SupplyUse]==='string')));
 if(!validScalars||!validMaterials||!validSupplies)return null;
 return {...s,supplies:s.supplies??[]} as Sheet;
}

export function validSheet(v:unknown):v is Sheet{return normalizeSheet(v)!==null;}
