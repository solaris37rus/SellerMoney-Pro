-- SellerMoney Pro — Telegram registration migration
-- Run this if you already applied the old schema.sql before.

create extension if not exists "pgcrypto";

create table if not exists public.telegram_users (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null unique,
  chat_id text,
  username text,
  first_name text,
  last_name text,
  language_code text,
  is_bot boolean not null default false,
  email text,
  linked_user_id uuid references auth.users(id) on delete set null,
  source_payload text,
  raw jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

alter table public.telegram_users enable row level security;

drop trigger if exists telegram_users_touch on public.telegram_users;
create trigger telegram_users_touch before update on public.telegram_users for each row execute function public.touch_updated_at();

create index if not exists idx_telegram_users_telegram_id on public.telegram_users(telegram_id);
create index if not exists idx_telegram_users_username on public.telegram_users(username);
create index if not exists idx_telegram_users_linked_user on public.telegram_users(linked_user_id);
