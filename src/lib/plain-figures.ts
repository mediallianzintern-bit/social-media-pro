// Field names out of AI text, in plain words.
//
// The agents are told never to write a data field's name (ai/agents.ts, rule
// 6), and still sometimes do: on 22 Oct 2026 the saved Instagram analysis said
// "struggling at a medianVsMedian of 0.29" ten times over. A rule a model can
// break is enforced here, in code, on everything an analysis shows: each field
// name, with its figure, becomes the words the rule asks for.
//
// Only the exact field names below are touched, so ordinary words, brand names
// and scripts are left alone. Client-safe and pure.

/** A figure as the data writes it: 0.29, 1,170, -31. */
const NUMBER = String.raw`-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;

/** Words that may sit between a field name and its figure: "medianViews of 184". */
const JOIN = String.raw`(?:\s+(?:of|at|is|was|=)|\s*:)?\s*`;

interface Field {
  /** The field name, and any spelling of it the data uses. */
  names: string[];
  /** With its figure: "{n}" is replaced by the number. */
  withNumber: string;
  /** On its own, when no figure follows. */
  alone: string;
}

const FIELDS: Field[] = [
  {
    names: ["medianVsMedian", "vsMedian"],
    withNumber: "{n}x a typical post",
    alone: "performance against a typical post",
  },
  { names: ["medianViews"], withNumber: "{n} views on a typical post", alone: "median views" },
  {
    names: ["medianInteractions", "medianEngagements"],
    withNumber: "{n} interactions on a typical post",
    alone: "median interactions",
  },
  { names: ["medianSaves"], withNumber: "{n} saves on a typical post", alone: "median saves" },
  { names: ["postsAnalysed", "postCount"], withNumber: "{n} posts", alone: "number of posts" },
  { names: ["shareOfOutputPct"], withNumber: "{n}% of the posts", alone: "share of the posts" },
  {
    names: ["shareOfPerformancePct"],
    withNumber: "{n}% of the engagement",
    alone: "share of the engagement",
  },
  {
    names: ["avgWatchSeconds", "medianWatchSeconds"],
    withNumber: "about {n} seconds watched",
    alone: "watch time",
  },
  { names: ["saveRatePct"], withNumber: "{n}% of viewers saving", alone: "save rate" },
  { names: ["shareRatePct"], withNumber: "{n}% of viewers sharing", alone: "share rate" },
  { names: ["engagementRate"], withNumber: "{n}% engagement rate", alone: "engagement rate" },
  { names: ["postsPerWeek"], withNumber: "{n} posts a week", alone: "posts a week" },
  { names: ["ratePerWeek"], withNumber: "{n} followers a week", alone: "followers a week" },
  { names: ["ratePerMonth"], withNumber: "{n} followers a month", alone: "followers a month" },
];

const RULES = FIELDS.map((field) => {
  const names = field.names.join("|");
  return {
    // "a medianVsMedian of 0.29x" -> "0.29x a typical post"; a leading article
    // goes too, since the replacement reads on its own.
    withNumber: new RegExp(
      String.raw`(?:\b(?:a|an|the)\s+)?\b(?:${names})\b${JOIN}(${NUMBER})(?:\s?[x%](?![A-Za-z0-9]))?`,
      "g",
    ),
    alone: new RegExp(String.raw`\b(?:${names})\b`, "g"),
    field,
  };
});

/** One piece of text with every known field name put into plain words. */
export function plainFigures(text: string): string {
  if (!/[a-z][A-Z]/.test(text)) return text;
  let out = text;
  for (const { withNumber, alone, field } of RULES) {
    out = out
      .replace(withNumber, (_match, n: string) => field.withNumber.replace("{n}", n))
      .replace(alone, field.alone);
  }
  return out;
}

/** Every string inside a value (an analysis, a read) put into plain words. */
export function plainFiguresDeep<T>(value: T): T {
  if (typeof value === "string") return plainFigures(value) as T;
  if (Array.isArray(value)) return value.map((item) => plainFiguresDeep(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = plainFiguresDeep(item);
    return out as T;
  }
  return value;
}
