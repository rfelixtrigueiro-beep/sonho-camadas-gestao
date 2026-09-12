create table if not exists public.farm_portfolio_products (
  airtable_record_id text primary key,
  nome text not null,
  categoria text,
  preco_venda numeric(12, 2),
  tempo_producao_h numeric(10, 2),
  ativo boolean not null default false,
  observacoes text,
  estoque integer,
  link_produto text,
  foto_urls text[] not null default '{}',
  importado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.farm_portfolio_products enable row level security;

drop policy if exists "portfolio_select_active_users" on public.farm_portfolio_products;
create policy "portfolio_select_active_users"
on public.farm_portfolio_products
for select
to authenticated
using (
  exists (
    select 1
    from public.farm_profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
  )
);

drop policy if exists "portfolio_admin_insert" on public.farm_portfolio_products;
create policy "portfolio_admin_insert"
on public.farm_portfolio_products
for insert
to authenticated
with check (
  exists (
    select 1
    from public.farm_profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
      and profile.role = 'administrador'
  )
);

drop policy if exists "portfolio_admin_update" on public.farm_portfolio_products;
create policy "portfolio_admin_update"
on public.farm_portfolio_products
for update
to authenticated
using (
  exists (
    select 1
    from public.farm_profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
      and profile.role = 'administrador'
  )
)
with check (
  exists (
    select 1
    from public.farm_profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
      and profile.role = 'administrador'
  )
);

drop policy if exists "portfolio_admin_delete" on public.farm_portfolio_products;
create policy "portfolio_admin_delete"
on public.farm_portfolio_products
for delete
to authenticated
using (
  exists (
    select 1
    from public.farm_profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
      and profile.role = 'administrador'
  )
);

grant select, insert, update, delete on public.farm_portfolio_products to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio',
  'portfolio',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
