create or replace function public.farm_validate_production_plate_quantities()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_total integer;
  v_all_completed boolean;
begin
  if jsonb_array_length(new.mesas) = 0 then
    if new.status in ('acabamento', 'pronto') then
      raise exception 'Cadastre e conclua as mesas antes de enviar para Acabamento';
    end if;
    return new;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.mesas) as mesa
    where not (mesa ? 'quantidade')
       or coalesce(mesa->>'quantidade', '') !~ '^[0-9]+$'
  ) then
    raise exception 'Informe uma quantidade inteira e não negativa para cada mesa';
  end if;

  select
    coalesce(sum((mesa->>'quantidade')::integer), 0),
    coalesce(bool_and(coalesce((mesa->>'concluida')::boolean, false)), false)
  into v_total, v_all_completed
  from jsonb_array_elements(new.mesas) as mesa;

  if v_total <> new.quantidade then
    raise exception 'A soma das quantidades das mesas (%) deve ser igual à quantidade do card (%)', v_total, new.quantidade;
  end if;

  if new.status in ('acabamento', 'pronto') and not v_all_completed then
    raise exception 'Conclua todas as mesas antes de enviar para Acabamento';
  end if;

  return new;
end;
$$;

comment on function public.farm_validate_production_plate_quantities() is
  'Valida a distribuição da quantidade entre mesas e bloqueia acabamento antes da conclusão.';
