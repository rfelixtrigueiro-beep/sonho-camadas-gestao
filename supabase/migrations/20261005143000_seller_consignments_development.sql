alter table public.farm_sellers
  add column if not exists modelo_comissao text not null default 'fixa',
  add column if not exists percentual_comissao numeric(5,2) not null default 0,
  add column if not exists forma_pagamento_comissao text,
  add column if not exists observacoes_acordo text;

alter table public.farm_sellers drop constraint if exists farm_sellers_modelo_comissao_check;
alter table public.farm_sellers add constraint farm_sellers_modelo_comissao_check check (modelo_comissao in ('fixa','produto'));
alter table public.farm_sellers drop constraint if exists farm_sellers_percentual_comissao_check;
alter table public.farm_sellers add constraint farm_sellers_percentual_comissao_check check (percentual_comissao between 0 and 100);

alter table public.farm_portfolio_products
  add column if not exists percentual_comissao numeric(5,2),
  add column if not exists desconto_maximo_percentual numeric(5,2) not null default 0;
alter table public.farm_portfolio_products drop constraint if exists farm_portfolio_products_percentual_comissao_check;
alter table public.farm_portfolio_products add constraint farm_portfolio_products_percentual_comissao_check check (percentual_comissao is null or percentual_comissao between 0 and 100);
alter table public.farm_portfolio_products drop constraint if exists farm_portfolio_products_desconto_maximo_check;
alter table public.farm_portfolio_products add constraint farm_portfolio_products_desconto_maximo_check check (desconto_maximo_percentual between 0 and 100);

create sequence if not exists public.farm_consignment_number_seq start 1;

create table if not exists public.farm_consignments (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null default nextval('public.farm_consignment_number_seq'),
  vendedor_id uuid not null references public.farm_sellers(id),
  ambiente text not null default 'desenvolvimento' check (ambiente in ('desenvolvimento','producao')),
  status text not null default 'rascunho' check (status in ('rascunho','enviada','recebida','parcialmente_devolvida','encerrada','cancelada')),
  data_envio date not null default current_date,
  data_prevista_retorno date,
  observacoes text,
  criado_por uuid not null default auth.uid() references auth.users(id),
  confirmado_recebimento_em timestamptz,
  confirmado_recebimento_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (ambiente, numero)
);

create table if not exists public.farm_consignment_items (
  id uuid primary key default gen_random_uuid(),
  remessa_id uuid not null references public.farm_consignments(id) on delete cascade,
  produto_id text not null references public.farm_portfolio_products(airtable_record_id),
  produto_nome text not null,
  categoria text,
  foto_url text,
  quantidade_enviada integer not null check (quantidade_enviada > 0),
  preco_unitario numeric(12,2) not null check (preco_unitario >= 0),
  desconto_maximo_percentual numeric(5,2) not null default 0 check (desconto_maximo_percentual between 0 and 100),
  percentual_comissao numeric(5,2) not null default 0 check (percentual_comissao between 0 and 100),
  criado_em timestamptz not null default now(),
  unique (remessa_id, produto_id)
);

create table if not exists public.farm_consignment_sales (
  id uuid primary key default gen_random_uuid(),
  remessa_item_id uuid not null references public.farm_consignment_items(id),
  vendedor_id uuid not null references public.farm_sellers(id),
  ambiente text not null check (ambiente in ('desenvolvimento','producao')),
  data_venda date not null default current_date,
  quantidade integer not null check (quantidade > 0),
  preco_tabela_unitario numeric(12,2) not null check (preco_tabela_unitario >= 0),
  valor_venda_unitario numeric(12,2) not null check (valor_venda_unitario >= 0),
  valor_total numeric(12,2) generated always as (round(valor_venda_unitario * quantidade,2)) stored,
  desconto_percentual numeric(5,2) not null check (desconto_percentual between 0 and 100),
  percentual_comissao numeric(5,2) not null check (percentual_comissao between 0 and 100),
  valor_comissao numeric(12,2) generated always as (round(valor_venda_unitario * quantidade * percentual_comissao / 100,2)) stored,
  cliente_informado boolean not null default false,
  cliente_nome text,
  observacoes text,
  status text not null default 'informada' check (status in ('informada','aprovada','cancelada')),
  fechamento_id uuid,
  criado_por uuid not null default auth.uid() references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.farm_consignment_occurrences (
  id uuid primary key default gen_random_uuid(),
  remessa_item_id uuid not null references public.farm_consignment_items(id),
  vendedor_id uuid not null references public.farm_sellers(id),
  ambiente text not null check (ambiente in ('desenvolvimento','producao')),
  tipo text not null check (tipo in ('devolucao','perda','avaria')),
  quantidade integer not null check (quantidade > 0),
  data_ocorrencia date not null default current_date,
  tratamento text check (tratamento is null or tratamento in ('absorvido_farm','cobrado_vendedor','compartilhado','outro')),
  valor_responsabilidade numeric(12,2) not null default 0 check (valor_responsabilidade >= 0),
  observacoes text,
  status text not null default 'informada' check (status in ('informada','aprovada','cancelada')),
  fechamento_id uuid,
  criado_por uuid not null default auth.uid() references auth.users(id),
  criado_em timestamptz not null default now()
);

create table if not exists public.farm_seller_closings (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references public.farm_sellers(id),
  ambiente text not null check (ambiente in ('desenvolvimento','producao')),
  competencia date not null check (competencia = date_trunc('month',competencia)::date),
  status text not null default 'em_conferencia' check (status in ('em_conferencia','aprovado','pago','reaberto')),
  total_vendas numeric(12,2) not null default 0,
  total_comissao numeric(12,2) not null default 0,
  total_responsabilidades numeric(12,2) not null default 0,
  valor_liquido numeric(12,2) not null default 0,
  observacoes text,
  aprovado_por uuid references auth.users(id),
  aprovado_em timestamptz,
  pago_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (ambiente, vendedor_id, competencia)
);

alter table public.farm_consignment_sales drop constraint if exists farm_consignment_sales_fechamento_id_fkey;
alter table public.farm_consignment_sales add constraint farm_consignment_sales_fechamento_id_fkey foreign key (fechamento_id) references public.farm_seller_closings(id);
alter table public.farm_consignment_occurrences drop constraint if exists farm_consignment_occurrences_fechamento_id_fkey;
alter table public.farm_consignment_occurrences add constraint farm_consignment_occurrences_fechamento_id_fkey foreign key (fechamento_id) references public.farm_seller_closings(id);

create index if not exists farm_consignments_seller_environment_idx on public.farm_consignments(vendedor_id,ambiente,status);
create index if not exists farm_consignment_items_remessa_idx on public.farm_consignment_items(remessa_id);
create index if not exists farm_consignment_sales_seller_date_idx on public.farm_consignment_sales(vendedor_id,ambiente,data_venda);
create index if not exists farm_consignment_occurrences_seller_date_idx on public.farm_consignment_occurrences(vendedor_id,ambiente,data_ocorrencia);

alter table public.farm_consignments enable row level security;
alter table public.farm_consignment_items enable row level security;
alter table public.farm_consignment_sales enable row level security;
alter table public.farm_consignment_occurrences enable row level security;
alter table public.farm_seller_closings enable row level security;

grant select,insert,update,delete on public.farm_consignments,public.farm_consignment_items,public.farm_consignment_sales,public.farm_consignment_occurrences,public.farm_seller_closings to authenticated;
grant usage,select on sequence public.farm_consignment_number_seq to authenticated;

create policy farm_consignments_select on public.farm_consignments for select to authenticated using (
  farm_private.is_admin() or exists(select 1 from public.farm_sellers s where s.id=vendedor_id and s.usuario_id=(select auth.uid()) and s.ativo)
);
create policy farm_consignments_admin_insert on public.farm_consignments for insert to authenticated with check (farm_private.is_admin());
create policy farm_consignments_admin_update on public.farm_consignments for update to authenticated using (farm_private.is_admin()) with check (farm_private.is_admin());
create policy farm_consignments_admin_delete on public.farm_consignments for delete to authenticated using (farm_private.is_admin());

create policy farm_consignment_items_select on public.farm_consignment_items for select to authenticated using (
  exists(select 1 from public.farm_consignments r where r.id=remessa_id and (farm_private.is_admin() or exists(select 1 from public.farm_sellers s where s.id=r.vendedor_id and s.usuario_id=(select auth.uid()) and s.ativo)))
);
create policy farm_consignment_items_admin_insert on public.farm_consignment_items for insert to authenticated with check (farm_private.is_admin());
create policy farm_consignment_items_admin_update on public.farm_consignment_items for update to authenticated using (farm_private.is_admin()) with check (farm_private.is_admin());
create policy farm_consignment_items_admin_delete on public.farm_consignment_items for delete to authenticated using (farm_private.is_admin());

create policy farm_consignment_sales_select on public.farm_consignment_sales for select to authenticated using (farm_private.is_admin() or exists(select 1 from public.farm_sellers s where s.id=vendedor_id and s.usuario_id=(select auth.uid()) and s.ativo));
create policy farm_consignment_occurrences_select on public.farm_consignment_occurrences for select to authenticated using (farm_private.is_admin() or exists(select 1 from public.farm_sellers s where s.id=vendedor_id and s.usuario_id=(select auth.uid()) and s.ativo));
create policy farm_seller_closings_select on public.farm_seller_closings for select to authenticated using (farm_private.is_admin() or exists(select 1 from public.farm_sellers s where s.id=vendedor_id and s.usuario_id=(select auth.uid()) and s.ativo));

create policy farm_consignment_sales_admin_update on public.farm_consignment_sales for update to authenticated using (farm_private.is_admin()) with check (farm_private.is_admin());
create policy farm_consignment_occurrences_admin_update on public.farm_consignment_occurrences for update to authenticated using (farm_private.is_admin()) with check (farm_private.is_admin());
create policy farm_seller_closings_admin_all on public.farm_seller_closings for all to authenticated using (farm_private.is_admin()) with check (farm_private.is_admin());

create or replace function public.farm_send_consignment(p_remessa_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_remessa public.farm_consignments%rowtype; v_item public.farm_consignment_items%rowtype; v_stock integer; v_count integer:=0;
begin
  if not farm_private.is_admin() then raise exception 'Apenas administradores podem enviar remessas'; end if;
  select * into v_remessa from public.farm_consignments where id=p_remessa_id for update;
  if not found or v_remessa.ambiente<>'desenvolvimento' then raise exception 'Remessa de desenvolvimento não encontrada'; end if;
  if v_remessa.status<>'rascunho' then raise exception 'Somente remessas em rascunho podem ser enviadas'; end if;
  for v_item in select * from public.farm_consignment_items where remessa_id=p_remessa_id for update loop
    select coalesce(estoque,0) into v_stock from public.farm_portfolio_products where airtable_record_id=v_item.produto_id and ativo for update;
    if not found or v_stock<v_item.quantidade_enviada then raise exception 'Estoque insuficiente para %',v_item.produto_nome; end if;
    update public.farm_portfolio_products set estoque=v_stock-v_item.quantidade_enviada,atualizado_em=now() where airtable_record_id=v_item.produto_id;
    v_count:=v_count+v_item.quantidade_enviada;
  end loop;
  if v_count=0 then raise exception 'Adicione ao menos um produto à remessa'; end if;
  update public.farm_consignments set status='enviada',atualizado_em=now() where id=p_remessa_id;
  return jsonb_build_object('status','enviada','quantidade',v_count);
end $$;

create or replace function public.farm_confirm_consignment(p_remessa_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_remessa public.farm_consignments%rowtype;
begin
  select * into v_remessa from public.farm_consignments where id=p_remessa_id for update;
  if not found or v_remessa.ambiente<>'desenvolvimento' then raise exception 'Remessa não encontrada'; end if;
  if not farm_private.is_admin() and not exists(select 1 from public.farm_sellers s where s.id=v_remessa.vendedor_id and s.usuario_id=auth.uid() and s.ativo) then raise exception 'Você não pode confirmar esta remessa'; end if;
  if v_remessa.status<>'enviada' then raise exception 'Esta remessa não aguarda confirmação'; end if;
  update public.farm_consignments set status='recebida',confirmado_recebimento_em=now(),confirmado_recebimento_por=auth.uid(),atualizado_em=now() where id=p_remessa_id;
  return jsonb_build_object('status','recebida');
end $$;

create or replace function public.farm_register_consignment_sale(p_item_id uuid,p_quantity integer,p_unit_value numeric,p_sale_date date,p_customer_name text default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item public.farm_consignment_items%rowtype; v_remessa public.farm_consignments%rowtype; v_seller public.farm_sellers%rowtype; v_used integer; v_discount numeric; v_id uuid;
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
  insert into public.farm_consignment_sales(remessa_item_id,vendedor_id,ambiente,data_venda,quantidade,preco_tabela_unitario,valor_venda_unitario,desconto_percentual,percentual_comissao,cliente_informado,cliente_nome,observacoes)
  values(p_item_id,v_seller.id,'desenvolvimento',coalesce(p_sale_date,current_date),p_quantity,v_item.preco_unitario,p_unit_value,v_discount,v_item.percentual_comissao,nullif(trim(coalesce(p_customer_name,'')),'') is not null,nullif(trim(coalesce(p_customer_name,'')),''),nullif(trim(coalesce(p_notes,'')),'')) returning id into v_id;
  return v_id;
end $$;

create or replace function public.farm_register_consignment_occurrence(p_item_id uuid,p_type text,p_quantity integer,p_date date,p_treatment text default null,p_responsibility_value numeric default 0,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item public.farm_consignment_items%rowtype; v_remessa public.farm_consignments%rowtype; v_seller public.farm_sellers%rowtype; v_used integer; v_id uuid;
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
  if p_type='devolucao' then update public.farm_portfolio_products set estoque=coalesce(estoque,0)+p_quantity,atualizado_em=now() where airtable_record_id=v_item.produto_id; end if;
  insert into public.farm_consignment_occurrences(remessa_item_id,vendedor_id,ambiente,tipo,quantidade,data_ocorrencia,tratamento,valor_responsabilidade,observacoes)
  values(p_item_id,v_seller.id,'desenvolvimento',p_type,p_quantity,coalesce(p_date,current_date),case when p_type='devolucao' then null else p_treatment end,coalesce(p_responsibility_value,0),nullif(trim(coalesce(p_notes,'')),'')) returning id into v_id;
  update public.farm_consignments set status='parcialmente_devolvida',atualizado_em=now() where id=v_remessa.id and p_type='devolucao';
  return v_id;
end $$;

create or replace function public.farm_close_seller_month(p_seller_id uuid,p_competence date,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_start date:=date_trunc('month',p_competence)::date; v_end date:=(date_trunc('month',p_competence)+interval '1 month')::date; v_id uuid; v_sales numeric; v_commission numeric; v_responsibility numeric;
begin
  if not farm_private.is_admin() then raise exception 'Apenas administradores podem fechar o mês'; end if;
  select coalesce(sum(valor_total),0),coalesce(sum(valor_comissao),0) into v_sales,v_commission from public.farm_consignment_sales where vendedor_id=p_seller_id and ambiente='desenvolvimento' and status='informada' and data_venda>=v_start and data_venda<v_end;
  select coalesce(sum(valor_responsabilidade),0) into v_responsibility from public.farm_consignment_occurrences where vendedor_id=p_seller_id and ambiente='desenvolvimento' and status='informada' and data_ocorrencia>=v_start and data_ocorrencia<v_end;
  insert into public.farm_seller_closings(vendedor_id,ambiente,competencia,status,total_vendas,total_comissao,total_responsabilidades,valor_liquido,observacoes,aprovado_por,aprovado_em)
  values(p_seller_id,'desenvolvimento',v_start,'aprovado',v_sales,v_commission,v_responsibility,greatest(v_commission-v_responsibility,0),nullif(trim(coalesce(p_notes,'')),''),auth.uid(),now())
  on conflict(ambiente,vendedor_id,competencia) do update set status='aprovado',total_vendas=excluded.total_vendas,total_comissao=excluded.total_comissao,total_responsabilidades=excluded.total_responsabilidades,valor_liquido=excluded.valor_liquido,observacoes=excluded.observacoes,aprovado_por=auth.uid(),aprovado_em=now(),atualizado_em=now() returning id into v_id;
  update public.farm_consignment_sales set status='aprovada',fechamento_id=v_id,atualizado_em=now() where vendedor_id=p_seller_id and ambiente='desenvolvimento' and status='informada' and data_venda>=v_start and data_venda<v_end;
  update public.farm_consignment_occurrences set status='aprovada',fechamento_id=v_id where vendedor_id=p_seller_id and ambiente='desenvolvimento' and status='informada' and data_ocorrencia>=v_start and data_ocorrencia<v_end;
  return v_id;
end $$;

revoke all on function public.farm_send_consignment(uuid) from public,anon;
revoke all on function public.farm_confirm_consignment(uuid) from public,anon;
revoke all on function public.farm_register_consignment_sale(uuid,integer,numeric,date,text,text) from public,anon;
revoke all on function public.farm_register_consignment_occurrence(uuid,text,integer,date,text,numeric,text) from public,anon;
revoke all on function public.farm_close_seller_month(uuid,date,text) from public,anon;
grant execute on function public.farm_send_consignment(uuid) to authenticated;
grant execute on function public.farm_confirm_consignment(uuid) to authenticated;
grant execute on function public.farm_register_consignment_sale(uuid,integer,numeric,date,text,text) to authenticated;
grant execute on function public.farm_register_consignment_occurrence(uuid,text,integer,date,text,numeric,text) to authenticated;
grant execute on function public.farm_close_seller_month(uuid,date,text) to authenticated;
