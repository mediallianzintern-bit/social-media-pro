import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { compactNumber } from "@/lib/format";

export interface BarRow {
  label: string;
  value: number;
  /** Overrides the formatted value at the end of the row. */
  display?: string;
  /** Rendered under the label — sample sizes, mostly. */
  sub?: string;
  /** Dimmed rows are present but not measurable (e.g. a metric with no public source). */
  muted?: boolean;
}

/**
 * Horizontal bars against the largest row, every row directly labelled. Drawn
 * against the max rather than a fixed 100% so small distributions stay legible.
 */
export function MetricBars({
  title,
  description,
  rows,
  color,
  note,
}: {
  title: string;
  description?: string | undefined;
  rows: BarRow[];
  color: string;
  note?: string | undefined;
}) {
  const max = Math.max(...rows.map((row) => row.value), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length ? (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.label} className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-xs capitalize text-muted-foreground">
                    {row.label}
                  </span>
                  {row.sub ? (
                    <span className="block truncate text-[10px] text-muted-foreground/70">
                      {row.sub}
                    </span>
                  ) : null}
                </span>
                <span className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      width: max > 0 ? `${Math.max((row.value / max) * 100, 1.5)}%` : "0%",
                      backgroundColor: color,
                      opacity: row.muted ? 0.35 : 1,
                    }}
                  />
                </span>
                <span className="text-right text-xs font-medium tabular-nums">
                  {row.display ?? compactNumber(row.value)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing to show for this window.</p>
        )}
        {note ? (
          <p className="border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
            {note}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
