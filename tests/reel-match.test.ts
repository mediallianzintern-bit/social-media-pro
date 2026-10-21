// Regression tests for finding the live reel a filmed idea became.
//
// Each case is a real failure from October 2026, kept so it cannot come back:
//   - Disney (21 Oct): a timing guess by another idea took this reel.
//   - Beam (21 Oct): the reel was posted two days before its script was
//     written, and its caption was stored cut at 300 characters, before the
//     word "Beam".
import { describe, expect, it } from "vitest";

import type { ContentIdea } from "@/lib/ai-types";
import type { PostRecord } from "@/lib/analytics-types";
import { findReelByTiming, findReelForIdea, nameFrequency } from "@/lib/reel-match";

const post = (code: string, publishedAt: string, caption: string): PostRecord => ({
  platform: "instagram",
  postId: code,
  url: `https://www.instagram.com/reel/${code}/`,
  caption,
  format: "reel",
  publishedAt,
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  pinned: false,
});

const idea = (id: string, title: string, headline: string, published: string): ContentIdea =>
  ({
    id,
    title,
    hook: title,
    angle: "",
    source: {
      verified: true,
      headline,
      publishedAt: published,
      subject: "",
      origin: "",
      searchQuery: "",
    },
  }) as unknown as ContentIdea;

const DISNEY_CAPTION =
  "Would your brand ever cut its own logo in half? Disney just did, on billboards in Canada. Half the Hulu logo + half the Disney logo = “Hu Dis?” It reads like “Who dis?”, a line we all know from texting. The message behind it is simple: Hulu shows are now part of Disney+. Most brands would explain this with a long ad. Disney explained it in two seconds. #Marketing #Branding #Advertising";

const BEAM_CAPTION =
  "Imagine managing Instagram accounts for three clients. You use AI to write thirty captions for each client, generate content ideas and summarise monthly performance. Now imagine the AI powering these tasks becomes cheaper to run. Automating this work at scale could become more affordable. But there's an important distinction. Beam isn't a social media management tool. It won't directly improve your captions or reduce your subscription fees. #AIForMarketing #AItools";

const GOOGLE_CAPTION =
  "What if your next website visitor isn't a person, but an AI agent? Google's new Auto Browse feature points towards a different way of using the internet.";

const posts = [
  post("Det8arJAAIp", "2026-10-20T13:30:00Z", DISNEY_CAPTION),
  post("DerXuO8DTPY", "2026-10-19T13:31:00Z", BEAM_CAPTION),
  post("DeegezMimBr", "2026-10-14T13:00:00Z", GOOGLE_CAPTION),
];

const disney = idea(
  "disney",
  "Disney's Unique Billboard Campaign in Canada",
  "Bold Billboard Blends Hulu and Disney Logos in Unusual Canadian Campaign",
  "2026-10-06T20:09:20Z",
);
const beam = idea(
  "beam",
  "Reflection AI launched Beam, an open-weight model for developers",
  "Reflection AI launched its first open-weight model, Beam",
  "2026-10-06T11:21:00Z",
);

// Both scripts were written and marked filmed on 21 October, after posting.
const written = { createdAt: "2026-10-21T05:53:00Z", filmedAt: "2026-10-21T05:54:00Z" };

describe("finding a filmed reel", () => {
  it("matches the Disney reel by the names in its caption", () => {
    const found = findReelForIdea(disney, posts, { ...written, taken: new Set() });
    expect(found?.shortcode).toBe("Det8arJAAIp");
  });

  it("matches the Beam reel posted two days before its script was written", () => {
    const found = findReelForIdea(beam, posts, {
      ...written,
      taken: new Set(),
      nameFreq: nameFrequency(posts),
    });
    expect(found?.shortcode).toBe("DerXuO8DTPY");
  });

  it("does not find Beam in a caption cut at 300 characters", () => {
    const cut = posts.map((p) => ({ ...p, caption: p.caption.slice(0, 300) }));
    expect(findReelForIdea(beam, cut, { ...written, taken: new Set() })).toBeNull();
  });

  it("never matches a reel posted before the story broke", () => {
    const early = [post("Old", "2026-10-01T10:00:00Z", DISNEY_CAPTION)];
    expect(findReelForIdea(disney, early, { ...written, taken: new Set() })).toBeNull();
  });

  it("does not match on one common name alone", () => {
    const gemini = idea(
      "gemini",
      "Google's Gemini 4 AI Model Launch",
      "Google releases Gemini 4",
      "2026-10-10T00:00:00Z",
    );
    const frequent = new Map([["google", 17]]);
    const found = findReelForIdea(gemini, posts, {
      ...written,
      taken: new Set(),
      nameFreq: frequent,
    });
    expect(found).toBeNull();
  });

  it("never guesses by timing a reel that names another story", () => {
    const onlyDisney = [posts[0]!];
    const guess = findReelByTiming(onlyDisney, {
      filmedAt: written.filmedAt,
      taken: new Set(),
      otherStories: [disney],
    });
    expect(guess).toBeNull();
  });
});
