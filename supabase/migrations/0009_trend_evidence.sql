-- Addendum C.4 — evidence on the computed signal, not only on the observation.
--
-- trend_observations.evidence already holds the real items each reading was
-- built from. trend_signals is what the UI reads, so the links have to reach it
-- too: a surfaced trend the team cannot click through to is a label they are
-- being asked to trust rather than judge, which is exactly what C.4 is against.
--
-- Empty array is the honest default. Not every feed returns links, and an
-- absent link is a fact about that actor rather than a missing value.
alter table public.trend_signals
  add column if not exists evidence jsonb not null default '[]'::jsonb;
