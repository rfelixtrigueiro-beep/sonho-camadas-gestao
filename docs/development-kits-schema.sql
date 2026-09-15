create table if not exists public.farm_product_kits (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(trim(nome)) between 1 and 160),
  categoria_id uuid references public.farm_product_categories(id) on delete set null,
  categoria text,
  desconto_percentual numeric(5,2) not null default 0
    check (desconto_percentual between 0 and 100),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  preco_venda numeric(12,2) not null default 0 check (preco_venda >= 0),
  preco_manual boolean not null default false,
  foto_url text,
  exibir_portfolio boolean not null default false,
  ativo boolean not null default true,
  ambiente text not null default 'desenvolvimento'
    check (ambiente in ('desenvolvimento', 'producao')),
  criado_por uuid not null references public.farm_profiles(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.farm_product_kit_items (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.farm_product_kits(id) on delete cascade,
  produto_id text not null references public.farm_portfolio_products(airtable_record_id),
  produto_nome text not null,
  foto_url text,
  quantidade integer not null default 1 check (quantidade > 0),
  preco_unitario numeric(12,2) not null check (preco_unitario >= 0),
  unique (kit_id, produto_id)
);

create index if not exists farm_product_kits_ambiente_idx
  on public.farm_product_kits (ambiente, ativo, exibir_portfolio);

create index if not exists farm_product_kit_items_kit_idx
  on public.farm_product_kit_items (kit_id);

alter table public.farm_product_kits enable row level security;
alter table public.farm_product_kit_items enable row level security;

revoke all on public.farm_product_kits from anon, authenticated;
revoke all on public.farm_product_kit_items from anon, authenticated;
grant select, insert, update, delete on public.farm_product_kits to authenticated;
grant select, insert, update, delete on public.farm_product_kit_items to authenticated;

drop policy if exists farm_kits_select_active_users on public.farm_product_kits;
create policy farm_kits_select_active_users
on public.farm_product_kits for select to authenticated
using (
  exists (
    select 1 from public.farm_profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
  )
  and ((select farm_private.is_admin()) or (ativo = true and exibir_portfolio = true))
);

drop policy if exists farm_kits_admin_insert on public.farm_product_kits;
create policy farm_kits_admin_insert
on public.farm_product_kits for insert to authenticated
with check ((select farm_private.is_admin()) and criado_por = (select auth.uid()));

drop policy if exists farm_kits_admin_update on public.farm_product_kits;
create policy farm_kits_admin_update
on public.farm_product_kits for update to authenticated
using ((select farm_private.is_admin()))
with check ((select farm_private.is_admin()));

drop policy if exists farm_kits_admin_delete on public.farm_product_kits;
create policy farm_kits_admin_delete
on public.farm_product_kits for delete to authenticated
using ((select farm_private.is_admin()));

drop policy if exists farm_kit_items_select_active_users on public.farm_product_kit_items;
create policy farm_kit_items_select_active_users
on public.farm_product_kit_items for select to authenticated
using (
  exists (
    select 1 from public.farm_product_kits kit
    where kit.id = kit_id
  )
);

drop policy if exists farm_kit_items_admin_insert on public.farm_product_kit_items;
create policy farm_kit_items_admin_insert
on public.farm_product_kit_items for insert to authenticated
with check ((select farm_private.is_admin()));

drop policy if exists farm_kit_items_admin_update on public.farm_product_kit_items;
create policy farm_kit_items_admin_update
on public.farm_product_kit_items for update to authenticated
using ((select farm_private.is_admin()))
with check ((select farm_private.is_admin()));

drop policy if exists farm_kit_items_admin_delete on public.farm_product_kit_items;
create policy farm_kit_items_admin_delete
on public.farm_product_kit_items for delete to authenticated
using ((select farm_private.is_admin()));
