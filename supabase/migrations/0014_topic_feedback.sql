-- 0014 — what the team likes: the ticks and crosses given to topics.
--
-- T67. Every topic the dashboard shows — a news story, a rising post, a reel
-- idea and its script — can be marked liked or not. The system learns from
-- those votes which subjects to show more of and which to fade out (see
-- src/lib/preferences.ts).
--
-- A HUMAN PREFERENCE, kept apart from `outcomes`, which records how published
-- posts actually performed. The two answer different questions — "do we want
-- this" and "did it work" — and are never folded into one number.
--
-- Idempotent, and safe to re-run.

create table if not exists public.topic_feedback (
  id uuid primary key default gen_random_uuid(),

  platform text not null check (platform in ('instagram', 'linkedin')),

  -- Which kind of item was voted on, and its id in its own table: a
  -- source_items id, a post id for a rising post, or a suggested_ideas id.
  item_kind text not null check (item_kind in ('source', 'trend', 'idea')),
  item_id text not null,

  verdict text not null check (verdict in ('like', 'dislike')),

  -- The words that were judged, copied at vote time. Source items age out of
  -- the inbox and rising posts leave the window, but a vote has to keep
  -- teaching after the thing it was cast on has gone — so the vote carries
  -- its own text rather than a foreign key that would dangle.
  item_text text not null,
  lane text,

  -- Who voted, from the verified session. The team shares one set of
  -- preferences per account; this is kept so a pattern can be traced to the
  -- person who set it.
  actor text,

  created_at timestamptz not null default now(),

  -- One standing verdict per item. Changing your mind replaces the row rather
  -- than leaving a like and a dislike to cancel out.
  unique (platform, item_kind, item_id)
);

create index if not exists topic_feedback_platform_idx
  on public.topic_feedback (platform, created_at desc);

alter table public.topic_feedback enable row level security;

comment on table public.topic_feedback is
  'Likes and dislikes the team gives to topics, trends and reel ideas. Teaches the system which subjects to surface more often and which to stop showing.';
