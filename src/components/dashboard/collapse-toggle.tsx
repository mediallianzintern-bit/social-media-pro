import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Expand at the heading; collapse where the section's content ends. */
export function CollapseToggle({
  collapsed, onToggle, showLabel = "Show", className, placement = "heading",
}: {
  collapsed: boolean;
  onToggle: () => void;
  showLabel?: string;
  className?: string;
  placement?: "heading" | "bottom";
}) {
  const bottom = placement === "bottom";
  const headingId = `expand-${showLabel.replace(/[^a-zA-Z0-9]/g, "-")}`;
  if (bottom ? collapsed : !collapsed) return null;
  return (
    <Button
      id={bottom ? undefined : headingId}
      type="button"
      size={bottom ? "icon" : "sm"}
      variant="ghost"
      className={cn(bottom
        ? "size-14 shrink-0 rounded-full bg-[#fff7e9] text-[#003b59] shadow-[0_3px_16px_#00000015] hover:bg-[#f7ecd8]"
        : "h-auto shrink-0 gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground", className)}
      onClick={() => {
        onToggle();
        if (bottom) requestAnimationFrame(() => {
          const heading = document.getElementById(headingId);
          heading?.focus({ preventScroll: true });
          heading?.scrollIntoView({ block: "nearest" });
        });
      }}
      aria-expanded={!collapsed}
      aria-label={bottom ? `Collapse section (${showLabel})` : showLabel}
      title={bottom ? "Collapse section" : showLabel}
    >
      {bottom ? <ChevronUp className="size-8" strokeWidth={1.5} aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
      {bottom ? null : showLabel}
    </Button>
  );
}
