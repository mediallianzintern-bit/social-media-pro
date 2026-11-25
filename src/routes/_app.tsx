import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/dashboard/app-shell";
import { TRACKING_PATHS } from "@/lib/service-level";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { dashboardQueryOptions } from "@/lib/analytics.functions";
import { useDashboard } from "@/lib/use-dashboard";
import { GoToLogin } from "@/components/auth/go-to";
import { currentStaffEmail } from "@/lib/session";

// The reporting window lives in the URL for every screen, so a view is
// shareable and survives reload. `.catch` keeps a hand-edited URL from 404ing.
const searchSchema = z.object({
  // T56 — the current era by default. With no confirmed era it resolves to the
  // last 30 days, the previous default, so nothing changes until one exists.
  range: z
    .enum(["era", "today", "yesterday", "7d", "30d", "90d", "all", "custom"])
    .catch("era")
    .default("era"),
  from: z.string().optional(),
  to: z.string().optional(),
  // A script to open in its drawer on the Instagram or LinkedIn page, from a
  // link elsewhere (Trends: "Go to LinkedIn"). Dropped by any other link.
  idea: z.string().uuid().optional().catch(undefined),
  // The tab open on an account page (13 Nov 2026, UI review). Absent means
  // Summary.
  tab: z
    .enum(["summary", "posts", "audience", "competitors", "ideas", "saved"])
    .optional()
    .catch(undefined),
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
  // The tab names the client being looked at, not always Pritesh (Studio
  // Phase 5). Switching client reloads this loader, so the title follows.
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.client?.displayName ?? "Dr. Pritesh Patel"} — Social Command Center`,
      },
    ],
  }),
  component: AppLayout,
});

function AppLayout() {
  const { staffEmail, returnTo } = Route.useRouteContext();
  if (!staffEmail) return <GoToLogin returnTo={returnTo} />;
  return <SignedInLayout staffEmail={staffEmail} />;
}

function SignedInLayout({ staffEmail }: { staffEmail: string }) {
  const data = useDashboard();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // A tracking-only client (migration 0041) opens only the tracking pages.
  const tracking = data.client?.service === "tracking";

  return (
    <AppShell
      lastSyncedAt={data.lastSyncedAt}
      stale={data.stale}
      autoSync={data.autoSync}
      // Nothing to sync with until the credentials are in place; the Data
      // sources page explains what is missing.
      syncDisabled={Boolean(data.setupError)}
      userEmail={staffEmail}
      client={data.client}
    >
      {tracking && !TRACKING_PATHS.has(pathname) ? (
        <Alert>
          <Info className="size-4" aria-hidden />
          <AlertTitle>Not part of {data.client?.displayName}&apos;s service</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              {data.client?.displayName} has tracking only: Home, its account pages, reports and
              Settings. Ideas, scripts, Published and To do come with the full service.
            </p>
            <Link to="/instagram" className="font-medium underline underline-offset-4">
              Go to {data.client?.displayName}&apos;s Instagram
            </Link>
          </AlertDescription>
        </Alert>
      ) : (
        <Outlet />
      )}
    </AppShell>
  );
}
