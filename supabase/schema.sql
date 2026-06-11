-- SellerMoney Pro — Supabase schema
-- Run this in Supabase SQL Editor once.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  telegram_chat_id text,
  telegram_user jsonb,
  plan text not null default 'free' check (plan in ('free','start','pro','business')),
  plan_until timestamptz,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  marketplace text not null default 'wildberries',
  category text not null default 'custom',
  price numeric not null default 0,
  cost numeric not null default 0,
  packaging numeric not null default 0,
  logistics numeric not null default 0,
  storage numeric not null default 0,
  return_logistics numeric not null default 0,
  commission_pct numeric not null default 0,
  acquiring_pct numeric not null default 0,
  ads_pct numeric not null default 0,
  returns_pct numeric not null default 0,
  tax_mode text not null default 'usn6',
  sales_per_month numeric not null default 0,
  profit numeric not null default 0,
  margin numeric not null default 0,
  roi numeric not null default 0,
  breakeven_price numeric not null default 0,
  status text not null default 'good' check (status in ('good','warn','bad')),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  provider text not null default 'yoomoney',
  external_id text,
  label text unique,
  plan text not null check (plan in ('start','pro','business')),
  amount numeric not null,
  currency text not null default 'RUB',
  status text not null default 'pending' check (status in ('pending','waiting_for_capture','succeeded','canceled','failed')),
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  plan text not null check (plan in ('start','pro','business')),
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  payment_id uuid references public.payments(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  code text not null unique,
  status text not null default 'pending' check (status in ('pending','confirmed','expired')),
  telegram_chat_id text,
  telegram_user jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.payments enable row level security;
alter table public.subscriptions enable row level security;
alter table public.telegram_links enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "products_select_own" on public.products for select using (auth.uid() = user_id);
create policy "products_insert_own" on public.products for insert with check (auth.uid() = user_id);
create policy "products_update_own" on public.products for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "products_delete_own" on public.products for delete using (auth.uid() = user_id);

create policy "payments_select_own" on public.payments for select using (auth.uid() = user_id);
create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);
create policy "telegram_links_select_own" on public.telegram_links for select using (auth.uid() = user_id);
create policy "telegram_links_insert_own" on public.telegram_links for insert with check (auth.uid() = user_id);

create index if not exists idx_products_user_created on public.products(user_id, created_at desc);
create index if not exists idx_payments_label on public.payments(label);
create index if not exists idx_payments_external on public.payments(external_id);
create index if not exists idx_telegram_links_code on public.telegram_links(code);
