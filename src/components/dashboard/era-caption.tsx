import { Flag } from "lucide-react";

import type { EraMarker } from "@/lib/eras";

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * T58 — the line under a chart that says which era it shows.
 *
 * Covers the case a dashed line cannot: an era that began before the chart's
 * first point. Drawing nothing there would leave a reader to assume the chart
 * spans a strategy change it does not show, and drawing a line at the left edge
 * would claim a change happened on a day the chart has no data for.
 */
export function EraCaption({
  markers,
  spansWhole,
}: {
  markers: EraMarker[];
  spansWhole: { startsAt: string; label: string } | null;
}) {
  if (!markers.length && !spansWhole) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
      <Flag className="size-3.5" aria-hidden />
      {spansWhole ? (
        <span>All of this chart is after the strategy change on {day(spansWhole.startsAt)}.</span>
      ) : null}
      {markers.length ? (
        <span>
          {markers.length === 1
            ? `The dashed line marks the strategy change on ${day(markers[0]!.startsAt)}.`
            : `Dashed lines mark the strategy changes on ${markers.map((marker) => day(marker.startsAt)).join(", ")}.`}
        </span>
      ) : null}
    </p>
  );
}
