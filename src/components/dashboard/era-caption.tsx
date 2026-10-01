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
    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
      <Flag className="size-3" aria-hidden />
      {spansWhole ? (
        <span>
          All of this chart is within <span className="font-medium">{spansWhole.label}</span>, which
          began {day(spansWhole.startsAt)}.
        </span>
      ) : null}
      {markers.length ? (
        <span>
          Dashed line{markers.length === 1 ? "" : "s"} mark where{" "}
          {markers.map((marker) => `${marker.label} (${day(marker.startsAt)})`).join(", ")} began.
        </span>
      ) : null}
    </p>
  );
}
