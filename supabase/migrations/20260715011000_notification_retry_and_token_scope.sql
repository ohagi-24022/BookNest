alter table public.notification_logs
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_retry_at timestamptz not null default now(),
  add column if not exists last_error text,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz;

create index if not exists notification_logs_retry_idx
  on public.notification_logs(status, next_retry_at, created_at);

alter table public.push_tokens
  drop constraint if exists push_tokens_expo_push_token_key;

create unique index if not exists push_tokens_user_token_unique_idx
  on public.push_tokens(user_id, expo_push_token);
