-- 0018 — topics the team bookmarked to come back to.
--
-- A shared shortlist. Every row in "Topics in the news" and "Rising on
-- <platform>" carries a save button; pressing it drops the topic here, where
-- the whole team sees it on the Saved screen. Distinct from topic_feedback,
-- which is a like/dislike that teaches ranking — a save is "keep this in front
-- of me", a plain bookmark with no effect on what gets surfaced.
--
-- The row keeps its own snapshot of the topic. A saved news story ages out of
-- the inbox and a saved rising post leaves the trend window, but the bookmark
-- must keep rendering after the source has scrolled away — so, like the vote
-- rows, it carries its own title/url/label rather than a foreign key that
-- would dangle.
--
-- Idempotent, and safe to re-run.

create table if not exists public.saved_topics (
  id uuid primary key default gen_random_uuid(),

  platform text not null check (platform in ('instagram', 'linkedin')),

  -- A source_items id ('source') or a post id for a rising post ('trend').
  item_kind text not null check (item_kind in ('source', 'trend')),
  item_id text not null,

  -- The topic, copied at save time so the bookmark survives the source.
  title text not null,
  url text,
  source_label text,
  lane text,

  -- Who saved it, from the verified session. Shared shortlist per account;
  -- kept only for the by-line.
  actor text,

  created_at timestamptz not null default now(),

  -- One bookmark per item. Saving twice is a no-op, not a duplicate row.
  unique (platform, item_kind, item_id)
);

create index if not exists saved_topics_platform_idx
  on public.saved_topics (platform, created_at desc);

alter table public.saved_topics enable row level security;

comment on table public.saved_topics is
  'Topics the team bookmarked from the news inbox and the rising-posts list. A shared shortlist, separate from the ranking votes in topic_feedback.';
