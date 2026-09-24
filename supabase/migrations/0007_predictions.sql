-- Layer 4 — prediction & confidence.
--
-- The plumbing is built now and the OUTPUT is gated, which is the whole point:
-- a confidence number is only worth showing once it has been checked against
-- what actually happened. Until a niche graduates, `mode` is 'cold_start' and
-- the numeric columns stay null — there is nothing honest to put in them.
--
-- Every prediction is written at suggestion time and scored later against the
-- outcomes table, so calibration is provable rather than asserted.

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.suggested_ideas (id) on delete cascade,
  -- Reserved for the multi-client foundation (Layer 2), like outcomes.client_id.
  client_id uuid,
  platform text not null check (platform in ('instagram', 'linkedin')),
  created_at timestamptz not null default now(),

  -- Which niche's model produced this, and which version of it. Both are needed
  -- to score fairly later: a prediction made by an older model must not be
  -- judged against the current one's calibration.
  niche text not null,
  model_version text not null,
  mode text not null check (mode in ('cold_start', 'calibrated')),

  -- The features the prediction rests on. Structural and measured only — no
  -- model ever writes into this.
  content_lane text,
  format text,
  duration_seconds integer,
  features jsonb not null default '{}'::jsonb,

  -- COLD-START OUTPUT: relative, measured expectations. Multiples of the
  -- account's own median, never absolute counts.
  lane_vs_median numeric,
  lane_save_rate_vs_median numeric,
  lane_watch_vs_median numeric,
  lane_directional boolean,
  -- The account median the multiples were taken against, stored so a later
  -- reading can be converted back to absolute terms and audited.
  baseline_median numeric,

  -- CALIBRATED OUTPUT: null until the niche graduates. A range, never a point
  -- estimate — a single number implies a precision this will never have.
  predicted_metric text check (predicted_metric in ('views', 'saves', 'shares')),
  predicted_low numeric,
  predicted_high numeric,
  interval_pct numeric,

  -- One prediction per suggestion. A suggestion is predicted once, when it is
  -- made; re-predicting later with more data would be scoring the model on
  -- information it did not have at the time.
  unique (suggestion_id)
);

create index if not exists predictions_niche_idx
  on public.predictions (platform, niche, created_at desc);

-- One fitted model per niche per platform.
--
-- `calibrated` is the graduation gate in a single column. It flips to true only
-- when the niche has enough linked outcomes AND the back-test holds, and it
-- flips back to false on its own if a later refit drifts — the spec's
-- auto-revert. Nothing downstream may show a numeric prediction while it is
-- false.
create table if not exists public.niche_models (
  platform text not null check (platform in ('instagram', 'linkedin')),
  niche text not null,
  fitted_at timestamptz not null default now(),
  model_version text not null,

  calibrated boolean not null default false,
  -- How many linked, measured outcomes the fit rests on.
  outcome_count integer not null default 0,
  -- Leave-one-out coverage: the share of held-out outcomes that fell inside the
  -- range the model predicted for them. The honest test of an interval.
  coverage numeric,
  -- What coverage was aiming for (e.g. 0.70 for a 70% interval).
  target_interval_pct numeric,

  -- Per-lane quantiles of vsMedian, the fitted model itself. Small enough to
  -- keep inline; a separate table would buy nothing.
  coefficients jsonb not null default '{}'::jsonb,

  -- Why this niche is or is not calibrated, in plain words. Shown in the
  -- agency console so the gate is never a mystery.
  note text not null default '',

  primary key (platform, niche)
);

alter table public.predictions enable row level security;
alter table public.niche_models enable row level security;
