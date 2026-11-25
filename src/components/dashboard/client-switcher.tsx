// The client being looked at, in the sidebar header (Studio Phase 5; tracker
// T12). Pritesh is first and the default; clients a manager linked in Social
// Pulse Studio follow. Choosing one reloads every figure for that client.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Download, Loader2 } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dashboardQueryOptions } from "@/lib/analytics.functions";
import {
  chooseClientFn,
  clientsQueryOptions,
  importStudioClientsFn,
} from "@/lib/clients.functions";
import { setClientSwitching } from "@/lib/client-switching";
import { cn } from "@/lib/utils";
import { TRACKING_PATHS, type ServiceLevel } from "@/lib/service-level";

export function ClientSwitcher({ fallbackName }: { fallbackName: string }) {
  const { data } = useQuery(clientsQueryOptions);
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"choose" | "import" | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const clients = data?.clients ?? [];
  const chosen = clients.find((c) => c.id === data?.chosenId);

  async function choose(id: string, isDefault: boolean, service: ServiceLevel) {
    if (id === data?.chosenId) return;
    setBusy("choose");
    setNotice(null);
    // The old client's page stays on screen, faded, until the new one is
    // ready. Clearing the cache instead (as this once did) emptied the whole
    // shell, which reads the dashboard through suspense, until Pritesh's large
    // dashboard arrived.
    setClientSwitching(true);
    try {
      await chooseClientFn({ data: { id: isDefault ? null : id } });
      await queryClient.cancelQueries();
      // Both fetched before either is shown, so the switcher's name and the
      // figures change together, never one client's name over another's numbers.
      const [dashboard, list] = await Promise.all([
        dashboardQueryOptions.queryFn(),
        clientsQueryOptions.queryFn(),
      ]);
      queryClient.setQueryData(dashboardQueryOptions.queryKey, dashboard);
      queryClient.setQueryData(clientsQueryOptions.queryKey, list);
      // A tracking-only client (migration 0041) has Home, its account pages,
      // reports and Settings; from any other page it starts on Home.
      const here = router.state.location.pathname;
      if (service === "tracking" && !TRACKING_PATHS.has(here)) await navigate({ to: "/" });
      // Nothing else cached for the previous client may be shown under this
      // one: every page-level query is reset and refetched for the new client.
      const shell = new Set<unknown>([
        dashboardQueryOptions.queryKey[0],
        clientsQueryOptions.queryKey[0],
      ]);
      await queryClient.resetQueries({ predicate: (query) => !shell.has(query.queryKey[0]) });
      // Re-runs the layout loader, which also renames the tab.
      await router.invalidate();
    } catch (error) {
      setNotice({
        tone: "bad",
        text: error instanceof Error ? error.message : "Could not switch.",
      });
    } finally {
      setClientSwitching(false);
      setBusy(null);
    }
  }

  async function importFromStudio() {
    setBusy("import");
    setNotice(null);
    try {
      const result = await importStudioClientsFn();
      await queryClient.invalidateQueries({ queryKey: clientsQueryOptions.queryKey });
      const parts = [
        result.added ? `${result.added} added` : null,
        result.updated ? `${result.updated} refreshed` : null,
        result.paused ? `${result.paused} no longer linked, paused` : null,
      ].filter(Boolean);
      const skipped = result.skipped.map((s) => `${s.name}: ${s.reason}`);
      setNotice({
        tone: skipped.length ? "bad" : "ok",
        text:
          [
            parts.length ? parts.join(", ") : "No clients are linked in Studio yet",
            ...skipped,
          ].join(". ") + ".",
      });
    } catch (error) {
      setNotice({ tone: "bad", text: error instanceof Error ? error.message : "Import failed." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex w-full min-w-0 items-center gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Choose the client"
        >
          <span className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-sm font-semibold">Social Command Center</span>
            <span className="truncate text-[13px] text-muted-foreground">
              {chosen?.displayName ?? fallbackName}
            </span>
          </span>
          {busy ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Clients</DropdownMenuLabel>
          {clients.map((client) => (
            <DropdownMenuItem
              key={client.id}
              disabled={busy !== null}
              onSelect={() => void choose(client.id, client.isDefault, client.service)}
              className="flex items-start gap-2"
            >
              <Check
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  client.id !== data?.chosenId && "invisible",
                )}
                aria-hidden
              />
              <span className="grid min-w-0">
                <span className="truncate text-sm">{client.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {client.instagramHandle ? `@${client.instagramHandle}` : "No Instagram account"}
                  {client.isDefault ? "" : " · from Studio"}
                  {client.service === "tracking" ? " · tracking" : ""}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={busy !== null || Boolean(data?.studioProblem)}
            onSelect={() => void importFromStudio()}
            className="gap-2"
          >
            <Download className="size-4" aria-hidden />
            Import clients from Studio
          </DropdownMenuItem>
          {data?.studioProblem ? (
            <p className="px-2 pb-1.5 text-xs text-muted-foreground">{data.studioProblem}</p>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {notice ? (
        <p
          role="status"
          className={cn(
            "mt-1.5 text-xs leading-snug",
            notice.tone === "bad" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
