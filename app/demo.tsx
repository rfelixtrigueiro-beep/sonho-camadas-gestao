'use client';
/* oxlint-disable next/no-img-element */
import {useEffect,useState} from 'react';
import ProductSheet from './product-sheet';
import Portfolio from './portfolio';
import Inventory from './inventory';
import Orders from './orders';
import Registries from './registries';
import Production from './production';
import {LayoutDashboard,Package,ReceiptText,Printer,Boxes,Wallet,Images,Settings2,ArrowRight,Info} from 'lucide-react';
import {SidebarProvider,Sidebar,SidebarContent,SidebarHeader,SidebarFooter,SidebarMenu,SidebarMenuItem,SidebarMenuButton,SidebarTrigger,useSidebar} from '@/components/ui/sidebar';

const nav=[['Visão geral',LayoutDashboard],['Produtos e custos',Package],['Pedidos',ReceiptText],['Produção',Printer],['Estoque',Boxes],['Recebimentos',Wallet],['Portfólio',Images],['Cadastros',Settings2]] as const;
const descriptions=['Acompanhe e organize as atividades da Farm.','Calcule custos e crie produtos.','Consulte e gerencie os pedidos.','Acompanhe os itens em produção.','Consulte o saldo dos produtos.','Acompanhe os valores recebidos.','Consulte e organize os produtos disponíveis.','Gerencie insumos, impressoras e vendedores em um só lugar.'];

function Menu({page,go,administrator}:{page:number;go:(v:number)=>void;administrator:boolean}){const {setOpenMobile}=useSidebar();return <Sidebar><SidebarHeader><div className="brand official-brand"><img src="brand/Logo_Otimizada_Preta.png" alt="Sonho em Camadas 3D — Ideias que ganham forma" width="180" height="178"/><small>GESTÃO DA FARM</small></div></SidebarHeader><SidebarContent><SidebarMenu>{nav.map(([label,Icon],i)=>!administrator&&[1,3,4,7].includes(i)?null:<SidebarMenuItem key={label}><SidebarMenuButton isActive={page===i} onClick={()=>{go(i);setOpenMobile(false)}}><Icon/><span>{label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter><div className="workspace"><span className="avatar">SC</span><div>Sonho em Camadas 3D<small>Sistema de gestão</small></div></div></SidebarFooter></Sidebar>}

function EmptyModule({icon:Icon,title,text}:{icon:typeof ReceiptText;title:string;text:string}){return <section className="panel"><div className="empty"><Icon size={34}/><h2>{title}</h2><p>{text}</p></div></section>}

export default function Demo({administrator,userId}:{administrator:boolean;userId:string}){
 const sectionKey=`farm.activeSection.${userId}`;
 const [page,go]=useState(0);
 const [catalogVersion,setCatalogVersion]=useState(0);
 const [sectionRestored,setSectionRestored]=useState(false);
 useEffect(()=>{const timer=window.setTimeout(()=>{const saved=Number(window.sessionStorage.getItem(sectionKey));const allowed=Number.isInteger(saved)&&saved>=0&&saved<nav.length&&(administrator||![1,3,4,7].includes(saved));if(allowed)go(saved);setSectionRestored(true)},0);return()=>window.clearTimeout(timer)},[administrator,sectionKey]);
 useEffect(()=>{if(sectionRestored)window.sessionStorage.setItem(sectionKey,String(page))},[page,sectionKey,sectionRestored]);
 const note=page===1?'A ficha fica salva na sua conta e pode ser acessada em outros aparelhos.':page===4?'Os produtos criados na calculadora entram automaticamente no estoque.':page===6?'Os produtos e as categorias desta área ficam salvos na conta da Farm.':'';
 return <SidebarProvider><Menu page={page} go={go} administrator={administrator}/><main><header className="app-header"><div className="crumb"><SidebarTrigger aria-label="Abrir menu"/>Farm <span>/</span> <strong>{nav[page][0]}</strong></div><span className="demo-pill">● Online</span></header><nav className="mobile-nav" aria-label="Navegação principal">{nav.map(([label,Icon],i)=>!administrator&&[1,3,4,7].includes(i)?null:<button key={label} className={page===i?'active':''} aria-current={page===i?'page':undefined} onClick={()=>go(i)}><Icon/><span>{label}</span></button>)}</nav><div className="canvas"><div className="heading"><div><p className="eyebrow">SUA FARM, EM CADA ETAPA</p><h1>{nav[page][0]}</h1><p>{descriptions[page]}</p></div></div>{note&&<div className="demo-note"><Info size={19}/><span>{note}</span></div>}
 {page===0&&<div className="split"><section className="panel accent-panel"><p className="eyebrow">PRODUTOS E CUSTOS</p><h2>Calcule o custo<br/>de cada peça</h2><p>Preencha a ficha do produto, confira o preço sugerido e salve no Portfólio e no Estoque.</p><button disabled={!administrator} onClick={()=>go(1)}>Abrir calculadora <ArrowRight size={17}/></button></section><section className="panel"><p className="eyebrow">CATÁLOGO</p><h2>Portfólio e estoque</h2><p className="muted">Consulte os produtos cadastrados, fotos, preços, categorias e saldos disponíveis.</p><div className="actions"><button onClick={()=>go(6)}>Abrir Portfólio <ArrowRight size={17}/></button>{administrator&&<button className="secondary" onClick={()=>go(4)}>Ver Estoque</button>}</div></section><section className="panel"><p className="eyebrow">VENDAS</p><h2>Pedidos</h2><p className="muted">Crie novos pedidos e acompanhe precificação, aprovação e andamento da produção.</p><div className="actions"><button onClick={()=>go(2)}>Abrir Pedidos <ArrowRight size={17}/></button></div></section></div>}
 {administrator&&<div hidden={page!==1}><ProductSheet userId={userId} catalogVersion={catalogVersion}/></div>}
 <div hidden={page!==2}><Orders administrator={administrator} userId={userId}/></div>
 {administrator&&<div hidden={page!==3}><Production administrator={administrator} userId={userId}/></div>}
 {administrator&&page===4&&<Inventory/>}
 {page===5&&<EmptyModule icon={Wallet} title="Nenhum recebimento cadastrado" text="Os recebimentos dos pedidos aparecerão aqui."/>}
 <div hidden={page!==6}><Portfolio administrator={administrator} userId={userId}/></div>
 {administrator&&<div hidden={page!==7}><Registries onCatalogChanged={()=>setCatalogVersion(version=>version+1)}/></div>}
 <footer>SONHO EM CAMADAS 3D <span>Sistema de gestão</span></footer></div></main></SidebarProvider>;
}
