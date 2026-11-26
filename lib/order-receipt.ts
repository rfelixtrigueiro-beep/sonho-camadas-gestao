import type {jsPDF} from 'jspdf';

export type ReceiptPayment={
 id:string;
 tipo:'recebimento'|'estorno';
 valor:number|string;
 data_movimentacao:string;
 forma_pagamento:string;
 pagamento_origem_id:string|null;
};

export const receiptOrderNumber=(number:number)=>String(number).padStart(4,'0');
export const receiptMoney=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
export const receiptDate=(date:string)=>new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR');

export function receiptablePayments(payments:ReceiptPayment[]){
 const reversed=new Set(payments.filter(payment=>payment.tipo==='estorno').map(payment=>payment.pagamento_origem_id));
 return payments.filter(payment=>payment.tipo==='recebimento'&&!reversed.has(payment.id)
  &&Number.isFinite(Number(payment.valor))&&Number(payment.valor)>0)
  .sort((a,b)=>b.data_movimentacao.localeCompare(a.data_movimentacao)||a.id.localeCompare(b.id));
}

export function renderOrderReceipt(doc:jsPDF,order:{numero:number;cliente_nome:string},payment:ReceiptPayment){
 const margin=18;
 const width=doc.internal.pageSize.getWidth()-margin*2;
 doc.setFont('helvetica','bold');
 doc.setFontSize(22);
 doc.setTextColor(23,52,65);
 doc.text('Recibo de pagamento',margin,29);
 doc.setFont('helvetica','normal');
 doc.setFontSize(11);
 doc.text('Sonho em Camadas 3D',margin,38);
 doc.setDrawColor(181,138,42);
 doc.line(margin,44,margin+width,44);

 doc.setFillColor(237,245,244);
 doc.roundedRect(margin,54,width,30,2,2,'F');
 doc.setFontSize(10);
 doc.text('Valor recebido neste pagamento',margin+6,64);
 doc.setFont('helvetica','bold');
 doc.setFontSize(20);
 doc.text(receiptMoney.format(Number(payment.valor)),margin+6,77);

 const fields=[
  ['Recebido de',order.cliente_nome],
  ['Referente ao pedido',`#${receiptOrderNumber(order.numero)}`],
  ['Data do pagamento',receiptDate(payment.data_movimentacao)],
  ['Forma de pagamento',payment.forma_pagamento],
  ['Referência do pagamento',payment.id],
 ];
 let y=101;
 for(const [label,value] of fields){
  doc.setFont('helvetica','bold');
  doc.setFontSize(10);
  doc.text(label,margin,y);
  doc.setFont('helvetica','normal');
  doc.setFontSize(11);
  const lines=doc.splitTextToSize(value,width) as string[];
  doc.text(lines,margin,y+6);
  y+=15+(lines.length-1)*5;
 }
 doc.setFontSize(9);
 doc.text('Este recibo confirma o pagamento acima para o pedido indicado.',margin,y+4);
}
