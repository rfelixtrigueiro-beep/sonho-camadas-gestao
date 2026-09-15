alter table public.farm_orders
  add column if not exists aprovado_em timestamptz,
  add column if not exists aprovado_por uuid references public.farm_profiles(id) on delete set null,
  add column if not exists decisao_observacao text;

alter table public.farm_order_items
  add column if not exists tipo text not null default 'portfolio',
  add column if not exists detalhes text,
  add column if not exists link_referencia text,
  add column if not exists foto_urls text[] not null default '{}',
  add column if not exists estoque_baixado integer not null default 0,
  add column if not exists producao_necessaria integer not null default 0;

alter table public.farm_order_items
  drop constraint if exists farm_order_items_tipo_check,
  add constraint farm_order_items_tipo_check check (tipo in ('portfolio','novo_produto')),
  drop constraint if exists farm_order_items_estoque_baixado_check,
  add constraint farm_order_items_estoque_baixado_check check (estoque_baixado >= 0 and estoque_baixado <= quantidade),
  drop constraint if exists farm_order_items_producao_necessaria_check,
  add constraint farm_order_items_producao_necessaria_check check (producao_necessaria >= 0 and producao_necessaria <= quantidade);

create table if not exists public.farm_production_orders (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.farm_orders(id) on delete cascade,
  item_pedido_id uuid not null references public.farm_order_items(id) on delete cascade,
  produto_id text references public.farm_portfolio_products(airtable_record_id) on delete set null,
  produto_nome text not null,
  quantidade integer not null check (quantidade > 0),
  status text not null default 'analise_produto' check (status in ('analise_produto','aguardando_producao','em_impressao','acabamento','pronto','cancelado')),
  detalhes text,
  link_referencia text,
  foto_urls text[] not null default '{}',
  ambiente text not null default 'desenvolvimento' check (ambiente in ('desenvolvimento','producao')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (item_pedido_id)
);

create index if not exists farm_production_orders_status_idx on public.farm_production_orders (ambiente,status,criado_em desc);
create index if not exists farm_production_orders_pedido_idx on public.farm_production_orders (pedido_id);
create index if not exists farm_production_orders_produto_idx on public.farm_production_orders (produto_id);
create index if not exists farm_orders_aprovado_por_idx on public.farm_orders (aprovado_por);
alter table public.farm_production_orders enable row level security;

drop policy if exists "farm_production_select_visible" on public.farm_production_orders;
create policy "farm_production_select_visible" on public.farm_production_orders for select to authenticated using (
  exists (select 1 from public.farm_profiles p where p.id=(select auth.uid()) and p.active=true)
  and ((select farm_private.is_admin()) or exists (select 1 from public.farm_orders o where o.id=pedido_id and o.vendedor_id=(select auth.uid())))
);
drop policy if exists "farm_production_admin_insert" on public.farm_production_orders;
create policy "farm_production_admin_insert" on public.farm_production_orders for insert to authenticated with check ((select farm_private.is_admin()));
drop policy if exists "farm_production_admin_update" on public.farm_production_orders;
create policy "farm_production_admin_update" on public.farm_production_orders for update to authenticated using ((select farm_private.is_admin())) with check ((select farm_private.is_admin()));
grant select,insert,update on public.farm_production_orders to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('orders','orders',true,10485760,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "order_images_authenticated_select" on storage.objects;
create policy "order_images_authenticated_select" on storage.objects for select to authenticated using (bucket_id='orders');
drop policy if exists "order_images_owner_insert" on storage.objects;
create policy "order_images_owner_insert" on storage.objects for insert to authenticated with check (bucket_id='orders' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "order_images_owner_update" on storage.objects;
create policy "order_images_owner_update" on storage.objects for update to authenticated using (bucket_id='orders' and owner_id=(select auth.uid()::text)) with check (bucket_id='orders' and owner_id=(select auth.uid()::text));
drop policy if exists "order_images_owner_delete" on storage.objects;
create policy "order_images_owner_delete" on storage.objects for delete to authenticated using (bucket_id='orders' and owner_id=(select auth.uid()::text));

create or replace function public.farm_approve_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_order public.farm_orders%rowtype;
  v_item public.farm_order_items%rowtype;
  v_stock integer;
  v_deducted integer;
  v_shortage integer;
  v_total_deducted integer := 0;
  v_total_production integer := 0;
begin
  if not exists(select 1 from public.farm_profiles where id=auth.uid() and active=true and role='administrador') then raise exception 'Apenas administradores podem aprovar pedidos'; end if;
  select * into v_order from public.farm_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.status <> 'aguardando_aprovacao' then raise exception 'Este pedido não está aguardando aprovação'; end if;

  for v_item in select * from public.farm_order_items where pedido_id=p_order_id order by criado_em for update loop
    v_deducted:=0; v_shortage:=v_item.quantidade;
    if v_item.produto_id is not null then
      select greatest(coalesce(estoque,0),0) into v_stock from public.farm_portfolio_products where airtable_record_id=v_item.produto_id for update;
      if found then
        v_deducted:=least(v_item.quantidade,v_stock);
        v_shortage:=v_item.quantidade-v_deducted;
        update public.farm_portfolio_products set estoque=v_stock-v_deducted,atualizado_em=now() where airtable_record_id=v_item.produto_id;
      end if;
    end if;
    update public.farm_order_items set estoque_baixado=v_deducted,producao_necessaria=v_shortage where id=v_item.id;
    v_total_deducted:=v_total_deducted+v_deducted; v_total_production:=v_total_production+v_shortage;
    if v_shortage>0 then
      insert into public.farm_production_orders (pedido_id,item_pedido_id,produto_id,produto_nome,quantidade,status,detalhes,link_referencia,foto_urls,ambiente)
      values (p_order_id,v_item.id,v_item.produto_id,v_item.produto_nome,v_shortage,'analise_produto',v_item.detalhes,v_item.link_referencia,v_item.foto_urls,v_order.ambiente)
      on conflict (item_pedido_id) do nothing;
    end if;
  end loop;
  update public.farm_orders set status=case when v_total_production>0 then 'em_producao' else 'aprovado' end,aprovado_em=now(),aprovado_por=auth.uid(),decisao_observacao=null,atualizado_em=now() where id=p_order_id;
  return jsonb_build_object('estoque_baixado',v_total_deducted,'producao_criada',v_total_production,'status',case when v_total_production>0 then 'em_producao' else 'aprovado' end);
end;
$$;
revoke all on function public.farm_approve_order(uuid) from public;
revoke all on function public.farm_approve_order(uuid) from anon;
grant execute on function public.farm_approve_order(uuid) to authenticated;
