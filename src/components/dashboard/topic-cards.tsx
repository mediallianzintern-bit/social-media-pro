import { ArrowRight, Lightbulb } from "lucide-react";
import { useState } from "react";

import { CardContent } from "@/components/ui/card";
import { ScriptDrawer } from "@/components/dashboard/script-drawer";
import { cn } from "@/lib/utils";
import { PLATFORM_META } from "@/lib/platform-meta";
import type { Recommendation } from "@/lib/recommendations";

/**
 * Ranked recommendations. Each card leads with the measured signal that
 * produced it — an idea without its rationale can't be argued with, and a
 * recommendation you can't argue with is one you can't trust.
 */
export function TopicCards({ recommendations }: { recommendations: Recommendation[] }) {
  const [open, setOpen] = useState<Recommendation | null>(null);

  if (!recommendations.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <Lightbulb className="mx-auto size-5 text-muted-foreground" aria-hidden />
        <p className="mt-2 text-sm font-medium">No recommendation clears the evidence bar yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          Every suggestion here has to be triggered by a measured pattern in this window. Widen the
          date range, or let a few more syncs accumulate.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        {recommendations.map((rec) => {
          const accent = PLATFORM_META[rec.platform].color;
          return (
            <button
              key={rec.id}
              type="button"
              onClick={() => setOpen(rec)}
              className="group rounded-xl border bg-card text-left text-card-foreground shadow transition-all hover:-translate-y-0.5 hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <CardContent className="relative p-5">
                <span
                  className="absolute right-5 top-5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold"
                  style={{ color: accent }}
                >
                  #{rec.rank}
                </span>
                <p className="pr-12 text-[11px] font-bold uppercase leading-relaxed tracking-wider text-muted-foreground">
                  {rec.evidence}
                </p>
                <h3 className="mt-2.5 text-base font-bold leading-snug tracking-tight">
                  {rec.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{rec.pitch}</p>

                <div
                  className="mt-4 flex gap-1"
                  role="img"
                  aria-label={`Confidence ${rec.score} of 5`}
                >
                  {[1, 2, 3, 4, 5].map((pip) => (
                    <span
                      key={pip}
                      className={cn("h-1 flex-1 rounded-full", pip > rec.score && "bg-muted")}
                      style={pip <= rec.score ? { backgroundColor: accent } : undefined}
                    />
                  ))}
                </div>

                <span className="mt-3 flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold" style={{ color: accent }}>
                    {rec.platform === "instagram" ? "Open reel script" : "Open post script"}
                  </span>
                  <ArrowRight
                    className="size-3.5 transition-transform group-hover:translate-x-0.5"
                    style={{ color: accent }}
                    aria-hidden
                  />
                </span>
                {rec.confidence === "tentative" ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    Small sample — treat as a lead, not a finding.
                  </p>
                ) : null}
              </CardContent>
            </button>
          );
        })}
      </div>

      <ScriptDrawer recommendation={open} onClose={() => setOpen(null)} />
    </>
  );
}
