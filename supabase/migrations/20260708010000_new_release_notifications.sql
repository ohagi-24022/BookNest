create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.series_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_key text not null,
  series_title text not null,
  latest_known_volume integer,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, series_key)
);

create table if not exists public.publication_checks (
  id uuid primary key default gen_random_uuid(),
  series_key text not null,
  series_title text not null,
  latest_volume integer,
  source text,
  checked_at timestamptz not null default now(),
  raw jsonb
);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_key text not null,
  series_title text not null,
  volume_number integer,
  notification_title text,
  expo_push_token text,
  status text not null default 'pending',
  response jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, series_key, volume_number)
);

alter table public.push_tokens enable row level security;
alter table public.series_subscriptions enable row level security;
alter table public.publication_checks enable row level security;
alter table public.notification_logs enable row level security;

create policy "Users can manage their own push tokens"
  on public.push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own series subscriptions"
  on public.series_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Authenticated users can read publication checks"
  on public.publication_checks
  for select
  using (auth.role() = 'authenticated');

create policy "Users can read their own notification logs"
  on public.notification_logs
  for select
  using (auth.uid() = user_id);

create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);
create index if not exists series_subscriptions_enabled_idx
  on public.series_subscriptions(enabled, series_key);
create index if not exists publication_checks_series_checked_idx
  on public.publication_checks(series_key, checked_at desc);
create index if not exists notification_logs_user_series_idx
  on public.notification_logs(user_id, series_key);
