import { Bookmark, Eye, Send, Timer, UserPlus, Users } from "lucide-react";

import { KpiTile } from "@/components/dashboard/kpi-tile";
import { MetricBars, type BarRow } from "@/components/dashboard/metric-bars";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { compactNumber, fullNumber, percent } from "@/lib/format";
import {
  measuredPosts,
  median,
  organicPosts,
  reachEngagementRate,
  type InstagramInsights,
  type PostRecord,
} from "@/lib/analytics-types";

/** ISO-3166 codes are what Graph returns; these are the ones this audience hits. */
const COUNTRY_NAMES: Record<string, string> = {
  IN: "India",
  US: "United States",
  BD: "Bangladesh",
  PK: "Pakistan",
  NP: "Nepal",
  AE: "UAE",
  GB: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  NG: "Nigeria",
  DE: "Germany",
  FR: "France",
  BR: "Brazil",
  RU: "Russia",
  SA: "Saudi Arabia",
  QA: "Qatar",
  SG: "Singapore",
  MA: "Morocco",
  DZ: "Algeria",
  KE: "Kenya",
  PT: "Portugal",
  SE: "Sweden",
  EG: "Egypt",
  ID: "Indonesia",
  PH: "Philippines",
  LK: "Sri Lanka",
  MY: "Malaysia",
  ZA: "South Africa",
};

const countryName = (code: string) => COUNTRY_NAMES[code] ?? code;

function share(
  slices: { label: string; value: number }[],
): (row: { label: string; value: number }) => string {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return (row) => (total > 0 ? `${((row.value / total) * 100).toFixed(1)}%` : "—");
}

function toRows(
  slices: { label: string; value: number }[],
  limit: number,
  label: (value: string) => string = (value) => value,
): BarRow[] {
  const format = share(slices);
  return slices.slice(0, limit).map((slice) => ({
    label: label(slice.label),
    value: slice.value,
    display: `${format(slice)}`,
    sub: compactNumber(slice.value),
  }));
}

/**
 * The panels that were locked until a Meta Graph token existed.
 *
 * Everything here is measured by Instagram itself rather than scraped, so it is
 * the only place in the dashboard that can speak about reach, saves, watch time
 * and who the audience actually is. Each panel states its own window, because
 * the account totals are a trailing 28 days while the audience mix is lifetime
 * and the per-post figures cover only the posts Graph still reports on.
 */
export function InsightsPanels({
  insights,
  posts,
  color,
}: {
  insights: InstagramInsights;
  posts: PostRecord[];
  color: string;
}) {
  const { account, audience } = insights;

  const measured = measuredPosts(organicPosts(posts));
  const reachRate = reachEngagementRate(posts);
  const saves = median(measured.map((post) => post.insight?.saved ?? 0));
  const shares = median(measured.map((post) => post.insight?.shares ?? 0));
  const reachPerPost = median(measured.map((post) => post.insight?.reach ?? 0));
  const watch = measured
    .map((post) => post.insight?.avgWatchMs)
    .filter((value): value is number => value !== undefined && value > 0);
  const avgWatch = median(watch);

  return (
    <div className="space-y-4">
      {/* ---- Account funnel, trailing 28 days ---- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiTile
          label="Accounts reached"
          value={compactNumber(account.reach)}
          icon={Users}
          hint="Unique accounts · last 28 days"
          accent={color}
        />
        <KpiTile
          label="Views"
          value={compactNumber(account.views)}
          icon={Eye}
          hint="Total content views · 28 days"
          accent={color}
        />
        <KpiTile
          label="Accounts engaged"
          value={compactNumber(account.accountsEngaged)}
          icon={UserPlus}
          hint={
            account.reach > 0
              ? `${percent(account.accountsEngaged / account.reach)} of reach acted`
              : "Of the accounts reached"
          }
          accent={color}
        />
        <KpiTile
          label="Profile visits"
          value={compactNumber(account.profileViews)}
          icon={Users}
          hint={
            account.reach > 0
              ? `${percent(account.profileViews / account.reach)} of reach visited`
              : "From content · 28 days"
          }
        />
        <KpiTile
          label="Total interactions"
          value={compactNumber(account.totalInteractions)}
          icon={Send}
          hint="Likes, comments, saves, shares"
        />
        <KpiTile
          label="Website taps"
          value={compactNumber(account.websiteClicks)}
          icon={Send}
          hint="Bio link · 28 days"
        />
      </div>

      {/* ---- Per-post owner metrics ---- */}
      {measured.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-post, measured by Instagram</CardTitle>
            <CardDescription>
              Median across {measured.length} post{measured.length === 1 ? "" : "s"} Instagram still
              reports on. Reach is unique accounts, so the rate below is the honest one — it answers
              what share of people who saw a post acted on it.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Engagement / reach"
              value={reachRate === null ? "—" : percent(reachRate)}
              hint="Likes + comments + saves + shares ÷ reach"
            />
            <Stat label="Median reach" value={compactNumber(reachPerPost)} hint="Per post" />
            <Stat
              label="Median saves"
              value={fullNumber(saves)}
              hint="The strongest ranking signal"
              icon={Bookmark}
            />
            <Stat label="Median shares" value={fullNumber(shares)} hint="Sends per post" />
            {watch.length ? (
              <Stat
                label="Avg watch time"
                value={`${(avgWatch / 1000).toFixed(1)}s`}
                hint={`Across ${watch.length} reel${watch.length === 1 ? "" : "s"}`}
                icon={Timer}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ---- Audience ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MetricBars
          title="Age"
          description="Share of followers · lifetime"
          rows={toRows(audience.age, 8)}
          color={color}
        />
        <MetricBars
          title="Gender"
          description="Share of followers · lifetime"
          rows={toRows(audience.gender, 4)}
          color={color}
        />
        <MetricBars
          title="Top countries"
          description="Share of followers · lifetime"
          rows={toRows(audience.country, 8, countryName)}
          color={color}
        />
        <MetricBars
          title="Top cities"
          description="Share of followers · lifetime"
          rows={toRows(audience.city, 8)}
          color={color}
          note="Instagram reports city only for followers who share a location, so these shares are of a smaller base than the country split."
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon?: typeof Bookmark;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
