import { createFileRoute, Outlet } from "@tanstack/react-router";
import { z } from "zod";

import { AppShell } from "@/components/dashboard/app-shell";
import { dashboardQueryOptions } from "@/lib/analytics.functions";
import { useDashboard } from "@/lib/use-dashboard";
import { GoToLogin } from "@/components/auth/go-to";
import { currentStaffEmail } from "@/lib/session";

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
  // The login session lives in the browser, so the guard and the data load
  // have to run there too: a server render has no session to check and every
  // server function would refuse it. Children inherit this.
  ssr: false,
  beforeLoad: async ({ location }) => ({
    staffEmail: await currentStaffEmail(),
    returnTo: location.href,
  }),
  // Nothing is fetched for a signed-out visitor: the server would refuse every
  // call anyway, and they are about to be sent to the login page.
  loader: ({ context }) =>
    context.staffEmail ? context.queryClient.ensureQueryData(dashboardQueryOptions) : null,
  component: AppLayout,
});

function AppLayout() {
  const { staffEmail, returnTo } = Route.useRouteContext();
  if (!staffEmail) return <GoToLogin returnTo={returnTo} />;
  return <SignedInLayout staffEmail={staffEmail} />;
}

function SignedInLayout({ staffEmail }: { staffEmail: string }) {
  const data = useDashboard();

  return (
    <AppShell
      lastSyncedAt={data.lastSyncedAt}
      stale={data.stale}
      autoSync={data.autoSync}
      // Nothing to sync with until the credentials are in place; the Data
      // sources page explains what is missing.
      syncDisabled={Boolean(data.setupError)}
      userEmail={staffEmail}
    >
      <Outlet />
    </AppShell>
  );
}
