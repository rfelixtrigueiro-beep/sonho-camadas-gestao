create or replace function public.farm_manage_user_for_environment(
  target uuid,
  new_role text,
  enabled boolean,
  p_environment text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile public.farm_profiles%rowtype;
  v_existing_id uuid;
begin
  if p_environment not in ('desenvolvimento','producao') or p_environment is null then
    raise exception 'Ambiente inválido';
  end if;

  perform farm_private.manage_user(target,new_role,enabled);
  select * into v_profile from public.farm_profiles where id=target;

  if new_role='vendedor' then
    select id into v_existing_id
      from public.farm_sellers
     where usuario_id=target and ambiente=p_environment
     for update;

    if found then
      update public.farm_sellers
         set ativo=enabled,
             email=coalesce(email,nullif(trim(v_profile.email),'')),
             modelo_comissao='fixa',
             atualizado_em=now()
       where id=v_existing_id;
    elsif enabled then
      select id into v_existing_id
        from public.farm_sellers
       where usuario_id is null
         and ambiente=p_environment
         and email is not null
         and lower(trim(email))=lower(trim(v_profile.email))
       order by criado_em
       limit 1
       for update;

      if found then
        update public.farm_sellers
           set usuario_id=target,
               ativo=true,
               modelo_comissao='fixa',
               atualizado_em=now()
         where id=v_existing_id;
      else
        insert into public.farm_sellers(
          nome,email,usuario_id,ativo,ambiente,modelo_comissao,percentual_comissao
        ) values (
          coalesce(nullif(trim(v_profile.name),''),v_profile.email),
          v_profile.email,
          target,
          true,
          p_environment,
          'fixa',
          0
        );
      end if;
    end if;
  end if;
end;
$$;

revoke all on function public.farm_manage_user_for_environment(uuid,text,boolean,text) from public,anon;
grant execute on function public.farm_manage_user_for_environment(uuid,text,boolean,text) to authenticated;

-- A comissão é definida exclusivamente no cadastro do vendedor.
update public.farm_sellers set modelo_comissao='fixa' where modelo_comissao<>'fixa';

create or replace function farm_private.consignment_reservation(p_product_id text,p_environment text)
returns integer
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(sum(greatest(i.quantidade_enviada
    - coalesce((select sum(v.quantidade) from public.farm_consignment_sales v where v.remessa_item_id=i.id and v.status<>'cancelada'),0)
    - coalesce((select sum(o.quantidade) from public.farm_consignment_occurrences o where o.remessa_item_id=i.id and o.status<>'cancelada'),0),0)),0)::integer
  from public.farm_consignment_items i
  join public.farm_consignments r on r.id=i.remessa_id
  where i.produto_id=p_product_id
    and r.ambiente=p_environment
    and r.status in ('enviada','recebida','parcialmente_devolvida');
$$;

revoke all on function farm_private.consignment_reservation(text,text) from public,anon,authenticated;

create or replace function public.farm_inventory_snapshot(p_environment text)
returns table (product_id text,nome text,categoria text,exibir_portfolio boolean,estoque_fisico integer,estoque_reservado_manual integer,estoque_reservado_automatico integer,estoque_reservado integer,estoque_disponivel integer)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_environment not in ('desenvolvimento','producao') then raise exception 'Ambiente inválido'; end if;
  if not exists(select 1 from public.farm_profiles where id=auth.uid() and active=true) then raise exception 'Usuário sem acesso ao estoque'; end if;
  return query
  select p.airtable_record_id,p.nome,p.categoria,p.exibir_portfolio,greatest(coalesce(p.estoque,0),0)::integer,p.estoque_reservado_manual,
    (coalesce(r.quantidade,0)+farm_private.consignment_reservation(p.airtable_record_id,p_environment))::integer,
    (p.estoque_reservado_manual+coalesce(r.quantidade,0)+farm_private.consignment_reservation(p.airtable_record_id,p_environment))::integer,
    greatest(greatest(coalesce(p.estoque,0),0)-p.estoque_reservado_manual-coalesce(r.quantidade,0)-farm_private.consignment_reservation(p.airtable_record_id,p_environment),0)::integer
  from public.farm_portfolio_products p
  left join lateral (
    select coalesce(sum(oi.estoque_baixado),0)::integer quantidade from public.farm_order_items oi join public.farm_orders o on o.id=oi.pedido_id
    where oi.produto_id=p.airtable_record_id and o.ambiente=p_environment and o.status in ('aprovado','em_producao','pronto')
  ) r on true where p.ativo=true order by p.nome;
end $$;

create or replace function public.farm_send_consignment(p_remessa_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_remessa public.farm_consignments%rowtype; v_item public.farm_consignment_items%rowtype; v_stock integer; v_manual integer; v_order_reserved integer; v_consigned integer; v_count integer:=0;
begin
  if not farm_private.is_admin() then raise exception 'Apenas administradores podem enviar remessas'; end if;
  select * into v_remessa from public.farm_consignments where id=p_remessa_id for update;
  if not found or v_remessa.ambiente<>'desenvolvimento' then raise exception 'Remessa de desenvolvimento não encontrada'; end if;
  if v_remessa.status<>'rascunho' then raise exception 'Somente remessas em rascunho podem ser enviadas'; end if;
  for v_item in select * from public.farm_consignment_items where remessa_id=p_remessa_id for update loop
    select greatest(coalesce(estoque,0),0),estoque_reservado_manual into v_stock,v_manual from public.farm_portfolio_products where airtable_record_id=v_item.produto_id and ativo for update;
    if not found then raise exception 'Produto não encontrado: %',v_item.produto_nome; end if;
    select coalesce(sum(oi.estoque_baixado),0)::integer into v_order_reserved from public.farm_order_items oi join public.farm_orders o on o.id=oi.pedido_id where oi.produto_id=v_item.produto_id and o.ambiente=v_remessa.ambiente and o.status in ('aprovado','em_producao','pronto');
    v_consigned:=farm_private.consignment_reservation(v_item.produto_id,v_remessa.ambiente);
    if v_stock-v_manual-v_order_reserved-v_consigned<v_item.quantidade_enviada then raise exception 'Estoque disponível insuficiente para %',v_item.produto_nome; end if;
    v_count:=v_count+v_item.quantidade_enviada;
  end loop;
  if v_count=0 then raise exception 'Adicione ao menos um produto à remessa'; end if;
  update public.farm_consignments set status='enviada',atualizado_em=now() where id=p_remessa_id;
  return jsonb_build_object('status','enviada','quantidade_reservada',v_count);
end $$;

create or replace function public.farm_register_consignment_sale(p_item_id uuid,p_quantity integer,p_unit_value numeric,p_sale_date date,p_customer_name text default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item public.farm_consignment_items%rowtype; v_remessa public.farm_consignments%rowtype; v_seller public.farm_sellers%rowtype; v_used integer; v_discount numeric; v_id uuid; v_stock integer;
begin
  select * into v_item from public.farm_consignment_items where id=p_item_id;
  if not found then raise exception 'Produto consignado não encontrado'; end if;
  select * into v_remessa from public.farm_consignments where id=v_item.remessa_id;
  select * into v_seller from public.farm_sellers where id=v_remessa.vendedor_id;
  if v_remessa.ambiente<>'desenvolvimento' or v_remessa.status not in ('recebida','parcialmente_devolvida') then raise exception 'Remessa indisponível para venda'; end if;
  if not farm_private.is_admin() and (v_seller.usuario_id is distinct from auth.uid() or not v_seller.ativo) then raise exception 'Você não pode registrar esta venda'; end if;
  if p_quantity is null or p_quantity<=0 or p_unit_value is null or p_unit_value<0 then raise exception 'Quantidade e valor inválidos'; end if;
  select coalesce((select sum(quantidade) from public.farm_consignment_sales where remessa_item_id=p_item_id and status<>'cancelada'),0)+coalesce((select sum(quantidade) from public.farm_consignment_occurrences where remessa_item_id=p_item_id and status<>'cancelada'),0) into v_used;
  if v_used+p_quantity>v_item.quantidade_enviada then raise exception 'Quantidade maior que o saldo consignado'; end if;
  v_discount:=case when v_item.preco_unitario=0 then 0 else round((1-p_unit_value/v_item.preco_unitario)*100,2) end;
  if v_discount<0 then v_discount:=0; end if;
  if v_discount>v_item.desconto_maximo_percentual then raise exception 'Desconto acima do limite de % por cento',v_item.desconto_maximo_percentual; end if;
  select greatest(coalesce(estoque,0),0) into v_stock from public.farm_portfolio_products where airtable_record_id=v_item.produto_id for update;
  if not found or v_stock<p_quantity then raise exception 'Estoque físico insuficiente'; end if;
  insert into public.farm_consignment_sales(remessa_item_id,vendedor_id,ambiente,data_venda,quantidade,preco_tabela_unitario,valor_venda_unitario,desconto_percentual,percentual_comissao,cliente_informado,cliente_nome,observacoes)
  values(p_item_id,v_seller.id,'desenvolvimento',coalesce(p_sale_date,current_date),p_quantity,v_item.preco_unitario,p_unit_value,v_discount,v_seller.percentual_comissao,nullif(trim(coalesce(p_customer_name,'')),'') is not null,nullif(trim(coalesce(p_customer_name,'')),''),nullif(trim(coalesce(p_notes,'')),'')) returning id into v_id;
  update public.farm_portfolio_products set estoque=v_stock-p_quantity,atualizado_em=now() where airtable_record_id=v_item.produto_id;
  return v_id;
end $$;

create or replace function public.farm_cancel_consignment_sale(p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sale public.farm_consignment_sales%rowtype; v_seller public.farm_sellers%rowtype; v_product_id text;
begin
  select * into v_sale from public.farm_consignment_sales where id=p_sale_id for update;
  if not found or v_sale.ambiente<>'desenvolvimento' then raise exception 'Venda não encontrada'; end if;
  select * into v_seller from public.farm_sellers where id=v_sale.vendedor_id;
  if not farm_private.is_admin() and (v_seller.usuario_id is distinct from auth.uid() or not v_seller.ativo) then raise exception 'Você não pode cancelar esta venda'; end if;
  if v_sale.status<>'informada' then raise exception 'Somente vendas pendentes do fechamento podem ser canceladas'; end if;
  select produto_id into v_product_id from public.farm_consignment_items where id=v_sale.remessa_item_id;
  update public.farm_consignment_sales set status='cancelada',atualizado_em=now() where id=p_sale_id;
  update public.farm_portfolio_products set estoque=coalesce(estoque,0)+v_sale.quantidade,atualizado_em=now() where airtable_record_id=v_product_id;
  return jsonb_build_object('status','cancelada','quantidade_liberada',v_sale.quantidade);
end $$;

create or replace function public.farm_register_consignment_occurrence(p_item_id uuid,p_type text,p_quantity integer,p_date date,p_treatment text default null,p_responsibility_value numeric default 0,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item public.farm_consignment_items%rowtype; v_remessa public.farm_consignments%rowtype; v_seller public.farm_sellers%rowtype; v_used integer; v_id uuid; v_stock integer;
begin
  if p_type not in ('devolucao','perda','avaria') then raise exception 'Tipo de ocorrência inválido'; end if;
  select * into v_item from public.farm_consignment_items where id=p_item_id;
  if not found then raise exception 'Produto consignado não encontrado'; end if;
  select * into v_remessa from public.farm_consignments where id=v_item.remessa_id;
  select * into v_seller from public.farm_sellers where id=v_remessa.vendedor_id;
  if v_remessa.ambiente<>'desenvolvimento' or v_remessa.status not in ('recebida','parcialmente_devolvida') then raise exception 'Remessa indisponível'; end if;
  if not farm_private.is_admin() and (v_seller.usuario_id is distinct from auth.uid() or not v_seller.ativo) then raise exception 'Você não pode registrar esta ocorrência'; end if;
  select coalesce((select sum(quantidade) from public.farm_consignment_sales where remessa_item_id=p_item_id and status<>'cancelada'),0)+coalesce((select sum(quantidade) from public.farm_consignment_occurrences where remessa_item_id=p_item_id and status<>'cancelada'),0) into v_used;
  if p_quantity is null or p_quantity<=0 or v_used+p_quantity>v_item.quantidade_enviada then raise exception 'Quantidade maior que o saldo consignado'; end if;
  if p_type in ('perda','avaria') then
    select greatest(coalesce(estoque,0),0) into v_stock from public.farm_portfolio_products where airtable_record_id=v_item.produto_id for update;
    if not found or v_stock<p_quantity then raise exception 'Estoque físico insuficiente'; end if;
    update public.farm_portfolio_products set estoque=v_stock-p_quantity,atualizado_em=now() where airtable_record_id=v_item.produto_id;
  end if;
  insert into public.farm_consignment_occurrences(remessa_item_id,vendedor_id,ambiente,tipo,quantidade,data_ocorrencia,tratamento,valor_responsabilidade,observacoes)
  values(p_item_id,v_seller.id,'desenvolvimento',p_type,p_quantity,coalesce(p_date,current_date),case when p_type='devolucao' then null else p_treatment end,coalesce(p_responsibility_value,0),nullif(trim(coalesce(p_notes,'')),'')) returning id into v_id;
  update public.farm_consignments set status='parcialmente_devolvida',atualizado_em=now() where id=v_remessa.id and p_type='devolucao';
  return v_id;
end $$;

create or replace function public.farm_set_manual_reservation(p_product_id text,p_quantity integer,p_environment text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_stock integer; v_automatic integer:=0;
begin
  if not exists(select 1 from public.farm_profiles where id=auth.uid() and active=true and role='administrador') then raise exception 'Apenas administradores podem alterar a reserva manual'; end if;
  if p_environment not in ('desenvolvimento','producao') then raise exception 'Ambiente inválido'; end if;
  if p_quantity is null or p_quantity<0 then raise exception 'A reserva deve ser igual ou maior que zero'; end if;
  select greatest(coalesce(estoque,0),0) into v_stock from public.farm_portfolio_products where airtable_record_id=p_product_id and ativo=true for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  select coalesce(sum(oi.estoque_baixado),0)::integer into v_automatic from public.farm_order_items oi join public.farm_orders o on o.id=oi.pedido_id where oi.produto_id=p_product_id and o.ambiente=p_environment and o.status in ('aprovado','em_producao','pronto');
  v_automatic:=v_automatic+farm_private.consignment_reservation(p_product_id,p_environment);
  if p_quantity+v_automatic>v_stock then raise exception 'A reserva total não pode ser maior que o estoque físico'; end if;
  update public.farm_portfolio_products set estoque_reservado_manual=p_quantity,atualizado_em=now() where airtable_record_id=p_product_id;
  return jsonb_build_object('estoque_reservado_manual',p_quantity,'estoque_reservado_automatico',v_automatic,'estoque_reservado',p_quantity+v_automatic,'estoque_disponivel',v_stock-p_quantity-v_automatic);
end $$;

create or replace function public.farm_set_physical_stock(p_product_id text,p_quantity integer,p_environment text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_manual integer; v_automatic integer:=0;
begin
  if not exists(select 1 from public.farm_profiles where id=auth.uid() and active=true and role='administrador') then raise exception 'Apenas administradores podem alterar o estoque físico'; end if;
  if p_environment not in ('desenvolvimento','producao') then raise exception 'Ambiente inválido'; end if;
  if p_quantity is null or p_quantity<0 then raise exception 'O estoque deve ser igual ou maior que zero'; end if;
  select estoque_reservado_manual into v_manual from public.farm_portfolio_products where airtable_record_id=p_product_id and ativo=true for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  select coalesce(sum(oi.estoque_baixado),0)::integer into v_automatic from public.farm_order_items oi join public.farm_orders o on o.id=oi.pedido_id where oi.produto_id=p_product_id and o.ambiente=p_environment and o.status in ('aprovado','em_producao','pronto');
  v_automatic:=v_automatic+farm_private.consignment_reservation(p_product_id,p_environment);
  if p_quantity<v_manual+v_automatic then raise exception 'O estoque físico não pode ser menor que a quantidade reservada'; end if;
  update public.farm_portfolio_products set estoque=p_quantity,atualizado_em=now() where airtable_record_id=p_product_id;
  return jsonb_build_object('estoque_fisico',p_quantity,'estoque_reservado',v_manual+v_automatic,'estoque_disponivel',p_quantity-v_manual-v_automatic);
end $$;
