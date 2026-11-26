'use client';

import {useState} from 'react';
import {Download,ReceiptText} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {receiptablePayments,receiptDate,receiptMoney,receiptOrderNumber,renderOrderReceipt,type ReceiptPayment} from '@/lib/order-receipt';

type Props={order:{id:string;numero:number;cliente_nome:string};environment:string};

export default function OrderReceipts({order,environment}:Props){
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [payments,setPayments]=useState<ReceiptPayment[]>([]);
 const [message,setMessage]=useState('');
 const panelId=`order-receipts-${order.id}`;

 async function loadPayments(){
  const {data,error}=await supabase.from('farm_order_financials')
   .select('pagamentos:farm_order_payments(id,tipo,valor,data_movimentacao,forma_pagamento,pagamento_origem_id)')
   .eq('pedido_id',order.id).eq('ambiente',environment).maybeSingle();
  if(error)throw error;
  const eligible=receiptablePayments((data?.pagamentos??[]) as ReceiptPayment[]);
  setPayments(eligible);
  return eligible;
 }

 async function toggle(){
  if(open){setOpen(false);return}
  setOpen(true);
  setBusy(true);
  setPayments([]);
  setMessage('Consultando pagamentos…');
  try{
   const eligible=await loadPayments();
   setMessage(eligible.length?'Escolha o pagamento para gerar o recibo.':'Este pedido ainda não tem pagamentos válidos para emitir recibo.');
  }catch{setMessage('Não foi possível consultar os pagamentos. Feche e tente novamente.')}
  finally{setBusy(false)}
 }

 async function download(paymentId:string){
  setBusy(true);
  setMessage('Preparando recibo…');
  try{
   const [eligible,{jsPDF}]=await Promise.all([loadPayments(),import('jspdf')]);
   const payment=eligible.find(item=>item.id===paymentId);
   if(!payment){setMessage('Esse pagamento foi estornado ou não está mais disponível.');return}
   const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
   renderOrderReceipt(doc,order,payment);
   doc.save(`recibo-pedido-${receiptOrderNumber(order.numero)}-${payment.id.slice(0,8)}.pdf`);
   setMessage('Recibo em PDF gerado.');
  }catch{setMessage('Não foi possível gerar o recibo. Tente novamente.')}
  finally{setBusy(false)}
 }

 return <div className={open?'order-receipts is-open':'order-receipts'}>
  <button type="button" className="secondary" aria-expanded={open} aria-controls={panelId} disabled={busy} onClick={()=>void toggle()}>
   <ReceiptText size={14}/> {open?'Fechar recibos':'Gerar recibo'}
  </button>
  <section id={panelId} className="order-receipts-panel" hidden={!open} aria-label="Recibos do pedido">
   {open&&<output>{message}</output>}
   {open&&payments.map(payment=><div className="order-receipt-payment" key={payment.id}>
    <span><strong>{receiptMoney.format(Number(payment.valor))}</strong> · {receiptDate(payment.data_movimentacao)} · {payment.forma_pagamento}</span>
    <button type="button" className="secondary" disabled={busy} onClick={()=>void download(payment.id)}>
     <Download size={14}/> Baixar recibo PDF
    </button>
   </div>)}
  </section>
 </div>;
}
