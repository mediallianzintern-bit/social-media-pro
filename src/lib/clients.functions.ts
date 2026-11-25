// The sidebar's client switcher (Studio Phase 5; tracker T12): which clients
// Pro measures, which one this browser is looking at, and bringing in the
// clients a manager linked in Social Pulse Studio.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { ClientOption } from "@/server/clients/choose";

export interface ClientsView {
  clients: ClientOption[];
  /** The client this browser has chosen; Pritesh's id when none is. */
  chosenId: string | null;
  /** Why Studio cannot be reached, or null when it is connected. */
  studioProblem: string | null;
}

export const getClients = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClientsView> => {
    const [{ listClients, chosenClient }, { studioBridgeProblem }] = await Promise.all([
      import("@/server/clients/choose"),
      import("@/server/clients/studio"),
    ]);
    const [clients, chosen] = await Promise.all([listClients(), chosenClient()]);
    return {
      clients,
      chosenId: chosen?.id ?? clients.find((c) => c.isDefault)?.id ?? null,
      studioProblem: studioBridgeProblem(),
    };
  },
);

export const clientsQueryOptions = {
  queryKey: ["clients"] as const,
  queryFn: () => getClients(),
  staleTime: 5 * 60 * 1000,
};

export const chooseClientFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ id: z.string().uuid().nullable() }).parse(input))
  .handler(async ({ data }) => {
    const { chooseClient } = await import("@/server/clients/choose");
    await chooseClient(data.id);
    return { ok: true };
  });

export const importStudioClientsFn = createServerFn({ method: "POST" }).handler(async () => {
  const { importStudioClients } = await import("@/server/clients/studio");
  return importStudioClients();
});

// Active accounts in Settings (25 Nov 2026): everyone sees every client; only
// an admin may pause, resume or delete one, checked on the server
// (server/clients/manage.ts) from the signed-in session.
export const getClientAccounts = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  const { loadClientAccounts } = await import("@/server/clients/manage");
  return loadClientAccounts(context.staffEmail);
});

export const clientAccountsQueryOptions = {
  queryKey: ["client-accounts"] as const,
  queryFn: () => getClientAccounts(),
  staleTime: 30 * 1000,
};

export const setClientStatusFn = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "paused"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { setClientStatus } = await import("@/server/clients/manage");
    return setClientStatus({ ...data, staffEmail: context.staffEmail });
  });

export const deleteClientFn = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), confirmName: z.string().max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { deleteClient } = await import("@/server/clients/manage");
    return deleteClient({ ...data, staffEmail: context.staffEmail });
  });
