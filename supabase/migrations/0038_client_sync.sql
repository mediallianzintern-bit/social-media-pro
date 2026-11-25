-- 0038 — syncing clients linked from Studio (Studio spec Phase 5; tracker T12).
--
-- A Studio client is synced on its own: its Instagram profile and posts, and
-- the competitors named in its Studio brand profile. Two rules keep that from
-- ever reaching Pritesh's figures:
--
--   * Its runs carry a client_id. Pritesh's "last synced" and schedule read
--     only runs with none, which is every run there has been until now.
--   * Its competitors are stored under their own role, client_competitor.
--     Pritesh's competitor table, AI read, trends and reactions read the
--     'competitor' role, so they never see a client's rivals.
--
-- Additive only. Idempotent, and safe to re-run.

alter table public.sync_runs
  add column if not exists client_id uuid references public.clients (id);

create index if not exists sync_runs_client_idx
  on public.sync_runs (client_id, platform, started_at desc)
  where client_id is not null;

-- Widen the role list: the inline check from 0001 is named by Postgres.
alter table public.account_snapshots drop constraint if exists account_snapshots_role_check;
alter table public.account_snapshots
  add constraint account_snapshots_role_check
  check (role in ('owner', 'competitor', 'client_competitor'));

-- The competitors each Studio client is measured against, from its Studio
-- brand profile. Refreshed on every import from Studio.
create table if not exists public.client_competitors (
  client_id uuid not null references public.clients (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'linkedin')),
  handle text not null,
  source text not null default 'studio' check (source in ('studio')),
  added_at timestamptz not null default now(),
  primary key (client_id, platform, handle)
);

alter table public.client_competitors enable row level security;

comment on table public.client_competitors is
  'Competitors of a client linked from Social Pulse Studio, from its Studio brand profile.';
