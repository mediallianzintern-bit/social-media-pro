-- 0029 — Pritesh Sir's new LinkedIn followers, day by day.
--
-- LinkedIn's API reports how many people started following him each day
-- (memberFollowersCount, q=dateRange). Stored beside his other daily figures,
-- so "new followers in the period" is LinkedIn's own count for any period the
-- dashboard shows, kept apart from his follower total as of a date (which
-- comes from the dated snapshots).
--
-- Server-only. Idempotent.

alter table public.linkedin_member_daily
  add column if not exists new_followers integer;
