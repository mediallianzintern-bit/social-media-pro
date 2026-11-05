import { ExternalLink } from "lucide-react";
import { useContext, type ReactNode } from "react";

import { StrongHeadings, useSectionTitleClass } from "@/components/dashboard/section-title";
import { cn } from "@/lib/utils";

/** Turns on bold, full-colour section titles for every section inside it. */
export function StrongSectionHeadings({ children }: { children: ReactNode }) {
  return <StrongHeadings.Provider value>{children}</StrongHeadings.Provider>;
}

/** The thin rule-and-label divider used between dashboard sections. */
export function SectionHeading({
  title,
  note,
  noteHref,
  action,
}: {
  title: string;
  note?: string;
  /**
   * T68a — where the note points, when it names one post. "Best performer
   * breakdown · This brand turned a tax problem…" quotes a specific reel, so
   * the quote should take you to it.
   */
  noteHref?: string | undefined;
  /** Optional control for this section, placed after the rule. */
  action?: ReactNode;
}) {
  const strong = useContext(StrongHeadings);
  const titleClass = useSectionTitleClass();
  return (
    <div className="flex flex-wrap items-baseline gap-3 pt-2">
      <h2 className={titleClass}>{title}</h2>
      {note && noteHref ? (
        <a
          href={noteHref}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground/70 underline-offset-2 hover:text-foreground hover:underline"
        >
          {note}
          <ExternalLink className="size-3 shrink-0" aria-hidden />
        </a>
      ) : note ? (
        <span className="text-xs text-muted-foreground/70">{note}</span>
      ) : null}
      <span
        aria-hidden
        className={cn("h-px min-w-8 flex-1", strong ? "bg-foreground/20" : "bg-border")}
      />
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
