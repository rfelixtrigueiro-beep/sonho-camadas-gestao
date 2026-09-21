alter table public.farm_production_orders
  add column if not exists mesas jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.farm_production_orders'::regclass
      and conname = 'farm_production_orders_mesas_array_check'
  ) then
    alter table public.farm_production_orders
      add constraint farm_production_orders_mesas_array_check
      check (jsonb_typeof(mesas) = 'array');
  end if;
end
$$;

comment on column public.farm_production_orders.mesas is
  'Mesas de impressão do card, com duração, consumo de insumo e conclusão.';
