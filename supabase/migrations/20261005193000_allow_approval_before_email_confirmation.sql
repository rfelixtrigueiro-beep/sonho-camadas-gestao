create or replace function farm_private.manage_user(target uuid,new_role text,enabled boolean)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not farm_private.is_admin() then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  if new_role not in ('administrador','vendedor') or new_role is null or enabled is null then
    raise exception 'Perfil inválido';
  end if;
  perform 1 from public.farm_profiles where id=target for update;
  if not found then raise exception 'Conta não encontrada'; end if;
  if exists(select 1 from public.farm_profiles where id=target and role='administrador') then
    raise exception 'Administradores não podem ser alterados nesta tela';
  end if;

  -- A aprovação administrativa e a confirmação do e-mail são etapas independentes.
  -- O Supabase continua impedindo o login enquanto o e-mail não for confirmado.
  update public.farm_profiles set role=new_role,active=enabled where id=target;
end;
$$;

revoke all on function farm_private.manage_user(uuid,text,boolean) from public,anon;
grant execute on function farm_private.manage_user(uuid,text,boolean) to authenticated;
