create table if not exists public.server_operation_logs (
  id uuid primary key default gen_random_uuid(),
  operation text not null,
  provider text,
  status text not null default 'ok',
  request_count integer not null default 1,
  duration_ms integer,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.server_operation_logs enable row level security;

drop policy if exists "Authenticated users can read server operation logs" on public.server_operation_logs;
create policy "Authenticated users can read server operation logs"
  on public.server_operation_logs
  for select
  using (auth.role() = 'authenticated');

grant select on public.server_operation_logs to authenticated;
grant select, insert, update, delete on public.server_operation_logs to service_role;

create index if not exists server_operation_logs_created_idx
  on public.server_operation_logs(created_at desc);

create index if not exists server_operation_logs_operation_created_idx
  on public.server_operation_logs(operation, created_at desc);
