-- Run this in the Supabase SQL editor after storing these Vault secrets:
--
-- select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
-- select vault.create_secret('YOUR_SUPABASE_ANON_OR_SERVICE_ROLE_KEY', 'function_key');
--
-- Supabase scheduled functions use pg_cron + pg_net to call Edge Functions.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

select cron.schedule(
  'booknest-check-new-releases',
  '0 9 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/check-new-releases',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'function_key')
    ),
    body := jsonb_build_object('limit', 30)
  );
  $$
);
