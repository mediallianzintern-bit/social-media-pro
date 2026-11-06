// Universal trends (6 Nov 2026): what is new across everything Pritesh Sir
// talks about, fetched once for both platforms, before any lane or platform
// is chosen. A story worth a post is then added to Instagram or LinkedIn in
// one of that platform's lanes, and written there in his voice like any
// other story (server/trends.ts).
//
// Client-safe: the page shows the categories and suggests a lane.

export interface TrendCategory {
  id: string;
  label: string;
  /** What the category covers, shown under its chip. */
  about: string;
}

export const TREND_CATEGORIES: TrendCategory[] = [
  {
    id: "marketing",
    label: "Marketing",
    about: "Ad recall, measurement, the funnel, consumer studies",
  },
  {
    id: "ad-platforms",
    label: "Ad platforms",
    about: "New features on Meta, Google, Amazon, Microsoft, TikTok and LinkedIn ads",
  },
  { id: "brands", label: "Brands", about: "Brand strategy, rebrands and repositioning" },
  { id: "campaigns", label: "Brand campaigns", about: "New campaigns from brands" },
  { id: "stunts", label: "Marketing stunts", about: "Stunts and campaigns people talk about" },
  {
    id: "ai",
    label: "AI launches",
    about: "New models and tools from OpenAI, Anthropic, Google, Meta",
  },
  {
    id: "frontier-ai",
    label: "Frontier AI",
    about: "Frontier labs, AI safety and security, where AI is heading",
  },
  {
    id: "ai-marketing",
    label: "AI x marketing",
    about: "AI in ads, search, shopping and marketing",
  },
  {
    id: "ai-companies",
    label: "Companies using AI",
    about: "How companies like Neko Health build their business on AI",
  },
];

export const TREND_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  TREND_CATEGORIES.map((category) => [category.id, category.label]),
);

export interface TrendItem {
  id: string;
  category: string;
  title: string;
  url: string;
  publisher: string | null;
  publisherUrl: string | null;
  publishedAt: string | null;
  /** Outlets that carried the story in the fetch. Two or more is trending. */
  coverage: number;
  fetchedAt: string;
}

export interface TrendsView {
  items: TrendItem[];
  lastFetched: string | null;
  /** Each platform's lanes, for "Add to Instagram / LinkedIn". */
  lanes: { instagram: string[]; linkedin: string[] };
}

/**
 * The lanes each category belongs in, best first, by name, across both
 * platforms: the first one a platform has is suggested. Checked against the
 * live lanes on 6 Nov 2026 (Instagram: Marketing stunts, Brand strategy
 * lessons, Frontier AI developments; LinkedIn: AI launches explained, AI X
 * Marketing Bridge, AI risks and security, Marketing fundamentals, Content
 * and creator craft).
 */
const PREFERRED_LANES: Record<string, string[]> = {
  marketing: ["marketing fundamentals", "brand strategy lessons", "marketing stunts"],
  "ad-platforms": ["marketing fundamentals", "ai x marketing bridge", "brand strategy lessons"],
  brands: ["brand strategy lessons", "marketing fundamentals"],
  campaigns: ["marketing stunts", "marketing fundamentals", "brand strategy lessons"],
  stunts: ["marketing stunts", "marketing fundamentals", "brand strategy lessons"],
  ai: ["ai launches explained", "frontier ai developments"],
  "frontier-ai": ["frontier ai developments", "ai launches explained", "ai risks and security"],
  "ai-marketing": ["ai x marketing bridge", "frontier ai developments", "brand strategy lessons"],
  "ai-companies": ["ai x marketing bridge", "frontier ai developments", "ai launches explained"],
};

/**
 * The lane a category most likely belongs in on one platform: its first
 * preferred lane the platform has, else the lane sharing most words with the
 * category's name. The team can always change it.
 */
export function suggestLane(category: string, lanes: string[]): string | null {
  const byName = new Map(lanes.map((lane) => [lane.trim().toLowerCase(), lane]));
  for (const name of PREFERRED_LANES[category] ?? []) {
    const lane = byName.get(name);
    if (lane) return lane;
  }
  const label = (TREND_CATEGORY_LABEL[category] ?? category).toLowerCase().split(/[^a-z]+/);
  let best: { lane: string; score: number } | null = null;
  for (const lane of lanes) {
    const score = lane
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 1 && label.includes(word)).length;
    if (score > 0 && (!best || score > best.score)) best = { lane, score };
  }
  return best?.lane ?? null;
}
