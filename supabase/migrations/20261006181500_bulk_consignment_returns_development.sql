create or replace function public.farm_register_consignment_returns(
  p_items jsonb,
  p_date date,
  p_notes text default null
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
  v_item public.farm_consignment_items%rowtype;
  v_remittance public.farm_consignments%rowtype;
  v_seller_id uuid;
  v_occurrence_id uuid;
  v_occurrence_ids uuid[]:='{}';
  v_total_quantity integer:=0;
  v_count integer:=0;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Selecione ao menos uma peça para a devolução';
  end if;
  if (
    select count(*)<>count(distinct value->>'item_id')
    from jsonb_array_elements(p_items)
  ) then
    raise exception 'Uma peça não pode ser repetida na mesma devolução';
  end if;

  -- Bloqueia e valida todas as peças antes de devolver qualquer quantidade ao estoque.
  for v_entry in select value from jsonb_array_elements(p_items) order by value->>'item_id' loop
    begin
      v_item_id:=(v_entry->>'item_id')::uuid;
      v_quantity:=(v_entry->>'quantidade')::integer;
    exception when others then
      raise exception 'Dados de uma das peças são inválidos';
    end;
    if v_quantity is null or v_quantity<=0 then
      raise exception 'A quantidade devolvida deve ser maior que zero';
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
      raise exception 'Remessa indisponível para devolução';
    end if;
    if v_seller_id is null then v_seller_id:=v_remittance.vendedor_id;
    elsif v_seller_id<>v_remittance.vendedor_id then
      raise exception 'Todas as peças da devolução devem pertencer ao mesmo vendedor';
    end if;
  end loop;

  for v_entry in select value from jsonb_array_elements(p_items) order by value->>'item_id' loop
    v_item_id:=(v_entry->>'item_id')::uuid;
    v_quantity:=(v_entry->>'quantidade')::integer;
    v_occurrence_id:=public.farm_register_consignment_occurrence(
      v_item_id,
      'devolucao',
      v_quantity,
      coalesce(p_date,current_date),
      null,
      0,
      p_notes
    );
    v_occurrence_ids:=array_append(v_occurrence_ids,v_occurrence_id);
    v_total_quantity:=v_total_quantity+v_quantity;
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object(
    'ocorrencias',to_jsonb(v_occurrence_ids),
    'itens',v_count,
    'quantidade',v_total_quantity
  );
end
$$;

revoke all on function public.farm_register_consignment_returns(jsonb,date,text) from public,anon;
grant execute on function public.farm_register_consignment_returns(jsonb,date,text) to authenticated;
