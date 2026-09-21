create table if not exists public.farm_order_financials (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references public.farm_orders(id) on delete restrict,
  ambiente text not null check (ambiente in ('desenvolvimento','producao')),
  valor_total numeric(12,2) not null check (valor_total >= 0),
  data_prevista_pagamento date,
  observacao text,
  status text not null default 'pendente' check (status in ('pendente','parcial','pago','cancelado','aguardando_devolucao')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.farm_order_payments (
  id uuid primary key default gen_random_uuid(),
  financeiro_id uuid not null references public.farm_order_financials(id) on delete restrict,
  ambiente text not null check (ambiente in ('desenvolvimento','producao')),
  tipo text not null default 'recebimento' check (tipo in ('recebimento','estorno')),
  valor numeric(12,2) not null check (valor > 0),
  data_movimentacao date not null default current_date,
  forma_pagamento text not null check (forma_pagamento in ('Pix','Dinheiro','Cartão de débito','Cartão de crédito','Transferência','Outro')),
  observacao text,
  motivo text,
  pagamento_origem_id uuid references public.farm_order_payments(id) on delete restrict,
  criado_por uuid not null references public.farm_profiles(id) on delete restrict,
  criado_em timestamptz not null default now(),
  check ((tipo='recebimento' and pagamento_origem_id is null) or (tipo='estorno' and pagamento_origem_id is not null and nullif(trim(motivo),'') is not null))
);

create unique index if not exists farm_order_payments_single_reversal
  on public.farm_order_payments(pagamento_origem_id)
  where tipo='estorno';
create index if not exists farm_order_financials_environment_status_idx
  on public.farm_order_financials(ambiente,status);
create index if not exists farm_order_financials_due_date_idx
  on public.farm_order_financials(data_prevista_pagamento);
create index if not exists farm_order_payments_financial_date_idx
  on public.farm_order_payments(financeiro_id,data_movimentacao desc,criado_em desc);
create index if not exists farm_order_payments_created_by_idx
  on public.farm_order_payments(criado_por);

alter table public.farm_order_financials enable row level security;
alter table public.farm_order_payments enable row level security;

create or replace function farm_private.can_view_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select auth.uid() is not null
    and exists(select 1 from public.farm_profiles p where p.id=auth.uid() and p.active)
    and exists(
      select 1 from public.farm_orders o
      where o.id=p_order_id
        and (farm_private.is_admin() or o.vendedor_id=auth.uid())
    )
$$;

create or replace function farm_private.can_view_financial(p_financial_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.farm_order_financials f
    where f.id=p_financial_id and farm_private.can_view_order(f.pedido_id)
  )
$$;

revoke all on function farm_private.can_view_order(uuid) from public,anon;
revoke all on function farm_private.can_view_financial(uuid) from public,anon;
grant execute on function farm_private.can_view_order(uuid) to authenticated;
grant execute on function farm_private.can_view_financial(uuid) to authenticated;

drop policy if exists farm_order_financials_select_visible on public.farm_order_financials;
create policy farm_order_financials_select_visible
  on public.farm_order_financials for select to authenticated
  using ((select farm_private.can_view_order(pedido_id)));

drop policy if exists farm_order_payments_select_visible on public.farm_order_payments;
create policy farm_order_payments_select_visible
  on public.farm_order_payments for select to authenticated
  using ((select farm_private.can_view_financial(financeiro_id)));

revoke all on table public.farm_order_financials from public,anon;
revoke all on table public.farm_order_payments from public,anon;
revoke insert,update,delete on table public.farm_order_financials from authenticated;
revoke insert,update,delete on table public.farm_order_payments from authenticated;
grant select on table public.farm_order_financials to authenticated;
grant select on table public.farm_order_payments to authenticated;

create or replace function farm_private.recalculate_financial_status(p_financial_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_total numeric(12,2);
  v_received numeric(12,2);
  v_current text;
begin
  select f.valor_total,f.status into v_total,v_current
  from public.farm_order_financials f where f.id=p_financial_id for update;
  if not found then raise exception 'Controle financeiro não encontrado'; end if;
  if v_current in ('cancelado','aguardando_devolucao') then return; end if;
  select coalesce(sum(case when p.tipo='recebimento' then p.valor else -p.valor end),0)
    into v_received from public.farm_order_payments p where p.financeiro_id=p_financial_id;
  update public.farm_order_financials
    set status=case when v_received<=0 then 'pendente' when v_received>=v_total then 'pago' else 'parcial' end,
        atualizado_em=now()
    where id=p_financial_id;
end;
$$;
revoke all on function farm_private.recalculate_financial_status(uuid) from public,anon,authenticated;

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
    where pedido_id=p_order_id and ambiente='desenvolvimento' for update;
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
  select * into v_financial from public.farm_order_financials where id=v_payment.financeiro_id and ambiente='desenvolvimento' for update;
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
    where pedido_id=p_order_id and ambiente='desenvolvimento';
  if not found then raise exception 'Controle financeiro não encontrado'; end if;
end;
$$;

revoke all on function public.farm_register_order_payment(uuid,numeric,date,text,text) from public,anon;
revoke all on function public.farm_reverse_order_payment(uuid,text) from public,anon;
revoke all on function public.farm_update_order_financial(uuid,date,text) from public,anon;
grant execute on function public.farm_register_order_payment(uuid,numeric,date,text,text) to authenticated;
grant execute on function public.farm_reverse_order_payment(uuid,text) to authenticated;
grant execute on function public.farm_update_order_financial(uuid,date,text) to authenticated;

create or replace function farm_private.sync_order_financial()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_received numeric(12,2);
begin
  if new.ambiente<>'desenvolvimento' then return new; end if;
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
revoke all on function farm_private.sync_order_financial() from public,anon,authenticated;

drop trigger if exists farm_orders_sync_financial on public.farm_orders;
create trigger farm_orders_sync_financial
after update of status on public.farm_orders
for each row execute function farm_private.sync_order_financial();

insert into public.farm_order_financials(pedido_id,ambiente,valor_total,status)
select o.id,o.ambiente,greatest(o.valor_total,0),case when o.status='cancelado' then 'cancelado' when o.valor_total<=0 then 'pago' else 'pendente' end
from public.farm_orders o
where o.ambiente='desenvolvimento' and o.status in ('aprovado','em_producao','pronto','entregue')
on conflict(pedido_id) do nothing;

comment on table public.farm_order_financials is 'Controle de recebimento por pedido. Ativado inicialmente apenas no ambiente de desenvolvimento.';
comment on table public.farm_order_payments is 'Histórico imutável de recebimentos e estornos de pedidos.';
