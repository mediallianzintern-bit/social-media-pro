-- What a suggestion actually did, frozen at a defined moment.
--
-- This is deliberately NOT a live query over post_metrics, and the difference
-- is the whole reason the table exists:
--
--   • post_metrics upserts, so engagement keeps climbing — the numerator moves.
--   • vsMedian is relative to the account's median at read time, so as the
--     account grows an old post's score drifts without the post changing.
--   • readPosts caps at 60 rows; at roughly five posts a week a suggestion's
--     post falls out of the read window after ~11 weeks and its result silently
--     reverts to "not measured yet" forever.
--
-- Calibration back-tests predictions against actuals, and none of that works
-- against a number that changes every time you look at it. So an outcome is a
-- measurement taken once, at a stated maturity, with the baseline it was scored
-- against stored alongside it — which also makes any figure here re-checkable
-- later rather than merely trusted.
create table if not exists public.outcomes (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.suggested_ideas (id) on delete cascade,
  -- Reserved for the multi-client foundation (Layer 2). Nullable now so that
  -- work does not have to migrate this table a second time.
  client_id uuid,
  platform text not null check (platform in ('instagram', 'linkedin')),
  post_id text not null,
  -- The platform's stable post identifier, as stored on suggested_ideas.
  published_shortcode text not null,
  published_at timestamptz,
  measured_at timestamptz not null default now(),
  -- How old the post was when this reading was taken. Part of the unique key so
  -- a later 1-day / 7-day / 30-day cadence needs no schema change.
  maturity_days integer not null,

  -- Public signal — exists for every account.
  views integer,
  likes integer,
  comments integer,
  shares integer,

  -- Owner-measured signal — only where a Graph token covered the post. Null
  -- means not measured, never zero.
  reach integer,
  saved integer,
  avg_watch_ms integer,

  -- Frozen derived figures. baseline_median is stored so vs_median can be
  -- re-derived and audited rather than taken on faith.
  vs_median numeric,
  baseline_median numeric,
  save_rate_pct numeric,
  share_rate_pct numeric,

  -- The lane at measurement time; lanes can be reclassified later.
  content_lane text,

  -- Set when a post was found but deliberately not scored — currently only
  -- 'pinned'. Recorded rather than dropped so the scorecard can say why a
  -- suggestion is missing instead of miscounting it as still pending.
  excluded_reason text,

  unique (suggestion_id, maturity_days)
);

create index if not exists outcomes_platform_idx
  on public.outcomes (platform, measured_at desc);

alter table public.outcomes enable row level security;

comment on column public.suggested_ideas.published_shortcode is
  'The platform''s stable post identifier: an Instagram shortcode, or a LinkedIn activity id.';
