'use client';
import {useState} from 'react';
import {Pencil,Power,X} from 'lucide-react';
import {supabase} from '@/lib/supabase';

export type Seller={id:string;nome:string;telefone:string|null;email:string|null;usuario_id:string|null;ativo:boolean};
export type SellerUser={id:string;name:string;email:string};

const sellerEnvironment=import.meta.env.BASE_URL.includes('/desenvolvimento/')?'desenvolvimento':'producao';

export default function SellerRegistry({sellers,users,onChanged,onClose}:{sellers:Seller[];users:SellerUser[];onChanged:()=>Promise<void>;onClose?:()=>void}){
 const [editing,setEditing]=useState<Seller|null>(null),[name,setName]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[linkUser,setLinkUser]=useState(false),[userId,setUserId]=useState(''),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const usedUsers=new Set(sellers.filter(seller=>seller.usuario_id&&seller.id!==editing?.id).map(seller=>seller.usuario_id));

 function reset(){setEditing(null);setName('');setPhone('');setEmail('');setLinkUser(false);setUserId('');setMessage('')}
 function startEdit(seller:Seller){setEditing(seller);setName(seller.nome);setPhone(seller.telefone||'');setEmail(seller.email||'');setLinkUser(Boolean(seller.usuario_id));setUserId(seller.usuario_id||'');setMessage('')}
 async function save(event:{preventDefault():void}){
  event.preventDefault();setMessage('');
  if(linkUser&&!userId){setMessage('Selecione o usuário que será vinculado ao vendedor.');return}
  setSaving(true);
  const values={nome:name.trim(),telefone:phone.trim()||null,email:email.trim()||null,usuario_id:linkUser?userId:null,atualizado_em:new Date().toISOString()};
  const result=editing?await supabase.from('farm_sellers').update(values).eq('id',editing.id):await supabase.from('farm_sellers').insert({...values,ativo:true,ambiente:sellerEnvironment});
  if(result.error)setMessage(result.error.code==='23505'?'Este usuário já está vinculado a outro vendedor.':'Não foi possível salvar o vendedor. Confira os dados.');else{reset();setMessage(editing?'Vendedor atualizado.':'Vendedor cadastrado.');await onChanged()}
  setSaving(false);
 }

 async function toggle(seller:Seller){
  const {error}=await supabase.from('farm_sellers').update({ativo:!seller.ativo,atualizado_em:new Date().toISOString()}).eq('id',seller.id);
  if(error)setMessage('Não foi possível alterar o vendedor.');else{setMessage(seller.ativo?'Vendedor desativado.':'Vendedor reativado.');await onChanged()}
 }

 return <section className={onClose?'panel seller-registry':'seller-registry'}>
  <div className="orders-title"><div><h3>Vendedores</h3><p className="muted">O vínculo com um usuário é opcional. Quando vinculado, o vendedor acessa os próprios pedidos.</p></div>{onClose&&<button className="secondary" onClick={onClose}><X size={16}/> Fechar</button>}</div>
  <form className="seller-form" onSubmit={save}>
   <label>Nome do vendedor<input value={name} onChange={event=>setName(event.target.value)} required maxLength={120}/></label>
   <label>Telefone ou WhatsApp<input value={phone} onChange={event=>setPhone(event.target.value)} inputMode="tel" maxLength={30}/></label>
   <label>E-mail<input value={email} onChange={event=>setEmail(event.target.value)} type="email" maxLength={180}/></label>
   <fieldset className="seller-link-choice"><legend>Vincular a um usuário?</legend><label><input type="radio" name="link-user" checked={linkUser} onChange={()=>setLinkUser(true)}/> Sim</label><label><input type="radio" name="link-user" checked={!linkUser} onChange={()=>{setLinkUser(false);setUserId('')}}/> Não</label></fieldset>
   {linkUser&&<label className="seller-user-field">Usuário<select value={userId} onChange={event=>setUserId(event.target.value)} required><option value="">Selecione um usuário vendedor</option>{users.map(user=><option key={user.id} value={user.id} disabled={usedUsers.has(user.id)}>{user.name||user.email}{usedUsers.has(user.id)?' — já vinculado':''}</option>)}</select></label>}
   <div className="seller-form-actions"><button disabled={saving}>{saving?'Salvando…':editing?'Salvar alterações':'Cadastrar vendedor'}</button>{editing&&<button type="button" className="secondary" onClick={reset}>Cancelar edição</button>}</div>
  </form>
  {message&&<output className="notice">{message}</output>}
  <div className="seller-list">{sellers.length===0?<p className="muted">Nenhum vendedor cadastrado neste ambiente.</p>:sellers.map(seller=><article className={seller.ativo?'seller-card':'seller-card seller-disabled'} key={seller.id}><div><strong>{seller.nome}</strong><span>{seller.telefone||seller.email||'Sem contato informado'}</span><small>{seller.usuario_id?'Vinculado a um usuário':'Sem usuário vinculado'}</small></div><span className={seller.ativo?'status-chip-active':'status-chip-disabled'}>{seller.ativo?'Ativo':'Desativado'}</span><div className="seller-card-actions"><button className="secondary" onClick={()=>startEdit(seller)}><Pencil size={15}/> Editar</button><button className="secondary" onClick={()=>void toggle(seller)}><Power size={15}/> {seller.ativo?'Desativar':'Reativar'}</button></div></article>)}</div>
 </section>
}
