create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  isbn text,
  title text not null,
  series_title text not null,
  volume_number integer,
  author text,
  thumbnail_url text,
  status text not null default 'unread' check (status in ('unread', 'reading', 'read')),
  created_at timestamptz not null default now()
);

alter table public.books enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.books to authenticated;

drop policy if exists "Users can read own books" on public.books;
create policy "Users can read own books"
  on public.books
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own books" on public.books;
create policy "Users can insert own books"
  on public.books
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own books" on public.books;
create policy "Users can update own books"
  on public.books
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own books" on public.books;
create policy "Users can delete own books"
  on public.books
  for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists books_user_id_created_at_idx
  on public.books (user_id, created_at desc);

create index if not exists books_user_id_series_volume_idx
  on public.books (user_id, series_title, volume_number);
