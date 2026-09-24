import { ExternalLink, Pin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { compactNumber, fullNumber, shortDate } from "@/lib/format";
import { engagementsOf, type PostRecord } from "@/lib/analytics-types";

/**
 * The total of the columns THIS TABLE shows.
 *
 * Deliberately not engagementsOf(), which is likes + comments + shares and is
 * the right definition everywhere a competitor is involved — competitors have
 * no save count, so including saves there would compare two different things.
 *
 * Here every column is the owner's own and Saves is displayed two cells to the
 * left, so a "Total" that silently omitted it did not add up on screen: 164
 * likes + 0 comments + 68 saves + 106 shares was shown as 270. A row whose
 * total does not total its own columns reads as broken data even when every
 * individual figure is correct.
 */
function rowTotal(post: PostRecord): number {
  return engagementsOf(post) + (post.insight?.saved ?? 0);
}

/** Seconds, to one decimal — how Instagram itself reports average watch time. */
function watchSeconds(ms: number | undefined): string | null {
  if (!ms) return null;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * The post ledger. Also the accessible fallback for the charts: every plotted
 * number is readable here as text.
 *
 * When Graph data is present the table widens to carry the same columns
 * Instagram shows the account owner — reach, saves, shares and watch time.
 * Those columns appear only for posts Instagram actually measured: a competitor
 * row, or one outside the Graph window, shows an em dash rather than a zero,
 * because "not measured" and "measured as zero" are different facts and a 0
 * would quietly assert the second.
 */
export function PostsTable({ posts, showViews }: { posts: PostRecord[]; showViews: boolean }) {
  if (!posts.length) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No posts stored yet. Run a sync to pull the most recent posts.
      </p>
    );
  }

  const hasInsights = posts.some((post) => post.insight);
  const hasWatch = posts.some((post) => post.insight?.avgWatchMs);
  const blank = <span className="text-muted-foreground">&mdash;</span>;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[280px]">Post</TableHead>
            <TableHead>Published</TableHead>
            {showViews ? <TableHead className="text-right">Views</TableHead> : null}
            {hasInsights ? <TableHead className="text-right">Reach</TableHead> : null}
            <TableHead className="text-right">Likes</TableHead>
            <TableHead className="text-right">Comments</TableHead>
            {hasInsights ? <TableHead className="text-right">Saves</TableHead> : null}
            {hasInsights ? <TableHead className="text-right">Shares</TableHead> : null}
            {hasWatch ? <TableHead className="text-right">Avg watch</TableHead> : null}
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.map((post) => (
            <TableRow key={post.postId}>
              <TableCell className="max-w-[460px]">
                <div className="flex items-start gap-2">
                  <span className="line-clamp-2 text-sm">
                    {post.caption || <span className="text-muted-foreground">(no caption)</span>}
                  </span>
                  {post.url ? (
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label="Open post"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </div>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px] font-normal capitalize">
                    {post.format}
                  </Badge>
                  {post.pinned ? (
                    <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
                      <Pin className="size-2.5" aria-hidden />
                      Pinned — excluded from rates
                    </Badge>
                  ) : null}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {shortDate(post.publishedAt)}
              </TableCell>
              {showViews ? (
                <TableCell className="text-right tabular-nums">
                  {/* Instagram's own count when we have it — it is the number
                      the owner sees in the app, and it runs roughly double the
                      public one a scraper can read. */}
                  {post.insight?.views
                    ? compactNumber(post.insight.views)
                    : post.views
                      ? compactNumber(post.views)
                      : blank}
                </TableCell>
              ) : null}
              {hasInsights ? (
                <TableCell className="text-right tabular-nums">
                  {post.insight ? compactNumber(post.insight.reach) : blank}
                </TableCell>
              ) : null}
              <TableCell className="text-right tabular-nums">{fullNumber(post.likes)}</TableCell>
              <TableCell className="text-right tabular-nums">{fullNumber(post.comments)}</TableCell>
              {hasInsights ? (
                <TableCell className="text-right tabular-nums">
                  {post.insight ? fullNumber(post.insight.saved) : blank}
                </TableCell>
              ) : null}
              {hasInsights ? (
                <TableCell className="text-right tabular-nums">
                  {post.insight ? fullNumber(post.insight.shares) : blank}
                </TableCell>
              ) : null}
              {hasWatch ? (
                <TableCell className="text-right tabular-nums">
                  {watchSeconds(post.insight?.avgWatchMs) ?? blank}
                </TableCell>
              ) : null}
              <TableCell className="text-right font-medium tabular-nums">
                {fullNumber(rowTotal(post))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
