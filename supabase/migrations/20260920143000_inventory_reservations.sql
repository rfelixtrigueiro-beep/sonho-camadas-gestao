alter table public.farm_portfolio_products
  add column if not exists estoque_reservado_manual integer not null default 0;

alter table public.farm_portfolio_products
  drop constraint if exists farm_portfolio_products_estoque_reservado_manual_check;

alter table public.farm_portfolio_products
  add constraint farm_portfolio_products_estoque_reservado_manual_check
  check (estoque_reservado_manual >= 0);

create or replace function public.farm_inventory_snapshot(p_environment text)
returns table (
  product_id text,
  nome text,
  categoria text,
  exibir_portfolio boolean,
  estoque_fisico integer,
  estoque_reservado_manual integer,
  estoque_reservado_automatico integer,
  estoque_reservado integer,
  estoque_disponivel integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_environment not in ('desenvolvimento','producao') then
    raise exception 'Ambiente inválido';
  end if;
  if not exists(select 1 from public.farm_profiles where id=auth.uid() and active=true) then
    raise exception 'Usuário sem acesso ao estoque';
  end if;

  return query
  select p.airtable_record_id,
         p.nome,
         p.categoria,
         p.exibir_portfolio,
         greatest(coalesce(p.estoque,0),0)::integer,
         p.estoque_reservado_manual,
         case when p_environment='desenvolvimento' then coalesce(r.quantidade,0) else 0 end::integer,
         (p.estoque_reservado_manual + case when p_environment='desenvolvimento' then coalesce(r.quantidade,0) else 0 end)::integer,
         greatest(
           greatest(coalesce(p.estoque,0),0) - p.estoque_reservado_manual -
           case when p_environment='desenvolvimento' then coalesce(r.quantidade,0) else 0 end,
           0
         )::integer
  from public.farm_portfolio_products p
  left join lateral (
    select sum(oi.estoque_baixado)::integer as quantidade
    from public.farm_order_items oi
    join public.farm_orders o on o.id=oi.pedido_id
    where oi.produto_id=p.airtable_record_id
      and o.ambiente=p_environment
      and o.status in ('aprovado','em_producao','pronto')
  ) r on true
  where p.ativo=true
  order by p.nome;
end;
$$;

create or replace function public.farm_set_manual_reservation(
  p_product_id text,
  p_quantity integer,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stock integer;
  v_automatic integer := 0;
begin
  if not exists(select 1 from public.farm_profiles where id=auth.uid() and active=true and role='administrador') then
    raise exception 'Apenas administradores podem alterar a reserva manual';
  end if;
  if p_environment not in ('desenvolvimento','producao') then raise exception 'Ambiente inválido'; end if;
  if p_quantity is null or p_quantity < 0 then raise exception 'A reserva deve ser igual ou maior que zero'; end if;

  select greatest(coalesce(estoque,0),0) into v_stock
  from public.farm_portfolio_products
  where airtable_record_id=p_product_id and ativo=true
  for update;
  if not found then raise exception 'Produto não encontrado'; end if;

  if p_environment='desenvolvimento' then
    select coalesce(sum(oi.estoque_baixado),0)::integer into v_automatic
    from public.farm_order_items oi
    join public.farm_orders o on o.id=oi.pedido_id
    where oi.produto_id=p_product_id
      and o.ambiente=p_environment
      and o.status in ('aprovado','em_producao','pronto');
  end if;

  if p_quantity + v_automatic > v_stock then
    raise exception 'A reserva total não pode ser maior que o estoque físico';
  end if;

  update public.farm_portfolio_products
  set estoque_reservado_manual=p_quantity, atualizado_em=now()
  where airtable_record_id=p_product_id;

  return jsonb_build_object(
    'estoque_reservado_manual',p_quantity,
    'estoque_reservado_automatico',v_automatic,
    'estoque_reservado',p_quantity+v_automatic,
    'estoque_disponivel',v_stock-p_quantity-v_automatic
  );
end;
$$;

create or replace function public.farm_set_physical_stock(
  p_product_id text,
  p_quantity integer,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_manual integer;
  v_automatic integer := 0;
begin
  if not exists(select 1 from public.farm_profiles where id=auth.uid() and active=true and role='administrador') then
    raise exception 'Apenas administradores podem alterar o estoque físico';
  end if;
  if p_environment not in ('desenvolvimento','producao') then raise exception 'Ambiente inválido'; end if;
  if p_quantity is null or p_quantity < 0 then raise exception 'O estoque deve ser igual ou maior que zero'; end if;

  select estoque_reservado_manual into v_manual
  from public.farm_portfolio_products
  where airtable_record_id=p_product_id and ativo=true
  for update;
  if not found then raise exception 'Produto não encontrado'; end if;

  if p_environment='desenvolvimento' then
    select coalesce(sum(oi.estoque_baixado),0)::integer into v_automatic
    from public.farm_order_items oi
    join public.farm_orders o on o.id=oi.pedido_id
    where oi.produto_id=p_product_id
      and o.ambiente=p_environment
      and o.status in ('aprovado','em_producao','pronto');
  end if;

  if p_quantity < v_manual + v_automatic then
    raise exception 'O estoque físico não pode ser menor que a quantidade reservada';
  end if;

  update public.farm_portfolio_products
  set estoque=p_quantity, atualizado_em=now()
  where airtable_record_id=p_product_id;

  return jsonb_build_object(
    'estoque_fisico',p_quantity,
    'estoque_reservado',v_manual+v_automatic,
    'estoque_disponivel',p_quantity-v_manual-v_automatic
  );
end;
$$;

create or replace function public.farm_approve_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.farm_orders%rowtype;
  v_item public.farm_order_items%rowtype;
  v_stock integer;
  v_manual integer;
  v_automatic integer;
  v_available integer;
  v_reserved integer;
  v_shortage integer;
  v_total_reserved integer := 0;
  v_total_production integer := 0;
begin
  if not exists(select 1 from public.farm_profiles where id=auth.uid() and active=true and role='administrador') then raise exception 'Apenas administradores podem aprovar pedidos'; end if;
  select * into v_order from public.farm_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.status <> 'aguardando_aprovacao' then raise exception 'Este pedido não está aguardando aprovação'; end if;

  for v_item in select * from public.farm_order_items where pedido_id=p_order_id order by criado_em for update loop
    v_reserved:=0; v_shortage:=v_item.quantidade;
    if v_item.produto_id is not null then
      select greatest(coalesce(estoque,0),0),estoque_reservado_manual
      into v_stock,v_manual
      from public.farm_portfolio_products
      where airtable_record_id=v_item.produto_id
      for update;
      if found then
        if v_order.ambiente='desenvolvimento' then
          select coalesce(sum(oi.estoque_baixado),0)::integer into v_automatic
          from public.farm_order_items oi
          join public.farm_orders o on o.id=oi.pedido_id
          where oi.produto_id=v_item.produto_id
            and o.ambiente=v_order.ambiente
            and o.status in ('aprovado','em_producao','pronto');
          v_available:=greatest(v_stock-v_manual-v_automatic,0);
          v_reserved:=least(v_item.quantidade,v_available);
        else
          v_available:=greatest(v_stock-v_manual,0);
          v_reserved:=least(v_item.quantidade,v_available);
          update public.farm_portfolio_products
          set estoque=v_stock-v_reserved,atualizado_em=now()
          where airtable_record_id=v_item.produto_id;
        end if;
        v_shortage:=v_item.quantidade-v_reserved;
      end if;
    end if;
    update public.farm_order_items set estoque_baixado=v_reserved,producao_necessaria=v_shortage where id=v_item.id;
    v_total_reserved:=v_total_reserved+v_reserved; v_total_production:=v_total_production+v_shortage;
    if v_shortage>0 then
      insert into public.farm_production_orders (pedido_id,item_pedido_id,produto_id,produto_nome,quantidade,status,detalhes,link_referencia,foto_urls,ambiente)
      values (p_order_id,v_item.id,v_item.produto_id,v_item.produto_nome,v_shortage,'analise_produto',v_item.detalhes,v_item.link_referencia,v_item.foto_urls,v_order.ambiente)
      on conflict (item_pedido_id) do nothing;
    end if;
  end loop;
  update public.farm_orders set status=case when v_total_production>0 then 'em_producao' else 'aprovado' end,aprovado_em=now(),aprovado_por=auth.uid(),decisao_observacao=null,atualizado_em=now() where id=p_order_id;
  return jsonb_build_object('estoque_reservado',v_total_reserved,'estoque_baixado',v_total_reserved,'producao_criada',v_total_production,'status',case when v_total_production>0 then 'em_producao' else 'aprovado' end);
end;
$$;

create or replace function public.farm_cancel_order(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.farm_orders%rowtype;
  v_item public.farm_order_items%rowtype;
  v_is_admin boolean;
  v_released integer := 0;
begin
  if nullif(trim(p_reason),'') is null then raise exception 'Informe o motivo do cancelamento'; end if;
  select exists(select 1 from public.farm_profiles where id=auth.uid() and active=true and role='administrador') into v_is_admin;
  select * into v_order from public.farm_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.status in ('cancelado','reprovado','entregue') then raise exception 'Este pedido não pode ser cancelado'; end if;
  if not v_is_admin and (v_order.vendedor_id is distinct from auth.uid() or v_order.status not in ('rascunho','aguardando_precificacao','em_precificacao','precificado','aguardando_confirmacao_vendedor','aguardando_aprovacao','devolvido_ajuste')) then
    raise exception 'Você não tem permissão para cancelar este pedido';
  end if;

  for v_item in select * from public.farm_order_items where pedido_id=p_order_id order by criado_em for update loop
    if v_item.estoque_baixado>0 then
      if v_order.ambiente='producao' and v_item.produto_id is not null then
        update public.farm_portfolio_products set estoque=coalesce(estoque,0)+v_item.estoque_baixado,atualizado_em=now() where airtable_record_id=v_item.produto_id;
      end if;
      v_released:=v_released+v_item.estoque_baixado;
    end if;
    update public.farm_order_items set estoque_baixado=0,producao_necessaria=0 where id=v_item.id;
  end loop;
  update public.farm_production_orders set status='cancelado',atualizado_em=now() where pedido_id=p_order_id and status<>'cancelado';
  update public.farm_orders set status='cancelado',motivo_cancelamento=trim(p_reason),cancelado_em=now(),cancelado_por=auth.uid(),atualizado_em=now() where id=p_order_id;
  return jsonb_build_object('reserva_liberada',v_released,'estoque_devolvido',case when v_order.ambiente='producao' then v_released else 0 end,'status','cancelado');
end;
$$;

create or replace function public.farm_deliver_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.farm_orders%rowtype;
  v_item public.farm_order_items%rowtype;
  v_delivered integer := 0;
  v_stock integer;
begin
  if not exists(select 1 from public.farm_profiles where id=auth.uid() and active=true and role='administrador') then raise exception 'Apenas administradores podem entregar pedidos'; end if;
  select * into v_order from public.farm_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.status not in ('aprovado','pronto') then raise exception 'Somente pedidos aprovados ou prontos podem ser entregues'; end if;

  for v_item in select * from public.farm_order_items where pedido_id=p_order_id order by criado_em for update loop
    if v_item.estoque_baixado>0 then
      if v_order.ambiente='desenvolvimento' and v_item.produto_id is not null then
        select greatest(coalesce(estoque,0),0) into v_stock from public.farm_portfolio_products where airtable_record_id=v_item.produto_id for update;
        if v_stock < v_item.estoque_baixado then raise exception 'Estoque físico insuficiente para entregar %',v_item.produto_nome; end if;
        update public.farm_portfolio_products set estoque=v_stock-v_item.estoque_baixado,atualizado_em=now() where airtable_record_id=v_item.produto_id;
      end if;
      v_delivered:=v_delivered+v_item.estoque_baixado;
      update public.farm_order_items set estoque_baixado=0 where id=v_item.id;
    end if;
  end loop;
  update public.farm_orders set status='entregue',atualizado_em=now() where id=p_order_id;
  return jsonb_build_object('estoque_baixado',v_delivered,'status','entregue');
end;
$$;

revoke all on function public.farm_inventory_snapshot(text) from public, anon;
revoke all on function public.farm_set_manual_reservation(text,integer,text) from public, anon;
revoke all on function public.farm_set_physical_stock(text,integer,text) from public, anon;
revoke all on function public.farm_approve_order(uuid) from public, anon;
revoke all on function public.farm_cancel_order(uuid,text) from public, anon;
revoke all on function public.farm_deliver_order(uuid) from public, anon;
grant execute on function public.farm_inventory_snapshot(text) to authenticated;
grant execute on function public.farm_set_manual_reservation(text,integer,text) to authenticated;
grant execute on function public.farm_set_physical_stock(text,integer,text) to authenticated;
grant execute on function public.farm_approve_order(uuid) to authenticated;
grant execute on function public.farm_cancel_order(uuid,text) to authenticated;
grant execute on function public.farm_deliver_order(uuid) to authenticated;
