create table if not exists public.farm_supplies (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(trim(nome)) between 1 and 120),
  valor_compra numeric not null check (valor_compra >= 0),
  quantidade_compra numeric not null check (quantidade_compra > 0),
  unidade_medida text not null check (unidade_medida in ('un', 'g', 'kg', 'ml', 'l', 'cm', 'm')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists farm_supplies_active_name_unique
  on public.farm_supplies (lower(trim(nome)))
  where ativo;

alter table public.farm_supplies enable row level security;
grant select, insert, update, delete on public.farm_supplies to authenticated;

create policy "Active users can read supplies"
  on public.farm_supplies for select to authenticated
  using (exists (
    select 1 from public.farm_profiles
    where id = auth.uid() and ativo = true
  ));

create policy "Admins can create supplies"
  on public.farm_supplies for insert to authenticated
  with check (farm_private.is_admin());

create policy "Admins can update supplies"
  on public.farm_supplies for update to authenticated
  using (farm_private.is_admin())
  with check (farm_private.is_admin());

create policy "Admins can delete supplies"
  on public.farm_supplies for delete to authenticated
  using (farm_private.is_admin());
