-- 0026 — Pritesh Sir's LinkedIn Discovery and Engagement, day by day.
--
-- His LinkedIn Content analytics screen shows, for any period: impressions and
-- members reached (Discovery), and reactions, comments, reposts, saves and sends
-- (Engagement). LinkedIn's Member Post Analytics API returns the same figures
-- for his whole account, day by day (UTC days, as his screen says).
--
-- linkedin_member_daily  one row per UTC day, refreshed once a day for the last
--                        180 days, so any period the dashboard shows is a sum
--                        of stored days and costs no call to view.
-- linkedin_reach_cache   members reached is a count of distinct people, so it
--                        cannot be summed from days. It is asked for per period
--                        when a period is first viewed, and kept for a day.
--
-- Free: LinkedIn's API costs nothing. Server-only. Idempotent.

create table if not exists public.linkedin_member_daily (
  day date primary key,
  impressions integer,
  reactions integer,
  comments integer,
  reposts integer,
  saves integer,
  sends integer,
  fetched_at timestamptz not null default now()
);

create table if not exists public.linkedin_reach_cache (
  period text primary key,
  members_reached integer,
  fetched_at timestamptz not null default now()
);

alter table public.linkedin_member_daily enable row level security;
alter table public.linkedin_reach_cache enable row level security;

comment on table public.linkedin_member_daily is
  'Pritesh Sir''s LinkedIn impressions and engagement per UTC day, from LinkedIn''s API. Server-only.';
comment on table public.linkedin_reach_cache is
  'Members reached per period (start..end), from LinkedIn''s API, kept a day. Server-only.';
