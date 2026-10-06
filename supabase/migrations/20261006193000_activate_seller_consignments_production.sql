-- Ativa o fluxo de consignação nos dois ambientes. O ambiente é sempre
-- herdado da remessa ou do vendedor para impedir gravações cruzadas.

create or replace function public.farm_send_consignment(p_remessa_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_remessa public.farm_consignments%rowtype; v_item public.farm_consignment_items%rowtype; v_stock integer; v_manual integer; v_order_reserved integer; v_consigned integer; v_count integer:=0;
begin
  if not farm_private.is_admin() then raise exception 'Apenas administradores podem enviar remessas'; end if;
  select * into v_remessa from public.farm_consignments where id=p_remessa_id for update;
  if not found then raise exception 'Remessa não encontrada'; end if;
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

create or replace function public.farm_confirm_consignment(p_remessa_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_remessa public.farm_consignments%rowtype;
begin
  select * into v_remessa from public.farm_consignments where id=p_remessa_id for update;
  if not found then raise exception 'Remessa não encontrada'; end if;
  if not farm_private.is_admin() and not exists(select 1 from public.farm_sellers s where s.id=v_remessa.vendedor_id and s.usuario_id=auth.uid() and s.ativo) then raise exception 'Você não pode confirmar esta remessa'; end if;
  if v_remessa.status<>'enviada' then raise exception 'Esta remessa não aguarda confirmação'; end if;
  update public.farm_consignments set status='recebida',confirmado_recebimento_em=now(),confirmado_recebimento_por=auth.uid(),atualizado_em=now() where id=p_remessa_id;
  return jsonb_build_object('status','recebida');
end $$;

create or replace function public.farm_update_consignment(p_remessa_id uuid,p_seller_id uuid,p_shipping_date date,p_return_date date,p_notes text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_remittance public.farm_consignments%rowtype; v_seller public.farm_sellers%rowtype; v_product public.farm_portfolio_products%rowtype;
  v_entry jsonb; v_product_id text; v_quantity integer; v_stock integer; v_manual integer; v_order_reserved integer; v_other_consigned integer; v_item_count integer;
begin
  if not farm_private.is_admin() then raise exception 'Apenas administradores podem alterar remessas'; end if;
  select * into v_remittance from public.farm_consignments where id=p_remessa_id for update;
  if not found then raise exception 'Remessa não encontrada'; end if;
  if v_remittance.status in ('encerrada','cancelada') then raise exception 'Remessas encerradas ou canceladas não podem ser alteradas'; end if;
  if exists(select 1 from public.farm_consignment_items i where i.remessa_id=p_remessa_id and (exists(select 1 from public.farm_consignment_sales s where s.remessa_item_id=i.id) or exists(select 1 from public.farm_consignment_occurrences o where o.remessa_item_id=i.id))) then raise exception 'Esta remessa já possui movimentações e não pode ser alterada'; end if;
  select * into v_seller from public.farm_sellers where id=p_seller_id and ambiente=v_remittance.ambiente and ativo=true for update;
  if not found then raise exception 'Vendedor não encontrado ou inativo neste ambiente'; end if;
  if p_shipping_date is null then raise exception 'Informe a data de envio'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Adicione ao menos um produto à remessa'; end if;
  if (select count(*)<>count(distinct value->>'produto_id') from jsonb_array_elements(p_items)) then raise exception 'Um produto não pode ser repetido na remessa'; end if;
  for v_entry in select value from jsonb_array_elements(p_items) order by value->>'produto_id' loop
    v_product_id:=nullif(trim(v_entry->>'produto_id'),'');
    begin v_quantity:=(v_entry->>'quantidade')::integer; exception when others then raise exception 'Quantidade inválida na remessa'; end;
    if v_product_id is null or v_quantity is null or v_quantity<=0 then raise exception 'Produto e quantidade são obrigatórios'; end if;
    select * into v_product from public.farm_portfolio_products where airtable_record_id=v_product_id and ativo=true for update;
    if not found then raise exception 'Produto não encontrado ou inativo'; end if;
    v_stock:=greatest(coalesce(v_product.estoque,0),0); v_manual:=coalesce(v_product.estoque_reservado_manual,0);
    select coalesce(sum(oi.estoque_baixado),0)::integer into v_order_reserved from public.farm_order_items oi join public.farm_orders o on o.id=oi.pedido_id where oi.produto_id=v_product_id and o.ambiente=v_remittance.ambiente and o.status in ('aprovado','em_producao','pronto');
    select coalesce(sum(greatest(i.quantidade_enviada-coalesce((select sum(s.quantidade) from public.farm_consignment_sales s where s.remessa_item_id=i.id and s.status<>'cancelada'),0)-coalesce((select sum(o.quantidade) from public.farm_consignment_occurrences o where o.remessa_item_id=i.id and o.status<>'cancelada'),0),0)),0)::integer into v_other_consigned from public.farm_consignment_items i join public.farm_consignments r on r.id=i.remessa_id where i.produto_id=v_product_id and r.ambiente=v_remittance.ambiente and r.id<>p_remessa_id and r.status in ('enviada','recebida','parcialmente_devolvida');
    if v_stock-v_manual-v_order_reserved-v_other_consigned<v_quantity then raise exception 'Estoque disponível insuficiente para %',v_product.nome; end if;
  end loop;
  update public.farm_consignments set vendedor_id=p_seller_id,data_envio=p_shipping_date,data_prevista_retorno=p_return_date,observacoes=nullif(trim(coalesce(p_notes,'')),''),atualizado_em=now() where id=p_remessa_id;
  delete from public.farm_consignment_items where remessa_id=p_remessa_id;
  insert into public.farm_consignment_items(remessa_id,produto_id,produto_nome,categoria,foto_url,quantidade_enviada,preco_unitario,desconto_maximo_percentual,percentual_comissao)
  select p_remessa_id,p.airtable_record_id,p.nome,p.categoria,p.foto_urls[1],(entry.value->>'quantidade')::integer,coalesce(p.preco_venda,0),coalesce(p.desconto_maximo_percentual,0),coalesce(v_seller.percentual_comissao,0) from jsonb_array_elements(p_items) entry join public.farm_portfolio_products p on p.airtable_record_id=entry.value->>'produto_id';
  get diagnostics v_item_count=row_count;
  return jsonb_build_object('status',v_remittance.status,'itens',v_item_count,'estoque_recalculado',true);
end $$;

create or replace function public.farm_delete_consignment(p_remessa_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_remittance public.farm_consignments%rowtype; v_reserved integer:=0;
begin
  if not farm_private.is_admin() then raise exception 'Apenas administradores podem excluir remessas'; end if;
  select * into v_remittance from public.farm_consignments where id=p_remessa_id for update;
  if not found then raise exception 'Remessa não encontrada'; end if;
  if exists(select 1 from public.farm_consignment_items i where i.remessa_id=p_remessa_id and (exists(select 1 from public.farm_consignment_sales s where s.remessa_item_id=i.id) or exists(select 1 from public.farm_consignment_occurrences o where o.remessa_item_id=i.id))) then raise exception 'Esta remessa possui movimentações e deve ser preservada no histórico'; end if;
  if v_remittance.status in ('enviada','recebida','parcialmente_devolvida') then select coalesce(sum(quantidade_enviada),0)::integer into v_reserved from public.farm_consignment_items where remessa_id=p_remessa_id; end if;
  delete from public.farm_consignments where id=p_remessa_id;
  return jsonb_build_object('excluida',true,'quantidade_liberada',v_reserved);
end $$;

create or replace function public.farm_register_consignment_sale(p_item_id uuid,p_quantity integer,p_unit_value numeric,p_sale_date date,p_customer_name text default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item public.farm_consignment_items%rowtype; v_remessa public.farm_consignments%rowtype; v_seller public.farm_sellers%rowtype; v_used integer; v_discount numeric; v_id uuid; v_stock integer;
begin
  select * into v_item from public.farm_consignment_items where id=p_item_id for update;
  if not found then raise exception 'Produto consignado não encontrado'; end if;
  select * into v_remessa from public.farm_consignments where id=v_item.remessa_id;
  select * into v_seller from public.farm_sellers where id=v_remessa.vendedor_id;
  if v_remessa.status not in ('recebida','parcialmente_devolvida') then raise exception 'Remessa indisponível para venda'; end if;
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
  values(p_item_id,v_seller.id,v_remessa.ambiente,coalesce(p_sale_date,current_date),p_quantity,v_item.preco_unitario,p_unit_value,v_discount,v_seller.percentual_comissao,nullif(trim(coalesce(p_customer_name,'')),'') is not null,nullif(trim(coalesce(p_customer_name,'')),''),nullif(trim(coalesce(p_notes,'')),'')) returning id into v_id;
  update public.farm_portfolio_products set estoque=v_stock-p_quantity,atualizado_em=now() where airtable_record_id=v_item.produto_id;
  return v_id;
end $$;

create or replace function public.farm_cancel_consignment_sale(p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sale public.farm_consignment_sales%rowtype; v_seller public.farm_sellers%rowtype; v_product_id text;
begin
  select * into v_sale from public.farm_consignment_sales where id=p_sale_id for update;
  if not found then raise exception 'Venda não encontrada'; end if;
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
  select * into v_item from public.farm_consignment_items where id=p_item_id for update;
  if not found then raise exception 'Produto consignado não encontrado'; end if;
  select * into v_remessa from public.farm_consignments where id=v_item.remessa_id;
  select * into v_seller from public.farm_sellers where id=v_remessa.vendedor_id;
  if v_remessa.status not in ('recebida','parcialmente_devolvida') then raise exception 'Remessa indisponível'; end if;
  if not farm_private.is_admin() and (v_seller.usuario_id is distinct from auth.uid() or not v_seller.ativo) then raise exception 'Você não pode registrar esta ocorrência'; end if;
  select coalesce((select sum(quantidade) from public.farm_consignment_sales where remessa_item_id=p_item_id and status<>'cancelada'),0)+coalesce((select sum(quantidade) from public.farm_consignment_occurrences where remessa_item_id=p_item_id and status<>'cancelada'),0) into v_used;
  if p_quantity is null or p_quantity<=0 or v_used+p_quantity>v_item.quantidade_enviada then raise exception 'Quantidade maior que o saldo consignado'; end if;
  if p_type in ('perda','avaria') then
    select greatest(coalesce(estoque,0),0) into v_stock from public.farm_portfolio_products where airtable_record_id=v_item.produto_id for update;
    if not found or v_stock<p_quantity then raise exception 'Estoque físico insuficiente'; end if;
    update public.farm_portfolio_products set estoque=v_stock-p_quantity,atualizado_em=now() where airtable_record_id=v_item.produto_id;
  end if;
  insert into public.farm_consignment_occurrences(remessa_item_id,vendedor_id,ambiente,tipo,quantidade,data_ocorrencia,tratamento,valor_responsabilidade,observacoes)
  values(p_item_id,v_seller.id,v_remessa.ambiente,p_type,p_quantity,coalesce(p_date,current_date),case when p_type='devolucao' then null else p_treatment end,coalesce(p_responsibility_value,0),nullif(trim(coalesce(p_notes,'')),'')) returning id into v_id;
  update public.farm_consignments set status='parcialmente_devolvida',atualizado_em=now() where id=v_remessa.id and p_type='devolucao';
  return v_id;
end $$;

create or replace function public.farm_close_seller_month(p_seller_id uuid,p_competence date,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_start date:=date_trunc('month',p_competence)::date; v_end date:=(date_trunc('month',p_competence)+interval '1 month')::date; v_id uuid; v_sales numeric; v_commission numeric; v_responsibility numeric; v_environment text;
begin
  if not farm_private.is_admin() then raise exception 'Apenas administradores podem fechar o mês'; end if;
  select ambiente into v_environment from public.farm_sellers where id=p_seller_id and ativo=true;
  if not found then raise exception 'Vendedor não encontrado ou inativo'; end if;
  select coalesce(sum(valor_total),0),coalesce(sum(valor_comissao),0) into v_sales,v_commission from public.farm_consignment_sales where vendedor_id=p_seller_id and ambiente=v_environment and status='informada' and data_venda>=v_start and data_venda<v_end;
  select coalesce(sum(valor_responsabilidade),0) into v_responsibility from public.farm_consignment_occurrences where vendedor_id=p_seller_id and ambiente=v_environment and status='informada' and data_ocorrencia>=v_start and data_ocorrencia<v_end;
  insert into public.farm_seller_closings(vendedor_id,ambiente,competencia,status,total_vendas,total_comissao,total_responsabilidades,valor_liquido,observacoes,aprovado_por,aprovado_em)
  values(p_seller_id,v_environment,v_start,'aprovado',v_sales,v_commission,v_responsibility,greatest(v_commission-v_responsibility,0),nullif(trim(coalesce(p_notes,'')),''),auth.uid(),now())
  on conflict(ambiente,vendedor_id,competencia) do update set status='aprovado',total_vendas=excluded.total_vendas,total_comissao=excluded.total_comissao,total_responsabilidades=excluded.total_responsabilidades,valor_liquido=excluded.valor_liquido,observacoes=excluded.observacoes,aprovado_por=auth.uid(),aprovado_em=now(),atualizado_em=now() returning id into v_id;
  update public.farm_consignment_sales set status='aprovada',fechamento_id=v_id,atualizado_em=now() where vendedor_id=p_seller_id and ambiente=v_environment and status='informada' and data_venda>=v_start and data_venda<v_end;
  update public.farm_consignment_occurrences set status='aprovada',fechamento_id=v_id where vendedor_id=p_seller_id and ambiente=v_environment and status='informada' and data_ocorrencia>=v_start and data_ocorrencia<v_end;
  return v_id;
end $$;

create or replace function public.farm_register_consignment_sales(p_items jsonb,p_sale_date date,p_customer_name text,p_notes text,p_sale_group_id uuid,p_payment_method text,p_receipt_paths text[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_entry jsonb; v_item_id uuid; v_quantity integer; v_unit_value numeric; v_item public.farm_consignment_items%rowtype; v_remittance public.farm_consignments%rowtype; v_seller_id uuid; v_environment text; v_sale_id uuid; v_sale_ids uuid[]:='{}'; v_total numeric:=0; v_total_quantity integer:=0; v_count integer:=0;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Selecione ao menos uma peça para a venda'; end if;
  if p_sale_group_id is null then raise exception 'Identificador da venda inválido'; end if;
  if p_payment_method not in ('Pix','Dinheiro','Cartão de débito','Cartão de crédito','Transferência','Outro') then raise exception 'Forma de pagamento inválida'; end if;
  if coalesce(array_length(p_receipt_paths,1),0)>10 then raise exception 'É permitido anexar até 10 comprovantes'; end if;
  if exists(select 1 from unnest(coalesce(p_receipt_paths,'{}'::text[])) path where path not like (select auth.uid())::text||'/%') then raise exception 'Caminho de comprovante inválido'; end if;
  if (select count(*)<>count(distinct value->>'item_id') from jsonb_array_elements(p_items)) then raise exception 'Uma peça não pode ser repetida na mesma venda'; end if;
  for v_entry in select value from jsonb_array_elements(p_items) order by value->>'item_id' loop
    begin v_item_id:=(v_entry->>'item_id')::uuid; v_quantity:=(v_entry->>'quantidade')::integer; v_unit_value:=(v_entry->>'valor_unitario')::numeric; exception when others then raise exception 'Dados de uma das peças são inválidos'; end;
    if v_quantity is null or v_quantity<=0 or v_unit_value is null or v_unit_value<0 then raise exception 'Quantidade e valor devem ser válidos'; end if;
    select * into v_item from public.farm_consignment_items where id=v_item_id for update;
    if not found then raise exception 'Produto consignado não encontrado'; end if;
    select * into v_remittance from public.farm_consignments where id=v_item.remessa_id;
    if not found or v_remittance.status not in ('recebida','parcialmente_devolvida') then raise exception 'Remessa indisponível para venda'; end if;
    if v_seller_id is null then v_seller_id:=v_remittance.vendedor_id; v_environment:=v_remittance.ambiente;
    elsif v_seller_id<>v_remittance.vendedor_id or v_environment<>v_remittance.ambiente then raise exception 'Todas as peças da venda devem pertencer ao mesmo vendedor e ambiente'; end if;
  end loop;
  for v_entry in select value from jsonb_array_elements(p_items) order by value->>'item_id' loop
    v_item_id:=(v_entry->>'item_id')::uuid; v_quantity:=(v_entry->>'quantidade')::integer; v_unit_value:=(v_entry->>'valor_unitario')::numeric;
    v_sale_id:=public.farm_register_consignment_sale(v_item_id,v_quantity,v_unit_value,coalesce(p_sale_date,current_date),p_customer_name,p_notes);
    update public.farm_consignment_sales set grupo_venda_id=p_sale_group_id,forma_pagamento=p_payment_method,comprovante_paths=coalesce(p_receipt_paths,'{}'::text[]),atualizado_em=now() where id=v_sale_id;
    v_sale_ids:=array_append(v_sale_ids,v_sale_id); v_total:=v_total+round(v_quantity*v_unit_value,2); v_total_quantity:=v_total_quantity+v_quantity; v_count:=v_count+1;
  end loop;
  return jsonb_build_object('grupo_venda_id',p_sale_group_id,'vendas',to_jsonb(v_sale_ids),'itens',v_count,'quantidade',v_total_quantity,'valor_total',round(v_total,2),'comprovantes',coalesce(array_length(p_receipt_paths,1),0));
end $$;

create or replace function public.farm_register_consignment_returns(p_items jsonb,p_date date,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_entry jsonb; v_item_id uuid; v_quantity integer; v_item public.farm_consignment_items%rowtype; v_remittance public.farm_consignments%rowtype; v_seller_id uuid; v_environment text; v_occurrence_id uuid; v_occurrence_ids uuid[]:='{}'; v_total_quantity integer:=0; v_count integer:=0;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Selecione ao menos uma peça para a devolução'; end if;
  if (select count(*)<>count(distinct value->>'item_id') from jsonb_array_elements(p_items)) then raise exception 'Uma peça não pode ser repetida na mesma devolução'; end if;
  for v_entry in select value from jsonb_array_elements(p_items) order by value->>'item_id' loop
    begin v_item_id:=(v_entry->>'item_id')::uuid; v_quantity:=(v_entry->>'quantidade')::integer; exception when others then raise exception 'Dados de uma das peças são inválidos'; end;
    if v_quantity is null or v_quantity<=0 then raise exception 'A quantidade devolvida deve ser maior que zero'; end if;
    select * into v_item from public.farm_consignment_items where id=v_item_id for update;
    if not found then raise exception 'Produto consignado não encontrado'; end if;
    select * into v_remittance from public.farm_consignments where id=v_item.remessa_id;
    if not found or v_remittance.status not in ('recebida','parcialmente_devolvida') then raise exception 'Remessa indisponível para devolução'; end if;
    if v_seller_id is null then v_seller_id:=v_remittance.vendedor_id; v_environment:=v_remittance.ambiente;
    elsif v_seller_id<>v_remittance.vendedor_id or v_environment<>v_remittance.ambiente then raise exception 'Todas as peças da devolução devem pertencer ao mesmo vendedor e ambiente'; end if;
  end loop;
  for v_entry in select value from jsonb_array_elements(p_items) order by value->>'item_id' loop
    v_item_id:=(v_entry->>'item_id')::uuid; v_quantity:=(v_entry->>'quantidade')::integer;
    v_occurrence_id:=public.farm_register_consignment_occurrence(v_item_id,'devolucao',v_quantity,coalesce(p_date,current_date),null,0,p_notes);
    v_occurrence_ids:=array_append(v_occurrence_ids,v_occurrence_id); v_total_quantity:=v_total_quantity+v_quantity; v_count:=v_count+1;
  end loop;
  return jsonb_build_object('ocorrencias',to_jsonb(v_occurrence_ids),'itens',v_count,'quantidade',v_total_quantity);
end $$;

revoke all on function public.farm_send_consignment(uuid) from public,anon;
revoke all on function public.farm_confirm_consignment(uuid) from public,anon;
revoke all on function public.farm_update_consignment(uuid,uuid,date,date,text,jsonb) from public,anon;
revoke all on function public.farm_delete_consignment(uuid) from public,anon;
revoke all on function public.farm_register_consignment_sale(uuid,integer,numeric,date,text,text) from public,anon;
revoke all on function public.farm_cancel_consignment_sale(uuid) from public,anon;
revoke all on function public.farm_register_consignment_occurrence(uuid,text,integer,date,text,numeric,text) from public,anon;
revoke all on function public.farm_close_seller_month(uuid,date,text) from public,anon;
revoke all on function public.farm_register_consignment_sales(jsonb,date,text,text,uuid,text,text[]) from public,anon;
revoke all on function public.farm_register_consignment_returns(jsonb,date,text) from public,anon;
grant execute on function public.farm_send_consignment(uuid) to authenticated;
grant execute on function public.farm_confirm_consignment(uuid) to authenticated;
grant execute on function public.farm_update_consignment(uuid,uuid,date,date,text,jsonb) to authenticated;
grant execute on function public.farm_delete_consignment(uuid) to authenticated;
grant execute on function public.farm_register_consignment_sale(uuid,integer,numeric,date,text,text) to authenticated;
grant execute on function public.farm_cancel_consignment_sale(uuid) to authenticated;
grant execute on function public.farm_register_consignment_occurrence(uuid,text,integer,date,text,numeric,text) to authenticated;
grant execute on function public.farm_close_seller_month(uuid,date,text) to authenticated;
grant execute on function public.farm_register_consignment_sales(jsonb,date,text,text,uuid,text,text[]) to authenticated;
grant execute on function public.farm_register_consignment_returns(jsonb,date,text) to authenticated;
