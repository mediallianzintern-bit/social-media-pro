import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Keep a small two-way arrow at the end of the full content or its preview. */
export function CollapseToggle({
  collapsed,
  onToggle,
  showLabel = "Show",
  className,
  placement = "heading",
}: {
  collapsed: boolean;
  onToggle: () => void;
  showLabel?: string;
  className?: string;
  placement?: "heading" | "bottom";
}) {
  const bottom = placement === "bottom";
  const headingId = `expand-${showLabel.replace(/[^a-zA-Z0-9]/g, "-")}`;
  if (!bottom) return null;
  return (
    <Button
      id={headingId}
      type="button"
      size={bottom ? "icon" : "sm"}
      variant="ghost"
      className={cn(
        bottom
          ? "size-8 shrink-0 rounded-full border border-border bg-background text-primary shadow-sm hover:bg-muted"
          : "h-auto shrink-0 gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={() => {
        onToggle();
        if (!collapsed)
          requestAnimationFrame(() => {
            const heading = document.getElementById(headingId);
            heading?.focus({ preventScroll: true });
            heading?.scrollIntoView({ block: "nearest" });
          });
      }}
      aria-expanded={!collapsed}
      aria-label={collapsed ? showLabel : `Collapse section (${showLabel})`}
      title={collapsed ? showLabel : "Collapse section"}
    >
      {collapsed ? (
        <ChevronDown className="size-4" aria-hidden />
      ) : (
        <ChevronUp className="size-4" aria-hidden />
      )}
      {bottom ? null : showLabel}
    </Button>
  );
}
