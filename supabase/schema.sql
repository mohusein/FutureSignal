-- FutureSignal community comments (Supabase Postgres)
-- Run this in Supabase SQL Editor before configuring the static site.

create table if not exists public.site_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.article_comments (
  id uuid primary key default gen_random_uuid(),
  article_slug text not null check (article_slug ~ '^[a-z0-9-]{1,100}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists article_comments_public_feed
  on public.article_comments (article_slug, created_at)
  where status = 'approved';
create index if not exists article_comments_author_queue
  on public.article_comments (user_id, created_at desc);

create or replace function public.is_site_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.site_moderators
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_site_moderator() from public;
grant execute on function public.is_site_moderator() to anon, authenticated;

create or replace function public.prepare_article_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to comment';
  end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  if (
    select count(*) from public.article_comments
    where user_id = auth.uid()
      and created_at > now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'Please wait before posting another comment';
  end if;

  select coalesce(
    nullif(btrim(raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(email, '@', 1), ''),
    'Reader'
  )
  into account_name
  from auth.users
  where id = auth.uid();

  new.user_id := auth.uid();
  new.display_name := left(account_name, 80);
  new.status := 'pending';
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists prepare_article_comment on public.article_comments;
create trigger prepare_article_comment
before insert on public.article_comments
for each row execute function public.prepare_article_comment();

alter table public.site_moderators enable row level security;
alter table public.article_comments enable row level security;

drop policy if exists "moderators can read their own membership" on public.site_moderators;
create policy "moderators can read their own membership"
  on public.site_moderators for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "read approved own or moderation queue comments" on public.article_comments;
create policy "read approved own or moderation queue comments"
  on public.article_comments for select to anon, authenticated
  using (
    status = 'approved'
    or user_id = (select auth.uid())
    or public.is_site_moderator()
  );

drop policy if exists "signed-in readers submit pending comments" on public.article_comments;
create policy "signed-in readers submit pending comments"
  on public.article_comments for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

drop policy if exists "moderators review comments" on public.article_comments;
create policy "moderators review comments"
  on public.article_comments for update to authenticated
  using (public.is_site_moderator())
  with check (public.is_site_moderator() and status in ('pending', 'approved', 'rejected'));

revoke all on public.site_moderators from anon, authenticated;
revoke all on public.article_comments from anon, authenticated;
grant select on public.article_comments to anon, authenticated;
grant insert (article_slug, body) on public.article_comments to authenticated;
grant update (status) on public.article_comments to authenticated;

-- Privacy-preserving analytics: one aggregate count per article per day.
-- No IP addresses, cookies, or visitor identifiers are collected.
create table if not exists public.article_daily_views (
  article_slug text not null check (article_slug in (
    'ai-software-engineering', 'how-websites-work', 'quantum-computing'
  )),
  view_date date not null default current_date,
  total_views bigint not null default 0 check (total_views >= 0),
  primary key (article_slug, view_date)
);

alter table public.article_daily_views enable row level security;
revoke all on public.article_daily_views from anon, authenticated;

create or replace function public.record_article_view(p_article_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_article_slug not in (
    'ai-software-engineering', 'how-websites-work', 'quantum-computing'
  ) then
    return;
  end if;

  insert into public.article_daily_views (article_slug, view_date, total_views)
  values (p_article_slug, current_date, 1)
  on conflict (article_slug, view_date)
  do update set total_views = public.article_daily_views.total_views + 1;
end;
$$;

revoke all on function public.record_article_view(text) from public;
grant execute on function public.record_article_view(text) to anon, authenticated;

create or replace function public.get_site_analytics()
returns table (
  article_slug text,
  total_views bigint,
  views_30_days bigint,
  approved_comments bigint,
  pending_comments bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_site_moderator() then
    raise exception 'Site owner access required';
  end if;

  return query
  with article_slugs as (
    select 'ai-software-engineering'::text as article_slug
    union select 'how-websites-work'::text
    union select 'quantum-computing'::text
    union select v.article_slug from public.article_daily_views v
    union
    select c.article_slug from public.article_comments c
  ), views as (
    select v.article_slug,
      sum(v.total_views)::bigint as all_time,
      (sum(v.total_views) filter (where v.view_date >= current_date - 29))::bigint as recent
    from public.article_daily_views v
    group by v.article_slug
  ), comments as (
    select c.article_slug,
      count(*) filter (where c.status = 'approved')::bigint as approved,
      count(*) filter (where c.status = 'pending')::bigint as pending
    from public.article_comments c
    group by c.article_slug
  )
  select a.article_slug,
    coalesce(v.all_time, 0),
    coalesce(v.recent, 0),
    coalesce(c.approved, 0),
    coalesce(c.pending, 0)
  from article_slugs a
  left join views v on v.article_slug = a.article_slug
  left join comments c on c.article_slug = a.article_slug
  order by coalesce(v.recent, 0) desc, a.article_slug;
end;
$$;

revoke all on function public.get_site_analytics() from public;
grant execute on function public.get_site_analytics() to authenticated;


-- Reader engagement. Only each user's own reaction/bookmark rows are readable;
-- public reaction totals are exposed through an aggregate-only RPC.
create table if not exists public.article_reactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  article_slug text not null check (article_slug in (
    'ai-software-engineering', 'how-websites-work', 'quantum-computing'
  )),
  reaction_type text not null check (reaction_type in ('helpful', 'insightful', 'thought-provoking')),
  created_at timestamptz not null default now(),
  primary key (user_id, article_slug, reaction_type)
);

create table if not exists public.article_bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  article_slug text not null check (article_slug in (
    'ai-software-engineering', 'how-websites-work', 'quantum-computing'
  )),
  created_at timestamptz not null default now(),
  primary key (user_id, article_slug)
);

alter table public.article_reactions enable row level security;
alter table public.article_bookmarks enable row level security;

drop policy if exists "read own article reactions" on public.article_reactions;
create policy "read own article reactions" on public.article_reactions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "read own article bookmarks" on public.article_bookmarks;
create policy "read own article bookmarks" on public.article_bookmarks
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "save own article bookmarks" on public.article_bookmarks;
create policy "save own article bookmarks" on public.article_bookmarks
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "remove own article bookmarks" on public.article_bookmarks;
create policy "remove own article bookmarks" on public.article_bookmarks
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.article_reactions, public.article_bookmarks from anon, authenticated;
grant select on public.article_reactions to authenticated;
grant select, insert, delete on public.article_bookmarks to authenticated;

create or replace function public.get_article_reaction_counts(p_article_slug text)
returns table (reaction_type text, total_reactions bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select kinds.kind, count(r.user_id)::bigint
  from (values ('helpful'::text), ('insightful'::text), ('thought-provoking'::text)) as kinds(kind)
  left join public.article_reactions r
    on r.reaction_type = kinds.kind and r.article_slug = p_article_slug
  group by kinds.kind
  order by kinds.kind;
$$;

revoke all on function public.get_article_reaction_counts(text) from public;
grant execute on function public.get_article_reaction_counts(text) to anon, authenticated;

create or replace function public.toggle_article_reaction(p_article_slug text, p_reaction_type text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_rows bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in to react to an article';
  end if;
  if p_article_slug not in ('ai-software-engineering', 'how-websites-work', 'quantum-computing')
     or p_reaction_type not in ('helpful', 'insightful', 'thought-provoking') then
    raise exception 'Invalid article reaction';
  end if;

  delete from public.article_reactions
  where user_id = auth.uid()
    and article_slug = p_article_slug
    and reaction_type = p_reaction_type;
  get diagnostics removed_rows = row_count;
  if removed_rows > 0 then
    return false;
  end if;

  insert into public.article_reactions (user_id, article_slug, reaction_type)
  values (auth.uid(), p_article_slug, p_reaction_type)
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.toggle_article_reaction(text, text) from public;
grant execute on function public.toggle_article_reaction(text, text) to authenticated;
