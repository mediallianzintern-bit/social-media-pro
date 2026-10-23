-- 0021 — creators watched for reel ideas (AI tool workflows, phase 1).
--
-- The AI tool workflows lane was fed by a news search, and news is the wrong
-- raw material for it: an article says a tool exists, it never shows the
-- workflow. Approved 23 Oct 2026 (the AI Tool Workflows proposal): feed the
-- lane with reels from creators who make exactly this kind of content.
--
-- This table is the setting the proposal asks for: the creators live here,
-- not in the code, so they can be added, paused or removed without a release.
-- On every Sync each active creator's recent posts are read through Instagram's
-- own API (free for Business and Creator accounts), and the reels that beat
-- that creator's own normal appear in the lane in place of news.
--
-- `role` says how a creator got here: 'reference' for the ten supplied as the
-- example of the format, 'found' for creators the system adds itself later
-- (phase 3). Never benchmarked as competitors.
--
-- Idempotent, and safe to re-run.

create table if not exists public.watched_creators (
  id uuid primary key default gen_random_uuid(),

  platform text not null check (platform in ('instagram')),
  handle text not null,

  -- The content lane this creator's reels feed.
  lane text not null,

  role text not null default 'reference' check (role in ('reference', 'found')),

  -- Pause a creator without losing the row.
  active boolean not null default true,

  note text,
  added_at timestamptz not null default now(),

  unique (platform, handle)
);

create index if not exists watched_creators_platform_idx
  on public.watched_creators (platform, active);

alter table public.watched_creators enable row level security;

comment on table public.watched_creators is
  'Creators whose standout reels feed a content lane in place of news (AI tool workflows first).';

-- The ten reference creators from the approved proposal (appendix).
insert into public.watched_creators (platform, handle, lane, role, note) values
  ('instagram', 'jasoncooperson', 'AI tool workflows', 'reference', 'Proposal appendix, 23 Oct 2026'),
  ('instagram', 'mr.pynk', 'AI tool workflows', 'reference', 'Proposal appendix, 23 Oct 2026'),
  ('instagram', 'leadgenman', 'AI tool workflows', 'reference', 'Proposal appendix, 23 Oct 2026'),
  ('instagram', 'sparklewithai', 'AI tool workflows', 'reference', 'Proposal appendix, 23 Oct 2026'),
  ('instagram', 'digitalsamaritan', 'AI tool workflows', 'reference', 'Proposal appendix, 23 Oct 2026'),
  ('instagram', 'drk_talks', 'AI tool workflows', 'reference', 'Proposal appendix, 23 Oct 2026'),
  ('instagram', 'winkguys', 'AI tool workflows', 'reference', 'Proposal appendix, 23 Oct 2026'),
  ('instagram', 'shhradddhaa.ai', 'AI tool workflows', 'reference', 'Proposal appendix, 23 Oct 2026'),
  ('instagram', 'cyborggirll', 'AI tool workflows', 'reference', 'Proposal appendix, 23 Oct 2026'),
  ('instagram', 'sebintel', 'AI tool workflows', 'reference', 'Proposal appendix, 23 Oct 2026')
on conflict (platform, handle) do nothing;
