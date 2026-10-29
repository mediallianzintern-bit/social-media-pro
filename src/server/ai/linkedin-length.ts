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
import { linkedInShapesBlock } from "@/lib/linkedin-shapes";
import type { SourceItem } from "@/lib/sources";
import { linkedInLength, voiceFlags } from "@/lib/voice-check";

import { completeJson } from "./client";
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
function problemsOf(raw: RawPost, body: string): string[] {
  const length = linkedInLength(body);
  const problems: string[] = [];
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
    if (!/ words: /.test(flag)) problems.push(`It ${flag}.`);
  }
  return problems;
}

/** The facts the post may use: the story it was written from, and nothing else. */
function storyFor(raw: RawPost, sources: SourceItem[]): string {
  const id = typeof raw.source?.sourceId === "string" ? raw.source.sourceId : null;
  const source = id ? sources.find((item) => item.id === id) : undefined;
  if (!source) {
    return "THE STORY: none beyond the post itself. Add no new fact, figure, company or result: lengthen with explanation, a clearly hypothetical example and what it means for the reader's work.";
  }
  return `THE STORY, the only facts the post may state:
Headline: ${source.title}
Publisher: ${source.publisher ?? "unknown"}${
    source.article ? `\nArticle text:\n${source.article.text}` : "\n(Only the headline was read.)"
  }
Anything beyond this is explanation, a clearly hypothetical example ("Suppose…", "Let us say you are…") or a bracketed "[verify: …]" note for the team. Never a new fact.`;
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
      let best = { body: draft, problems: problemsOf(raw, draft) };
      if (!best.problems.length) return raw;

      const lane = typeof raw.contentLane === "string" ? raw.contentLane : "";
      const firstLine = draft.trim().split("\n")[0]!.trim();
      try {
        for (let round = 0; round < ROUNDS && best.problems.length; round += 1) {
          if (deadline && deadline - Date.now() < ROUND_MIN_MS) break;
          const result = await completeJson<{ body?: unknown }>({
            system: [
              LINKEDIN_VOICE,
              lane ? linkedInShapesBlock([{ name: lane, definition: "" }]) : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
            user: `Rewrite this LinkedIn post by Pritesh Patel so it fixes every problem below, and nothing else.

PROBLEMS, counted by code:
${best.problems.map((problem) => `- ${problem}`).join("\n")}

HOW:
- Keep the first line exactly as it is: "${firstLine}"
- Keep the idea, the order of the argument, the closing question and the closing line.
- When it needs more words, add SUBSTANCE in his voice, never filler: explain the idea in simple
  words before naming any term, add one specific business situation the reader would recognise
  (a salesperson before a client call, a marketer planning a campaign, a manager reviewing a
  report), what it means for the reader's own work, and a limitation or the mistake people make.
- When it needs fewer words, cut repetition and general statements first.
- One to three short lines per paragraph, a blank line between them.

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
          const problems = problemsOf(raw, body);
          if (problems.length < best.problems.length) best = { body, problems };
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
