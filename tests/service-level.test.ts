// A client's level of service (migration 0041): the server refuses everything
// not on the tracking list for a tracking-only client.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: () => undefined,
  setCookie: () => undefined,
  deleteCookie: () => undefined,
}));

import { effectiveService } from "@/server/clients/choose";
import { currentService, runAsClient, runAsDefault } from "@/server/clients/context";
import { TRACKING_FUNCTIONS, trackingAllows } from "@/lib/service-level";

describe("service level", () => {
  it("lets a tracking client call the dashboard, Refresh and reports, and nothing paid", () => {
    const fn = (filename: string, name: string) => trackingAllows({ filename, name });
    expect(fn("src/lib/analytics.functions.ts", "getDashboard")).toBe(true);
    expect(fn("src/lib/analytics.functions.ts", "syncNow")).toBe(true);
    expect(fn("src/lib/analytics.functions.ts", "getReport")).toBe(true);
    expect(fn("src/lib/analytics.functions.ts", "generateAnalysis")).toBe(false);
    expect(fn("src/lib/analytics.functions.ts", "generateOneIdea")).toBe(false);
    expect(fn("src/lib/linkedin-write.functions.ts", "writeLinkedIn")).toBe(false);
    expect(fn("src/lib/reel-learning.functions.ts", "analyseFilmed")).toBe(false);
    expect(fn("src/lib/universal-trends.functions.ts", "fetchTrendsNow")).toBe(false);
  });

  it("names only server functions that exist", () => {
    for (const entry of TRACKING_FUNCTIONS) {
      const [file, name] = entry.split("#") as [string, string];
      const source = readFileSync(file, "utf8");
      expect(source, entry).toMatch(new RegExp(`export const ${name} = createServerFn`));
    }
  });

  it("serves Pritesh in full and Studio clients as tracking, before and after 0041", () => {
    expect(effectiveService({ source: "pro" })).toBe("full");
    expect(effectiveService({ source: "pro", service: "full" })).toBe("full");
    expect(effectiveService({ source: "studio" })).toBe("tracking");
    expect(effectiveService({ source: "studio", service: "tracking" })).toBe("tracking");
  });

  it("keeps a Studio client set to full on tracking until it has its own voice", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(effectiveService({ source: "studio", service: "full", display_name: "Tim" })).toBe(
      "tracking",
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("carries the service through the request", () => {
    expect(currentService()).toBe("full");
    runAsDefault("p", () => expect(currentService()).toBe("full"));
    runAsClient(
      {
        id: "t",
        displayName: "Tim",
        instagramHandle: "timhortons",
        linkedinHandle: null,
        source: "studio",
        studioClientId: null,
        service: "tracking",
      },
      () => expect(currentService()).toBe("tracking"),
    );
  });
});
