-- 0019 — reels found by search, from accounts nobody is tracking.
--
-- "Rising on <platform>" only ever sees the handful of accounts configured by
-- hand. A reel that went off in this niche from anyone else was invisible,
-- however well it worked. This table holds reels found by searching Instagram
-- for each of the account's own content lanes.
--
-- The gate is the LANE, not the account: a reel is stored only when its
-- caption matches one of this creator's lanes (src/lib/lane-fit.ts). That is
-- what keeps a search of the open platform relevant instead of a firehose.
--
-- APPEND-ONLY BY DESIGN. Each search adds what it found and never clears what
-- came before, so the pool grows with every refresh. That is what stops the
-- list emptying out when the team crosses the reels they do not want: a cross
-- hides one reel, it does not exhaust the shelf.
--
-- Idempotent, and safe to re-run.

create table if not exists public.discovered_reels (
  id uuid primary key default gen_random_uuid(),

  platform text not null check (platform in ('instagram', 'linkedin')),

  -- The platform's own id for the post, which is what a vote is keyed on.
  post_id text not null,
  url text not null,
  creator_handle text,

  caption text not null default '',
  views bigint,
  likes bigint,
  comments bigint,

  -- Derived from the post id, which encodes the publish time. The search
  -- itself returns no date, and the Top tab reaches back years, so without
  -- this there is no way to tell this week's breakout from one from 2023.
  published_at timestamptz,

  -- The creator's own lane this reel matched, and the evidence for it. The
  -- matched words are stored so a wrong match can be argued with rather than
  -- taken on trust.
  lane text,
  lane_fit numeric,
  matched_words text[],

  -- The search that found it. Rotating through queries is what makes a second
  -- refresh return something new rather than the same top posts again.
  query text,

  found_at timestamptz not null default now(),

  -- One row per post, however many searches surface it.
  unique (platform, post_id)
);

create index if not exists discovered_reels_platform_idx
  on public.discovered_reels (platform, found_at desc);

create index if not exists discovered_reels_lane_idx
  on public.discovered_reels (platform, lane);

alter table public.discovered_reels enable row level security;

comment on table public.discovered_reels is
  'Reels found by searching Instagram for this account''s content lanes, from creators nobody is tracking. Append-only: each search adds to the pool.';
