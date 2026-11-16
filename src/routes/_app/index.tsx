// Home (13 Nov 2026, UI review; replaces Overview): "how am I doing, and what
// do I do next". One sentence on both accounts, one card each, at most three
// things to do with one button each, and the period's best post. The detail
// is a click away on each account's page.
//
// Every number comes from lib/account-summary.ts, for the period chosen in
// the header, so Home, the account Summary and the posts table agree.
import { createFileRoute, Link } from "@tanstack/react-router";
import { Info } from "lucide-react";

import { FollowFlowLine } from "@/components/dashboard/follow-flow-line";
import { PostCover, Sparkline } from "@/components/dashboard/post-cover";
import { PostInsightButton } from "@/components/dashboard/post-insight-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  accountSummary,
  bestPost,
  bestSlot,
  changeSentence,
  compact,
  doMoreAndLess,
  postTitle,
  primaryOf,
  verdict,
  type AccountSummary,
} from "@/lib/account-summary";
import { viewsOf, type PlatformData, type PostRecord } from "@/lib/analytics-types";
import { dayMonth, type ResolvedRange } from "@/lib/date-range";
import { fullNumber, percent } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform-meta";
import { usePlatform, useFilteredDashboard } from "@/lib/use-dashboard";
import { useWaitingIdeas } from "@/lib/use-waiting-ideas";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/")({ component: Home });

interface Action {
  title: string;
  detail: string;
  button: string;
  to: string;
  search?: Record<string, string>;
  primary?: boolean;
}

function Home() {
  const { data } = useFilteredDashboard();
  const instagram = usePlatform("instagram");
  const linkedin = usePlatform("linkedin");
  const { waiting, byPlatform } = useWaitingIdeas();

  const ranges = { instagram: instagram.range, linkedin: linkedin.range };
  const accounts = [instagram, linkedin]
    .filter((entry): entry is typeof entry & { data: PlatformData } => Boolean(entry.data))
    .filter((entry) => entry.data.status === "ok")
    .map((entry) => ({
      data: entry.data,
      summary: {
        ...accountSummary(entry.data, entry.range),
        label: PLATFORM_META[entry.data.platform].label,
      },
    }));

  const actions: Action[] = [];
  if (waiting.length) {
    actions.push({
      title: `Review ${waiting.length} idea${waiting.length === 1 ? "" : "s"} waiting for you`,
      detail: [
        byPlatform.instagram ? `${byPlatform.instagram} for Instagram` : "",
        byPlatform.linkedin ? `${byPlatform.linkedin} for LinkedIn` : "",
      ]
        .filter(Boolean)
        .join(", ")
        .concat("."),
      button: "Review ideas",
      to: "/ideas",
      primary: true,
    });
  }
  // The account that needs attention first, then the other.
  const ordered = [...accounts].sort(
    (a, b) => Number(b.summary.needsAttention) - Number(a.summary.needsAttention),
  );
  for (const { data: account, summary } of ordered) {
    const top = doMoreAndLess(account).more.find((finding) => finding.kind === "topic");
    if (top && actions.length < 3) {
      actions.push({
        title: `Make one more “${top.label}” post for ${summary.label}`,
        detail: `${top.label} gets ${top.value}, measured over ${top.posts} posts.`,
        button: "See ideas",
        to: PLATFORM_META[account.platform].route,
        search: { tab: "ideas" },
      });
    }
  }
  for (const { data: account, summary } of ordered) {
    const slot = bestSlot(account);
    if (slot && actions.length < 3) {
      actions.push({
        title: `Post on ${summary.label} around ${slot.ist}`,
        detail: `That hour gets ${slot.ratio.toFixed(1)}× your typical ${summary.usesViews ? "views" : "interactions"}, measured over ${slot.posts} posts.`,
        button: "See when to post",
        to: PLATFORM_META[account.platform].route,
        search: { tab: "audience" },
      });
    }
  }

  // The period's best post: the one furthest above its own account's typical post.
  const best = accounts
    .map(({ data: account, summary }) => {
      const post = bestPost(account);
      return post
        ? {
            post,
            account,
            summary,
            ratio: primaryOf(post, summary.usesViews) / (summary.typical || 1),
          }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.ratio - a.ratio)[0];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {data.setupError ? (
        <Alert>
          <Info className="size-4" aria-hidden />
          <AlertTitle>Setup needed before the first refresh</AlertTitle>
          <AlertDescription>
            {data.setupError}.{" "}
            <Link to="/sources" className="font-medium underline underline-offset-4">
              See what to add
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      <div>
        {data.goal ? (
          <p className="text-[13px] text-muted-foreground">Goal: {data.goal.label}</p>
        ) : null}
        <h2 className="mt-1 text-2xl leading-tight font-bold md:text-3xl">
          {verdict(accounts.map((entry) => entry.summary))}
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map(({ data: account, summary }) => (
          <AccountCard
            key={account.platform}
            data={account}
            summary={summary}
            range={ranges[account.platform]}
          />
        ))}
      </div>

      {actions.length ? (
        <Card>
          <CardContent className="p-0">
            <h3 className="border-b px-5 py-4 text-base font-semibold">Do next</h3>
            <ol>
              {actions.map((action, index) => (
                <li
                  key={action.title}
                  className="flex flex-col gap-3 border-b px-5 py-4 last:border-b-0 sm:flex-row sm:items-center"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                      action.primary ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{action.title}</p>
                    <p className="text-[13px] text-muted-foreground">{action.detail}</p>
                  </div>
                  <Button
                    asChild
                    variant={action.primary ? "default" : "outline"}
                    className="h-11 shrink-0"
                  >
                    <Link to={action.to} search={action.search as never}>
                      {action.button}
                    </Link>
                  </Button>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {best ? <BestPost {...best} /> : null}
    </div>
  );
}

function AccountCard({
  data,
  summary,
  range,
}: {
  data: PlatformData;
  summary: AccountSummary & { label: string };
  range: ResolvedRange;
}) {
  const meta = PLATFORM_META[data.platform];
  const change = changeSentence(summary);
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            {meta.label}
          </span>
          {summary.change != null ? (
            <Badge
              variant="outline"
              className={cn(
                "rounded-full px-3 py-1 text-[13px] font-semibold",
                summary.needsAttention
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
              )}
            >
              {summary.needsAttention ? "Needs attention" : "On track"}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-4xl font-bold tabular-nums">
              {summary.followers == null ? "—" : fullNumber(summary.followers)}
            </p>
            <p className="text-[13px] text-muted-foreground">followers</p>
          </div>
          <Sparkline values={data.growth.map((point) => point.followers)} color={meta.color} />
        </div>
        {change ? (
          <p
            className={cn(
              "text-sm font-semibold",
              summary.needsAttention
                ? "text-red-700 dark:text-red-400"
                : "text-emerald-700 dark:text-emerald-400",
            )}
          >
            {change}
          </p>
        ) : null}
        <FollowFlowLine platform={data.platform} range={range} className="block text-[13px]" />
        <p className="text-[13px] text-muted-foreground">
          Engagement rate {percent(summary.rate, 2)} · {summary.postsPerWeek.toFixed(1)} posts a
          week
        </p>
        <Link
          to={meta.route}
          className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
        >
          {summary.needsAttention ? "See what to change" : "See what is working"}
        </Link>
      </CardContent>
    </Card>
  );
}

function BestPost({
  post,
  account,
  summary,
}: {
  post: PostRecord;
  account: PlatformData;
  summary: AccountSummary & { label: string };
}) {
  const parts = [
    summary.usesViews
      ? `${compact(viewsOf(post))} views`
      : `${compact(primaryOf(post, false))} interactions`,
    post.insight?.saved ? `${compact(post.insight.saved)} saves` : "",
    post.shares || post.insight?.shares
      ? `${compact(post.insight?.shares ?? post.shares)} shares`
      : "",
  ].filter(Boolean);
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <PostCover post={post} className="size-16" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted-foreground">
            Best post {summary.since} · {summary.label} · {dayMonth(new Date(post.publishedAt))}
          </p>
          <p className="mt-0.5 text-sm font-semibold">{postTitle(post.caption, 110)}</p>
          <p className="text-[13px] text-muted-foreground">{parts.join(" · ")}</p>
        </div>
        <PostInsightButton
          post={post}
          platform={account.platform}
          label="Why it worked"
          className="h-11 text-sm font-semibold underline underline-offset-4"
        />
      </CardContent>
    </Card>
  );
}
