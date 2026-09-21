alter table public.farm_production_orders
  add column if not exists origem_produto text not null default 'novo',
  add column if not exists criar_no_portfolio boolean not null default false,
  add column if not exists estoque_lancado_em timestamptz,
  add column if not exists produto_portfolio_criado_id text;

alter table public.farm_production_orders
  drop constraint if exists farm_production_orders_origem_produto_check;
alter table public.farm_production_orders
  add constraint farm_production_orders_origem_produto_check
  check (origem_produto in ('novo','portfolio'));

update public.farm_production_orders
set origem_produto='portfolio'
where produto_id is not null;

create index if not exists farm_production_orders_created_portfolio_product_idx
  on public.farm_production_orders(produto_portfolio_criado_id)
  where produto_portfolio_criado_id is not null;

create or replace function farm_private.complete_manual_production_stock()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_product_id text;
begin
  if new.ambiente<>'desenvolvimento'
     or new.pedido_id is not null
     or new.status<>'pronto'
     or new.estoque_lancado_em is not null then
    return new;
  end if;

  if new.origem_produto='portfolio' then
    if new.produto_id is null then
      raise exception 'Selecione um produto do Portfólio antes de finalizar';
    end if;
    update public.farm_portfolio_products
      set estoque=greatest(coalesce(estoque,0),0)+new.quantidade,
          atualizado_em=now()
      where airtable_record_id=new.produto_id
        and ativo=true
        and excluido_em is null;
    if not found then raise exception 'O produto selecionado não está mais disponível no Portfólio'; end if;
    new.estoque_lancado_em:=now();
  elsif new.criar_no_portfolio then
    v_product_id:='producao-'||replace(new.id::text,'-','');
    insert into public.farm_portfolio_products(
      airtable_record_id,nome,categoria,preco_venda,tempo_producao_h,ativo,
      observacoes,estoque,link_produto,foto_urls,exibir_portfolio,atualizado_em
    ) values(
      v_product_id,new.produto_nome,null,null,null,true,
      new.detalhes,new.quantidade,new.link_referencia,new.foto_urls,false,now()
    )
    on conflict(airtable_record_id) do update
      set estoque=greatest(coalesce(public.farm_portfolio_products.estoque,0),excluded.estoque),
          atualizado_em=now();
    new.produto_id:=v_product_id;
    new.produto_portfolio_criado_id:=v_product_id;
    new.estoque_lancado_em:=now();
  end if;
  return new;
end;
$$;

revoke all on function farm_private.complete_manual_production_stock() from public,anon,authenticated;

drop trigger if exists farm_production_complete_manual_stock on public.farm_production_orders;
create trigger farm_production_complete_manual_stock
before insert or update of status,produto_id,origem_produto,criar_no_portfolio
on public.farm_production_orders
for each row execute function farm_private.complete_manual_production_stock();

comment on column public.farm_production_orders.origem_produto is
  'No card manual, informa se a produção usa um produto existente do Portfólio ou um produto novo.';
comment on column public.farm_production_orders.criar_no_portfolio is
  'Quando verdadeiro, cria o produto novo como oculto no Portfólio ao finalizar a produção manual.';
comment on column public.farm_production_orders.estoque_lancado_em is
  'Impede que a mesma produção manual seja lançada mais de uma vez no estoque.';
