-- 0032 — What each LinkedIn post is about, analysed from its full text, and
-- the lanes and competitors built on that analysis.
--
-- LinkedIn lanes were built from the first 300 characters of 30 posts, and
-- competitors were found by job title and bio. Both now start from what the
-- posts actually say (server/ai/linkedin-content.ts):
--
-- linkedin_content    one row per analysed post, Pritesh Sir's and each
--                     competitor's alike: its subject, topic, format,
--                     structure, hook, takeaway and audience.
-- content_proposals   lanes or a competitor shortlist proposed from that
--                     analysis, held for the team to approve before it
--                     replaces what the dashboard uses.
--
-- Server-only. Idempotent.

create table if not exists public.linkedin_content (
  post_id text primary key,
  handle text not null,
  analysis jsonb not null,
  analysed_at timestamptz not null default now()
);

create index if not exists linkedin_content_handle on public.linkedin_content (handle);

create table if not exists public.content_proposals (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  kind text not null check (kind in ('lanes', 'competitors')),
  proposal jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'discarded')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

alter table public.linkedin_content enable row level security;
alter table public.content_proposals enable row level security;
