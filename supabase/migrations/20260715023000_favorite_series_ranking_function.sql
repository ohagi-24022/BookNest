create or replace function public.get_favorite_series_rankings(limit_count integer default 20)
returns table (
  title text,
  cover_url text,
  want_count bigint,
  average_score numeric,
  top_score integer,
  favorite_count bigint,
  owner_count bigint,
  owned_volume_count bigint,
  popularity_score numeric
)
language sql
security definer
set search_path = public
as $$
  with favorites as (
    select
      series_key as ranking_key,
      (array_agg(series_title order by updated_at desc))[1] as title,
      (array_agg(cover_url order by (cover_url is null), updated_at desc))[1] as cover_url,
      count(*) as favorite_count,
      max(owned_volume_count) as favorite_owned_volume_count
    from public.favorite_series
    group by series_key
  ),
  owned as (
    select
      lower(
        regexp_replace(
          coalesce(nullif(series_title, ''), title),
          '[[:space:]\[\]()]',
          '',
          'g'
        )
      ) as ranking_key,
      (array_agg(thumbnail_url order by (thumbnail_url is null), volume_number nulls last, created_at asc))[1] as cover_url,
      count(distinct user_id) as owner_count,
      count(*) as owned_volume_count
    from public.books
    group by lower(
      regexp_replace(
        coalesce(nullif(series_title, ''), title),
        '[[:space:]\[\]()]',
        '',
        'g'
      )
    )
  )
  select
    favorites.title,
    coalesce(owned.cover_url, favorites.cover_url) as cover_url,
    0::bigint as want_count,
    0::numeric as average_score,
    0::integer as top_score,
    favorites.favorite_count,
    coalesce(owned.owner_count, 0) as owner_count,
    coalesce(owned.owned_volume_count, favorites.favorite_owned_volume_count, 0) as owned_volume_count,
    (
      favorites.favorite_count::numeric * 2
      + coalesce(owned.owner_count, 0)::numeric * 3
      + least(coalesce(owned.owned_volume_count, favorites.favorite_owned_volume_count, 0), 100)::numeric * 0.1
    ) as popularity_score
  from favorites
  left join owned using (ranking_key)
  where favorites.title is not null
  order by favorites.favorite_count desc, owner_count desc, owned_volume_count desc, favorites.title asc
  limit greatest(1, least(coalesce(limit_count, 20), 100));
$$;

revoke all on function public.get_favorite_series_rankings(integer) from public;
grant execute on function public.get_favorite_series_rankings(integer) to authenticated;
