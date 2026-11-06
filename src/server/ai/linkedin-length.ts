// Holding a LinkedIn post to the length of his own posts, in his own voice.
//
// The writer is asked for 150-300 words (a teaser for his article, 75-125),
// read from his posts (lib/linkedin-shapes.ts), and still returned a 97-word
// post that the voice check could only flag. A flag leaves the fix to the
// team; the team asked for it to be fixed before anyone sees it, and for the
// added words to be his. So a post outside the range, or one using a word his
// voice prompt rules out, is rewritten here: his LinkedIn voice prompt as the
// system, the lane's shape, the story's own facts, and the exact problems the
// CODE counted (a model cannot be trusted to count its own words). Two rounds
// at most; the version with the fewest problems is kept, so a post is never
// made worse than the draft.
//
// One small call per post that needs it, on the default model; none at all
// for a post already in range. Never fatal: on any failure the draft stands.
import { costOf, type GenerationCost } from "@/lib/ai-cost";
import type { ContentIdea } from "@/lib/ai-types";
import { unsupportedFigures } from "@/lib/fact-check";
import { isOpeningPair } from "@/lib/hook-variants";
import { linkedInShapesBlock } from "@/lib/linkedin-shapes";
import { factSheetText } from "@/lib/research";
import type { SourceItem } from "@/lib/sources";
import { linkedInLength, voiceFlags } from "@/lib/voice-check";

import { completeJson } from "./client";
import { storyTextOf } from "./linkedin-review";
import { addCosts } from "./review";
import { LINKEDIN_VOICE } from "./voice";

const ROUNDS = 2;

/** Less time than this before the deadline, and a round is not started. */
const ROUND_MIN_MS = 30_000;

type RawPost = Record<string, unknown> & {
  format?: unknown;
  contentLane?: unknown;
  hook?: unknown;
  source?: { sourceId?: unknown } | null;
  post?: { body?: unknown; sections?: unknown } | null;
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["body"],
  properties: {
    body: {
      type: "string",
      description:
        "The complete rewritten post, first line first, short paragraphs separated by a blank line.",
    },
  },
} as const;

/** What is wrong with a post body, as the code measures it. Empty when it is fine. */
function problemsOf(raw: RawPost, body: string, story: string): string[] {
  const length = linkedInLength(body);
  const problems: string[] = [];
  // Detail added to reach the length comes from the story, never from memory.
  const invented = unsupportedFigures(body, story);
  if (invented.length) {
    problems.push(
      `It states figures the story never gives (${invented.slice(0, 6).join(", ")}); use only the story's figures, exactly as it states them, or cut the line.`,
    );
  }
  if (length && !length.ok) {
    problems.push(
      length.count < length.min
        ? `It is ${length.count} words; ${length.kind} of his runs ${length.min} to ${length.max}. Add about ${length.min + 20 - length.count} words of substance.`
        : `It is ${length.count} words; ${length.kind} of his runs ${length.min} to ${length.max}. Cut about ${length.count - length.max + 20} words.`,
    );
  }
  // His voice rules, checked on the post alone. The length flag is the one above.
  const probe = { ...raw, altHooks: [], shots: [], caption: "", post: { body, sections: [] } };
  for (const flag of voiceFlags(probe as unknown as ContentIdea)) {
    // The opening is the review's to fix: this pass keeps it as it is.
    if (!/ words: |opens like a news report|opens on what the reader already knows/.test(flag))
      problems.push(`It ${flag}.`);
  }
  return problems;
}

/**
 * The facts the post may use: the story it was written from, and nothing else.
 *
 * The fact sheet when the story was researched (6 Nov 2026). Until then this
 * read only `source.article.text`, which research leaves empty (the article
 * is kept for its link), so a researched post under 150 words was sent here
 * with no facts at all, told to add substance and never to pad, and came back
 * as short as it went in: the Meta Andromeda post stayed at 129 words.
 */
function storyFor(raw: RawPost, sources: SourceItem[]): string {
  const id = typeof raw.source?.sourceId === "string" ? raw.source.sourceId : null;
  const source = id ? sources.find((item) => item.id === id) : undefined;
  if (!source) {
    return "THE STORY: none beyond the post itself. Add no new fact, figure, company or result: lengthen with explanation, a clearly hypothetical example and what it means for the reader's work.";
  }
  const body = source.research
    ? `Researched across several outlets; each fact names the outlets that state it:\n${factSheetText(source.research)}\nUse the facts that serve the post's one idea; a fact marked CONFLICTING is said only as its outlet reported it.`
    : source.article?.text
      ? `Article text:\n${source.article.text}`
      : "(Only the headline was read: the article could not be read.)";
  return `THE STORY, the only facts the post may state:
Headline: ${source.title}
Publisher: ${source.publisher ?? "unknown"}
${body}
Anything beyond this is explanation, a clearly hypothetical example ("Suppose…", "Let us say you are…") or a bracketed "[verify: …]" note for the team. Never a new fact.`;
}

/**
 * How bad a version's problems are, worst first: a figure the story never
 * gives, then the length, then how many other problems. Compared in that
 * order (6 Nov 2026): a rewrite that brings a 129-word post into range was
 * thrown away when it gained one smaller flag (a reading-grade note), since
 * only the COUNT of problems was compared, and 1 is not fewer than 1.
 */
function severity(problems: string[]): [number, number, number] {
  const invented = problems.some((problem) => problem.startsWith("It states figures")) ? 1 : 0;
  const length = problems.some((problem) => /^It is \d+ words;/.test(problem)) ? 1 : 0;
  return [invented, length, problems.length];
}

/** Whether one version's problems are less serious than another's. Exported for the tests. */
export function lessSerious(next: string[], current: string[]): boolean {
  const a = severity(next);
  const b = severity(current);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index]! < b[index]!;
  }
  return false;
}

/**
 * Rewrites every LinkedIn text post that is outside his length or breaks his
 * voice rules. Articles and documents are left alone: their length is in
 * their sections.
 */
export async function fitLinkedInPosts(
  data: unknown,
  sources: SourceItem[],
  deadline?: number,
  /** His own best recent posts (ai/linkedin-references.ts), so a fit keeps his format. */
  references = "",
): Promise<{ data: unknown; cost: GenerationCost | undefined; fixed: number; failed: number }> {
  const ideas = (data as { ideas?: unknown })?.ideas;
  if (!Array.isArray(ideas)) return { data, cost: undefined, fixed: 0, failed: 0 };

  let cost: GenerationCost | undefined;
  let fixed = 0;
  let failed = 0;

  const next = await Promise.all(
    (ideas as RawPost[]).map(async (raw) => {
      const draft = typeof raw.post?.body === "string" ? raw.post.body : "";
      if (raw.format !== "text_post" || !draft.trim()) return raw;
      const story = storyTextOf(raw, sources);
      let best = { body: draft, problems: problemsOf(raw, draft, story) };
      if (!best.problems.length) return raw;

      const lane = typeof raw.contentLane === "string" ? raw.contentLane : "";
      // The headline, and the subheadline when the hook was written as a pair.
      const kept = draft
        .trim()
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, typeof raw.hook === "string" && isOpeningPair(raw.hook) ? 2 : 1);
      try {
        for (let round = 0; round < ROUNDS && best.problems.length; round += 1) {
          if (deadline && deadline - Date.now() < ROUND_MIN_MS) break;
          const result = await completeJson<{ body?: unknown }>({
            system: [
              LINKEDIN_VOICE,
              lane ? linkedInShapesBlock([{ name: lane, definition: "" }]) : "",
              references,
            ]
              .filter(Boolean)
              .join("\n\n"),
            user: `Rewrite this LinkedIn post by Pritesh Patel so it fixes every problem below, and nothing else.

PROBLEMS, counted by code:
${best.problems.map((problem) => `- ${problem}`).join("\n")}

HOW:
- Keep the ${kept.length > 1 ? "first two lines" : "first line"} exactly as ${kept.length > 1 ? "they are" : "it is"}: ${kept.map((line) => `"${line}"`).join(" / ")}
- Keep the idea, the order of the argument, the closing question and the closing line.
- When it needs more words, add substance from THIS story: a fact from the story below that
  serves the one idea (what exactly happened, a figure, who it affects, how it works), or a
  clearer explanation of that idea. Never a stock example ("Suppose you're a marketer
  planning a campaign…") and never a "one mistake brands make" line: those were added here
  before, and they are the lines that sounded least like him (4 Nov 2026). A post a little
  under the length is better than a padded one.
- When it needs fewer words, cut repetition and general statements first.
- One sentence per line, about nine words, a blank line between lines.

${storyFor(raw, sources)}

THE POST:
${best.body}`,
            schemaName: "linkedin_post_fit",
            schema: schema as unknown as Record<string, unknown>,
            temperature: 0.5,
            effort: "medium",
            timeoutMs: 90_000,
            ...(deadline ? { deadline } : {}),
          });
          if (result.usage) cost = addCosts(cost, costOf(result.usage, result.model));
          const body = typeof result.data.body === "string" ? result.data.body.trim() : "";
          if (!body) continue;
          const problems = problemsOf(raw, body, story);
          if (lessSerious(problems, best.problems)) best = { body, problems };
        }
      } catch (error) {
        console.warn("[ai:linkedin] post length fit failed; keeping the draft:", error);
      }
      if (best.body === draft) {
        failed += 1;
        return raw;
      }
      fixed += 1;
      return { ...raw, post: { ...raw.post, body: best.body } };
    }),
  );

  return { data: { ...(data as object), ideas: next }, cost, fixed, failed };
}
