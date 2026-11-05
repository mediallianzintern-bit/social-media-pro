import { createContext, useContext } from "react";

/**
 * Section titles a page wants easy to spot: larger, heavier and in the full
 * text colour, in light and dark mode alike, instead of the quiet grey label.
 * The Instagram page turns it on for every section inside it (5 Nov 2026),
 * through StrongSectionHeadings (section-heading.tsx).
 */
export const StrongHeadings = createContext(false);

/** The classes for a section title, for SectionHeading and the few sections that draw their own. */
export function useSectionTitleClass(): string {
  return useContext(StrongHeadings)
    ? "font-extrabold uppercase tracking-wider text-sm text-foreground"
    : "font-bold uppercase tracking-wider text-xs text-muted-foreground";
}
