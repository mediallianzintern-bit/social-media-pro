-- 0031 — Google News links already converted to their articles.
--
-- Every news result is a news.google.com link, and reading the article means
-- asking Google for the real address first. Research now reads several
-- outlets per story, and on a busy day Google answered "429, unusual traffic"
-- and every outlet failed, even the story's own (29 Oct 2026). A link
-- converted once is kept here and never asked of Google again.
--
-- Server-only. Idempotent.

create table if not exists public.decoded_links (
  google_url text primary key,
  url text not null,
  decoded_at timestamptz not null default now()
);

alter table public.decoded_links enable row level security;

comment on table public.decoded_links is
  'Google News links and the article each one leads to, so each is converted once. Server-only.';
