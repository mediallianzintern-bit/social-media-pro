// A reaction script's shot list: the source clip, then one shot per beat.
import { describe, expect, it } from "vitest";

import { assembleReaction, type ReactionContext } from "@/server/ai/reaction";

const context: ReactionContext = {
  source: {
    id: "src-1",
    platform: "instagram",
    sourceUrl: "https://www.instagram.com/p/DeJSJZjJSIB/",
    sourcePlatform: "instagram",
    sourceCreatorHandle: "nivedan.ai",
    sourceType: "other",
    sourcePublicViews: 225_527,
    transcript: null,
    extractedClaim: "470K+ followers without filming a single video.",
    creditText: null,
    rightsStatus: "credited_clip",
    foundBy: "trend_listener",
    createdAt: "2026-10-27T10:00:00Z",
  } as ReactionContext["source"],
  account: { handle: "dr.priteshpatel", followers: 10_000, medianViews: 5_000 },
  lanes: [],
  ownedLane: "Brand strategy lessons",
  standardCta: null,
  leadMagnet: null,
  brandSetNotes: null,
  expertTarget: { seconds: null, basis: "" },
};

const beat = (name: string, line: string, extra: Record<string, string> = {}) => ({
  beat: name,
  line,
  shotType: "",
  visual: "",
  onScreenText: "",
  ...extra,
});

const raw = {
  extractedClaim: "470K+ followers without filming a single video.",
  title: "Follower Growth Without Video",
  hook: "Growing without video is real, but the followers are not the win.",
  altHooks: [],
  angle: "Followers without trust do not sell.",
  pivotType: "concede_reframe",
  sourceIn: "0:00",
  sourceOut: "0:04",
  beats: [
    beat("pivot", "Growing without video is real, but the followers are not the win.", {
      shotType: "Talking head — tight",
      visual: "Pritesh straight to camera",
      onScreenText: "Followers aren't the win",
    }),
    beat("authority", "I have audited dozens of accounts that grew fast and sold nothing.", {
      shotType: "Talking head — wide",
    }),
    beat("specifics", "Carousels and threads can pull reach without a single face on screen.", {
      shotType: "Screen recording",
      visual: "Scrolling a carousel-only account's grid",
      onScreenText: "Carousels pull reach",
    }),
    beat("mechanism", "Saves and shares push a post further than likes ever will.", {
      shotType: "B-roll",
      visual: "Phone screen saving and sharing a post",
    }),
    beat("twist", "But a face on camera is what turns reach into trust and buyers."),
    beat("redirect", "That is the brand lesson: reach is rented, trust is owned."),
    beat("cta", "Follow me for more."),
  ],
  musicDirection: "Calm, low electronic",
  expertSeconds: 30,
  contentLane: "Brand strategy lessons",
  whyNow: "A rising post in the niche.",
  winningTrait: "Concede then reframe on growth myths",
  caption: "Reach is rented, trust is owned.",
  hashtags: ["#a", "#b", "#c", "#d", "#e", "#f"],
};

describe("reaction shot list", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const idea = assembleReaction(raw as any, context);

  it("is the source clip, then one shot per beat", () => {
    expect(idea.shots[0]!.shotType).toBe("Source clip");
    expect(idea.shots).toHaveLength(1 + 7);
    expect(idea.shots[3]!.shotType).toBe("Screen recording");
    expect(idea.shots[4]!.visual).toBe("Phone screen saving and sharing a post");
  });

  it("fills a beat the model left undescribed instead of merging it", () => {
    expect(idea.shots[5]!.shotType).toBe("Talking head — tight");
    expect(idea.shots[7]!.shotType).toBe("Text card");
  });

  it("ends on the lane's own CTA, on a text card", () => {
    const last = idea.shots.at(-1)!;
    expect(last.voiceover).not.toBe("Follow me for more.");
    expect(last.onScreenText).toBeTruthy();
    expect(last.transition).toBe("End");
  });

  it("runs on one continuous clock with no gaps", () => {
    const marks = idea.shots.map((shot) => shot.mark.split("–"));
    for (let i = 1; i < marks.length; i += 1) expect(marks[i]![0]).toBe(marks[i - 1]![1]);
  });

  it("lists the B-roll and screen recordings to source, and the music", () => {
    expect(idea.production!.assetsNeeded.join(" ")).toContain("Screen recording:");
    expect(idea.production!.assetsNeeded.join(" ")).toContain("B-roll:");
    expect(idea.production!.musicDirection).toContain("Calm, low electronic");
  });
});
