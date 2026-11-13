// A post's cover, small: the thumbnail where one is stored, a quiet
// placeholder where it is not (a post scraped before covers were mirrored, or
// one whose cover could not be fetched).
import { useState } from "react";

import type { PostRecord } from "@/lib/analytics-types";
import { cn } from "@/lib/utils";

export function PostCover({ post, className }: { post: PostRecord; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!post.thumbnailUrl || broken) {
    return (
      <div
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md bg-muted text-[13px] text-muted-foreground",
          className,
        )}
      >
        Cover
      </div>
    );
  }
  return (
    <img
      src={post.thumbnailUrl}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className={cn("shrink-0 rounded-md bg-muted object-cover", className)}
    />
  );
}

/** A follower line, small enough for a card: the period's points, no axes. */
export function Sparkline({
  values,
  color,
  className,
}: {
  values: number[];
  color: string;
  className?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 28 - ((value - min) / span) * 24;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden
      className={cn("h-10 w-36", className)}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
