-- 0023 — finding new creators by itself (AI tool workflows, phase 3).
--
-- Once a week the finder searches Instagram with the lane's learned search
-- terms (lane_patterns, 0022), checks every account it finds against the
-- learned pattern through Instagram's own API (free), and adds the ones that
-- clearly make this kind of content to watched_creators as role 'found'.
-- Found creators are re-checked on every sync and retired when they drift off
-- the subject or stop posting. The search is the only paid step: it runs only
-- under a monthly cap (CREATOR_SEARCH_MONTHLY_USD), and every run's cost is
-- recorded here.
--
-- Idempotent, and safe to re-run.

alter table public.watched_creators add column if not exists fit numeric;
alter table public.watched_creators add column if not exists found_by text;
alter table public.watched_creators add column if not exists last_checked timestamptz;
alter table public.watched_creators add column if not exists retired_reason text;

create table if not exists public.creator_search_runs (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram')),
  lane text not null,
  ran_at timestamptz not null default now(),
  terms text[] not null default '{}',
  candidates integer not null default 0,
  checked integer not null default 0,
  added integer not null default 0,
  cost_usd numeric not null default 0,
  note text
);

create index if not exists creator_search_runs_platform_idx
  on public.creator_search_runs (platform, ran_at desc);

alter table public.creator_search_runs enable row level security;

comment on table public.creator_search_runs is
  'Every paid creator search: terms, what it found, what was added, and what it cost.';
