-- Keep the existing admin checks, grants, and order-based access policies.
create or replace function public.farm_register_order_payment(
  p_order_id uuid,
  p_value numeric,
  p_payment_date date,
  p_method text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_financial public.farm_order_financials%rowtype;
  v_received numeric(12,2);
  v_balance numeric(12,2);
begin
  if not farm_private.is_admin() then raise exception 'Apenas administradores podem registrar pagamentos'; end if;
  if p_value is null or p_value<=0 then raise exception 'Informe um valor maior que zero'; end if;
  if p_payment_date is null then raise exception 'Informe a data do pagamento'; end if;
  if p_method is null or p_method not in ('Pix','Dinheiro','Cartão de débito','Cartão de crédito','Transferência','Outro') then raise exception 'Forma de pagamento inválida'; end if;
  select * into v_financial from public.farm_order_financials
    where pedido_id=p_order_id for update;
  if not found then raise exception 'Controle financeiro não encontrado para este pedido'; end if;
  if v_financial.status in ('cancelado','aguardando_devolucao') then raise exception 'Não é possível receber um pedido cancelado'; end if;
  select coalesce(sum(case when tipo='recebimento' then valor else -valor end),0)
    into v_received from public.farm_order_payments where financeiro_id=v_financial.id;
  v_balance:=greatest(v_financial.valor_total-v_received,0);
  if p_value>v_balance then raise exception 'O valor informado é maior que o saldo devedor'; end if;
  insert into public.farm_order_payments(financeiro_id,ambiente,tipo,valor,data_movimentacao,forma_pagamento,observacao,criado_por)
    values(v_financial.id,v_financial.ambiente,'recebimento',round(p_value,2),p_payment_date,p_method,nullif(trim(p_note),''),auth.uid());
  perform farm_private.recalculate_financial_status(v_financial.id);
  return jsonb_build_object('valor_recebido',v_received+round(p_value,2),'saldo',greatest(v_balance-round(p_value,2),0));
end;
$$;

create or replace function public.farm_reverse_order_payment(p_payment_id uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_payment public.farm_order_payments%rowtype;
  v_financial public.farm_order_financials%rowtype;
  v_remaining numeric(12,2);
begin
  if not farm_private.is_admin() then raise exception 'Apenas administradores podem estornar pagamentos'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Informe o motivo do estorno'; end if;
  select * into v_payment from public.farm_order_payments where id=p_payment_id for update;
  if not found or v_payment.tipo<>'recebimento' then raise exception 'Pagamento não encontrado'; end if;
  if exists(select 1 from public.farm_order_payments where pagamento_origem_id=p_payment_id and tipo='estorno') then raise exception 'Este pagamento já foi estornado'; end if;
  select * into v_financial from public.farm_order_financials where id=v_payment.financeiro_id for update;
  if not found then raise exception 'Controle financeiro não encontrado'; end if;
  insert into public.farm_order_payments(financeiro_id,ambiente,tipo,valor,data_movimentacao,forma_pagamento,motivo,pagamento_origem_id,criado_por)
    values(v_payment.financeiro_id,v_payment.ambiente,'estorno',v_payment.valor,current_date,v_payment.forma_pagamento,trim(p_reason),v_payment.id,auth.uid());
  if v_financial.status='aguardando_devolucao' then
    select coalesce(sum(case when tipo='recebimento' then valor else -valor end),0)
      into v_remaining from public.farm_order_payments where financeiro_id=v_financial.id;
    update public.farm_order_financials
      set status=case when v_remaining>0 then 'aguardando_devolucao' else 'cancelado' end,atualizado_em=now()
      where id=v_financial.id;
  else
    perform farm_private.recalculate_financial_status(v_financial.id);
  end if;
  return jsonb_build_object('valor_estornado',v_payment.valor);
end;
$$;

create or replace function public.farm_update_order_financial(
  p_order_id uuid,
  p_due_date date,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not farm_private.is_admin() then raise exception 'Apenas administradores podem alterar o controle financeiro'; end if;
  update public.farm_order_financials
    set data_prevista_pagamento=p_due_date,observacao=nullif(trim(p_note),''),atualizado_em=now()
    where pedido_id=p_order_id;
  if not found then raise exception 'Controle financeiro não encontrado'; end if;
end;
$$;

create or replace function farm_private.sync_order_financial()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_received numeric(12,2);
begin
  if new.status in ('aprovado','em_producao','pronto','entregue')
     and (old.status is distinct from new.status or not exists(select 1 from public.farm_order_financials where pedido_id=new.id)) then
    insert into public.farm_order_financials(pedido_id,ambiente,valor_total,status)
      values(new.id,new.ambiente,greatest(new.valor_total,0),case when new.valor_total<=0 then 'pago' else 'pendente' end)
      on conflict(pedido_id) do nothing;
  elsif new.status='cancelado' and old.status is distinct from new.status then
    select coalesce(sum(case when p.tipo='recebimento' then p.valor else -p.valor end),0)
      into v_received
      from public.farm_order_payments p
      join public.farm_order_financials f on f.id=p.financeiro_id
      where f.pedido_id=new.id;
    update public.farm_order_financials
      set status=case when v_received>0 then 'aguardando_devolucao' else 'cancelado' end,atualizado_em=now()
      where pedido_id=new.id;
  end if;
  return new;
end;
$$;

-- Initialize financial control for existing approved production orders without recording any payment.
insert into public.farm_order_financials (pedido_id, ambiente, valor_total, status)
select o.id, o.ambiente, greatest(o.valor_total, 0),
       case when o.valor_total <= 0 then 'pago' else 'pendente' end
from public.farm_orders o
where o.ambiente = 'producao'
  and o.status in ('aprovado', 'em_producao', 'pronto', 'entregue')
on conflict (pedido_id) do nothing;

comment on table public.farm_order_financials is 'Controle de recebimento por pedido em desenvolvimento e produção.';
