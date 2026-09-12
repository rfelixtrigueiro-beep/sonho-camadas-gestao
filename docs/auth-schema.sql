create schema if not exists farm_private;
revoke all on schema farm_private from public, anon, authenticated;
grant usage on schema farm_private to authenticated;
create table public.farm_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null default '', email text not null,
 role text not null default 'vendedor' check (role in ('administrador','vendedor')),
 active boolean not null default false, created_at timestamptz not null default now()
);
alter table public.farm_profiles enable row level security;
revoke all on public.farm_profiles from anon, authenticated;
grant select on public.farm_profiles to authenticated;
create table farm_private.bootstrap_admin(email text primary key);
alter table farm_private.bootstrap_admin enable row level security;
-- Configure the first administrator directly in the protected table.
-- Do not commit a real e-mail address to a public repository.
create function farm_private.sync_profile() returns trigger language plpgsql security definer set search_path='' as $$
declare bootstrap boolean := false;
begin
 if new.email_confirmed_at is not null then
   delete from farm_private.bootstrap_admin where email=lower(new.email) returning true into bootstrap;
 end if;
 insert into public.farm_profiles(id,name,email,role,active)
 values(new.id,left(coalesce(new.raw_user_meta_data->>'name',''),120),coalesce(new.email,''),case when bootstrap then 'administrador' else 'vendedor' end,coalesce(bootstrap,false))
 on conflict(id) do update set email=excluded.email,
 role=case when bootstrap then 'administrador' else farm_profiles.role end,
 active=case when bootstrap then true else farm_profiles.active end;
 return new;
end $$;
revoke all on function farm_private.sync_profile() from public,anon,authenticated;
create trigger farm_auth_profile after insert or update of email_confirmed_at,email on auth.users for each row execute function farm_private.sync_profile();
create function farm_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.farm_profiles where id=auth.uid() and role='administrador' and active)
$$;
revoke all on function farm_private.is_admin() from public,anon;
grant execute on function farm_private.is_admin() to authenticated;
create policy farm_profile_read on public.farm_profiles for select to authenticated using(id=(select auth.uid()) or (select farm_private.is_admin()));
create function farm_private.manage_user(target uuid,new_role text,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not farm_private.is_admin() then raise exception 'Acesso negado' using errcode='42501'; end if;
 if new_role not in ('administrador','vendedor') or new_role is null or enabled is null then raise exception 'Perfil inválido'; end if;
 perform 1 from public.farm_profiles where id=target for update;
 if not found then raise exception 'Conta não encontrada'; end if;
 if exists(select 1 from public.farm_profiles where id=target and role='administrador') then raise exception 'Administradores não podem ser alterados nesta tela'; end if;
 if enabled and not exists(select 1 from auth.users where id=target and email_confirmed_at is not null) then raise exception 'A conta precisa confirmar o e-mail'; end if;
 update public.farm_profiles set role=new_role,active=enabled where id=target;
end $$;
revoke all on function farm_private.manage_user(uuid,text,boolean) from public,anon;
grant execute on function farm_private.manage_user(uuid,text,boolean) to authenticated;
create function public.farm_manage_user(target uuid,new_role text,enabled boolean) returns void language sql security invoker set search_path='' as $$
 select farm_private.manage_user(target,new_role,enabled)
$$;
revoke all on function public.farm_manage_user(uuid,text,boolean) from public,anon;
grant execute on function public.farm_manage_user(uuid,text,boolean) to authenticated;
create table public.farm_product_sheets(
 id uuid primary key references auth.users(id) on delete cascade,
 sheet jsonb not null check(jsonb_typeof(sheet)='object'),
 updated_at timestamptz not null default now()
);
alter table public.farm_product_sheets enable row level security;
revoke all on public.farm_product_sheets from anon,authenticated;
grant select,insert,update on public.farm_product_sheets to authenticated;
create policy farm_sheet_read on public.farm_product_sheets for select to authenticated using(id=(select auth.uid()) and (select farm_private.is_admin()));
create policy farm_sheet_insert on public.farm_product_sheets for insert to authenticated with check(id=(select auth.uid()) and (select farm_private.is_admin()));
create policy farm_sheet_update on public.farm_product_sheets for update to authenticated using(id=(select auth.uid()) and (select farm_private.is_admin())) with check(id=(select auth.uid()) and (select farm_private.is_admin()));
