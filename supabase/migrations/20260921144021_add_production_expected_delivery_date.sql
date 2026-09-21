alter table public.farm_production_orders
  add column if not exists data_prevista_entrega date;

comment on column public.farm_production_orders.data_prevista_entrega is
  'Data prevista de entrega opcional do card de produção.';
