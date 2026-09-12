'use client';
import {useEffect,useMemo,useState} from 'react';
import {Image as ImageIcon,Search} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import './portfolio.css';

type PortfolioProduct={airtable_record_id:string;nome:string;categoria:string|null;preco_venda:number|null;tempo_producao_h:number|null;estoque:number|null;foto_urls:string[]};
const reais=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});

export default function Portfolio(){
 const [products,setProducts]=useState<PortfolioProduct[]>([]),[query,setQuery]=useState(''),[category,setCategory]=useState('Todos'),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let live=true;async function load(){setLoading(true);setError('');const {data,error}=await supabase.from('farm_portfolio_products').select('airtable_record_id,nome,categoria,preco_venda,tempo_producao_h,estoque,foto_urls').eq('ativo',true).order('nome');if(!live)return;if(error){setError('Não foi possível carregar o portfólio. Tente novamente.');setProducts([])}else setProducts((data||[]) as PortfolioProduct[]);setLoading(false)}void load();return()=>{live=false}},[]);
 const categories=useMemo(()=>['Todos',...Array.from(new Set(products.map(p=>p.categoria).filter(Boolean) as string[])).sort()],[products]);
 const visible=useMemo(()=>{const term=query.trim().toLocaleLowerCase('pt-BR');return products.filter(product=>{const matchesCategory=category==='Todos'||product.categoria===category;const searchable=`${product.nome} ${product.categoria||''}`.toLocaleLowerCase('pt-BR');return matchesCategory&&(!term||searchable.includes(term))})},[products,query,category]);
 if(loading)return <section className="panel portfolio-state" role="status">Carregando produtos do portfólio…</section>;
 if(error)return <section className="panel portfolio-state" role="alert">{error}</section>;
 return <section aria-label="Portfólio de produtos">
  <div className="portfolio-toolbar"><label className="portfolio-search"><Search size={18}/><span className="sr-only">Pesquisar produtos</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Pesquisar produto"/></label><div className="category-list" aria-label="Filtrar por categoria">{categories.map(item=><button key={item} className={category===item?'category active':'category'} onClick={()=>setCategory(item)}>{item}</button>)}</div></div>
  <p className="portfolio-count">{visible.length} {visible.length===1?'produto':'produtos'} encontrado{visible.length===1?'':'s'}</p>
  {visible.length===0?<div className="panel portfolio-state"><Search size={28}/><h2>Nenhum produto encontrado</h2><p>Altere a pesquisa ou escolha outra categoria.</p></div>:<div className="portfolio-grid">{visible.map(product=><article className="portfolio-card" key={product.airtable_record_id}>
   <div className="portfolio-image">{product.foto_urls?.[0]?<img src={product.foto_urls[0]} alt={`Foto de ${product.nome}`} loading="lazy"/>:<div className="portfolio-placeholder"><ImageIcon size={34}/><span>Foto ainda não cadastrada</span></div>}</div>
   <div className="portfolio-card-body"><div className="portfolio-card-top"><span className="badge">{product.categoria||'Sem categoria'}</span>{product.estoque!==null&&<small>{product.estoque} em estoque</small>}</div><h2>{product.nome}</h2><div className="portfolio-meta">{product.preco_venda!==null&&<strong>{reais.format(product.preco_venda)}</strong>}{product.tempo_producao_h!==null&&<span>{product.tempo_producao_h.toLocaleString('pt-BR')} h de produção</span>}</div></div>
  </article>)}</div>}
 </section>
}
