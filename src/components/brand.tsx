// The Mediallianz identity, in one place.
//
// Two forms, because one does not substitute for the other: the lockup is
// unreadable below about 120px wide, and the mark alone carries no name. The
// sidebar needs a square that survives collapsing to 32px; the auth and report
// screens have room for the full lockup and are where saying who this is
// actually matters.
//
// Both are plain <img>: the assets are raster (the source supplied was a PNG),
// so they are served at 2-3x the rendered size and given explicit intrinsic
// dimensions to keep them out of the layout shift on first paint.
import { cn } from "@/lib/utils";

/** The square M, for tight or collapsible slots. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/mediallianz-mark.png"
      width={512}
      height={512}
      alt=""
      aria-hidden
      className={cn("size-8 shrink-0 object-contain", className)}
    />
  );
}

/**
 * The full lockup. Carries the alt text, since this is the one that names the
 * company — the mark beside a heading would only repeat it to a screen reader.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <img
      src="/mediallianz-logo.png"
      width={308}
      height={60}
      alt="Mediallianz"
      className={cn("h-7 w-auto object-contain", className)}
    />
  );
}
