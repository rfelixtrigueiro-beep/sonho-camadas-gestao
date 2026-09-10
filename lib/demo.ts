export const money=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function cost(pla:number){return ((240/1000*pla+60/1000*120)*1.05+6*.1*1+6*2+.5*24)/10+1+2}
export type State={confirmed:boolean; frozen:number; started:boolean; approved:number; delivered:boolean; payments:number[]; movements:{name:string;qty:string}[]};
export const initial:State={confirmed:false,frozen:0,started:false,approved:0,delivered:false,payments:[],movements:[{name:'Saldo inicial · chaveiro',qty:'+2 unidades'}]};
export type Action={type:'confirm'|'start'|'produce'|'deliver'|'pay'|'reset';value?:number};
export function reduce(s:State,a:Action):State{
 if(a.type==='reset')return initial;
 if(a.type==='confirm'&&!s.confirmed&&Number.isFinite(a.value))return {...s,confirmed:true,frozen:a.value!,movements:[...s.movements,{name:'Pedido #1042 · reserva de chaveiros',qty:'2 reservados'}]};
 if(a.type==='start'&&s.confirmed&&!s.started)return {...s,started:true};
 if(a.type==='produce'&&s.started&&!s.delivered&&Number.isInteger(a.value)&&a.value!>0&&s.approved+a.value!<=10)return {...s,approved:s.approved+a.value!,movements:[...s.movements,{name:'OP-028 · vasos aprovados e reservados',qty:`+${a.value} unidades`}]};
 if(a.type==='deliver'&&s.approved===10&&!s.delivered)return {...s,delivered:true,movements:[...s.movements,{name:'Pedido #1042 · entrega e liberação das reservas',qty:'−10 vasos / −2 chaveiros'}]};
 if(a.type==='pay'&&s.confirmed&&Number.isFinite(a.value)&&a.value!>0&&Math.round(a.value!*100)<=21000-Math.round(s.payments.reduce((x,y)=>x+y,0)*100))return {...s,payments:[...s.payments,Math.round(a.value!*100)/100]};
 return s;
}
