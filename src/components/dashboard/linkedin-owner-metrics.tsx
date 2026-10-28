// LinkedIn's owner-only half, measured by LinkedIn itself: impressions,
// members reached, saves and sends for each of Pritesh Sir's posts, from the
// Member Post Analytics API (server/linkedin-analytics.ts). The posts and their
// reactions, comments and reposts still come from the scraper; these figures
// are joined to them by post id.
//
// Shown in place of the locked "Impressions and members reached" panel once
// LinkedIn is connected and has figures. The audience breakdowns stay locked:
// LinkedIn offers no API for them on a personal profile.
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Eye, Percent, Users } from "lucide-react";
import { useMemo } from "react";

import { KpiTile } from "@/components/dashboard/kpi-tile";
import { LockedPanel } from "@/components/dashboard/locked-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PostRecord } from "@/lib/analytics-types";
import { compactNumber, dateTime, fullNumber, percent, shortDate } from "@/lib/format";
import { TRACK_DAYS, trueEngagementRate } from "@/lib/linkedin-analytics";
import { linkedInAnalyticsQueryOptions } from "@/lib/linkedin-api.functions";

const AUDIENCE_PANEL = {
  title: "Who you reach vs who follows you",
  description: "Industry, seniority, location and top companies",
  rows: [
    "In-network vs out-of-network",
    "Industry breakdown",
    "Seniority breakdown",
    "Top companies in reach",
  ],
  unlock:
    "LinkedIn's API offers none of these for a personal profile: they appear only on Pritesh's own LinkedIn analytics screens (Content and Audience) and in their Export.",
};

const IMPRESSIONS_PANEL = {
  title: "Impressions and members reached",
  description: "Per-post distribution figures",
  rows: ["Impressions", "Members reached", "Saves and sends", "Engagement rate on impressions"],
  unlock:
    "Measured by LinkedIn's Member Post Analytics API once Pritesh connects his LinkedIn on Data sources. They fill in on the next LinkedIn sync after that.",
};

export function LinkedInOwnerMetrics({ posts, color }: { posts: PostRecord[]; color: string }) {
  const { data } = useQuery(linkedInAnalyticsQueryOptions);
  const byId = useMemo(
    () => new Map((data?.posts ?? []).map((figures) => [figures.postId, figures])),
    [data],
  );

  // The posts in the selected range that LinkedIn has measured.
  const measured = posts
    .filter((post) => !post.pinned)
    .map((post) => ({ post, figures: byId.get(post.postId) }))
    .filter(
      (row): row is { post: PostRecord; figures: NonNullable<typeof row.figures> } =>
        row.figures?.impressions != null,
    );

  if (!data || !measured.length) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <LockedPanel {...IMPRESSIONS_PANEL} />
        <LockedPanel {...AUDIENCE_PANEL} />
      </div>
    );
  }

  const sum = (pick: (row: (typeof measured)[number]) => number | null) =>
    measured.reduce((total, row) => total + (pick(row) ?? 0), 0);
  const impressions = sum((row) => row.figures.impressions);
  const reached = sum((row) => row.figures.membersReached);
  const interactions = sum((row) => row.post.likes + row.post.comments + row.post.shares);
  const kept = sum((row) => (row.figures.saves ?? 0) + (row.figures.sends ?? 0));
  const rate = trueEngagementRate(interactions, impressions);
  const lastFetched = measured
    .map((row) => row.figures.fetchedAt ?? "")
    .sort()
    .at(-1);
  const rows = [...measured].sort(
    (a, b) => (b.figures.impressions ?? 0) - (a.figures.impressions ?? 0),
  );

  return (
    <div className="space-y-4">
      <section
        aria-label="LinkedIn owner-only metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiTile
          label="Impressions"
          value={fullNumber(impressions)}
          icon={Eye}
          hint={`${measured.length} of ${posts.filter((post) => !post.pinned).length} posts measured`}
          accent={color}
        />
        <KpiTile
          label="Members reached"
          value={fullNumber(reached)}
          icon={Users}
          hint="Summed per post, so a person reached twice counts twice"
          accent={color}
        />
        <KpiTile
          label="Engagement rate"
          value={rate === null ? "—" : percent(rate, 2)}
          icon={Percent}
          hint="interactions ÷ impressions, as LinkedIn counts them"
          accent={color}
        />
        <KpiTile
          label="Saves and sends"
          value={fullNumber(kept)}
          icon={Bookmark}
          hint="People keeping or passing a post on"
          accent={color}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Each post, as LinkedIn measured it</CardTitle>
          <CardDescription>
            Reactions, comments and reposts from each public post; impressions, reach, saves and
            sends from LinkedIn&rsquo;s own API. Refreshed daily while a post is under {TRACK_DAYS}{" "}
            days old, then kept.
            {lastFetched ? ` Last read ${dateTime(lastFetched)}.` : ""}
            {data.account
              ? ` Account, ${shortDate(data.account.day)}: ${fullNumber(data.account.followers ?? 0)} followers, ${compactNumber(data.account.impressions30d ?? 0)} impressions and ${compactNumber(data.account.membersReached30d ?? 0)} members reached in 30 days.`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Post</th>
                  <th className="py-2 pr-3 text-right font-medium">Impressions</th>
                  <th className="py-2 pr-3 text-right font-medium">Reached</th>
                  <th className="py-2 pr-3 text-right font-medium">Interactions</th>
                  <th className="py-2 pr-3 text-right font-medium">Engagement</th>
                  <th className="py-2 text-right font-medium">Saves · sends</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ post, figures }) => {
                  const engaged = post.likes + post.comments + post.shares;
                  const postRate = trueEngagementRate(engaged, figures.impressions);
                  return (
                    <tr key={post.postId} className="border-b last:border-0">
                      <td className="max-w-[22rem] py-2 pr-3">
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="line-clamp-1 hover:underline"
                        >
                          {post.caption || "(no text)"}
                        </a>
                        <span className="text-xs text-muted-foreground">
                          {shortDate(post.publishedAt)}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {fullNumber(figures.impressions ?? 0)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {fullNumber(figures.membersReached ?? 0)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fullNumber(engaged)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {postRate === null ? "—" : percent(postRate, 1)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {figures.saves ?? 0} · {figures.sends ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <LockedPanel {...AUDIENCE_PANEL} />
    </div>
  );
}
