// His own LinkedIn posts that worked, as examples for the topic they ran in
// (16 Nov 2026).
//
// The learning on LinkedIn waited for the team to press "I posted this" on a
// dashboard draft, and they write most of his posts themselves, so nothing
// reached the writer. LinkedIn's API already measures every post he
// publishes, drafted here or not, and every synced post is filed under a topic.
// So the writer gets the posts in the topic it is writing for that beat his
// typical impressions, as examples of how a post in that topic is built. The
// LinkedIn version of the filmed reels' transcripts (lib/filmed-scripts.ts).
//
// Four rules:
//   - SAME TOPIC ONLY. Another topic's shape would mislead.
//   - RESULTS DECIDE. A post counts once it has had POST_REVIEW_DAYS for its
//     impressions to settle, and only one above his typical post of the same
//     kind is shown, the furthest above first. One below typical never is.
//   - LIKE FOR LIKE. Articles and text posts get different impressions, so
//     each is measured against its own kind, and Write article is shown
//     articles while Write post is shown text posts.
//   - STRUCTURE ONLY. Their facts belong to their own stories.
//
// Client-safe and pure; server/ai/linkedin-lane-posts.ts reads the data.
import type { PostRecord } from "@/lib/analytics-types";
import { POST_REVIEW_DAYS } from "@/lib/reel-learning-types";

/** Examples per post: enough to show a shape, few enough to stay cheap. */
export const LANE_POSTS_SHOWN = 2;
/** How far back a post can still teach: his style moves. */
export const LANE_POSTS_DAYS = 120;
/** His typical post is the middle of at least this many measured ones. */
const MIN_MEASURED = 5;
/** A text post this short is an article teaser, not a model of a full post. */
const MIN_POST_WORDS = 120;
const MAX_CHARS = 2000;
const DAY_MS = 86_400_000;

export type WrittenKind = "text_post" | "article";

export interface LanePost {
  post: PostRecord;
  impressions: number;
  /** Impressions against his typical post of the same kind. */
  ratio: number;
  typical: number;
  /** The article's own title, when it is an article. */
  title: string | null;
}

const wordsIn = (text: string) => text.split(/\s+/).filter(Boolean).length;
const sameLane = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const kindOf = (post: PostRecord): WrittenKind =>
  post.format === "article" ? "article" : "text_post";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The posts to show for one topic and kind: above typical only, furthest above first. */
export function pickLanePosts(
  posts: PostRecord[],
  impressions: Map<string, number>,
  lane: string | null | undefined,
  options: {
    kind?: WrittenKind | undefined;
    now?: number;
    /** Posts already quoted elsewhere in the prompt. */
    exclude?: Set<string>;
    titles?: Map<string, string>;
    count?: number;
  } = {},
): LanePost[] {
  if (!lane?.trim()) return [];
  const kind = options.kind ?? "text_post";
  const now = options.now ?? Date.now();
  const measured = posts
    .filter((post) => kindOf(post) === kind)
    .filter((post) => {
      const age = now - Date.parse(post.publishedAt);
      return age >= POST_REVIEW_DAYS * DAY_MS && age <= LANE_POSTS_DAYS * DAY_MS;
    })
    .filter((post) => kind === "article" || wordsIn(post.caption) >= MIN_POST_WORDS)
    .flatMap((post) => {
      const count = impressions.get(post.postId);
      return count != null && count > 0 ? [{ post, impressions: count }] : [];
    });
  if (measured.length < MIN_MEASURED) return [];
  const typical = median(measured.map((entry) => entry.impressions));
  return measured
    .filter(({ post }) => post.contentLane && sameLane(post.contentLane, lane))
    .filter(({ post }) => !options.exclude?.has(post.postId))
    .map((entry) => ({
      ...entry,
      ratio: entry.impressions / typical,
      typical,
      title: options.titles?.get(entry.post.postId) ?? null,
    }))
    .filter((entry) => entry.ratio > 1)
    .sort((a, b) => b.ratio - a.ratio || b.post.publishedAt.localeCompare(a.post.publishedAt))
    .slice(0, options.count ?? LANE_POSTS_SHOWN);
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** The writer's block for one topic, or "" when nothing in it beat his typical post. */
export function lanePostsBlock(
  picked: LanePost[],
  lane: string | null | undefined,
  kind: WrittenKind = "text_post",
): string {
  if (!picked.length || !lane) return "";
  const article = kind === "article";
  return [
    `HOW HIS ${lane.toUpperCase()} ${article ? "ARTICLES" : "POSTS"} THAT WORKED ARE BUILT — his own published ${article ? "articles" : "posts"} in this topic that beat his typical ${article ? "article" : "post"}, by the impressions LinkedIn measured. Whether or not they started here, they are what his readers rewarded. Build this ${article ? "article" : "post"} the way these are built: ${article ? "how the title and the opening lines promise the article, what the introduction holds back" : "how the opening holds the point back, the order of the parts, where it turns, how long it runs, how it ends"}. STRUCTURE ONLY: their facts belong to their own stories, so never use a fact, name or figure from them, and never copy or lightly reword a sentence.`,
    ...picked.map((entry, index) => {
      const text = entry.post.caption.trim();
      const quoted = text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS).trimEnd()}…` : text;
      const result = `${entry.ratio.toFixed(1)}x his typical ${article ? "article" : "post"}: ${entry.impressions} impressions against ${Math.round(entry.typical)}`;
      return `WORKED ${index + 1} — published ${day(entry.post.publishedAt)}, ${result}, ${wordsIn(text)} words${entry.title ? `\nArticle title: "${entry.title}"` : ""}\n"""\n${quoted}\n"""`;
    }),
  ].join("\n");
}
