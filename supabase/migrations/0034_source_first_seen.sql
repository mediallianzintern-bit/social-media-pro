-- 0034 — when each topic first arrived, so new topics can be told apart.
--
-- source_items.fetched_at is refreshed every time a story is fetched again, so
-- it cannot say whether a story is new: one fetched for the fifth time looks
-- as fresh as one seen for the first time. first_seen_at is set once, when the
-- row is inserted, and never touched by the upsert on (platform, url), which
-- only writes the columns it is given.
--
-- The topic list orders on it (src/server/sources/index.ts): ticked topics,
-- then topics first seen in the last day, then the rest.
--
-- Existing rows get the earlier of when the story was published and when it
-- was last fetched: the closest record there is of when it arrived, and old
-- enough that applying this does not mark the whole list as new at once.
--
-- Idempotent, and safe to re-run.

alter table public.source_items add column if not exists first_seen_at timestamptz;

update public.source_items
  set first_seen_at = least(coalesce(published_at, fetched_at), fetched_at)
  where first_seen_at is null;

alter table public.source_items alter column first_seen_at set default now();
alter table public.source_items alter column first_seen_at set not null;

create index if not exists source_items_first_seen_idx
  on public.source_items (platform, first_seen_at desc);
