alter table public.farm_consignment_sales
  add column if not exists grupo_venda_id uuid,
  add column if not exists forma_pagamento text,
  add column if not exists comprovante_paths text[] not null default '{}';

alter table public.farm_consignment_sales
  drop constraint if exists farm_consignment_sales_forma_pagamento_check;
alter table public.farm_consignment_sales
  add constraint farm_consignment_sales_forma_pagamento_check
  check (forma_pagamento is null or forma_pagamento in ('Pix','Dinheiro','Cartão de débito','Cartão de crédito','Transferência','Outro'));

create index if not exists farm_consignment_sales_group_idx
  on public.farm_consignment_sales(grupo_venda_id)
  where grupo_venda_id is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'consignment-receipts',
  'consignment-receipts',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists farm_consignment_receipts_insert on storage.objects;
create policy farm_consignment_receipts_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='consignment-receipts'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists farm_consignment_receipts_select on storage.objects;
create policy farm_consignment_receipts_select
on storage.objects for select to authenticated
using (
  bucket_id='consignment-receipts'
  and (
    farm_private.is_admin()
    or (storage.foldername(name))[1]=(select auth.uid())::text
    or exists(
      select 1
      from public.farm_consignment_sales sale
      join public.farm_sellers seller on seller.id=sale.vendedor_id
      where name=any(sale.comprovante_paths)
        and seller.usuario_id=(select auth.uid())
        and seller.ativo=true
    )
  )
);

drop policy if exists farm_consignment_receipts_delete on storage.objects;
create policy farm_consignment_receipts_delete
on storage.objects for delete to authenticated
using (
  bucket_id='consignment-receipts'
  and (
    farm_private.is_admin()
    or (storage.foldername(name))[1]=(select auth.uid())::text
  )
);

create or replace function public.farm_register_consignment_sales(
  p_items jsonb,
  p_sale_date date,
  p_customer_name text,
  p_notes text,
  p_sale_group_id uuid,
  p_payment_method text,
  p_receipt_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_entry jsonb;
  v_item_id uuid;
  v_quantity integer;
  v_unit_value numeric;
  v_item public.farm_consignment_items%rowtype;
  v_remittance public.farm_consignments%rowtype;
  v_seller_id uuid;
  v_sale_id uuid;
  v_sale_ids uuid[]:='{}';
  v_total numeric:=0;
  v_total_quantity integer:=0;
  v_count integer:=0;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Selecione ao menos uma peça para a venda';
  end if;
  if p_sale_group_id is null then
    raise exception 'Identificador da venda inválido';
  end if;
  if p_payment_method not in ('Pix','Dinheiro','Cartão de débito','Cartão de crédito','Transferência','Outro') then
    raise exception 'Forma de pagamento inválida';
  end if;
  if coalesce(array_length(p_receipt_paths,1),0)>10 then
    raise exception 'É permitido anexar até 10 comprovantes';
  end if;
  if exists(
    select 1 from unnest(coalesce(p_receipt_paths,'{}'::text[])) path
    where path not like (select auth.uid())::text||'/%'
  ) then
    raise exception 'Caminho de comprovante inválido';
  end if;
  if (
    select count(*)<>count(distinct value->>'item_id')
    from jsonb_array_elements(p_items)
  ) then
    raise exception 'Uma peça não pode ser repetida na mesma venda';
  end if;

  -- Bloqueia e valida todas as peças antes de registrar qualquer linha da venda.
  for v_entry in select value from jsonb_array_elements(p_items) order by value->>'item_id' loop
    begin
      v_item_id:=(v_entry->>'item_id')::uuid;
      v_quantity:=(v_entry->>'quantidade')::integer;
      v_unit_value:=(v_entry->>'valor_unitario')::numeric;
    exception when others then
      raise exception 'Dados de uma das peças são inválidos';
    end;
    if v_quantity is null or v_quantity<=0 or v_unit_value is null or v_unit_value<0 then
      raise exception 'Quantidade e valor devem ser válidos';
    end if;

    select * into v_item
    from public.farm_consignment_items
    where id=v_item_id
    for update;
    if not found then raise exception 'Produto consignado não encontrado'; end if;

    select * into v_remittance
    from public.farm_consignments
    where id=v_item.remessa_id;
    if not found or v_remittance.ambiente<>'desenvolvimento' or v_remittance.status not in ('recebida','parcialmente_devolvida') then
      raise exception 'Remessa indisponível para venda';
    end if;
    if v_seller_id is null then v_seller_id:=v_remittance.vendedor_id;
    elsif v_seller_id<>v_remittance.vendedor_id then
      raise exception 'Todas as peças da venda devem pertencer ao mesmo vendedor';
    end if;
  end loop;

  for v_entry in select value from jsonb_array_elements(p_items) order by value->>'item_id' loop
    v_item_id:=(v_entry->>'item_id')::uuid;
    v_quantity:=(v_entry->>'quantidade')::integer;
    v_unit_value:=(v_entry->>'valor_unitario')::numeric;
    v_sale_id:=public.farm_register_consignment_sale(
      v_item_id,
      v_quantity,
      v_unit_value,
      coalesce(p_sale_date,current_date),
      p_customer_name,
      p_notes
    );
    update public.farm_consignment_sales
    set grupo_venda_id=p_sale_group_id,
        forma_pagamento=p_payment_method,
        comprovante_paths=coalesce(p_receipt_paths,'{}'::text[]),
        atualizado_em=now()
    where id=v_sale_id;
    v_sale_ids:=array_append(v_sale_ids,v_sale_id);
    v_total:=v_total+round(v_quantity*v_unit_value,2);
    v_total_quantity:=v_total_quantity+v_quantity;
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object(
    'grupo_venda_id',p_sale_group_id,
    'vendas',to_jsonb(v_sale_ids),
    'itens',v_count,
    'quantidade',v_total_quantity,
    'valor_total',round(v_total,2),
    'comprovantes',coalesce(array_length(p_receipt_paths,1),0)
  );
end
$$;

revoke all on function public.farm_register_consignment_sales(jsonb,date,text,text,uuid,text,text[]) from public,anon;
grant execute on function public.farm_register_consignment_sales(jsonb,date,text,text,uuid,text,text[]) to authenticated;
