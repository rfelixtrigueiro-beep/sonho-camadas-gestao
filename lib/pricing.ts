export type Material={name:string;grams:string;kgPrice:string};
export type Sheet={name:string;batch:string;materials:Material[];hours:string;watts:string;kwh:string;machine:string;minutes:string;labor:string;finish:string;pack:string;loss:string;commission:string;payment:string;tax:string;fixed:string;shipping:string;margin:string;price:string};
export const blank:Sheet={name:'',batch:'',materials:[{name:'',grams:'',kgPrice:''}],hours:'',watts:'',kwh:'',machine:'',minutes:'',labor:'',finish:'',pack:'',loss:'',commission:'',payment:'',tax:'',fixed:'',shipping:'',margin:'',price:''};
export const example:Sheet={name:'Vaso Aurora (exemplo)',batch:'10',materials:[{name:'PLA',grams:'240',kgPrice:'100'},{name:'PETG',grams:'60',kgPrice:'120'}],hours:'6',watts:'100',kwh:'1',machine:'2',minutes:'30',labor:'24',finish:'1',pack:'2',loss:'5',commission:'0',payment:'0',tax:'0',fixed:'0',shipping:'0',margin:'35',price:'20'};
export function number(v:string){if(!/^\d+(?:[.,]\d+)?$/.test(v.trim()))return NaN;return Number(v.trim().replace(',','.'))}
export function calculate(s:Sheet){
 const errors:Record<string,string>={};const n:Record<string,number>={};
 if(!s.name.trim())errors.name='Informe o nome do produto.';
 for(const k of Object.keys(blank).filter(k=>!['name','materials','price'].includes(k))){n[k]=number(s[k as keyof Sheet] as string);if(!Number.isFinite(n[k])||n[k]<0)errors[k]='Informe um número válido. Use 0 se não houver custo.'}
 if(!Number.isInteger(n.batch)||n.batch<1)errors.batch='Informe uma quantidade inteira maior que zero.';
 for(const k of ['loss','commission','payment','tax','margin'])if(n[k]>=100)errors[k]='Informe um percentual de 0 a menos de 100.';
 const rates=(n.commission+n.payment+n.tax)/100, margin=n.margin/100;
 if(rates+margin>=1)errors.margin='Margem + comissão + pagamento + impostos devem somar menos de 100%.';
 let material=0;
 s.materials.forEach((m,i)=>{if(!m.name.trim())errors[`m${i}name`]='Identifique o filamento.';for(const key of ['grams','kgPrice'] as const){if(!Number.isFinite(number(m[key])))errors[`m${i}${key}`]='Informe um valor válido, inclusive 0 quando aplicável.'}material+=number(m.grams)/1000*number(m.kgPrice)});
 if(!s.materials.length)errors.materials='Adicione ao menos um material.';
 if(s.price.trim()&&(!Number.isFinite(number(s.price))||number(s.price)<=0))errors.price='Informe um preço maior que zero ou deixe vazio.';
 if(Object.keys(errors).length)return {errors,result:null};
 const parts=[['Material',material/n.batch],['Reserva de perdas',material*n.loss/100/n.batch],['Energia',n.hours*n.watts/1000*n.kwh/n.batch],['Máquina',n.hours*n.machine/n.batch],['Trabalho manual',n.minutes/60*n.labor/n.batch],['Acabamento',n.finish],['Embalagem',n.pack]] as [string,number][];
 const unit=parts.reduce((sum,p)=>sum+p[1],0), expenses=n.fixed+n.shipping;
 const suggested=(unit+expenses)/(1-rates-margin);const price=s.price.trim()?number(s.price):null;
 const contribution=price===null?null:price*(1-rates)-unit-expenses;
 if(![unit,suggested,...parts.map(p=>p[1])].every(Number.isFinite))return {errors:{batch:'Valores muito grandes para calcular. Revise a ficha.'},result:null};
 return {errors,result:{unit,batch:unit*n.batch,parts,suggested:Math.ceil(suggested*100-1e-9)/100,price,contribution,actualMargin:price===null?null:contribution!/price*100,rates,expenses}};
}
export function validSheet(v:unknown):v is Sheet{if(!v||typeof v!=='object')return false;const s=v as Sheet;return Object.keys(blank).filter(k=>k!=='materials').every(k=>typeof s[k as keyof Sheet]==='string')&&Array.isArray(s.materials)&&s.materials.length>0&&s.materials.length<=50&&s.materials.every(m=>m&&['name','grams','kgPrice'].every(k=>typeof m[k as keyof Material]==='string'))}
