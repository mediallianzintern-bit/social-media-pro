// The research a script was written from: the outlets read and the fact
// sheet, each fact with the outlets that state it, so the team can see where
// every detail came from and judge it before filming (lib/research.ts).
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { FACT_CATEGORIES, FACT_CATEGORY_LABEL, type StoryResearch } from "@/lib/research";

export function ResearchBlock({ research }: { research: StoryResearch }) {
  const outlet = (index: number) => research.sources[index - 1]?.publisher ?? `Outlet ${index}`;
  const byCategory = FACT_CATEGORIES.map((category) => ({
    category,
    facts: research.facts.filter((fact) => fact.category === category),
  })).filter((group) => group.facts.length);

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Research
        <span aria-hidden className="h-px flex-1 bg-border" />
      </h3>
      <div className="space-y-3 rounded-lg border bg-card p-3.5 text-sm">
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {research.sufficient ? (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/40 font-normal text-emerald-700 dark:text-emerald-400"
            >
              <CheckCircle2 className="size-3" aria-hidden />
              Enough detail
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 border-amber-500/40 font-normal text-amber-700 dark:text-amber-400"
            >
              <AlertTriangle className="size-3" aria-hidden />
              {research.missing.length
                ? `Not found: ${research.missing.map((category) => FACT_CATEGORY_LABEL[category].toLowerCase()).join(", ")}`
                : "Only one outlet confirms the main fact"}
            </Badge>
          )}
          <span>
            {research.sources.length} {research.sources.length === 1 ? "outlet" : "outlets"} read in{" "}
            {research.stages} {research.stages === 1 ? "stage" : "stages"}, {research.facts.length}{" "}
            facts
            {research.unreadable ? `; ${research.unreadable} more could not be read` : ""}.
          </span>
        </p>

        <ol className="flex flex-wrap gap-1.5 text-xs">
          {research.sources.map((source, index) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium hover:bg-accent hover:text-accent-foreground"
              >
                {index + 1}. {source.publisher ?? "Unknown outlet"}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </li>
          ))}
        </ol>

        <div className="space-y-2.5">
          {byCategory.map((group) => (
            <div key={group.category}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {FACT_CATEGORY_LABEL[group.category]}
              </p>
              <ul className="mt-1 space-y-1">
                {group.facts.map((fact) => (
                  <li key={fact.text} className="leading-snug">
                    {fact.text}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({[...new Set(fact.sources)].map(outlet).join(", ")})
                    </span>
                    {fact.conflict ? (
                      <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-400">
                        Outlets disagree: {fact.conflict}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          The script was written from these facts only. Check any fact one outlet alone reports, and
          anything marked as disagreeing, before it goes on camera.
        </p>
      </div>
    </section>
  );
}
