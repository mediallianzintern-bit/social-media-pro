-- 0012 — the team's own content calendar, as training knowledge.
--
-- Every other table here records what the PLATFORMS did: followers, views,
-- saves. This one records what the TEAM decided — which topics a person judged
-- worth making, in their own words, over more than a year. That judgement is
-- the thing the topic engine has never had, and no amount of scraping produces
-- it.
--
-- Two uses, both of which need the rows to persist rather than be re-read from
-- a spreadsheet each time:
--   • MEMORY — a topic already on the calendar must never be suggested again,
--     whether or not it was ever published.
--   • PATTERN — the labelled rows say what a topic in each lane looks like to
--     this team, which is what a new candidate gets scored against.
--
-- Idempotent, and safe to re-run.

create table if not exists public.content_calendar (
  id uuid primary key default gen_random_uuid(),

  -- Identity is the CONTENT, not the row position. The team re-exports this
  -- sheet with rows inserted and reordered, and the same topic appears in more
  -- than one export (57 of 71 rows were shared between the two files supplied).
  -- Hashing the normalised script means a re-import updates a row instead of
  -- creating a second copy of the same topic.
  content_hash text not null unique,

  platform text not null default 'instagram' check (platform in ('instagram', 'linkedin')),

  -- Where it came from, so a wrong label can be traced to a row in a file.
  source_file text,
  sheet text,

  planned_date date,
  brand text,
  -- The script as the team wrote it. The single most valuable column here:
  -- it is the house voice in its natural form.
  content text not null,
  caption text,
  -- The team's own workflow state: Posted / Scheduled / Edited / Not Started.
  status text,

  -- Assigned by rule in src/lib/calendar-classify.ts, never by a model, so the
  -- labels stay stable across imports and a group comparison means something.
  lane text,
  topic_type text check (topic_type in ('evergreen', 'fresh', 'ai_news', 'ai_tool')),
  subjects text[] not null default '{}',

  -- Set once the entry is matched to a real published post, which is what
  -- connects an editorial decision to its measured outcome.
  published_post_id text,

  imported_at timestamptz not null default now()
);

create index if not exists content_calendar_platform_idx
  on public.content_calendar (platform, planned_date desc);

create index if not exists content_calendar_lane_idx
  on public.content_calendar (platform, lane);

-- "Have we covered this brand before?" is asked on every generation.
create index if not exists content_calendar_subjects_idx
  on public.content_calendar using gin (subjects);

alter table public.content_calendar enable row level security;

comment on table public.content_calendar is
  'The social team''s planned and published topics, imported from their calendar spreadsheet. Training knowledge for topic selection, and the memory that stops a topic being suggested twice.';
