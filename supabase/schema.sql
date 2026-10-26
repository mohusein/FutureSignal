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
set search_path = public
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
set search_path = public, auth
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
