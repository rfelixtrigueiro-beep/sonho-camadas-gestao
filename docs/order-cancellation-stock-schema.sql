create or replace function public.farm_cancel_order(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_order public.farm_orders%rowtype;
  v_item public.farm_order_items%rowtype;
  v_is_admin boolean;
  v_restored integer := 0;
begin
  if nullif(trim(p_reason),'') is null then
    raise exception 'Informe o motivo do cancelamento';
  end if;

  select exists(
    select 1 from public.farm_profiles
    where id=auth.uid() and active=true and role='administrador'
  ) into v_is_admin;

  select * into v_order
  from public.farm_orders
  where id=p_order_id
  for update;

  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.status in ('cancelado','reprovado','entregue') then
    raise exception 'Este pedido não pode ser cancelado';
  end if;
  if not v_is_admin and (
    v_order.vendedor_id is distinct from auth.uid()
    or v_order.status not in ('rascunho','aguardando_precificacao','em_precificacao','precificado','aguardando_confirmacao_vendedor','aguardando_aprovacao','devolvido_ajuste')
  ) then
    raise exception 'Você não tem permissão para cancelar este pedido';
  end if;

  for v_item in
    select * from public.farm_order_items
    where pedido_id=p_order_id
    order by criado_em
    for update
  loop
    if v_item.produto_id is not null and v_item.estoque_baixado>0 then
      update public.farm_portfolio_products
      set estoque=coalesce(estoque,0)+v_item.estoque_baixado,
          atualizado_em=now()
      where airtable_record_id=v_item.produto_id;
      v_restored:=v_restored+v_item.estoque_baixado;
    end if;
    update public.farm_order_items
    set estoque_baixado=0,producao_necessaria=0
    where id=v_item.id;
  end loop;

  update public.farm_production_orders
  set status='cancelado',atualizado_em=now()
  where pedido_id=p_order_id and status<>'cancelado';

  update public.farm_orders
  set status='cancelado',motivo_cancelamento=trim(p_reason),cancelado_em=now(),
      cancelado_por=auth.uid(),atualizado_em=now()
  where id=p_order_id;

  return jsonb_build_object('estoque_devolvido',v_restored,'status','cancelado');
end;
$$;

revoke all on function public.farm_cancel_order(uuid,text) from public;
revoke all on function public.farm_cancel_order(uuid,text) from anon;
grant execute on function public.farm_cancel_order(uuid,text) to authenticated;
