-- 0028 — Pritesh Sir's LinkedIn articles.
--
-- He publishes LinkedIn articles and shares each one in a post. The posts
-- scraper returns the shared article's title, link and read time with the
-- post, and the dashboard used to drop them, so an article share was stored as
-- an ordinary text post. That post is now stored with format 'article' in
-- post_metrics, and the article itself here, keyed by the same post id.
--
-- Its reach is the sharing post's: LinkedIn's API measures that post's
-- impressions (linkedin_post_analytics), not the article page's views.
--
-- Server-only. Idempotent.

create table if not exists public.linkedin_articles (
  post_id text primary key,
  title text not null,
  url text,
  read_minutes integer,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.linkedin_articles enable row level security;

comment on table public.linkedin_articles is
  'Pritesh Sir''s LinkedIn articles, by the post that shares each one. Server-only.';
