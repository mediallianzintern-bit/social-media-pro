-- 0025 — Pritesh Sir's LinkedIn figures, from LinkedIn's own API.
--
-- The posts scraper finds his posts and gives each one LinkedIn's post ID
-- (share_urn). LinkedIn's Member Post Analytics API, which he connected in
-- 0024, then returns the owner-only figures for that ID: impressions, members
-- reached, saves and sends. Scraping can read none of them.
--
-- linkedin_post_analytics  one row per post, keyed by the scraper's post id
--                          (posts.post_id), refreshed once a day while the
--                          post is under 30 days old and kept after that.
-- linkedin_account_daily   one row per day: his follower count and his 30-day
--                          totals, as LinkedIn reports them.
--
-- Free: LinkedIn's API costs nothing. Read and written by the server only.
-- Idempotent, and safe to re-run.

create table if not exists public.linkedin_post_analytics (
  post_id text primary key,
  share_urn text not null,
  published_at timestamptz,
  impressions integer,
  members_reached integer,
  saves integer,
  sends integer,
  fetched_at timestamptz
);

create table if not exists public.linkedin_account_daily (
  day date primary key,
  followers integer,
  impressions_30d integer,
  members_reached_30d integer,
  captured_at timestamptz not null default now()
);

alter table public.linkedin_post_analytics enable row level security;
alter table public.linkedin_account_daily enable row level security;

comment on table public.linkedin_post_analytics is
  'Owner-only LinkedIn post figures from the Member Post Analytics API. Server-only.';
comment on table public.linkedin_account_daily is
  'Pritesh Sir''s LinkedIn followers and 30-day totals, one row per day. Server-only.';
