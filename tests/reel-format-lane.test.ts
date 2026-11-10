// Two filmed-reel failures from November 2026, kept so they cannot come back:
//   - The Google Ads (3 Nov) and Meta AI (7 Nov) reels were never found:
//     Apify had stopped sending productType, so they were stored as "video"
//     and the finder looked only at reels.
//   - The Google Ads script was written for Marketing stunts and went live as
//     Frontier AI developments: its ✓ must teach the lane it ran in.
import { describe, expect, it } from "vitest";

import { formatOf } from "@/server/apify/instagram";
import { laneChange } from "@/lib/reel-learning-types";

describe("formatOf", () => {
  it("reads a Video with no productType as a reel", () => {
    expect(formatOf({ type: "Video" })).toBe("reel");
  });
  it("still reads clips as a reel", () => {
    expect(formatOf({ type: "Video", productType: "clips" })).toBe("reel");
  });
  it("keeps a video Instagram marks as something else", () => {
    expect(formatOf({ type: "Video", productType: "feed" })).toBe("video");
    expect(formatOf({ type: "Video", productType: "igtv" })).toBe("video");
  });
  it("leaves carousels and images alone", () => {
    expect(formatOf({ type: "Sidecar" })).toBe("carousel");
    expect(formatOf({ type: "Image" })).toBe("image");
  });
});

describe("laneChange", () => {
  it("names the move when the reel went live in another lane", () => {
    expect(laneChange("Marketing stunts", "Frontier AI developments")).toEqual({
      from: "Marketing stunts",
      to: "Frontier AI developments",
    });
  });
  it("is no change in the same lane, whatever the case", () => {
    expect(laneChange("AI tool workflows", "ai tool workflows")).toBeNull();
  });
  it("is no change when the reel fitted no lane or has none yet", () => {
    expect(laneChange("Brand strategy lessons", "other")).toBeNull();
    expect(laneChange("Brand strategy lessons", null)).toBeNull();
    expect(laneChange(null, "Marketing stunts")).toBeNull();
  });
});
