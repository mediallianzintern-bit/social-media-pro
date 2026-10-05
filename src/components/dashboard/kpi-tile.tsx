import { ExternalLink, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A hero number: one value, an icon, and a one-line qualifier.
 *
 * T68a — a tile whose number belongs to ONE post takes an `href` and becomes a
 * link to it. "Top post views: 17.4K" was a dead end: it named a specific reel
 * and gave no way to go and look at it. Tiles that aggregate many posts, like
 * Followers or Engagement rate, have no single destination and stay plain.
 */
export function KpiTile({
  label,
  value,
  icon: Icon,
  hint,
  accent,
  href,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string | undefined;
  accent?: string | undefined;
  /** The post this number is about, when it is about exactly one. */
  href?: string | undefined;
}) {
  const body = (
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-2.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          {hint}
          {href ? <ExternalLink className="size-3 shrink-0" aria-hidden /> : null}
        </p>
      ) : null}
    </CardContent>
  );

  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        href && "transition-colors hover:border-foreground/25",
      )}
    >
      {accent ? (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
        />
      ) : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${label}: ${value} — open the post`}
        >
          {body}
        </a>
      ) : (
        body
      )}
    </Card>
  );
}
