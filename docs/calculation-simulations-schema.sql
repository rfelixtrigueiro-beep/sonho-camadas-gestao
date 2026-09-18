create table if not exists public.farm_calculation_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  ambiente text not null check (ambiente in ('desenvolvimento', 'producao')),
  nome text not null check (char_length(trim(nome)) between 1 and 160),
  sheet jsonb not null check (jsonb_typeof(sheet) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists farm_calculation_simulations_owner_environment_updated_idx
  on public.farm_calculation_simulations (user_id, ambiente, updated_at desc);

alter table public.farm_calculation_simulations enable row level security;
revoke all on public.farm_calculation_simulations from anon, authenticated;
grant select, insert, update, delete on public.farm_calculation_simulations to authenticated;

create policy "Admins can read their calculation simulations"
  on public.farm_calculation_simulations for select to authenticated
  using (user_id = (select auth.uid()) and (select farm_private.is_admin()));

create policy "Admins can create their calculation simulations"
  on public.farm_calculation_simulations for insert to authenticated
  with check (user_id = (select auth.uid()) and (select farm_private.is_admin()));

create policy "Admins can update their calculation simulations"
  on public.farm_calculation_simulations for update to authenticated
  using (user_id = (select auth.uid()) and (select farm_private.is_admin()))
  with check (user_id = (select auth.uid()) and (select farm_private.is_admin()));

create policy "Admins can delete their calculation simulations"
  on public.farm_calculation_simulations for delete to authenticated
  using (user_id = (select auth.uid()) and (select farm_private.is_admin()));
