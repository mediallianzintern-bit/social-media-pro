-- 0043 — how long each video post runs (27 Nov 2026).
--
-- For the Posts tab's CSV download: each Reel's length in seconds, as the
-- Instagram scrapers report it (`videoDuration`, read on every sync from now
-- on). Null for images, carousels, LinkedIn posts, and posts not re-scraped
-- since this was added.
--
-- Additive only. Idempotent, and safe to re-run.

alter table public.post_metrics
  add column if not exists duration_seconds real;
