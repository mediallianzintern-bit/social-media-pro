import { createFileRoute, Outlet } from "@tanstack/react-router";
import { z } from "zod";

import { AppShell } from "@/components/dashboard/app-shell";
import { dashboardQueryOptions } from "@/lib/analytics.functions";
import { useDashboard } from "@/lib/use-dashboard";

// The reporting window lives in the URL for every screen, so a view is
// shareable and survives reload. `.catch` keeps a hand-edited URL from 404ing.
const searchSchema = z.object({
  range: z
    .enum(["today", "yesterday", "7d", "30d", "90d", "all", "custom"])
    .catch("30d")
    .default("30d"),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/_app")({
  validateSearch: searchSchema,
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQueryOptions),
  component: AppLayout,
});

function AppLayout() {
  const data = useDashboard();

  return (
    <AppShell
      lastSyncedAt={data.lastSyncedAt}
      stale={data.stale}
      autoSync={data.autoSync}
      // Nothing to sync with until the credentials are in place; the Data
      // sources page explains what is missing.
      syncDisabled={Boolean(data.setupError)}
    >
      <Outlet />
    </AppShell>
  );
}
