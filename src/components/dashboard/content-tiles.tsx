import { ExternalLink } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { compactNumber, shortDate } from "@/lib/format";
import { engagementsOf, type PostRecord, viewsOf } from "@/lib/analytics-types";

/**
 * Top content as a poster wall — the real cover frame where there is one.
 *
 * Instagram's own thumbnail links expire within days, so what is shown here is
 * our stored copy of the cover (see server/thumbnails.ts). A post keeps the
 * text poster until a sync has mirrored its cover, and falls back to it if the
 * image fails to load, so the wall is never broken images.
 */
/** The first sentence of the caption — what the post leads with. */
const openingLine = (caption: string) => caption.split(/[.!?\n]/)[0]?.trim() || "(no caption)";

/**
 * The cover frame, with the opening line over it.
 *
 * The line stays even when there is artwork: these are text-led marketing
 * posts, and on a four-across wall the hook is what makes a tile scannable.
 */
function Poster({ post, color }: { post: PostRecord; color: string }) {
  const [broken, setBroken] = useState(false);
  const line = openingLine(post.caption);

  if (!post.thumbnailUrl || broken) {
    return (
      <div
        className="flex aspect-[4/5] items-center justify-center p-5 text-center"
        style={{ backgroundColor: `color-mix(in oklab, ${color} 12%, var(--card))` }}
      >
        <p className="line-clamp-6 text-balance text-sm font-bold leading-snug tracking-tight text-foreground">
          {line}
        </p>
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-muted">
      <img
        src={post.thumbnailUrl}
        alt={line}
        loading="lazy"
        className="size-full object-cover"
        onError={() => setBroken(true)}
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-3 pt-10">
        <p className="line-clamp-3 text-balance text-xs font-semibold leading-snug text-white drop-shadow">
          {line}
        </p>
      </div>
    </div>
  );
}

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
          className="relative overflow-hidden transition-colors hover:border-foreground/20"
        >
          <Poster post={post} color={color} />
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold tabular-nums">
                {compactNumber(value(post))}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {metric === "views" ? "views" : "interactions"}
                </span>
              </span>
              {post.url ? (
                // T68a — the whole tile opens the post, not just this icon.
                // People click the picture; a 14px target in the corner was the
                // only way through. `before:absolute inset-0` stretches this one
                // anchor over the card, so there is still a single link for a
                // screen reader and for the keyboard rather than a card-wide
                // click handler that neither can reach.
                <a
                  href={post.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-muted-foreground before:absolute before:inset-0 hover:text-foreground"
                  aria-label="Open this post"
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
