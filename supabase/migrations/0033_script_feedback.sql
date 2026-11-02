-- 0033 — the team's verdict on a script's WRITING: approved, or rejected and why.
--
-- topic_feedback (0014) learns which SUBJECTS the team wants. It never learned
-- which writing they want: not one script had been voted on by 2 Nov 2026, and
-- a cross could not say whether the topic, the opening or the facts were the
-- problem. Here a script is approved or rejected with one-tap reasons, and
-- the writer is told both: approved scripts become examples of how he sounds
-- (voice and shape only, never their facts), rejections become what to avoid.
--
-- A HUMAN PREFERENCE, like topic_feedback, kept apart from reel_learning,
-- which records how published posts actually performed.
--
-- Idempotent, and safe to re-run.

create table if not exists public.script_feedback (
  platform text not null check (platform in ('instagram', 'linkedin')),

  -- The suggested_ideas id the verdict is on.
  idea_id text not null,

  verdict text not null check (verdict in ('approve', 'reject')),

  -- Why it was rejected, as fixed keys (src/lib/script-feedback.ts). Empty
  -- for an approval.
  reasons text[] not null default '{}',
  -- Anything the reasons do not cover, in the team's own words.
  note text,

  -- The script as it was judged, opening with the chosen hook, copied at vote
  -- time: the example has to keep teaching after the idea ages out.
  script text not null default '',
  hook text,
  title text,
  lane text,

  -- Who judged it, from the verified session.
  actor text,

  created_at timestamptz not null default now(),

  -- One standing verdict per script. Changing your mind replaces it.
  primary key (platform, idea_id)
);

create index if not exists script_feedback_platform_idx
  on public.script_feedback (platform, created_at desc);

alter table public.script_feedback enable row level security;

comment on table public.script_feedback is
  'The team''s verdict on a script''s writing: approved scripts become voice examples for the writer, rejected ones (with reasons) become what it avoids.';
