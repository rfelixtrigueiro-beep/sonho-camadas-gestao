create table if not exists public.farm_printers (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(trim(nome)) between 1 and 120),
  potencia_watts numeric not null check (potencia_watts >= 0),
  tarifa_energia_kwh numeric not null check (tarifa_energia_kwh >= 0),
  custo_maquina_hora numeric not null check (custo_maquina_hora >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists farm_printers_active_name_unique
  on public.farm_printers (lower(trim(nome))) where ativo;

alter table public.farm_printers enable row level security;
grant select, insert, update, delete on public.farm_printers to authenticated;

create policy printers_select_active_users on public.farm_printers
  for select to authenticated
  using (exists (select 1 from public.farm_profiles where id = (select auth.uid()) and ativo = true));

create policy printers_admin_insert on public.farm_printers
  for insert to authenticated with check (farm_private.is_admin());

create policy printers_admin_update on public.farm_printers
  for update to authenticated using (farm_private.is_admin()) with check (farm_private.is_admin());

create policy printers_admin_delete on public.farm_printers
  for delete to authenticated using (farm_private.is_admin());
