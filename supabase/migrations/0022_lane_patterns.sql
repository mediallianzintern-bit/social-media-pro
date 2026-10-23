-- 0022 — what a reel in a creator-fed lane looks like, learned (AI tool
-- workflows, phase 2).
--
-- The vocabulary of the lane (words, phrases, hashtags) learned from the
-- watched creators' own posts against a background of ordinary news and the
-- account's other lanes (src/lib/creator-pattern.ts). Kept here between runs so
-- it is not relearned on every sync; rebuilt monthly or from the Data sources
-- page. Every term carries the counts behind it, so the pattern can be checked.
--
-- Idempotent, and safe to re-run.

create table if not exists public.lane_patterns (
  id uuid primary key default gen_random_uuid(),

  platform text not null check (platform in ('instagram', 'linkedin')),
  lane text not null,

  -- The whole learned pattern: terms with their weights and counts, the pass
  -- mark, how many posts it was learned from, and the search terms for phase 3.
  pattern jsonb not null,

  built_at timestamptz not null default now(),

  unique (platform, lane)
);

alter table public.lane_patterns enable row level security;

comment on table public.lane_patterns is
  'Learned vocabulary of a creator-fed content lane: terms, weights, counts and pass mark.';
