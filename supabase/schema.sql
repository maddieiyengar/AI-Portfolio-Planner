create extension if not exists pgcrypto;

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  portfolio_id text not null,
  portfolio_name text not null,
  finalized_at timestamptz not null,
  client jsonb not null,
  holdings jsonb not null default '[]'::jsonb,
  snapshots jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, portfolio_id)
);

create index if not exists portfolios_user_id_idx on public.portfolios (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists portfolios_set_updated_at on public.portfolios;

create trigger portfolios_set_updated_at
before update on public.portfolios
for each row
execute function public.set_updated_at();

alter table public.portfolios enable row level security;

drop policy if exists "Users can read their own portfolios" on public.portfolios;
create policy "Users can read their own portfolios"
on public.portfolios
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own portfolios" on public.portfolios;
create policy "Users can insert their own portfolios"
on public.portfolios
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own portfolios" on public.portfolios;
create policy "Users can update their own portfolios"
on public.portfolios
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own portfolios" on public.portfolios;
create policy "Users can delete their own portfolios"
on public.portfolios
for delete
to authenticated
using ((select auth.uid()) = user_id);
