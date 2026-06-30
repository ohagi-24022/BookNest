create unique index if not exists books_user_isbn_unique
on public.books (user_id, isbn)
where isbn is not null;
