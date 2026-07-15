create index if not exists server_operation_logs_metadata_gin_idx
  on public.server_operation_logs using gin (metadata);

create index if not exists server_operation_logs_proxy_rate_limit_idx
  on public.server_operation_logs(operation, provider, created_at desc);
