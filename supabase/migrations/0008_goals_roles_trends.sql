-- Foundation for Addenda A (growth goal), B (roles & workflow) and C (trend listener).
--
-- One migration because the three addenda share a spine: all of them hang off
-- `clients`, which did not exist. Layer 2 was always the prerequisite the
-- earlier audit named, and every one of these tables needs it.
--
-- client_id is added NULLABLE everywhere, exactly as outcomes.client_id and
-- predictions.client_id already were. That is deliberate: the system runs
-- single-client today, so backfilling a NOT NULL would either invent a tenant or
-- block the migration. Making it non-null is a later, separate step once real
-- clients exist and RLS policies land with it.

-- ---------------------------------------------------------------------------
-- Addendum A.1 — the client, and its growth goal
-- ---------------------------------------------------------------------------

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  display_name text not null,
  -- The niche label predictions and fitted models are keyed on.
  niche text,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  -- When the agency started managing this account. A.2's "since engagement
  -- start" is measured from here, so it is a stored fact, not an inference
  -- from whenever the first snapshot happens to have been captured.
  engagement_start date,

  -- A.1: the objective the platform optimizes toward. A human decision made by
  -- the account lead in the dashboard — the system enforces it and must never
  -- guess it, which is why there is no default beyond the safest one.
  growth_goal text not null default 'grow_following'
    check (growth_goal in ('grow_following', 'drive_leads', 'maximize_reach', 'build_authority')),
  -- The single metric growth is judged on. Defaulted from the goal, overridable.
  primary_metric text not null default 'follower_growth_rate',
  -- Supporting signals to watch, explicitly NOT to optimize against.
  secondary_metrics text[] not null default '{}',
  -- Optional explicit target or rate the growth manager sets.
  target jsonb,

  -- Which accounts this client owns, per platform. Kept here rather than in a
  -- join table while there is exactly one handle per platform per client.
  instagram_handle text,
  linkedin_handle text
);

-- ---------------------------------------------------------------------------
-- Addendum B.6 — people, and who works which client
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text unique,
  role text not null
    check (role in ('growth_manager', 'creator', 'editor', 'team_manager'))
);

create table if not exists public.client_assignments (
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  -- The role this person plays ON THIS CLIENT, which need not equal their
  -- global role: someone can be a creator on one account and an editor on
  -- another.
  role text not null
    check (role in ('growth_manager', 'creator', 'editor', 'team_manager')),
  assigned_at timestamptz not null default now(),
  primary key (client_id, user_id, role)
);

-- ---------------------------------------------------------------------------
-- Addendum B.3 — the status lifecycle that turns a report into a workspace
-- ---------------------------------------------------------------------------

alter table public.suggested_ideas
  add column if not exists client_id uuid references public.clients (id) on delete cascade,
  add column if not exists approved_by uuid references public.users (id),
  add column if not exists assigned_to uuid references public.users (id),
  add column if not exists produced_by uuid references public.users (id),
  add column if not exists approved_at timestamptz,
  add column if not exists production_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists measured_at timestamptz;

-- Extend the lifecycle: idea -> approved -> in production -> published -> measured.
--
-- 'used' is KEPT rather than renamed. It is the value the existing code writes
-- when a creator links a permalink, and it is what readUsedSuggestions and the
-- outcome capture both match on. Renaming it would be a data migration plus a
-- code change in the one path that feeds the entire learning loop — not worth
-- the risk for a nicer word. It means exactly 'published'.
alter table public.suggested_ideas drop constraint if exists suggested_ideas_status_check;
alter table public.suggested_ideas add constraint suggested_ideas_status_check
  check (status in (
    'suggested',      -- generated, awaiting a growth manager
    'approved',       -- growth manager approved it
    'in_production',  -- creator/editor is working on it
    'used',           -- published; the legacy name, still the one code writes
    'published',      -- published; the spec's name, accepted as a synonym
    'measured',       -- an outcome has been captured against it
    'dismissed'
  ));

-- C.5: trend-sourced ideas are labelled so the learning loop can later measure
-- whether trend-driven suggestions actually perform for this client.
alter table public.suggested_ideas drop constraint if exists suggested_ideas_source_signal_check;
alter table public.suggested_ideas add constraint suggested_ideas_source_signal_check
  check (source_signal is null or source_signal in ('owner', 'niche', 'niche_trend'));

-- ---------------------------------------------------------------------------
-- Addendum C.2 — trend storage, so momentum can be COMPUTED rather than asserted
-- ---------------------------------------------------------------------------

-- Append-only: one row per detected item per niche per listening run. The
-- history is the point — a topic seen once is not a trend, and momentum only
-- exists by comparing readings across runs.
create table if not exists public.trend_observations (
  id uuid primary key default gen_random_uuid(),
  observed_at timestamptz not null default now(),
  niche text not null,
  platform text check (platform in ('instagram', 'linkedin')),
  -- What kind of thing is rising.
  kind text not null default 'topic' check (kind in ('topic', 'format', 'hook', 'sound')),
  -- The verbatim label as the feed returned it. Never paraphrased by a model.
  label text not null,
  -- A public-signal strength reading. Public only, per the two-signal rule: no
  -- owner-measured figure belongs in a cross-account trend.
  strength numeric,
  -- The query that surfaced it, so a surprising trend can be traced back.
  from_query text,
  -- Real posts that establish the trend, so the team can judge it rather than
  -- trust the label (C.4).
  evidence jsonb not null default '[]'::jsonb
);

create index if not exists trend_observations_niche_idx
  on public.trend_observations (niche, label, observed_at desc);

-- Replace-per-trend: the current computed state. Momentum is derived in
-- TypeScript from the observations above — never stated by an agent.
create table if not exists public.trend_signals (
  niche text not null,
  label text not null,
  kind text not null default 'topic',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  observations integer not null default 1,
  -- Latest reading and the change that produced the momentum call.
  latest_strength numeric,
  previous_strength numeric,
  momentum text not null default 'steady' check (momentum in ('rising', 'steady', 'fading')),
  -- True while too few observations exist to treat the momentum as a result —
  -- the same thin-sample discipline used for lanes and predictions.
  directional boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (niche, label)
);

-- ---------------------------------------------------------------------------
-- Layer 2 — client scoping on the existing tables (nullable; see header)
-- ---------------------------------------------------------------------------

alter table public.account_snapshots add column if not exists client_id uuid references public.clients (id) on delete cascade;
alter table public.post_metrics      add column if not exists client_id uuid references public.clients (id) on delete cascade;
alter table public.account_insights  add column if not exists client_id uuid references public.clients (id) on delete cascade;
alter table public.content_taxonomy  add column if not exists client_id uuid references public.clients (id) on delete cascade;
alter table public.ai_analyses       add column if not exists client_id uuid references public.clients (id) on delete cascade;

alter table public.clients             enable row level security;
alter table public.users               enable row level security;
alter table public.client_assignments  enable row level security;
alter table public.trend_observations  enable row level security;
alter table public.trend_signals       enable row level security;

-- Seed the single client this system currently manages, so the growth goal has
-- somewhere to live before multi-tenancy lands. Idempotent.
insert into public.clients (display_name, niche, engagement_start, growth_goal, primary_metric,
                            secondary_metrics, instagram_handle, linkedin_handle)
select 'Dr. Pritesh Patel', 'digital marketing', current_date, 'grow_following',
       'follower_growth_rate', array['saves', 'shares', 'reach'],
       'priteshpatel.co', 'digitalmarketingtrainer'
where not exists (select 1 from public.clients);
