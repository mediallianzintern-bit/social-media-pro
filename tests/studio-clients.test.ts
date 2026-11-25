// Phase 5: Pro adopts Studio's clients (Studio spec §5.2; tracker T12).
import { describe, expect, it } from "vitest";

import {
  bareHandle,
  planImport,
  type ExistingClient,
  type StudioClient,
} from "@/lib/studio-clients";

const studio = (id: string, name: string, handle: string): StudioClient => ({
  id,
  name,
  handle,
  country: "CA",
  industry: "Bakery",
  captionFooter: "",
  linkedAt: "2026-11-20T08:00:00Z",
  competitors: [],
  inspiration: [],
  lanes: [],
});
const A = "10000000-0000-4000-8000-00000000000a";
const B = "10000000-0000-4000-8000-00000000000b";
const pritesh: ExistingClient = {
  id: "p",
  source: "pro",
  studioClientId: null,
  instagramHandle: "priteshpatel.co",
  status: "active",
};

describe("studio clients", () => {
  it("normalises handles and refuses what is not one", () => {
    expect(bareHandle(" @Maple.Bakery ")).toBe("maple.bakery");
    expect(bareHandle("maple bakery")).toBeNull();
    expect(bareHandle("")).toBeNull();
  });

  it("adds a new linked client and never touches Pritesh", () => {
    const plan = planImport([studio(A, "Maple", "@Maple.Bakery")], [pritesh]);
    expect(plan.inserts).toEqual([
      {
        studio_client_id: A,
        source: "studio",
        display_name: "Maple",
        instagram_handle: "maple.bakery",
        niche: "Bakery",
        status: "active",
      },
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.pauses).toEqual([]);
  });

  it("skips a client on an account another client already holds, saying why", () => {
    const plan = planImport(
      [
        studio(A, "Copycat", "@PriteshPatel.co"),
        studio(B, "Maple", "maple"),
        studio(A, "Twin", "maple"),
      ],
      [pritesh],
    );
    expect(plan.inserts.map((r) => r.display_name)).toEqual(["Maple"]);
    expect(plan.skipped).toEqual([
      { name: "Copycat", reason: "@priteshpatel.co already belongs to another client" },
      { name: "Twin", reason: "@maple already belongs to another client" },
    ]);
  });

  it("refreshes a known client and pauses one Studio no longer links", () => {
    const maple: ExistingClient = {
      id: "m",
      source: "studio",
      studioClientId: A,
      instagramHandle: "maple",
      status: "active",
    };
    const gone: ExistingClient = { ...maple, id: "g", studioClientId: B, instagramHandle: "gone" };
    const plan = planImport([studio(A, "Maple Bakery", "@maple")], [pritesh, maple, gone]);
    expect(plan.updates).toEqual([
      {
        id: "m",
        fields: {
          display_name: "Maple Bakery",
          instagram_handle: "maple",
          niche: "Bakery",
          status: "active",
        },
      },
    ]);
    expect(plan.pauses).toEqual(["g"]);
    expect(plan.inserts).toEqual([]);
  });

  it("takes each client's Instagram rivals, never another client's own account", () => {
    const withRivals = {
      ...studio(A, "Maple", "@maple"),
      competitors: [
        { platform: "instagram", handle: "@Rival.Bakery", verified: true },
        { platform: "instagram", handle: "rival.bakery", verified: false },
        { platform: "instagram", handle: "@priteshpatel.co", verified: true },
        { platform: "instagram", handle: "@other.cafe", verified: true },
        { platform: "linkedin", handle: "some-company", verified: true },
        { platform: "instagram", handle: "not a handle", verified: true },
      ],
    };
    const plan = planImport([withRivals, studio(B, "Other Cafe", "@other.cafe")], [pritesh]);
    expect(plan.competitors).toEqual([
      { studioClientId: A, handles: ["rival.bakery"], benchmarks: [] },
      { studioClientId: B, handles: [], benchmarks: [] },
    ]);
  });

  it("takes the aspirational account as a benchmark (spec §3.11), never twice or a client's own", () => {
    const withAspiration = {
      ...studio(A, "Maple", "@maple"),
      competitors: [{ platform: "instagram", handle: "@rival.bakery", verified: true }],
      inspiration: [
        { platform: "instagram", handle: "@Big.Bakery", admiredTraits: "hooks", verified: true },
        { platform: "instagram", handle: "big.bakery", admiredTraits: "", verified: true },
        // Already a competitor: stays a competitor.
        { platform: "instagram", handle: "@rival.bakery", admiredTraits: "", verified: true },
        // Another client's own account is never its benchmark.
        { platform: "instagram", handle: "@priteshpatel.co", admiredTraits: "", verified: true },
        { platform: "linkedin", handle: "big-bakery", admiredTraits: "", verified: true },
      ],
    };
    const plan = planImport([withAspiration], [pritesh]);
    expect(plan.competitors).toEqual([
      { studioClientId: A, handles: ["rival.bakery"], benchmarks: ["big.bakery"] },
    ]);
  });

  it("never makes a client paused in Pro active again", () => {
    const paused: ExistingClient = {
      id: "t",
      source: "studio",
      studioClientId: A,
      instagramHandle: "maple",
      status: "paused",
    };
    const plan = planImport([studio(A, "Maple", "@maple")], [pritesh, paused]);
    expect(plan.updates).toEqual([
      { id: "t", fields: { display_name: "Maple", instagram_handle: "maple", niche: "Bakery" } },
    ]);
  });

  it("plans no competitors for a client it skipped", () => {
    const plan = planImport([studio(A, "Copycat", "@priteshpatel.co")], [pritesh]);
    expect(plan.competitors).toEqual([]);
  });
});
