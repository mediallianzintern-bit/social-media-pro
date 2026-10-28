-- 0024 — the account owner's own consent to read their private analytics.
--
-- LinkedIn's Member Post Analytics API (Community Management API, scope
-- r_member_postAnalytics) serves impressions, members reached and the other
-- owner-only figures for a PERSONAL profile's posts — but only with a token the
-- member granted by signing in to LinkedIn and pressing Allow. That token is
-- kept here, one row per platform, so every sync can read the figures without
-- asking again until it expires (about 60 days for LinkedIn).
--
-- Server-only: row level security is on and no policy is granted, so only the
-- service role the server uses can read or write it. Tokens never reach the
-- browser; the dashboard is only told whether a connection exists and when it
-- expires.
--
-- Idempotent, and safe to re-run.

create table if not exists public.platform_tokens (
  platform text primary key check (platform in ('linkedin')),
  access_token text not null,
  expires_at timestamptz not null,
  refresh_token text,
  refresh_expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_by text,
  connected_at timestamptz not null default now()
);

alter table public.platform_tokens enable row level security;

comment on table public.platform_tokens is
  'Owner-granted API tokens (LinkedIn member post analytics). Server-only: RLS on, no policies.';
