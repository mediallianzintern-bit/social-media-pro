import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Folds a dashboard section away.
 *
 * Every section that uses this is OPEN by default and stays open until
 * someone presses it. The point is to let a person shorten a long page they
 * are already looking at — not to hide anything from them, and not to make
 * them expand things to find out what is there.
 *
 * Each caller keeps its own state, because the sections sit in different
 * shells — a plain heading, a card header, a section rule — and no single
 * wrapper fits all three without distorting them. This is the part worth
 * sharing: one chevron, one label, one behaviour.
 */
export function CollapseToggle({
  collapsed,
  onToggle,
  /** What the button says when the section is folded, e.g. "Show 300 stories". */
  showLabel = "Show",
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  showLabel?: string;
  className?: string;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className={cn(
        "h-auto shrink-0 gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={onToggle}
      aria-expanded={!collapsed}
    >
      <ChevronDown
        className={cn("size-3.5 transition-transform", collapsed && "-rotate-90")}
        aria-hidden
      />
      {collapsed ? showLabel : "Collapse"}
    </Button>
  );
}
