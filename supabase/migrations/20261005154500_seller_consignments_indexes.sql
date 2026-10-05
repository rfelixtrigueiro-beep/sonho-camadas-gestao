drop policy if exists farm_seller_closings_admin_all on public.farm_seller_closings;
create policy farm_seller_closings_admin_insert on public.farm_seller_closings for insert to authenticated with check (farm_private.is_admin());
create policy farm_seller_closings_admin_update on public.farm_seller_closings for update to authenticated using (farm_private.is_admin()) with check (farm_private.is_admin());
create policy farm_seller_closings_admin_delete on public.farm_seller_closings for delete to authenticated using (farm_private.is_admin());

create index if not exists farm_consignment_items_product_idx on public.farm_consignment_items(produto_id);
create index if not exists farm_consignment_sales_item_idx on public.farm_consignment_sales(remessa_item_id);
create index if not exists farm_consignment_sales_closing_idx on public.farm_consignment_sales(fechamento_id);
create index if not exists farm_consignment_sales_created_by_idx on public.farm_consignment_sales(criado_por);
create index if not exists farm_consignment_occurrences_item_idx on public.farm_consignment_occurrences(remessa_item_id);
create index if not exists farm_consignment_occurrences_closing_idx on public.farm_consignment_occurrences(fechamento_id);
create index if not exists farm_consignment_occurrences_created_by_idx on public.farm_consignment_occurrences(criado_por);
create index if not exists farm_consignments_created_by_idx on public.farm_consignments(criado_por);
create index if not exists farm_consignments_confirmed_by_idx on public.farm_consignments(confirmado_recebimento_por);
create index if not exists farm_seller_closings_seller_idx on public.farm_seller_closings(vendedor_id);
create index if not exists farm_seller_closings_approved_by_idx on public.farm_seller_closings(aprovado_por);
