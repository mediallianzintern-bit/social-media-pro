import { ExternalLink, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { shortDate } from "@/lib/format";
import { postInsight, type Verdict } from "@/lib/post-insight";
import { usePlatform } from "@/lib/use-dashboard";
import type { PlatformId, PostRecord } from "@/lib/analytics-types";
import { cn } from "@/lib/utils";

const VERDICT_CLASS: Record<Verdict, string> = {
  strong: "text-emerald-600 dark:text-emerald-400",
  typical: "text-muted-foreground",
  weak: "text-amber-600 dark:text-amber-400",
};

/**
 * "See the insight" — one post, read against this account's own history.
 *
 * The ledger already shows the numbers; what it cannot show is whether they
 * are good. Every figure in here is a multiple of this account's median, which
 * is the only way "17.4K views" means anything, and the readings at the bottom
 * are rules over those multiples rather than sentences from a model. Opening
 * it spends nothing.
 *
 * Comparisons are drawn from ALL stored posts, not the window on screen: how
 * this account normally performs should not change because someone picked
 * "7 days" from the range picker.
 */
export function PostInsightButton({
  post,
  platform,
  label = "See the insight",
  className,
}: {
  post: PostRecord;
  platform: PlatformId;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={cn("h-auto gap-1.5 px-2 py-1 text-xs", className)}
        >
          <Sparkles className="size-3" aria-hidden />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        {open ? <InsightBody post={post} platform={platform} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Split out so the comparison only runs when the dialog is actually open —
 * the posts table renders one trigger per row, and scoring every post against
 * every other on page load would be sixty passes nobody asked for.
 */
function InsightBody({ post, platform }: { post: PostRecord; platform: PlatformId }) {
  const { allPosts } = usePlatform(platform);
  const insight = useMemo(() => postInsight(post, allPosts), [post, allPosts]);
  const opening = post.caption.split(/[.!?\n]/)[0]?.trim() || "(no caption)";

  return (
    <>
      <DialogHeader>
        <DialogDescription className="text-xs">
          {shortDate(post.publishedAt)} · {post.format}
          {post.contentLane ? ` · ${post.contentLane}` : ""}
        </DialogDescription>
        <DialogTitle className="text-left text-base leading-snug">{opening}</DialogTitle>
      </DialogHeader>

      <p className="rounded-lg border bg-muted/40 p-3 text-sm font-medium">{insight.headline}</p>

      <dl className="divide-y rounded-lg border">
        {insight.rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <dt className="text-sm font-medium">{row.label}</dt>
              <dd className="text-xs text-muted-foreground">{row.note}</dd>
            </div>
            <div className="shrink-0 text-right">
              <span className="text-sm font-semibold tabular-nums">{row.value}</span>
              {row.multiple != null && row.verdict ? (
                <span
                  className={cn(
                    "ml-2 text-xs font-semibold tabular-nums",
                    VERDICT_CLASS[row.verdict],
                  )}
                >
                  {row.multiple}×
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </dl>

      {insight.reads.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What this says
          </p>
          <ul className="space-y-2">
            {insight.reads.map((read) => (
              <li key={read} className="rounded-lg border bg-card p-3 text-sm leading-relaxed">
                {read}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing here stands out from your usual — this post behaved the way most of them do.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <Badge variant="outline" className="text-[10px] font-normal">
          Measured against {insight.sample} stored post{insight.sample === 1 ? "" : "s"}
        </Badge>
        {post.url ? (
          <a
            href={post.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Open the post
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : null}
      </div>
    </>
  );
}
