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
import { Bookmark, ChevronRight, Eye, FileText, Percent, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { KpiTile } from "@/components/dashboard/kpi-tile";
import { LinkedInDiscovery } from "@/components/dashboard/linkedin-discovery";
import { LockedPanel } from "@/components/dashboard/locked-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PostRecord } from "@/lib/analytics-types";
import type { ResolvedRange } from "@/lib/date-range";
import { compactNumber, dateTime, fullNumber, percent, shortDate } from "@/lib/format";
import {
  measuredByImpressions,
  postAnalyticsUrl,
  TRACK_DAYS,
  trueEngagementRate,
  type LinkedInPostFigures,
} from "@/lib/linkedin-analytics";
import { articlesVsPosts, type LinkedInArticle } from "@/lib/linkedin-articles";
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

/**
 * One post the way his LinkedIn "Top performing posts" shows it: impressions
 * and engagements across the top, View analytics, then the post's text.
 * `detail` adds the figures LinkedIn's own card leaves to its analytics page.
 */
export function LinkedInPostCard({
  post,
  figures,
  article,
  detail = false,
}: {
  post: PostRecord;
  figures: LinkedInPostFigures;
  /** The LinkedIn article this post shares, when it shares one. */
  article?: LinkedInArticle | undefined;
  detail?: boolean;
}) {
  const engaged = post.likes + post.comments + post.shares;
  const rate = trueEngagementRate(engaged, figures.impressions);
  return (
    <li className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-2.5 text-sm">
        <span className="tabular-nums">
          {fullNumber(figures.impressions ?? 0)} impressions · {fullNumber(engaged)} engagements
        </span>
        <a
          href={postAnalyticsUrl(post.postId)}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-primary hover:underline"
        >
          View analytics
        </a>
      </div>
      <div className="space-y-1.5 px-4 py-3">
        {article ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge variant="secondary" className="gap-1 text-[10px] font-medium">
              <FileText className="size-3" aria-hidden />
              Article
            </Badge>
            <span className="text-sm font-semibold leading-snug">{article.title}</span>
            {article.readMinutes ? (
              <span className="text-xs text-muted-foreground">{article.readMinutes} min read</span>
            ) : null}
            {article.url ? (
              <a
                href={article.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs font-medium text-primary hover:underline"
              >
                Open article
              </a>
            ) : null}
          </div>
        ) : null}
        <a
          href={post.url}
          target="_blank"
          rel="noreferrer noopener"
          className="line-clamp-2 text-sm leading-snug hover:underline"
        >
          {post.caption || "(no text)"}
        </a>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
          <span>{shortDate(post.publishedAt)}</span>
          {detail ? (
            <>
              <span>{fullNumber(figures.membersReached ?? 0)} members reached</span>
              <span>{rate === null ? "—" : percent(rate, 1)} engagement rate</span>
              <span>
                {fullNumber(post.likes)} reactions · {fullNumber(post.comments)} comments ·{" "}
                {fullNumber(post.shares)} reposts
              </span>
              <span>
                {figures.saves ?? 0} saves · {figures.sends ?? 0} sends
              </span>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}

/** A list of post cards: the first few, then Show more, as LinkedIn does it. */
export function LinkedInPostList({
  rows,
  first,
  detail = false,
}: {
  rows: Array<{ post: PostRecord; figures: LinkedInPostFigures }>;
  first: number;
  detail?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, first);
  // His articles, by the post that shares each one. Cached with the figures.
  const { data } = useQuery(linkedInAnalyticsQueryOptions);
  const articles = useMemo(
    () => new Map((data?.articles ?? []).map((article) => [article.postId, article])),
    [data],
  );
  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {shown.map(({ post, figures }) => (
          <LinkedInPostCard
            key={post.postId}
            post={post}
            figures={figures}
            article={articles.get(post.postId)}
            detail={detail}
          />
        ))}
      </ol>
      {rows.length > first ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-center gap-1 py-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {open ? "Show less" : `Show more (${rows.length - first})`}
          <ChevronRight
            className={`size-4 transition-transform ${open ? "-rotate-90" : ""}`}
            aria-hidden
          />
        </button>
      ) : null}
    </div>
  );
}

export function LinkedInOwnerMetrics({
  posts,
  color,
  range,
}: {
  posts: PostRecord[];
  color: string;
  range: ResolvedRange;
}) {
  const { data } = useQuery(linkedInAnalyticsQueryOptions);
  // The posts in the selected range that LinkedIn has measured.
  const measured = useMemo(() => measuredByImpressions(posts, data?.posts), [posts, data]);

  if (!data || !measured.length) {
    return (
      <div className="space-y-4">
        <LinkedInDiscovery range={range} />
        <div className="grid gap-4 lg:grid-cols-2">
          <LockedPanel {...IMPRESSIONS_PANEL} />
          <LockedPanel {...AUDIENCE_PANEL} />
        </div>
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
          <LinkedInPostList rows={measured} first={5} detail />
        </CardContent>
      </Card>

      <ArticlesVsPosts rows={measured} />

      <LinkedInDiscovery range={range} />
      <LockedPanel {...AUDIENCE_PANEL} />
    </div>
  );
}

/**
 * His LinkedIn articles against his other posts, on the impressions LinkedIn
 * measured for the post that shares each one. Hidden until he has both.
 */
function ArticlesVsPosts({
  rows,
}: {
  rows: Array<{ post: PostRecord; figures: LinkedInPostFigures }>;
}) {
  const { articles, posts } = useMemo(() => articlesVsPosts(rows), [rows]);
  if (!articles.posts || !posts.posts) return null;
  const column = (label: string, group: typeof articles) => (
    <div className="space-y-2 rounded-lg border p-4">
      <p className="text-sm font-semibold">
        {label}{" "}
        <span className="font-normal text-muted-foreground">
          ({group.posts} {group.posts === 1 ? "post" : "posts"})
        </span>
      </p>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Typical impressions</dt>
          <dd className="font-semibold tabular-nums">{fullNumber(group.medianImpressions)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Typical engagements</dt>
          <dd className="font-semibold tabular-nums">{fullNumber(group.medianEngagements)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Engagement on impressions</dt>
          <dd className="font-semibold tabular-nums">
            {group.engagementRate === null ? "—" : percent(group.engagementRate, 1)}
          </dd>
        </div>
      </dl>
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Articles vs posts</CardTitle>
        <CardDescription>
          His LinkedIn articles against his other posts, in the period shown. An article is measured
          by the post that shares it: LinkedIn&rsquo;s API reports that post&rsquo;s impressions,
          not the article page&rsquo;s own views, which only his LinkedIn screen shows.
          {articles.posts < 3 ? " Fewer than 3 articles so far: a direction, not a result." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {column("Articles", articles)}
        {column("Posts", posts)}
      </CardContent>
    </Card>
  );
}
