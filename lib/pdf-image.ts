export type PdfImage={data:string;width:number;height:number};

export async function loadPdfImage(url:string):Promise<PdfImage|null>{
 try{
  const image=new Image();
  image.src=url;
  await image.decode();
  const scale=Math.min(1,900/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const context=canvas.getContext('2d');
  if(!context)return null;
  context.fillStyle='#ffffff';
  context.fillRect(0,0,canvas.width,canvas.height);
  context.drawImage(image,0,0,canvas.width,canvas.height);
  return {data:canvas.toDataURL('image/jpeg',.88),width:canvas.width,height:canvas.height};
 }catch{return null}
}

export function loadPdfBrandLogo(){
 const url=new URL(`${import.meta.env.BASE_URL}brand/Logo_Otimizada_Preta.png`,window.location.origin);
 return loadPdfImage(url.href);
}
