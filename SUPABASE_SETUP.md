# Supabase setup

Run this SQL in the Supabase SQL Editor if app inserts fail with `permission denied for table books`.

```sql
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.books to authenticated;

alter table public.books enable row level security;

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
```

The full migration, including table creation and indexes, is in:

`supabase/migrations/20260629140000_books_permissions.sql`
