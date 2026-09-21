drop policy if exists farm_production_admin_delete_manual on public.farm_production_orders;

create policy farm_production_admin_delete_manual
on public.farm_production_orders
for delete
to authenticated
using (
  (select farm_private.is_admin())
  and pedido_id is null
);
