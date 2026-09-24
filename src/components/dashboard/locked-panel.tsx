import { Lock } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * A section from the original spec that public data cannot fill.
 *
 * It renders the section rather than hiding it, so the shape of the report is
 * intact and the gap is explicit — but it never shows a number. Showing an
 * invented figure here would be worse than showing nothing, because a reader
 * cannot tell the difference once it's on the screen.
 */
export function LockedPanel({
  title,
  description,
  rows,
  unlock,
}: {
  title: string;
  description: string;
  /** The metrics this panel would have shown, listed so the gap is concrete. */
  rows: string[];
  unlock: string;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <CardTitle className="text-base text-muted-foreground">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row}
              className="grid grid-cols-[1fr_4rem] items-center gap-3 text-xs text-muted-foreground"
            >
              <span className="truncate">{row}</span>
              <span className="h-2 w-full rounded-full bg-muted" aria-hidden />
            </li>
          ))}
        </ul>
        <p className="border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
          {unlock}
        </p>
      </CardContent>
    </Card>
  );
}
