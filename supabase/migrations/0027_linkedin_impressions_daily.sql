-- 0027 — Read each LinkedIn post's impressions once a day.
--
-- Until now a post 7-30 days old had all four figures (impressions, members
-- reached, saves, sends) read every 3 days, so its impressions could trail the
-- number on his own LinkedIn Top performing posts by up to 3 days. Impressions
-- are now read once a day for every post under 30 days old (one call each), and
-- the other three stay every 3 days, inside LinkedIn's 100 calls a day.
--
-- impressions_at  when impressions alone were last read; fetched_at stays the
--                 time of the last full read.
--
-- Server-only. Idempotent.

alter table public.linkedin_post_analytics
  add column if not exists impressions_at timestamptz;
