create or replace function public.farm_cancel_consignment_sale(p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sale public.farm_consignment_sales%rowtype; v_seller public.farm_sellers%rowtype;
begin
  select * into v_sale from public.farm_consignment_sales where id=p_sale_id for update;
  if not found or v_sale.ambiente<>'desenvolvimento' then raise exception 'Venda não encontrada'; end if;
  select * into v_seller from public.farm_sellers where id=v_sale.vendedor_id;
  if not farm_private.is_admin() and (v_seller.usuario_id is distinct from auth.uid() or not v_seller.ativo) then raise exception 'Você não pode cancelar esta venda'; end if;
  if v_sale.status<>'informada' then raise exception 'Somente vendas pendentes do fechamento podem ser canceladas'; end if;
  update public.farm_consignment_sales set status='cancelada',atualizado_em=now() where id=p_sale_id;
  return jsonb_build_object('status','cancelada','quantidade_liberada',v_sale.quantidade);
end $$;
revoke all on function public.farm_cancel_consignment_sale(uuid) from public,anon;
grant execute on function public.farm_cancel_consignment_sale(uuid) to authenticated;
