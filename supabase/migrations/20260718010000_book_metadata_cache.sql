create table if not exists public.book_metadata_cache (
  id uuid primary key default gen_random_uuid(),
  isbn text,
  normalized_isbn text,
  title text not null,
  subtitle text,
  series_title text,
  series_key text,
  volume_number integer,
  author text,
  publisher text,
  description text,
  thumbnail_url text,
  source text not null check (source in ('Google Books', 'OpenBD', 'Rakuten Books')),
  source_url text,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (normalized_isbn is not null or (series_key is not null and volume_number is not null))
);

create unique index if not exists book_metadata_cache_normalized_isbn_key
  on public.book_metadata_cache (normalized_isbn)
  where normalized_isbn is not null;

create unique index if not exists book_metadata_cache_series_volume_key
  on public.book_metadata_cache (series_key, volume_number)
  where normalized_isbn is null and series_key is not null and volume_number is not null;

create index if not exists book_metadata_cache_series_key_idx
  on public.book_metadata_cache (series_key);

create index if not exists book_metadata_cache_expires_at_idx
  on public.book_metadata_cache (expires_at);

alter table public.book_metadata_cache enable row level security;

grant select on public.book_metadata_cache to anon, authenticated;
grant insert, update on public.book_metadata_cache to authenticated;

drop policy if exists "Anyone can read book metadata cache" on public.book_metadata_cache;
create policy "Anyone can read book metadata cache"
  on public.book_metadata_cache
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can insert book metadata cache" on public.book_metadata_cache;
create policy "Authenticated users can insert book metadata cache"
  on public.book_metadata_cache
  for insert
  to authenticated
  with check (auth.uid() is not null);

drop policy if exists "Authenticated users can update book metadata cache" on public.book_metadata_cache;
create policy "Authenticated users can update book metadata cache"
  on public.book_metadata_cache
  for update
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
