import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireStaff } from "@/lib/require-staff";

export interface LinkedInApiStatus {
  /** LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are set on the server. */
  configured: boolean;
  connected: boolean;
  expiresAt: string | null;
  scopes: string[];
  connectedBy: string | null;
  connectedAt: string | null;
}

/** Whether Pritesh Sir's LinkedIn is connected. Never returns the token. Free. */
export const getLinkedInApiStatus = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async (): Promise<LinkedInApiStatus> => {
    const { linkedInApiConfigured, readConnection } = await import("@/server/linkedin-api");
    return { configured: linkedInApiConfigured(), ...(await readConnection()) };
  });

/** The LinkedIn consent screen to send the browser to. */
export const startLinkedInConnect = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) => z.object({ origin: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    const { connectUrl } = await import("@/server/linkedin-api");
    return { url: connectUrl(data.origin, context.staffEmail) };
  });

/** Completes the sign-in LinkedIn sent the browser back from. */
export const finishLinkedInConnect = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) =>
    z
      .object({ code: z.string().min(1), state: z.string().min(1), origin: z.string().url() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { finishConnect } = await import("@/server/linkedin-api");
    return finishConnect({ ...data, email: context.staffEmail });
  });

export const disconnectLinkedIn = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .handler(async () => {
    const { disconnect } = await import("@/server/linkedin-api");
    await disconnect();
    return { ok: true };
  });

/** Reads his last 30 days of post totals from LinkedIn, to prove the connection. Free. */
export const testLinkedInAnalytics = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .handler(async () => {
    const { memberTotals } = await import("@/server/linkedin-api");
    return memberTotals(30);
  });

export const linkedInApiStatusQueryOptions = {
  queryKey: ["linkedin-api-status"] as const,
  queryFn: () => getLinkedInApiStatus(),
  staleTime: 60 * 1000,
};
