// A client's level of service (multi-client plan; migration 0041).
//
//   full      every feature: ideas, scripts, trends, Published, learning, To do;
//   tracking  measurement only: Home, the account pages' Summary, Posts,
//             Audience and Competitors tabs, reports, and Settings.
//
// The menu, the tabs and the pages follow it, and the server refuses every
// other server function for a tracking client (lib/client-scope.ts), so a
// hidden button cannot be reached by calling its function directly.
//
// Client-safe.

export type ServiceLevel = "full" | "tracking";

/** Pages a tracking client can open (the report pages sit outside the menu). */
export const TRACKING_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/instagram",
  "/linkedin",
  "/settings",
  "/report",
  "/lane-report",
]);

/** The account-page tabs a tracking client sees. */
export const TRACKING_TABS: ReadonlySet<string> = new Set([
  "summary",
  "posts",
  "audience",
  "competitors",
]);

/**
 * The server functions a tracking client may call, as "file#name". Everything
 * else is refused for it: deny by default, so a new feature is full-service
 * only until it is added here on purpose.
 */
export const TRACKING_FUNCTIONS: ReadonlySet<string> = new Set([
  // The dashboard, its Refresh and the reports.
  "src/lib/analytics.functions.ts#getDashboard",
  "src/lib/analytics.functions.ts#syncNow",
  "src/lib/analytics.functions.ts#getReport",
  "src/lib/lane-report.functions.ts#getLaneReport",
  // Followed/unfollowed (Pritesh's alone: it returns nothing for a client).
  "src/lib/follow-flow.functions.ts#getFollowFlow",
  // LinkedIn's own figures, read only.
  "src/lib/linkedin-api.functions.ts#getLinkedInApiStatus",
  "src/lib/linkedin-api.functions.ts#getLinkedInAnalytics",
  "src/lib/linkedin-api.functions.ts#getLinkedInPeriod",
  // The client switcher.
  "src/lib/clients.functions.ts#getClients",
  "src/lib/clients.functions.ts#chooseClientFn",
  "src/lib/clients.functions.ts#importStudioClientsFn",
  // Active accounts in Settings (pause and delete are admin-only on the server).
  "src/lib/clients.functions.ts#getClientAccounts",
  "src/lib/clients.functions.ts#setClientStatusFn",
  "src/lib/clients.functions.ts#deleteClientFn",
  // The team: Mediallianz's people, not any client's data.
  "src/lib/team.functions.ts#getTeamRoles",
  "src/lib/team.functions.ts#changeTeamRole",
  "src/lib/team.functions.ts#addTeamMember",
]);

/** Whether a tracking client may call this server function. */
export function trackingAllows(fn: { filename: string; name: string }): boolean {
  return TRACKING_FUNCTIONS.has(`${fn.filename}#${fn.name}`);
}
