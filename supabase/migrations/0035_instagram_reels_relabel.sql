-- 0035 — Instagram reels synced as "video" are reels.
--
-- Around 17 October 2026 Apify's profile scraper stopped sending productType,
-- and every reel synced after that was stored with format 'video'. The code now
-- reads a Video with no productType as a reel (src/server/apify/instagram.ts
-- formatOf), and the next syncs relabel the posts they return, but each sync
-- returns only the latest dozen per account. This relabels the rest.
--
-- Only from 1 October 2026: Instagram has posted every new video as a reel
-- since 2022, and that is when the scraper changed. Older rows are left as
-- they were synced.
--
-- Idempotent, and safe to re-run.

update public.post_metrics
   set format = 'reel'
 where platform = 'instagram'
   and format = 'video'
   and published_at >= '2026-10-01';
