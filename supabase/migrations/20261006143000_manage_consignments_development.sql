create or replace function public.farm_update_consignment(
  p_remessa_id uuid,
  p_seller_id uuid,
  p_shipping_date date,
  p_return_date date,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_remittance public.farm_consignments%rowtype;
  v_seller public.farm_sellers%rowtype;
  v_product public.farm_portfolio_products%rowtype;
  v_entry jsonb;
  v_product_id text;
  v_quantity integer;
  v_stock integer;
  v_manual integer;
  v_order_reserved integer;
  v_other_consigned integer;
  v_item_count integer;
begin
  if not farm_private.is_admin() then
    raise exception 'Apenas administradores podem alterar remessas';
  end if;

  select * into v_remittance
  from public.farm_consignments
  where id=p_remessa_id
  for update;

  if not found or v_remittance.ambiente<>'desenvolvimento' then
    raise exception 'Remessa de desenvolvimento não encontrada';
  end if;
  if v_remittance.status in ('encerrada','cancelada') then
    raise exception 'Remessas encerradas ou canceladas não podem ser alteradas';
  end if;
  if exists(
    select 1
    from public.farm_consignment_items i
    where i.remessa_id=p_remessa_id
      and (
        exists(select 1 from public.farm_consignment_sales s where s.remessa_item_id=i.id)
        or exists(select 1 from public.farm_consignment_occurrences o where o.remessa_item_id=i.id)
      )
  ) then
    raise exception 'Esta remessa já possui movimentações e não pode ser alterada';
  end if;

  select * into v_seller
  from public.farm_sellers
  where id=p_seller_id and ambiente='desenvolvimento' and ativo=true
  for update;
  if not found then
    raise exception 'Vendedor não encontrado ou inativo';
  end if;

  if p_shipping_date is null then
    raise exception 'Informe a data de envio';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Adicione ao menos um produto à remessa';
  end if;
  if (
    select count(*)<>count(distinct value->>'produto_id')
    from jsonb_array_elements(p_items)
  ) then
    raise exception 'Um produto não pode ser repetido na remessa';
  end if;

  for v_entry in select value from jsonb_array_elements(p_items) order by value->>'produto_id' loop
    v_product_id:=nullif(trim(v_entry->>'produto_id'),'');
    begin
      v_quantity:=(v_entry->>'quantidade')::integer;
    exception when others then
      raise exception 'Quantidade inválida na remessa';
    end;
    if v_product_id is null or v_quantity is null or v_quantity<=0 then
      raise exception 'Produto e quantidade são obrigatórios';
    end if;

    select * into v_product
    from public.farm_portfolio_products
    where airtable_record_id=v_product_id and ativo=true
    for update;
    if not found then
      raise exception 'Produto não encontrado ou inativo';
    end if;

    v_stock:=greatest(coalesce(v_product.estoque,0),0);
    v_manual:=coalesce(v_product.estoque_reservado_manual,0);
    select coalesce(sum(oi.estoque_baixado),0)::integer into v_order_reserved
    from public.farm_order_items oi
    join public.farm_orders o on o.id=oi.pedido_id
    where oi.produto_id=v_product_id
      and o.ambiente='desenvolvimento'
      and o.status in ('aprovado','em_producao','pronto');

    select coalesce(sum(greatest(i.quantidade_enviada
      - coalesce((select sum(s.quantidade) from public.farm_consignment_sales s where s.remessa_item_id=i.id and s.status<>'cancelada'),0)
      - coalesce((select sum(o.quantidade) from public.farm_consignment_occurrences o where o.remessa_item_id=i.id and o.status<>'cancelada'),0),0)),0)::integer
    into v_other_consigned
    from public.farm_consignment_items i
    join public.farm_consignments r on r.id=i.remessa_id
    where i.produto_id=v_product_id
      and r.ambiente='desenvolvimento'
      and r.id<>p_remessa_id
      and r.status in ('enviada','recebida','parcialmente_devolvida');

    if v_stock-v_manual-v_order_reserved-v_other_consigned<v_quantity then
      raise exception 'Estoque disponível insuficiente para %',v_product.nome;
    end if;
  end loop;

  update public.farm_consignments
  set vendedor_id=p_seller_id,
      data_envio=p_shipping_date,
      data_prevista_retorno=p_return_date,
      observacoes=nullif(trim(coalesce(p_notes,'')),''),
      atualizado_em=now()
  where id=p_remessa_id;

  delete from public.farm_consignment_items where remessa_id=p_remessa_id;

  insert into public.farm_consignment_items(
    remessa_id,produto_id,produto_nome,categoria,foto_url,quantidade_enviada,
    preco_unitario,desconto_maximo_percentual,percentual_comissao
  )
  select p_remessa_id,
         p.airtable_record_id,
         p.nome,
         p.categoria,
         p.foto_urls[1],
         (entry.value->>'quantidade')::integer,
         coalesce(p.preco_venda,0),
         coalesce(p.desconto_maximo_percentual,0),
         coalesce(v_seller.percentual_comissao,0)
  from jsonb_array_elements(p_items) entry
  join public.farm_portfolio_products p on p.airtable_record_id=entry.value->>'produto_id';

  get diagnostics v_item_count=row_count;
  return jsonb_build_object(
    'status',v_remittance.status,
    'itens',v_item_count,
    'estoque_recalculado',true
  );
end
$$;

create or replace function public.farm_delete_consignment(p_remessa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_remittance public.farm_consignments%rowtype;
  v_reserved integer:=0;
begin
  if not farm_private.is_admin() then
    raise exception 'Apenas administradores podem excluir remessas';
  end if;

  select * into v_remittance
  from public.farm_consignments
  where id=p_remessa_id
  for update;

  if not found or v_remittance.ambiente<>'desenvolvimento' then
    raise exception 'Remessa de desenvolvimento não encontrada';
  end if;
  if exists(
    select 1
    from public.farm_consignment_items i
    where i.remessa_id=p_remessa_id
      and (
        exists(select 1 from public.farm_consignment_sales s where s.remessa_item_id=i.id)
        or exists(select 1 from public.farm_consignment_occurrences o where o.remessa_item_id=i.id)
      )
  ) then
    raise exception 'Esta remessa possui movimentações e deve ser preservada no histórico';
  end if;

  if v_remittance.status in ('enviada','recebida','parcialmente_devolvida') then
    select coalesce(sum(quantidade_enviada),0)::integer into v_reserved
    from public.farm_consignment_items
    where remessa_id=p_remessa_id;
  end if;

  delete from public.farm_consignments where id=p_remessa_id;
  return jsonb_build_object('excluida',true,'quantidade_liberada',v_reserved);
end
$$;

revoke all on function public.farm_update_consignment(uuid,uuid,date,date,text,jsonb) from public,anon;
revoke all on function public.farm_delete_consignment(uuid) from public,anon;
grant execute on function public.farm_update_consignment(uuid,uuid,date,date,text,jsonb) to authenticated;
grant execute on function public.farm_delete_consignment(uuid) to authenticated;
