alter table public.farm_portfolio_products
add column if not exists exibir_portfolio boolean not null default false;

update public.farm_portfolio_products
set exibir_portfolio = true
where ativo = true;

drop policy if exists "portfolio_images_admin_select" on storage.objects;
create policy "portfolio_images_admin_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'portfolio'
  and exists (
    select 1 from public.farm_profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
      and profile.role = 'administrador'
  )
);

drop policy if exists "portfolio_images_admin_insert" on storage.objects;
create policy "portfolio_images_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'portfolio'
  and exists (
    select 1 from public.farm_profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
      and profile.role = 'administrador'
  )
);

drop policy if exists "portfolio_images_admin_update" on storage.objects;
create policy "portfolio_images_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'portfolio'
  and exists (
    select 1 from public.farm_profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
      and profile.role = 'administrador'
  )
)
with check (
  bucket_id = 'portfolio'
  and exists (
    select 1 from public.farm_profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
      and profile.role = 'administrador'
  )
);

drop policy if exists "portfolio_images_admin_delete" on storage.objects;
create policy "portfolio_images_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'portfolio'
  and exists (
    select 1 from public.farm_profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
      and profile.role = 'administrador'
  )
);
