import type {jsPDF} from 'jspdf';
import type {PdfImage} from './pdf-image';

export type ReceiptPayment={
 id:string;
 tipo:'recebimento'|'estorno';
 valor:number|string;
 data_movimentacao:string;
 forma_pagamento:string;
 pagamento_origem_id:string|null;
};

export type ReceiptOrder={
 numero:number;
 cliente_nome:string;
 items:ReadonlyArray<{produto_nome:string;quantidade:number}>;
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

export function renderOrderReceipt(doc:jsPDF,order:ReceiptOrder,payment:ReceiptPayment,logo:PdfImage|null){
 const margin=18;
 const width=doc.internal.pageSize.getWidth()-margin*2;
 let titleX=margin;
 if(logo){
  const logoSize=25;
  const scale=logoSize/Math.max(logo.width,logo.height);
  const logoWidth=logo.width*scale,logoHeight=logo.height*scale;
  doc.addImage(logo.data,'JPEG',margin+(logoSize-logoWidth)/2,13+(logoSize-logoHeight)/2,logoWidth,logoHeight,undefined,'FAST');
  titleX+=32;
 }
 doc.setFont('helvetica','bold');
 doc.setFontSize(22);
 doc.setTextColor(23,52,65);
 doc.text('Recibo de pagamento',titleX,26);
 doc.setFont('helvetica','normal');
 doc.setFontSize(11);
 doc.text('Sonho em Camadas 3D',titleX,34);
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
 if(!order.items.length)return;

 const bottom=doc.internal.pageSize.getHeight()-18;
 y+=17;
 function itemHeader(continued=false){
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.setTextColor(23,52,65);
  doc.text(continued?'Itens do pedido (continuação)':'Itens do pedido',margin,y);
  y+=4;
  doc.setFillColor(23,52,65);
  doc.rect(margin,y,width,9,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(8);
  doc.text('DESCRIÇÃO',margin+4,y+6);
  doc.text('QTD.',margin+width-4,y+6,{align:'right'});
  y+=9;
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.setTextColor(23,52,65);
 }

 if(y+24>bottom){doc.addPage();y=21;}
 itemHeader();
 for(const item of order.items){
  const lines=doc.splitTextToSize(item.produto_nome,width-28) as string[];
  let rowOffset=0;
  while(rowOffset<lines.length){
   if(y+10>bottom){doc.addPage();y=21;itemHeader(true);}
   const count=Math.min(lines.length-rowOffset,Math.floor((bottom-y-6)/4));
   const rowHeight=6+count*4;
   doc.setDrawColor(220,227,233);
   doc.rect(margin,y,width,rowHeight);
   lines.slice(rowOffset,rowOffset+count).forEach((line,index)=>doc.text(line,margin+4,y+6+index*4));
   if(rowOffset===0)doc.text(item.quantidade.toLocaleString('pt-BR'),margin+width-4,y+6,{align:'right'});
   rowOffset+=count;
   y+=rowHeight;
  }
 }
}
