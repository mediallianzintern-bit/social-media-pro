-- The feedback loop's memory: every idea the model has ever proposed.
--
-- ai_analyses UPSERTS by platform — regenerating replaces the row, which is
-- correct for "what does the dashboard show right now" but wrong for "did our
-- own past suggestions work", because that question needs the ones we've since
-- overwritten. This table is append-only for that reason: nothing here is ever
-- updated except status and published_shortcode on the one row a creator links
-- to a real post.
--
-- content_lane and source_signal are defined now but populated by nothing yet
-- — they belong to the content-lanes work, not yet built. Adding them here
-- avoids a second migration once that lands; until then every row leaves them
-- null.
create table if not exists public.suggested_ideas (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram', 'linkedin')),
  created_at timestamptz not null default now(),
  hook text not null,
  format text not null check (format in ('reel', 'carousel')),
  -- Full shot list / production brief as generated — kept as-is rather than
  -- normalized, since nothing queries inside them; they exist here so a linked
  -- idea can be read back in full without joining against ai_analyses history
  -- that may since have been overwritten.
  shot_list jsonb not null,
  production jsonb not null,
  why_now text not null,
  -- The trait the idea was built to reproduce, as its own column rather than
  -- buried in why_now's prose — this is what a future rollup groups by.
  winning_trait text not null,
  -- Reserved for the content-lanes work. Null until that ships.
  content_lane text,
  -- 'owner' | 'niche' — which signal drove the idea. Also reserved; the current
  -- generateIdeas() prompt does not yet attribute an idea to one signal.
  source_signal text,
  status text not null default 'suggested' check (status in ('suggested', 'used', 'dismissed')),
  -- Set once a creator links this idea to the post they actually made from it.
  published_shortcode text,
  updated_at timestamptz not null default now()
);

create index if not exists suggested_ideas_platform_idx
  on public.suggested_ideas (platform, created_at desc);

-- Speeds the eventual "how did my used suggestions perform" rollup, which
-- joins this table to post_metrics by shortcode.
create index if not exists suggested_ideas_shortcode_idx
  on public.suggested_ideas (published_shortcode)
  where published_shortcode is not null;

alter table public.suggested_ideas enable row level security;
