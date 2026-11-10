// Universal trends (6 Nov 2026): what is new across everything Pritesh Sir
// talks about, fetched once for both platforms, before any lane or platform
// is chosen, with its own searches: no lane restricts what it finds. A story worth a post is then added to Instagram or LinkedIn in
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
    about:
      "What changes on Meta, Google, Amazon, TikTok, YouTube, LinkedIn, Microsoft and Pinterest ads",
  },
  { id: "brands", label: "Brands", about: "Brand strategy, rebrands and repositioning" },
  { id: "campaigns", label: "Brand campaigns", about: "New campaigns from brands" },
  { id: "stunts", label: "Marketing stunts", about: "Stunts and campaigns people talk about" },
  {
    id: "ai",
    label: "AI launches",
    about: "Launches from OpenAI, Anthropic, Google, Meta, xAI, DeepSeek and Mistral",
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
  /** Where the team already added it from Trends, per platform. */
  added?: Partial<Record<"instagram" | "linkedin", AddedOn>>;
  /**
   * Added earlier but not in the latest fetch (it aged out, or its reports
   * were grouped under another headline): `id` is then the topic's id on a
   * platform, not a trend's, and Add copies from that topic.
   */
  kept?: boolean;
}

/** One platform's copy of a story added from Trends. */
export interface AddedOn {
  lane: string | null;
  /** The story in that platform's topics. */
  sourceId: string;
  /** The newest post or script written from it there, if any. */
  ideaId: string | null;
}

export interface TrendsView {
  /** The latest fetch, without the stories in `pinned`. */
  items: TrendItem[];
  /**
   * Stories the team added from Trends in the last two weeks, newest first,
   * shown above the list so a story written for one platform stays in reach
   * for the other, whatever the next fetch does with it (10 Nov 2026: the
   * Claude Fable 5.2 story, written for LinkedIn, vanished from the list on
   * the next fetch before it could be added to Instagram).
   */
  pinned: TrendItem[];
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

/** Hours since a story was published; Infinity when it has no date. */
export function hoursOld(publishedAt: string | null, now = Date.now()): number {
  const time = publishedAt ? new Date(publishedAt).getTime() : NaN;
  return Number.isFinite(time) ? Math.max(0, (now - time) / 3_600_000) : Infinity;
}

/** Published in the last six hours and already carried by two or more outlets. */
export const BREAKING_HOURS = 6;
/** Published in the last day. */
export const NEW_HOURS = 24;

/**
 * How urgent a story is (6 Nov 2026, the team's request for the latest news
 * first): its coverage, halved for every day it has aged. Two days old with
 * ten outlets still beats this morning's single report, and a single report
 * from an hour ago beats one outlet's story from three days back.
 */
export function urgencyOf(
  story: { coverage: number; publishedAt: string | null },
  now = Date.now(),
): number {
  const hours = hoursOld(story.publishedAt, now);
  if (!Number.isFinite(hours)) return 0;
  return (1 + Math.log2(Math.max(1, story.coverage))) * Math.pow(0.5, hours / 24);
}

/** Most urgent first; the newest first between equals. */
export function byUrgency<T extends { coverage: number; publishedAt: string | null }>(
  items: T[],
  now = Date.now(),
): T[] {
  return [...items].sort(
    (a, b) =>
      urgencyOf(b, now) - urgencyOf(a, now) ||
      hoursOld(a.publishedAt, now) - hoursOld(b.publishedAt, now),
  );
}

/** "40 min ago", "5 h ago", "3 days ago". */
export function ageLabel(publishedAt: string | null, now = Date.now()): string | null {
  const hours = hoursOld(publishedAt, now);
  if (!Number.isFinite(hours)) return null;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
  if (hours < 24) return `${Math.round(hours)} h ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
