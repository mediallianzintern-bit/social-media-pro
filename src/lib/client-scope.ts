// Every server function runs as a client (multi-client step 1, 25 Nov 2026),
// and a tracking-only client can call only what tracking needs.
//
// Registered globally in src/start.ts, after requireStaff. The client chosen in
// the sidebar when there is one (Studio Phase 5); otherwise Pritesh, as his own
// `clients` row rather than "no client", so every client-owned row a request
// reads or writes carries a real client id (server/tenant/db.ts). A request
// that cannot read Pritesh's row still runs, unscoped, as before.
//
// Then the client's level of service (lib/service-level.ts): a tracking
// client is refused every server function not on the tracking list, paid AI
// included, whatever the screens show.
import { createMiddleware } from "@tanstack/react-start";

import { trackingAllows } from "@/lib/service-level";

export const clientScope = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => {
    const [
      { chosenClient, defaultClient },
      { runAsClient, runAsDefault },
      { tenantReady, tenantKeysReady },
    ] = await Promise.all([
      import("@/server/clients/choose"),
      import("@/server/clients/context"),
      import("@/server/tenant/db"),
    ]);
    const [client, pritesh] = await Promise.all([
      chosenClient(),
      defaultClient(),
      // Whether migrations 0040 and 0042 are applied, so the tenant filter and
      // the wider conflict keys know to switch on.
      tenantReady(),
      tenantKeysReady(),
    ]);
    const service = client ? (client.service ?? "tracking") : (pritesh?.service ?? "full");
    if (service === "tracking" && !trackingAllows(serverFnMeta)) {
      const name = client?.displayName ?? "This client";
      throw new Error(
        `${name} has tracking only, so this is not available for it (${serverFnMeta.name}).`,
      );
    }
    if (client) return runAsClient(client, () => next());
    return pritesh ? runAsDefault(pritesh.id, () => next(), pritesh.service) : next();
  },
);
