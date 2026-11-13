import { createContext, useContext } from "react";

/**
 * Section titles a page wants easy to spot: larger, heavier and in the full
 * text colour, in light and dark mode alike, instead of the quiet grey label.
 * The Instagram and LinkedIn pages turn it on for every section inside them (5 Nov 2026),
 * through StrongSectionHeadings (section-heading.tsx).
 */
export const StrongHeadings = createContext(false);

/** The classes for a section title, for SectionHeading and the few sections that draw their own. */
export function useSectionTitleClass(): string {
  return useContext(StrongHeadings)
    ? "text-base font-semibold text-foreground"
    : "text-base font-semibold text-foreground";
}
