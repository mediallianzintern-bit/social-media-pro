-- 0020 — learning from the reels that were filmed.
--
-- "I filmed this" used to ask for the reel's link, and nobody pasted it: of 73
-- scripts, none was ever linked to a live reel, so the learning loop measured
-- nothing. Pritesh's rule for this (19 Oct call): zero input from the team.
-- They press one button; the system does the rest.
--
-- So pressing it records only that the idea was filmed. The TOPIC is the
-- anchor: the system finds the live reel by the story it covers, because the
-- team may rewrite the hook, the script, the caption and the hashtags, but the
-- story stays. Everything else is then compared against what the dashboard
-- wrote, element by element, and judged against how the reel performed.
--
-- One row per filmed idea. Each paid step (transcript + comparison, and the
-- review once the reel has run for a week) runs only from a button, and
-- writes its own columns, so a row shows exactly how far it has got.
--
-- Idempotent, and safe to re-run.

create table if not exists public.reel_learning (
  id uuid primary key default gen_random_uuid(),

  platform text not null check (platform in ('instagram', 'linkedin')),
  idea_id uuid not null unique references public.suggested_ideas (id) on delete cascade,

  -- Who pressed "I filmed this", and when.
  filmed_at timestamptz not null default now(),
  filmed_by text,

  -- The live reel, found by its topic (free: it reads already-synced posts).
  shortcode text,
  reel_url text,
  matched_at timestamptz,
  -- The words the reel and the story shared, and whether a person linked it
  -- by hand instead, so a wrong match can be seen and argued with.
  match jsonb,

  -- Analyse (paid): what the reel says, and what was kept, changed or replaced.
  transcript text,
  comparison jsonb,
  -- How much of the dashboard's script made it into the reel.
  usage text check (usage in ('as_written', 'partly', 'topic_only')),
  analysed_at timestamptz,

  -- Review (paid, once the reel has run for a week): did it work, and why.
  review jsonb,
  worked boolean,
  reviewed_at timestamptz,

  cost_usd numeric not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists reel_learning_platform_idx
  on public.reel_learning (platform, filmed_at desc);

alter table public.reel_learning enable row level security;

comment on table public.reel_learning is
  'Filmed ideas, the live reel each became, what of the script was used, and what it taught.';
