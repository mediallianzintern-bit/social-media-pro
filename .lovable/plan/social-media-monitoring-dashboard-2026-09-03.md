# Social Media Monitoring Dashboard

A single-page analytics dashboard for your two accounts:

- Instagram: `instagram.com/priteshpatel.co`
- LinkedIn: `linkedin.com/in/digitalmarketingtrainer`

## What it looks like

```text
+---------------------------------------------------------------+
|  [ Instagram | LinkedIn ]        Last synced 12:40   [Sync now]|
|  [ Today ][ Yesterday ][ Last 7d ][ Last 30d ][ Custom range ] |
+---------------------------------------------------------------+
|  Posts   Likes   Comments   Shares/Saves   Eng. rate   Views   |
+---------------------------------------------------------------+
|  Engagement over time (chart)      |   Top performing posts    |
+---------------------------------------------------------------+
|  Post table: thumbnail | caption | type | date | metrics | link|
+---------------------------------------------------------------+
```

- Top toggle switches between Instagram and LinkedIn (same layout, platform-specific metrics).
- Date presets: Today, Yesterday, Last 7 / 30 / 90 days, plus a custom range picker.
- Every post row expands to show the full caption, hashtags, media, and all captured metrics.
- Sortable table + CSV export.

## How data gets in

- **Instagram** — Apify actor scrapes your profile's posts and reels: caption, hashtags, media/thumbnail, type (image/carousel/reel), timestamp, likes, comments, and view/play counts where public.
- **LinkedIn** — the LinkedIn connector for your own profile posts and the metrics the official API returns; Apify's LinkedIn profile-posts actor fills in what the API won't give for a personal profile (reactions, comments, reposts, post text, media).
- **Auto refresh every 2 hours** plus a manual **Sync now** button. Each sync stores a snapshot so the dashboard loads instantly and builds real history (growth over time), rather than re-scraping on every page view.

## Honest limits

Private analytics numbers (impressions, reach, profile visits, saves, follower demographics) are only visible inside the native Instagram/LinkedIn apps to the account owner. Public scraping and the LinkedIn API cannot see them. So the dashboard will show every publicly derivable metric, and clearly label the ones no external tool can access. If you later want true reach/impressions for Instagram, that needs a Business/Creator account linked to a Facebook Page + Meta app approval — we can add that as a phase 2.

## What I need from you

1. Approve the **Apify** connection when I show the connect card (I'll pick the actors).
2. Approve the **LinkedIn** connection (OAuth sign-in with the `digitalmarketingtrainer` account).
3. Confirm the LinkedIn profile is a **personal profile**, not a company page — that changes which API endpoints apply.
4. Nothing else; no API keys to paste manually.

## Technical notes

- Lovable Cloud enabled for storage + scheduled sync: tables `accounts`, `posts` (platform, external id, permalink, posted_at, type, caption, media_url, raw JSON), `post_metrics` (snapshot timestamped rows), `sync_runs` (status/errors).
- Apify + LinkedIn calls run server-side through the Lovable connector gateway inside `createServerFn` handlers; no credentials in the browser.
- Sync endpoint at `src/routes/api/public/sync.ts`, signature/secret protected, triggered by a 2-hour schedule; the manual button calls an authenticated server function that reuses the same sync logic.
- Dashboard reads only from the database via TanStack Query, so page loads never wait on Apify.
- Date filtering happens on `posted_at` in SQL; charts built with Recharts.
- Design: dark analytics UI, semantic tokens in `src/styles.css`, platform accent colors per tab.
