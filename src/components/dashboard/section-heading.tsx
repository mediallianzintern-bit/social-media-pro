/** The thin rule-and-label divider used between dashboard sections. */
export function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-3 pt-2">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {note ? <span className="text-xs text-muted-foreground/70">{note}</span> : null}
      <span aria-hidden className="h-px min-w-8 flex-1 bg-border" />
    </div>
  );
}
