// LinkedIn's engagement, from what is public on each post: reactions, comments
// and reposts, for the selected window, against the window just before it, and
// the posts that drew the most.
//
// The public half of the "Content analytics" screen in Pritesh's own LinkedIn.
// The other half (impressions, members reached, saves, sends) is never shown on
// a public post, so no scraper can read it; the locked panels below say where
// it comes from. Counted the way the rest of the dashboard counts interactions
// (analytics-types engagementsOf), so this panel and the Overview tiles agree.
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  MessageCircle,
  Repeat2,
  ThumbsUp,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { engagementsOf, organicPosts, type PostRecord } from "@/lib/analytics-types";
import { withinRange, type ResolvedRange } from "@/lib/date-range";
import { delta, fullNumber, shortDate, signedPercent } from "@/lib/format";

const TOP_POSTS = 5;

interface Totals {
  posts: number;
  reactions: number;
  comments: number;
  reposts: number;
  engagements: number;
}

function totalsOf(posts: PostRecord[]): Totals {
  return posts.reduce<Totals>(
    (sum, post) => ({
      posts: sum.posts + 1,
      reactions: sum.reactions + post.likes,
      comments: sum.comments + post.comments,
      reposts: sum.reposts + post.shares,
      engagements: sum.engagements + engagementsOf(post),
    }),
    { posts: 0, reactions: 0, comments: 0, reposts: 0, engagements: 0 },
  );
}

/** The window of the same length just before this one, or null for "all time". */
function priorWindow(range: ResolvedRange): ResolvedRange | null {
  if (!range.from) return null;
  const end = range.to ?? new Date();
  const length = end.getTime() - range.from.getTime();
  if (length <= 0) return null;
  return {
    ...range,
    from: new Date(range.from.getTime() - length),
    to: range.from,
    label: "previous period",
  };
}

function Change({ now, before }: { now: number; before: number | null }) {
  if (before === null) return null;
  const change = delta(now, before);
  if (change === null) {
    return <span className="text-xs text-muted-foreground">none in the previous period</span>;
  }
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        up ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
      }`}
      title={`${fullNumber(now)} now, ${fullNumber(before)} in the previous period`}
    >
      <Icon className="size-3.5" aria-hidden />
      {signedPercent(change)} vs previous period
    </span>
  );
}

export function PublicEngagement({
  posts,
  allPosts,
  range,
  color,
}: {
  /** Posts in the selected window. */
  posts: PostRecord[];
  /** Every stored post, for the previous-period comparison. */
  allPosts: PostRecord[];
  range: ResolvedRange;
  color: string;
}) {
  const current = organicPosts(posts);
  const now = totalsOf(current);
  const prior = priorWindow(range);
  const before = prior
    ? totalsOf(organicPosts(allPosts.filter((post) => withinRange(post.publishedAt, prior))))
    : null;
  const top = [...current].sort((a, b) => engagementsOf(b) - engagementsOf(a)).slice(0, TOP_POSTS);

  const tiles: Array<{ label: string; key: keyof Totals; icon: typeof ThumbsUp | null }> = [
    { label: "Social engagements", key: "engagements", icon: null },
    { label: "Reactions", key: "reactions", icon: ThumbsUp },
    { label: "Comments", key: "comments", icon: MessageCircle },
    { label: "Reposts", key: "reposts", icon: Repeat2 },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engagement</CardTitle>
          <CardDescription>
            {fullNumber(now.posts)} post{now.posts === 1 ? "" : "s"} · {range.label}. Counts the
            engagement on posts published in this window. LinkedIn&rsquo;s own screen counts the
            engagement received in the window on any post, plus saves, so its total differs a
            little; each post&rsquo;s own count matches.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tiles.map(({ label, key, icon: Icon }) => (
            <div
              key={key}
              className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 ${
                key === "engagements" ? "border-b pb-3" : ""
              }`}
            >
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                {Icon ? <Icon className="size-4" aria-hidden /> : null}
                {label}
              </span>
              <span className="flex flex-wrap items-baseline gap-3">
                <Change now={now[key]} before={before ? before[key] : null} />
                <span
                  className={`tabular-nums ${key === "engagements" ? "text-2xl font-bold" : "text-base font-semibold"}`}
                  style={key === "engagements" ? { color } : undefined}
                >
                  {fullNumber(now[key])}
                </span>
              </span>
            </div>
          ))}
          {now.posts ? (
            <p className="text-xs text-muted-foreground">
              {fullNumber(Number((now.engagements / now.posts).toFixed(2)))} engagements per post on
              average
              {before?.posts
                ? `, against ${fullNumber(Number((before.engagements / before.posts).toFixed(2)))} in the previous period`
                : ""}
              .
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top performing posts</CardTitle>
          <CardDescription>
            By engagements in {range.label.toLowerCase()}. Ranking by impressions needs
            Pritesh&rsquo;s own LinkedIn analytics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {top.length ? (
            <ol className="divide-y">
              {top.map((post, index) => (
                <li key={post.postId} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="w-4 shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="line-clamp-2 text-sm leading-snug">
                      {post.caption || "(no text)"}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{shortDate(post.publishedAt)}</span>
                      <span className="font-medium text-foreground tabular-nums">
                        {fullNumber(engagementsOf(post))} engagements
                      </span>
                      <span className="tabular-nums">
                        {fullNumber(post.likes)} reactions · {fullNumber(post.comments)} comments ·{" "}
                        {fullNumber(post.shares)} reposts
                      </span>
                      {post.url ? (
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                        >
                          Open <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : null}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No posts in this window.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
