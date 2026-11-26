create table public.farm_customers (
  id uuid primary key default gen_random_uuid(),
  ambiente text not null check (ambiente in ('desenvolvimento','producao')),
  nome text not null check (char_length(btrim(nome)) between 1 and 160),
  telefone text,
  email text,
  unique (id, ambiente)
);

alter table public.farm_customers enable row level security;
revoke all on public.farm_customers from public, anon, authenticated;
grant select, insert, update on public.farm_customers to authenticated;
create policy farm_customers_admin_select on public.farm_customers
  for select to authenticated using ((select farm_private.is_admin()));
create policy farm_customers_admin_insert on public.farm_customers
  for insert to authenticated with check ((select farm_private.is_admin()));
create policy farm_customers_admin_update on public.farm_customers
  for update to authenticated using ((select farm_private.is_admin()))
  with check ((select farm_private.is_admin()));

alter table public.farm_orders add column cliente_id uuid;
alter table public.farm_orders add constraint farm_orders_customer_environment_fk
  foreign key (cliente_id, ambiente) references public.farm_customers(id, ambiente);
create index farm_orders_customer_idx on public.farm_orders (cliente_id, ambiente) where cliente_id is not null;
create index farm_customers_environment_name_idx on public.farm_customers (ambiente, nome, id);

create function farm_private.guard_order_customer()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.cliente_id is not null and not farm_private.is_admin() then
      raise exception 'Só um administrador pode vincular clientes.';
    end if;
  elsif (new.cliente_id is distinct from old.cliente_id
     or (old.cliente_id is not null and new.cliente_nome is distinct from old.cliente_nome))
     and not farm_private.is_admin() then
    raise exception 'Peça a um administrador para corrigir o cliente cadastrado.';
  end if;
  if new.cliente_id is not null and farm_private.is_admin() then
    select nome into new.cliente_nome from public.farm_customers
     where id = new.cliente_id and ambiente = new.ambiente;
    if not found then raise exception 'Cliente não encontrado neste ambiente.'; end if;
  end if;
  return new;
end;
$$;
revoke all on function farm_private.guard_order_customer() from public, anon, authenticated;
create trigger farm_orders_guard_customer
before insert or update of cliente_id, cliente_nome on public.farm_orders
for each row execute function farm_private.guard_order_customer();

create function farm_private.sync_customer_name()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  update public.farm_orders
     set cliente_nome = new.nome
   where cliente_id = new.id and ambiente = new.ambiente
     and cliente_nome is distinct from new.nome;
  return new;
end;
$$;
revoke all on function farm_private.sync_customer_name() from public, anon, authenticated;
create trigger farm_customers_sync_name
after update of nome on public.farm_customers
for each row when (new.nome is distinct from old.nome)
execute function farm_private.sync_customer_name();

create function public.farm_link_order_customer(
  p_order_id uuid, p_environment text, p_customer_id uuid default null, p_name text default null
)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  v_order public.farm_orders%rowtype;
  v_customer public.farm_customers%rowtype;
begin
  if not farm_private.is_admin() then raise exception 'Só um administrador pode vincular clientes.'; end if;
  if p_customer_id is not null then
    select * into v_customer from public.farm_customers
     where id = p_customer_id and ambiente = p_environment for share;
    if not found then raise exception 'Cliente não encontrado neste ambiente.'; end if;
  end if;
  select * into v_order from public.farm_orders
   where id = p_order_id and ambiente = p_environment for update;
  if not found then raise exception 'Pedido não encontrado neste ambiente.'; end if;
  if v_order.cliente_id is not null then raise exception 'O pedido já tem um cliente cadastrado. Atualize a lista.'; end if;
  if p_customer_id is null then
    if coalesce(char_length(btrim(p_name)),0) not between 1 and 160 then
      raise exception 'Informe o nome do cliente (até 160 caracteres).';
    end if;
    insert into public.farm_customers (ambiente,nome,telefone,email)
    values (v_order.ambiente,btrim(p_name),v_order.cliente_telefone,v_order.cliente_email)
    returning * into v_customer;
  end if;
  update public.farm_orders set cliente_id = v_customer.id, cliente_nome = v_customer.nome
   where id = v_order.id;
  return v_customer.id;
end;
$$;
revoke all on function public.farm_link_order_customer(uuid,text,uuid,text) from public, anon;
grant execute on function public.farm_link_order_customer(uuid,text,uuid,text) to authenticated;
