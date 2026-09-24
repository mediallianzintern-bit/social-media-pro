-- Instagram's own view count, kept apart from the scraped one.
--
-- These are two different measurements of the same post and they disagree
-- badly: Apify reads the number rendered on a public profile, which came back
-- roughly half of what Instagram reports to the account owner (620 vs 1,314 on
-- one reel). Storing both in a single `views` column meant whichever source ran
-- last won, so the figure silently changed meaning depending on whether the
-- Graph API happened to be reachable during that sync.
--
-- `views` therefore stays the public, scraped number — comparable across the
-- owner and every competitor, which is what the shared engagement rates need.
-- `graph_views` is the owner-only truth, shown wherever the dashboard promises
-- what Instagram itself reports.

alter table public.post_metrics
  add column if not exists graph_views integer;
