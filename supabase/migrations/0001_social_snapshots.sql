-- Social Command Center — snapshot history.
--
-- Apify returns a point-in-time view of a public profile. Trend lines are built
-- by STORING each sync, so this schema is append-only for account metrics and
-- upsert-by-post for content metrics.
--
-- All access goes through the server using the service-role key, so RLS is
-- enabled with no policies: anon/authenticated clients get nothing.

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram', 'linkedin')),
  -- Apify run id; null for runs the app started but could not attribute.
  apify_run_id text,
  status text not null default 'ok' check (status in ('ok', 'error')),
  error text,
  -- 'manual' when someone pressed Sync, 'schedule' when ingested from Apify's scheduler.
  trigger text not null default 'manual' check (trigger in ('manual', 'schedule')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- One row per platform per sync. This table IS the follower growth curve.
create table if not exists public.account_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.sync_runs (id) on delete set null,
  platform text not null check (platform in ('instagram', 'linkedin')),
  handle text not null,
  -- 'owner' is Pritesh; 'competitor' rows power the benchmarking table.
  role text not null default 'owner' check (role in ('owner', 'competitor')),
  display_name text,
  headline text,
  followers integer,
  following integer,
  posts_count integer,
  captured_at timestamptz not null default now()
);

create index if not exists account_snapshots_series_idx
  on public.account_snapshots (platform, handle, captured_at desc);

-- Latest known state of each post. Engagement keeps climbing after publication,
-- so this is upserted rather than appended.
create table if not exists public.post_metrics (
  platform text not null check (platform in ('instagram', 'linkedin')),
  post_id text not null,
  handle text not null,
  url text,
  caption text,
  format text,
  published_at timestamptz,
  views integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  -- Pinned posts sit at the top of a profile for months and distort cadence and
  -- engagement rate, so derived metrics exclude them.
  pinned boolean not null default false,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (platform, post_id)
);

create index if not exists post_metrics_published_idx
  on public.post_metrics (platform, published_at desc);

-- Cached AI analysis, one row per platform. Regenerating replaces the row:
-- history of past analyses is not useful, and the payload is large.
create table if not exists public.ai_analyses (
  platform text primary key check (platform in ('instagram', 'linkedin')),
  payload jsonb not null,
  model text,
  generated_at timestamptz not null default now()
);

-- Competitors found by the discovery pipeline. Distinct from the env-configured
-- list so a rediscovery never silently drops a hand-picked account.
create table if not exists public.competitor_watchlist (
  platform text not null check (platform in ('instagram', 'linkedin')),
  handle text not null,
  added_at timestamptz not null default now(),
  primary key (platform, handle)
);

alter table public.competitor_watchlist enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.sync_runs enable row level security;
alter table public.account_snapshots enable row level security;
alter table public.post_metrics enable row level security;
