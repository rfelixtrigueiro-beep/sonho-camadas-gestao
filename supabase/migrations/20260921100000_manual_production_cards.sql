alter table public.farm_production_orders
  alter column pedido_id drop not null,
  alter column item_pedido_id drop not null;

comment on column public.farm_production_orders.pedido_id is
  'Pedido de origem. Nulo quando o card de produção é criado manualmente.';

comment on column public.farm_production_orders.item_pedido_id is
  'Item do pedido de origem. Nulo quando o card de produção é criado manualmente.';
