import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { compactNumber, shortDate } from "@/lib/format";
import { engagementsOf, type PostRecord, viewsOf } from "@/lib/analytics-types";

/**
 * Top content as a poster wall. These are text-led marketing posts, so the
 * opening line is the artwork — the thumbnail URLs Instagram returns are
 * short-lived signed CDN links that expire, and a wall of broken images is
 * worse than no images.
 */
export function ContentTiles({
  posts,
  color,
  metric,
}: {
  posts: PostRecord[];
  color: string;
  metric: "views" | "engagements";
}) {
  if (!posts.length) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No posts in this window.
      </p>
    );
  }

  const value = (post: PostRecord) => (metric === "views" ? viewsOf(post) : engagementsOf(post));

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {posts.map((post) => (
        <Card
          key={post.postId}
          className="overflow-hidden transition-colors hover:border-foreground/20"
        >
          <div
            className="flex aspect-[4/5] items-center justify-center p-5 text-center"
            style={{ backgroundColor: `color-mix(in oklab, ${color} 12%, var(--card))` }}
          >
            <p className="line-clamp-6 text-balance text-sm font-bold leading-snug tracking-tight text-foreground">
              {post.caption.split(/[.!?\n]/)[0]?.trim() || "(no caption)"}
            </p>
          </div>
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold tabular-nums">
                {compactNumber(value(post))}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {metric === "views" ? "views" : "interactions"}
                </span>
              </span>
              {post.url ? (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Open post"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline" className="text-[10px] font-normal capitalize">
                {post.format}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {shortDate(post.publishedAt)}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
