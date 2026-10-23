// Which watched creators' reels stand out (AI tool workflows, phase 1).
import { describe, expect, it } from "vitest";

import { headlineOf, reelAsTopic, standoutReels, type CreatorPost } from "@/lib/creator-reels";

const now = Date.parse("2026-10-23T12:00:00Z");
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();

const post = (
  id: string,
  likes: number | null,
  comments: number,
  age: number,
  isReel = true,
): CreatorPost => ({
  id,
  permalink: `https://www.instagram.com/reel/${id}/`,
  caption: `How I automate my inbox with ChatGPT in 3 steps ${id}\n\nComment AUTO for the guide #ai #automation`,
  likes,
  comments,
  postedAt: daysAgo(age),
  isReel,
});

// A creator whose normal reel gets about 1,000 likes.
const normal = [1, 2, 3, 4, 5, 6, 7].map((n) => post(`n${n}`, 1000, 20, 3 + n));

describe("standout creator reels", () => {
  it("keeps a reel well above the creator's own normal", () => {
    const found = standoutReels([...normal, post("big", 3000, 60, 1)], now);
    expect(found.map((entry) => entry.post.id)).toEqual(["big"]);
    expect(found[0]!.multiple).toBeCloseTo(3, 1);
  });

  it("ignores a reel that is only at the creator's normal", () => {
    expect(standoutReels([...normal, post("ok", 1100, 22, 1)], now)).toEqual([]);
  });

  it("ignores old reels and posts that are not reels", () => {
    const found = standoutReels(
      [...normal, post("old", 5000, 90, 30), post("photo", 5000, 90, 1, false)],
      now,
    );
    expect(found).toEqual([]);
  });

  it("judges a creator who hides likes on comments alone", () => {
    const hidden = [1, 2, 3, 4, 5, 6].map((n) => post(`h${n}`, null, 20, 3 + n));
    const found = standoutReels([...hidden, post("talked", null, 70, 1)], now);
    expect(found.map((entry) => entry.post.id)).toEqual(["talked"]);
  });

  it("waits until a creator has enough posts to set a normal", () => {
    expect(standoutReels([post("a", 1000, 10, 2), post("b", 9000, 90, 1)], now)).toEqual([]);
  });

  it("turns a standout into a topic in the creator's lane", () => {
    const [standout] = standoutReels([...normal, post("big", 3000, 60, 1)], now);
    expect(reelAsTopic("mr.pynk", "AI tool workflows", standout!)).toMatchObject({
      url: "https://www.instagram.com/reel/big/",
      title: "How I automate my inbox with ChatGPT in 3 steps big",
      publisher: "@mr.pynk",
      lane: "AI tool workflows",
      kind: "video",
      query: "@mr.pynk reel · 3.0× their normal",
    });
  });

  it("skips a call to action when making the headline", () => {
    expect(
      headlineOf(
        "Comment “PYNK” and i send the skills🤝\n\nSeven Claude skills, one for every format:",
      ),
    ).toBe("Seven Claude skills, one for every format:");
  });

  it("drops reels that do not show an AI tool or workflow", () => {
    const offTopic = { ...post("gate", 9000, 90, 1), caption: "Gate prep !" };
    expect(standoutReels([...normal, offTopic], now)).toEqual([]);
  });

  it("judges on likes, so a comment giveaway does not inflate a reel", () => {
    const giveaway = { ...post("bait", 1100, 9000, 1) };
    expect(standoutReels([...normal, giveaway], now)).toEqual([]);
  });

  it("makes a headline from a caption's first real line", () => {
    expect(headlineOf("#ai #tools\nThis prompt writes my emails for me 🤯\nmore")).toBe(
      "This prompt writes my emails for me 🤯",
    );
  });
});
