-- 0036 — learning from every LinkedIn post he publishes (16 Nov 2026).
--
-- reel_learning (0020) holds one row per dashboard idea, so it only learns
-- from posts someone marked "I posted this", and the team writes most of his
-- posts outside the dashboard. This holds one row per published post, drafted
-- here or not: after each sync the post is analysed (its opening, body shape,
-- example and close), and once it has run 14 days it is reviewed against his
-- typical post on LinkedIn's own impressions. What the reviews teach goes into
-- every new post (server/post-learning).
--
-- Written only by the server (service role). Idempotent, and safe to re-run.

create table if not exists public.linkedin_post_learning (
  post_id text primary key,
  post_url text,
  published_at timestamptz not null,
  format text,

  -- Analyse (paid, ~0.1¢): the post's parts, measured in code and named by a model.
  analysis jsonb,
  analysed_at timestamptz,

  -- Review (paid, ~1-2¢, once the post has run 14 days): did it work, and why.
  review jsonb,
  worked boolean,
  reviewed_at timestamptz,

  cost_usd numeric not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists linkedin_post_learning_published_idx
  on public.linkedin_post_learning (published_at desc);

alter table public.linkedin_post_learning enable row level security;

comment on table public.linkedin_post_learning is
  'Every LinkedIn post he published, its parts, and what its 14-day review taught the writer.';
