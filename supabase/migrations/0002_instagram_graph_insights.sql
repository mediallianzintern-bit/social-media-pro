-- Owner-only Instagram metrics, from the Meta Graph API.
--
-- Kept in the existing post_metrics row rather than a side table: these describe
-- the same post as the public numbers beside them, and every read path already
-- selects that row. All columns are NULLABLE on purpose — null means "not
-- measured" (a competitor's post, or one outside the Graph window), which is a
-- different fact from a measured zero, and the UI renders the two differently.

alter table public.post_metrics
  add column if not exists reach integer,
  add column if not exists saved integer,
  add column if not exists avg_watch_ms integer,
  add column if not exists total_watch_ms bigint,
  add column if not exists follows integer,
  add column if not exists profile_visits integer,
  -- Distinguishes a Graph-sourced share count from Apify's hardcoded 0.
  add column if not exists insights_at timestamptz;

-- Account-level totals and audience demographics. Append-only like
-- account_snapshots, so the audience mix can be compared over time later.
create table if not exists public.account_insights (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram', 'linkedin')),
  handle text not null,
  -- { account: {...}, audience: {...}, postsMeasured: n } — shape follows
  -- InstagramInsights in src/lib/analytics-types.ts.
  payload jsonb not null,
  captured_at timestamptz not null default now()
);

create index if not exists account_insights_series_idx
  on public.account_insights (platform, handle, captured_at desc);

alter table public.account_insights enable row level security;
