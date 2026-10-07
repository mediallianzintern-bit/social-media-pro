import { Monitor, Moon, Sun } from "lucide-react";

import { SidebarMenuButton } from "@/components/ui/sidebar";
import { useTheme } from "@/lib/use-theme";

/**
 * Light / dark, as one click in the sidebar footer.
 *
 * A two-way toggle rather than a three-way cycle through system. The default is
 * still "system", so a first visit matches the machine; the button then commits
 * to an explicit choice, because a control labelled "Dark mode" that leaves you
 * at the mercy of the OS an hour later is not a switch.
 *
 * The icon shows the mode you would MOVE TO, and the label says so too. An icon
 * showing the current state is the other common choice and it is a coin flip
 * every time: a moon can equally mean "it is dark" or "go dark".
 *
 * Rendered as a SidebarMenuButton so it collapses to an icon with a tooltip,
 * exactly like Sign out beneath it.
 */
export function ThemeToggle() {
  const { preference, resolved, setPreference, toggle } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Dark mode" : "Light mode";

  return (
    <SidebarMenuButton
      onClick={toggle}
      tooltip={label}
      // Right-click returns to following the machine. Undocumented on purpose:
      // it would cost a second visible control to serve a case almost nobody
      // has, and the two-way button is the thing people came for.
      onContextMenu={(event) => {
        event.preventDefault();
        setPreference("system");
      }}
      aria-label={`Switch to ${next} mode`}
    >
      {next === "dark" ? <Moon aria-hidden /> : <Sun aria-hidden />}
      <span className="flex-1 text-left">{label}</span>
      {/* Only while no explicit choice has been made — which is also the only
          time the dashboard can change theme on its own, so it is worth saying
          so rather than leaving the change unexplained. */}
      {preference === "system" ? (
        <span
          title="Following your system setting"
          className="group-data-[collapsible=icon]:hidden"
        >
          <Monitor className="size-3 text-muted-foreground" aria-hidden />
        </span>
      ) : null}
    </SidebarMenuButton>
  );
}
