alter table public.farm_portfolio_products
  add column if not exists largura_cm numeric null,
  add column if not exists altura_cm numeric null;

alter table public.farm_portfolio_products
  drop constraint if exists farm_portfolio_products_largura_cm_nonnegative,
  add constraint farm_portfolio_products_largura_cm_nonnegative
    check (largura_cm is null or largura_cm >= 0),
  drop constraint if exists farm_portfolio_products_altura_cm_nonnegative,
  add constraint farm_portfolio_products_altura_cm_nonnegative
    check (altura_cm is null or altura_cm >= 0);
