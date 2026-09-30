-- 0013 — content eras: when this account changed what it was doing.
--
-- Addendum D. Every comparison in this system is against the account's own
-- history — vsMedian, lane share, the §7 scorecard, the breakout multiple —
-- and history stops being a fair comparison the moment the account
-- deliberately changed. An account that spent six months on AI tool workflows
-- and then pivoted to marketing stunts has a median describing neither period.
-- Judging today's reel against it credits or blames it for a decision someone
-- made on purpose months ago.
--
-- Why now, on an account with one client and a year of data: the boundary has
-- to be recorded WHEN IT HAPPENS, or it has to be reconstructed later from
-- memory. Detection can propose a date from the data (see src/lib/eras.ts) but
-- only the team knows whether a shift was a decision or a quiet month, and
-- that knowledge decays. The table is cheap today and archaeology later.
--
-- Idempotent, and safe to re-run.

create table if not exists public.content_eras (
  id uuid primary key default gen_random_uuid(),

  platform text not null check (platform in ('instagram', 'linkedin')),
  handle text not null,

  -- The era runs from here until the next era's start, or until now for the
  -- most recent one. An open end rather than a stored end date: storing both
  -- lets them disagree, and they did nothing a computed end cannot.
  starts_at date not null,

  -- What the team was trying to do. Free text on purpose — this is the one
  -- column holding intent, which is exactly the thing no amount of scraping
  -- produces and no enum anticipates.
  label text not null,
  note text,

  -- How this boundary came to exist. A date a person set is worth more than
  -- one a detector proposed, and the two must stay distinguishable: the
  -- detector reads output and can only ever see the CONSEQUENCES of a decision,
  -- usually a few posts late.
  origin text not null default 'manual' check (origin in ('manual', 'detected')),

  -- The detector's score and evidence for a proposed boundary, kept so a
  -- person can see why it was suggested and disagree with it. Null for a
  -- boundary someone set themselves.
  detection jsonb,

  created_at timestamptz not null default now(),

  -- One era per start date per account. Re-running detection updates the row
  -- rather than stacking duplicates on the same day.
  unique (platform, handle, starts_at)
);

-- "Which era is this post in?" resolves to a descending scan for the latest
-- start on or before a date, which is the access pattern for every read.
create index if not exists content_eras_lookup_idx
  on public.content_eras (platform, handle, starts_at desc);

alter table public.content_eras enable row level security;

comment on table public.content_eras is
  'Strategy-change markers. An era is a span during which an account pursued one strategy; comparisons against an account''s own history are only fair within one.';
