-- 0015 — Addendum E: the reaction-hook format ("viral video hook").
--
-- A borrowed clip from a bigger creator sets up a belief; the expert cuts in
-- with a correction or a deeper take that lands in their own lane. This is a
-- FORMAT, not a new agent: a template the strategist writes into, a library of
-- source clips, and fields that let the loop measure whether the format works.
--
-- The one thing this migration exists to guarantee: the source reel is always
-- the one the team actually chose. Its link is stored here exactly as given,
-- with its credit and rights status, and an idea points to it by id. No model
-- ever writes a source URL.
--
-- Idempotent, and safe to re-run.

-- ---------------------------------------------------------------------------
-- E.4 — client settings the reaction script reuses verbatim
-- ---------------------------------------------------------------------------
alter table public.clients add column if not exists standard_cta text;
alter table public.clients add column if not exists lead_magnet text;
alter table public.clients add column if not exists brand_set_notes text;
alter table public.clients add column if not exists owned_lane_for_redirect text;

-- ---------------------------------------------------------------------------
-- E.4 — the source-clip library
-- ---------------------------------------------------------------------------
create table if not exists public.reaction_sources (
  id uuid primary key default gen_random_uuid(),

  -- Per client. Only one client exists today; the column is here so T12's
  -- multi-client work does not have to retrofit it.
  client_id uuid references public.clients (id) on delete cascade,

  -- The platform the REACTION will be published on.
  platform text not null default 'instagram' check (platform in ('instagram', 'linkedin')),

  -- Where the borrowed clip lives. Stored exactly as given (tracking
  -- parameters removed, nothing else), never generated.
  source_url text not null,
  source_platform text not null default 'other'
    check (source_platform in ('instagram', 'youtube', 'tiktok', 'linkedin', 'x', 'facebook', 'other')),
  source_creator_handle text,

  source_type text not null default 'other'
    check (source_type in ('meme', 'street_interview', 'podcast', 'news', 'tutorial', 'movie_tv', 'other')),

  -- Public signal only, and labelled as such wherever it is shown.
  source_public_views integer,

  -- v1 is team-led: the transcript (or just the key claim) is pasted in.
  transcript text,
  extracted_claim text,

  -- E.7: both are required before a reaction idea may be approved.
  credit_text text,
  rights_status text not null default 'needs_review'
    check (rights_status in ('native_remix', 'credited_clip', 'needs_review')),

  found_by text not null default 'team' check (found_by in ('team', 'trend_listener')),
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One row per clip per platform: pasting the same link twice updates it.
  unique (platform, source_url)
);

create index if not exists reaction_sources_platform_idx
  on public.reaction_sources (platform, created_at desc);

alter table public.reaction_sources enable row level security;

comment on table public.reaction_sources is
  'Addendum E. Borrowed clips the expert reacts to, with the exact link, on-screen credit and rights status. A reaction idea points here by id; its source link is never written by a model.';

-- ---------------------------------------------------------------------------
-- E.4 / E.9 — the format tag and the reaction fields on each idea
-- ---------------------------------------------------------------------------
alter table public.suggested_ideas
  add column if not exists format_template text not null default 'standard';
alter table public.suggested_ideas drop constraint if exists suggested_ideas_format_template_check;
alter table public.suggested_ideas add constraint suggested_ideas_format_template_check
  check (format_template in ('standard', 'reaction_hook'));

alter table public.suggested_ideas
  add column if not exists reaction_source_id uuid
    references public.reaction_sources (id) on delete set null;

-- source_in, source_out, pivot_type, credit overlay, expert seconds, the
-- [VERIFY] items, and whether the client has confirmed them. One column, so
-- the learning comparisons in E.9 read them without another join.
alter table public.suggested_ideas add column if not exists reaction jsonb;

create index if not exists suggested_ideas_format_template_idx
  on public.suggested_ideas (platform, format_template);
