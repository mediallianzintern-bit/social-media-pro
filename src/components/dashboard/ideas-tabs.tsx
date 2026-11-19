// The Ideas section's own tabs (13 Nov 2026, UI review): one menu item,
// "Ideas", in place of four (Saved, Trends, Reaction hooks, and the ideas
// inside each account page). Each page keeps its own address, so a link to
// any of them still works.
import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

const TABS = [
  { to: "/trends", label: "Trends" },
  { to: "/saved", label: "Saved" },
  { to: "/reactions", label: "Reaction hooks" },
] as const;

export function IdeasTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <nav aria-label="Ideas" className="-mt-2 flex gap-1 overflow-x-auto border-b">
      {TABS.map((tab) => {
        const active = pathname === tab.to;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center border-b-2 px-3 text-sm whitespace-nowrap",
              active
                ? "border-primary font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
