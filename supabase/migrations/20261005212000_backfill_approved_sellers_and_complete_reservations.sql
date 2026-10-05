insert into public.farm_sellers(nome,email,usuario_id,ativo,ambiente,modelo_comissao,percentual_comissao)
select coalesce(nullif(trim(p.name),''),p.email),p.email,p.id,true,'desenvolvimento','fixa',0
from public.farm_profiles p
where p.role='vendedor' and p.active=true
  and not exists(select 1 from public.farm_sellers s where s.usuario_id=p.id and s.ambiente='desenvolvimento');
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
