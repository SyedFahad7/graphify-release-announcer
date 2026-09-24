-- Release announcer approval queue. Written by the Vercel app (service role).
-- Run in Supabase Dashboard → SQL Editor → New query → Run.

create table if not exists public.release_drafts (
  tag text primary key,
  status text not null check (status in ('seeded', 'pending', 'sent', 'skipped')),
  name text,
  url text,
  published_at timestamptz,
  paste_text text,
  post_text text,
  source text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists release_drafts_status_idx
  on public.release_drafts (status, published_at desc);

alter table public.release_drafts enable row level security;

comment on table public.release_drafts is
  'Graphify Studio release drafts. Cron queues pending rows; Send marks them sent. No anon access.';
