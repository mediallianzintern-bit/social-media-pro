# Social Command Center — Dr. Pritesh Patel

Live Instagram and LinkedIn analytics, scraped through Apify and synced every
two hours.

- Instagram — [@priteshpatel.co](https://www.instagram.com/priteshpatel.co/)
- LinkedIn — [in/digitalmarketingtrainer](https://www.linkedin.com/in/digitalmarketingtrainer/)

## Running locally

```sh
npm install
npm run dev
```

Serves on **http://localhost:8080**.

## Setup (three steps, in order)

### 1. Create the Supabase tables

Open the Supabase SQL editor for project `dxmplhyrvwrkwmonwutu` and run
[`supabase/migrations/0001_social_snapshots.sql`](supabase/migrations/0001_social_snapshots.sql).

It creates `sync_runs`, `account_snapshots` and `post_metrics`, all with RLS on
and no policies — the server reaches them with the service-role key, and a
leaked publishable key reads nothing.

### 2. Fill in `.env`

```sh
cp .env.example .env
```

Add `APIFY_TOKEN` (Apify Console → Settings → Integrations) and
`SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API → `service_role`),
then restart the dev server. The Data sources page shows what is still missing.

### 3. Schedule the two-hourly sync in Apify

The in-app timer only fires while somebody has the dashboard open. For history
that keeps accumulating with the laptop shut, add an Apify Schedule
(Apify Console → Schedules → Create) with cron `0 */2 * * *` and these actors:

| Actor                                 | Input                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apify/instagram-profile-scraper`     | `{ "usernames": ["priteshpatel.co"] }`                                                                                                  |
| `harvestapi/linkedin-profile-scraper` | `{ "profileScraperMode": "Profile details no email ($4 per 1k)", "queries": ["https://www.linkedin.com/in/digitalmarketingtrainer/"] }` |
| `harvestapi/linkedin-profile-posts`   | `{ "targetUrls": ["https://www.linkedin.com/in/digitalmarketingtrainer/"], "maxPosts": 30 }`                                            |

## How syncing works

**Read and write are separate.** Opening the dashboard never scrapes — it renders
instantly from stored snapshots. Scraping happens only on a sync.

A sync scrapes both platforms in parallel, normalizes the results, and writes:

- one **append** to `account_snapshots` per account — this is the growth curve
- an **upsert** into `post_metrics` per post — engagement keeps climbing after
  publication, so posts are updated in place rather than duplicated

Platforms sync independently. LinkedIn failing must not lose the Instagram
snapshot, because a missed snapshot is a permanent hole in the curve.

Three ways a sync fires:

1. **The Sync button** — scrapes immediately and refreshes the page when it lands.
2. **On open, if stale** — data older than two hours triggers a catch-up sync.
3. **The Apify Schedule** — runs in Apify's cloud on the cron above.

### Follower history has to accumulate

Scraping returns _today's_ counts, not history. The growth chart shows one point
per stored sync, so day one is a single point and the trend line fills in over
the following weeks. That is the real payoff of the two-hour cadence.

## Reporting window

Every screen is filtered by the window picked in the header — Today, Yesterday,
7 / 30 / 90 days, All time, or a custom from–to range. The choice lives in the
URL (`?range=30d`, or `?range=custom&from=…&to=…`), so a view is shareable and
survives a reload.

Filtering runs client-side over the stored payload, so switching windows is
instant and never triggers a scrape. It also cannot reach further back than the
sync has stored — the window narrows what you already have, it does not fetch
history that was never captured.

Follower counts are deliberately **not** filtered: "followers" means the current
count regardless of the window being viewed.

## Competitor discovery

Competitors are found automatically the first time you press Generate on a
platform page (or any time you press **Re-find competitors**). Three stages,
arranged so the model never states something it could fabricate:

1. **The model proposes search phrases** from the owner's bio and captions —
   never handles. Asked directly for usernames it produces confident,
   non-existent accounts.
2. **Apify searches Instagram** with those phrases, then the profile scraper
   fills in real follower counts, bios and recent posts for up to 24 candidates.
3. **The model picks from that scraped list**, given actual numbers. Anything it
   returns that is not in the list is discarded rather than trusted.

Candidates are filtered to a follower band **relative to the owner** (5% to 25×)
before the model sees them. An absolute band was tried first and silently
excluded everything — Instagram's account search surfaces mostly small accounts,
so a fixed floor returned an empty set for an 11k account.

Selected accounts are written to `competitor_watchlist`, and their scraped
snapshots and posts are stored immediately, so the benchmark table fills in
without waiting for the next sync. Every later sync tracks them automatically.

Roughly **$0.15 of Apify** per discovery run plus four OpenAI calls. It runs only
when no competitors exist or you explicitly re-find; a plain Regenerate reuses
the existing set.

## Competitor benchmarking

Add handles to `.env` as comma-separated lists — bare handles, @handles or full
profile URLs all work:

```
COMPETITORS_INSTAGRAM=somehandle,anotherhandle
COMPETITORS_LINKEDIN=some-public-id,another-public-id
```

Rivals are scraped with the same actors on the same schedule as the owner
account, so followers, cadence, median views and engagement rate are
like-for-like rather than assembled from different sources. Each handle is
billed by Apify on every sync, so the list is opt-in and empty by default.

## Recommendations

The "Next reel to make" / "Next post to write" cards are generated from measured
signals, not written by hand. Each play in
[`src/lib/recommendations.ts`](src/lib/recommendations.ts) declares the condition
that makes it worth recommending, and a play whose signal is absent is not shown
— the list gets shorter rather than padded.

Every card leads with the number that triggered it ("your best post did 3.7× your
median"), and anything resting on fewer than 6 posts is labelled as a lead rather
than a finding. The thresholds live in [`src/lib/insights.ts`](src/lib/insights.ts).

## AI analysis (OpenAI)

Two things the model produces, on demand: a competitive read, and content ideas
with production-ready scripts. Set `OPENAI_API_KEY` in `.env`; `OPENAI_MODEL` is
optional and defaults to `gpt-4o`.

**The division of labour is the whole design.** Every statistic is computed in
TypeScript and handed to the model as fact. The model interprets and writes — it
never calculates. The system prompt in
[`analyst.ts`](src/server/ai/analyst.ts) states this as hard rules:

1. Every number mentioned must appear verbatim in the data block
2. "Too few posts to tell" is a valid answer
3. Never refer to impressions, reach, saves, demographics or retention — those
   are not in the data and mentioning them makes the output unusable
4. Anything under 6 posts is directional, and must be labelled as such

Output is constrained by OpenAI **strict structured outputs** (JSON Schema with
`additionalProperties: false`, every field required) and re-validated with Zod on
the way back. A malformed response fails loudly rather than half-rendering.

Generation is a button, never a page load — each run costs money and the answer
only changes when the posts do. Results are cached per platform in
`ai_analyses` and stamped with the timestamp and model that produced them.

The rule-based recommendations remain below the AI section. They need no API key
and no network call, so the page is still useful without OpenAI configured.

## What this dashboard cannot show

Scrapers see what a logged-out visitor sees. These are owner-only and are absent
rather than estimated:

| Metric                           | Why                                |
| -------------------------------- | ---------------------------------- |
| Impressions, reach               | Never rendered on a public profile |
| Profile visits, link taps        | Owner-only                         |
| Audience age / gender / location | Owner-only                         |
| Video retention, watch time      | Owner-only                         |
| Saves and shares (Instagram)     | Not published publicly             |

**Instagram's versions are recoverable.** If `@priteshpatel.co` is switched to a
Business or Creator account and linked to a Facebook Page, the Meta Graph API
serves reach, impressions, profile visits and demographics for free. The account
is currently personal (`isBusinessAccount: false`), so that path is closed today.

**LinkedIn's are not.** LinkedIn publishes no member-analytics API at any tier.

Because Instagram publishes view counts and LinkedIn does not, their engagement
rates use different denominators — views on Instagram, follower-impressions on
LinkedIn. The two are never combined, and each page states which basis it uses.

## Costs per sync

Roughly **$0.01** per sync for the two owner profiles (~$0.0026 Instagram profile,
$0.004 LinkedIn profile, ~$0.002 per LinkedIn post). At every two hours that is
about **$3–4 a month**. Adding competitor handles to
[`src/server/apify/accounts.ts`](src/server/apify/accounts.ts) multiplies it by
the number of profiles tracked.

## Layout

```
src/
  server/apify/     Apify REST client + per-platform actors and normalization
  server/store.ts   Supabase reads and writes
  server/sync.ts    scrape → normalize → persist
  server/dashboard  read path: assembles the page from stored snapshots
  lib/              domain types, derived metrics, formatters (client-safe)
  components/       KPI tiles, growth chart, post charts, sync button
  routes/_app/      Overview, Instagram, LinkedIn, Data sources
```

Nothing under `src/server` may be imported from a route at the top level — the
server functions in `src/lib/analytics.functions.ts` import it inside the
handler, which is what keeps tokens out of the browser bundle.

## Built with

- TanStack Start · React 19 · TypeScript
- Tailwind CSS 4 + shadcn/ui · Recharts
- Apify (scraping) · Supabase (snapshot history)
