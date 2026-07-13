create table if not exists public.wanted_manga (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  normalized_title text not null,
  score integer not null default 70 check (score between 1 and 100),
  note text,
  purchase_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, normalized_title)
);

alter table public.wanted_manga enable row level security;

create policy "Users can manage own wanted manga"
  on public.wanted_manga
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.wanted_manga to authenticated;
grant usage on schema public to anon, authenticated;

create or replace function public.get_wanted_manga_rankings(limit_count integer default 20)
returns table (
  title text,
  want_count bigint,
  average_score numeric,
  top_score integer
)
language sql
security definer
set search_path = public
as $$
  select
    (array_agg(title order by score desc, updated_at desc))[1] as title,
    count(*) as want_count,
    round(avg(score)::numeric, 1) as average_score,
    max(score) as top_score
  from public.wanted_manga
  group by normalized_title
  order by count(*) desc, avg(score) desc, max(updated_at) desc
  limit greatest(1, least(coalesce(limit_count, 20), 50));
$$;

revoke all on function public.get_wanted_manga_rankings(integer) from public;
grant execute on function public.get_wanted_manga_rankings(integer) to anon, authenticated;
