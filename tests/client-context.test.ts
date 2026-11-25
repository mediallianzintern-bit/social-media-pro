// Phase 5: a request can run as a client; without one it is Pritesh, as before.
import { describe, expect, it } from "vitest";

import { DEFAULT_OWNER_ACCOUNTS, NoAccountError, ownerAccount } from "@/server/apify/accounts";
import { activeClient, runAsClient, type ActiveClient } from "@/server/clients/context";

const maple: ActiveClient = {
  id: "m",
  displayName: "Maple Bakery",
  instagramHandle: "maple.bakery",
  linkedinHandle: null,
  source: "studio",
  studioClientId: "10000000-0000-4000-8000-00000000000a",
};

describe("client context", () => {
  it("is Pritesh whenever no client is chosen", () => {
    expect(activeClient()).toBeNull();
    expect(ownerAccount("instagram")).toEqual(DEFAULT_OWNER_ACCOUNTS.instagram);
    expect(ownerAccount("linkedin").handle).toBe("digitalmarketingtrainer");
  });

  it("is the chosen client for everything the request awaits", async () => {
    const handle = await runAsClient(maple, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return ownerAccount("instagram");
    });
    expect(handle).toEqual({
      platform: "instagram",
      handle: "maple.bakery",
      profileUrl: "https://www.instagram.com/maple.bakery/",
      role: "owner",
    });
    // Outside the run, it is Pritesh again.
    expect(ownerAccount("instagram").handle).toBe("priteshpatel.co");
  });

  it("keeps two clients apart when their requests overlap", async () => {
    const other = { ...maple, id: "o", instagramHandle: "other.cafe" };
    const [a, b] = await Promise.all([
      runAsClient(maple, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return ownerAccount("instagram").handle;
      }),
      runAsClient(other, async () => ownerAccount("instagram").handle),
    ]);
    expect([a, b]).toEqual(["maple.bakery", "other.cafe"]);
  });

  it("never falls back to Pritesh for a platform the client is not on", () => {
    expect(() => runAsClient(maple, () => ownerAccount("linkedin"))).toThrow(NoAccountError);
    expect(() => runAsClient(maple, () => ownerAccount("linkedin"))).toThrow(
      "Maple Bakery has no LinkedIn account in Pro.",
    );
  });
});
