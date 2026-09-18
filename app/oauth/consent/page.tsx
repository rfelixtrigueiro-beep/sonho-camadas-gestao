'use client';

import {useEffect,useState} from 'react';
import type {OAuthAuthorizationDetails} from '@supabase/supabase-js';
import {supabase} from '@/lib/supabase';

export default function OAuthConsentPage(){
 const [details,setDetails]=useState<OAuthAuthorizationDetails|null>(null);
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [message,setMessage]=useState('Carregando solicitação…'),[busy,setBusy]=useState(false);

 async function load(){
  const authorizationId=new URLSearchParams(window.location.search).get('authorization_id');
  if(!authorizationId){setMessage('Solicitação de acesso inválida. Volte à plataforma de IA e tente conectar novamente.');return}
  const {data,error}=await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if(error||!data){setMessage('Não foi possível carregar a solicitação. Ela pode ter expirado.');return}
  if('redirect_url' in data){window.location.assign(data.redirect_url);return}
  setDetails(data);setMessage('');
 }

 useEffect(()=>{queueMicrotask(()=>void load())},[]);

 async function signIn(event:React.SyntheticEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setMessage('');
  const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
  setBusy(false);
  if(error)setMessage('Não foi possível entrar. Confira e-mail, senha e aprovação da conta.');
  else{setPassword('');await load()}
 }

 async function decide(approved:boolean){
  if(!details)return;setBusy(true);setMessage('');
  const response=approved
   ?await supabase.auth.oauth.approveAuthorization(details.authorization_id,{skipBrowserRedirect:true})
   :await supabase.auth.oauth.denyAuthorization(details.authorization_id,{skipBrowserRedirect:true});
  setBusy(false);
  if(response.error||!response.data)setMessage('Não foi possível concluir a autorização. Tente conectar novamente.');
  else window.location.assign(response.data.redirect_url);
 }

 return <main className="oauth-page"><section className="panel oauth-card">
  {/* oxlint-disable-next-line next/no-img-element -- static export uses the same local brand asset as the login page */}
  <img src="../../brand/Logo_Otimizada_Preta.png" width="104" height="103" alt="Sonho em Camadas 3D"/>
  <p className="eyebrow">SOFIA · ACESSO SEGURO</p>
  {details?<><h1>Autorizar a Sofia</h1><p><strong>{details.client.name}</strong> solicita acesso à sua conta da Gestão Sonho em Camadas 3D.</p><div className="oauth-permissions"><strong>Com este acesso, a IA poderá:</strong><ul><li>consultar portfólio, estoque, pedidos, produção e cadastros;</li><li>consultar e salvar simulações da calculadora;</li><li>executar ações apenas dentro das permissões do seu perfil.</li></ul></div><p className="oauth-identity">Conta conectada: <strong>{details.user.email}</strong></p><div className="oauth-actions"><button disabled={busy} onClick={()=>void decide(true)}>{busy?'Aguarde…':'Autorizar acesso'}</button><button className="secondary" disabled={busy} onClick={()=>void decide(false)}>Negar</button></div></>:<><h1>Entrar para autorizar</h1><p>Use a mesma conta do sistema de gestão.</p><form onSubmit={signIn}><label>E-mail<input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" required/></label><label>Senha<input type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" required/></label><button disabled={busy}>{busy?'Entrando…':'Entrar'}</button></form></>}
  {message&&<output className="oauth-message">{message}</output>}
  <small>Você poderá revogar este acesso depois. Sua senha nunca é compartilhada com a plataforma de IA.</small>
 </section></main>;
}
