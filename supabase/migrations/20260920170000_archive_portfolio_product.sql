alter table public.farm_portfolio_products
  add column if not exists excluido_em timestamp with time zone,
  add column if not exists excluido_por uuid;

create or replace function public.farm_archive_portfolio_product(p_product_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.farm_portfolio_products%rowtype;
  v_active_orders integer;
  v_active_production integer;
  v_active_kits integer;
begin
  if not exists(
    select 1 from public.farm_profiles
    where id=auth.uid() and active=true and role='administrador'
  ) then
    raise exception 'Apenas administradores podem excluir produtos';
  end if;

  select * into v_product
  from public.farm_portfolio_products
  where airtable_record_id=p_product_id
  for update;

  if not found then raise exception 'Produto não encontrado'; end if;
  if not v_product.ativo then raise exception 'Este produto já foi excluído'; end if;

  select count(*)::integer into v_active_orders
  from public.farm_order_items oi
  join public.farm_orders o on o.id=oi.pedido_id
  where oi.produto_id=p_product_id
    and o.status not in ('entregue','cancelado','reprovado');

  if v_active_orders>0 then
    raise exception 'O produto está vinculado a um pedido ativo. Conclua ou cancele o pedido antes de excluir';
  end if;

  select count(*)::integer into v_active_production
  from public.farm_production_orders po
  where po.produto_id=p_product_id
    and po.status not in ('pronto','cancelado');

  if v_active_production>0 then
    raise exception 'O produto possui uma produção em andamento e não pode ser excluído';
  end if;

  select count(*)::integer into v_active_kits
  from public.farm_product_kit_items ki
  join public.farm_product_kits k on k.id=ki.kit_id
  where ki.produto_id=p_product_id and k.ativo=true;

  if v_active_kits>0 then
    raise exception 'O produto faz parte de um kit ativo. Altere ou desative o kit antes de excluir';
  end if;

  update public.farm_portfolio_products
  set ativo=false,
      exibir_portfolio=false,
      excluido_em=now(),
      excluido_por=auth.uid(),
      atualizado_em=now()
  where airtable_record_id=p_product_id;

  return jsonb_build_object(
    'product_id',p_product_id,
    'nome',v_product.nome,
    'status','excluido'
  );
end;
$$;

revoke all on function public.farm_archive_portfolio_product(text) from public, anon;
grant execute on function public.farm_archive_portfolio_product(text) to authenticated;
