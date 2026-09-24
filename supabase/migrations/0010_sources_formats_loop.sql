-- 0010 — real sources, LinkedIn formats, and a learning loop graded on the goal.
--
-- Three changes, one migration, because each depends on the others to mean
-- anything: an idea built on a real source has to remember that source; a
-- LinkedIn idea has to be storable at all before it can be filmed; and a filmed
-- idea has to be graded on the metric it was chosen for, or the loop learns the
-- opposite of what it was built to learn.
--
-- Every statement is idempotent. The app degrades gracefully until this runs:
-- sources are simply not stored, and outcomes are written without the new
-- columns — nothing throws.

-- ---------------------------------------------------------------------------
-- 1. Real sources — the articles a topic may be built on.
-- ---------------------------------------------------------------------------
--
-- Fetched from a live news search, never produced by a model. The strategist
-- is handed these rows by id and must build every idea on one of them, so
-- every topic on screen traces to a page that existed when it was fetched.
create table if not exists public.source_items (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram', 'linkedin')),
  url text not null,
  title text not null,
  publisher text,
  publisher_url text,
  published_at timestamptz,
  -- The search that found it, and the lane that search was derived from, so a
  -- topic can be traced back to the part of the account it was fetched for.
  query text not null,
  lane text,
  kind text not null default 'article' check (kind in ('article', 'video')),
  -- How many outlets carried the same story in the same fetch. Above one is
  -- what "trending" means here: measured, not asserted.
  coverage integer not null default 1,
  fetched_at timestamptz not null default now(),
  unique (platform, url)
);

create index if not exists source_items_platform_idx
  on public.source_items (platform, published_at desc);

alter table public.source_items enable row level security;

-- ---------------------------------------------------------------------------
-- 2. suggested_ideas — LinkedIn formats, the full script, and its source.
-- ---------------------------------------------------------------------------

-- LinkedIn is written, not filmed: a text post, a long-form article, or a
-- document carousel. The old constraint allowed only Instagram's two formats,
-- which made a LinkedIn-native suggestion impossible to store.
alter table public.suggested_ideas drop constraint if exists suggested_ideas_format_check;
alter table public.suggested_ideas add constraint suggested_ideas_format_check
  check (format in ('reel', 'carousel', 'text_post', 'article', 'document'));

-- A LinkedIn idea has no shot list or production brief.
alter table public.suggested_ideas alter column shot_list drop not null;
alter table public.suggested_ideas alter column production drop not null;

-- The whole idea as generated. The learner needs the SCRIPT, not just the hook:
-- "which script format won" cannot be answered from a first line.
alter table public.suggested_ideas add column if not exists payload jsonb;

-- Deterministic features of that script (hook type, length, CTA, pacing),
-- computed in TypeScript at save time so every row is grouped by the same rules.
alter table public.suggested_ideas add column if not exists script_features jsonb;

-- The real article the idea was built on. Set null rather than cascading: a
-- pruned source must not delete the suggestion history the loop learns from.
alter table public.suggested_ideas
  add column if not exists source_item_id uuid references public.source_items (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. outcomes — graded on the goal metric, with the view source recorded.
-- ---------------------------------------------------------------------------

-- vs_median stays as it was (reach, now from Graph). These say what the
-- outcome was actually GRADED on: the client's goal metric where the post was
-- measured for it, and an honest fallback label where it was not.
alter table public.outcomes add column if not exists goal_metric text;
alter table public.outcomes add column if not exists goal_vs_median numeric;
alter table public.outcomes add column if not exists graded_on text;
-- 'graph' when the view count came from the Graph API, 'public' otherwise.
alter table public.outcomes add column if not exists views_source text;
