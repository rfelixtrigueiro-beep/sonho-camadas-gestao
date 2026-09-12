create table if not exists public.farm_product_categories (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 1 and 100),
  ativa boolean not null default true,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create unique index if not exists farm_product_categories_nome_unique
  on public.farm_product_categories (lower(btrim(nome)));

alter table public.farm_product_categories enable row level security;
revoke all on public.farm_product_categories from anon, authenticated;
grant select, insert, update, delete on public.farm_product_categories to authenticated;

create policy product_categories_select_active_users
  on public.farm_product_categories for select to authenticated
  using (exists (
    select 1 from public.farm_profiles profile
    where profile.id = (select auth.uid()) and profile.active = true
  ));

create policy product_categories_admin_insert
  on public.farm_product_categories for insert to authenticated
  with check ((select farm_private.is_admin()));

create policy product_categories_admin_update
  on public.farm_product_categories for update to authenticated
  using ((select farm_private.is_admin()))
  with check ((select farm_private.is_admin()));

create policy product_categories_admin_delete
  on public.farm_product_categories for delete to authenticated
  using ((select farm_private.is_admin()));

insert into public.farm_product_categories (nome)
select distinct initcap(lower(btrim(categoria)))
from public.farm_portfolio_products
where categoria is not null and btrim(categoria) <> ''
on conflict do nothing;

alter table public.farm_portfolio_products
  add column if not exists categoria_id uuid references public.farm_product_categories(id);

update public.farm_portfolio_products product
set categoria_id = category.id,
    categoria = category.nome,
    atualizado_em = now()
from public.farm_product_categories category
where lower(btrim(product.categoria)) = lower(btrim(category.nome))
  and (product.categoria_id is distinct from category.id or product.categoria is distinct from category.nome);

create index if not exists farm_portfolio_products_categoria_id_idx
  on public.farm_portfolio_products (categoria_id);
