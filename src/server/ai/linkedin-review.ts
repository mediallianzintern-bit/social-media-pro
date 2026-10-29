// The review-and-rewrite pass for LinkedIn posts and articles, the LinkedIn
// counterpart of review.ts (Instagram reels).
//
// Instagram's review sends Pritesh's own "Review and rewrite a team draft"
// prompt. His LinkedIn prompt has no such section, so this review is built
// from what it does have: his voice sections and his "Final Pritesh quality
// check", both verbatim in LINKEDIN_VOICE, which the reviewer is told to apply
// to the draft as an editor would. The task wording below is the dashboard's,
// labelled as such, never edited into his text.
//
// The draft goes to the stronger review model with the lane's shape and the
// story's facts (the multi-outlet fact sheet when there is one). The CODE then
// checks the rewrite: his length, his banned words, and a first line that
// names the subject. A rewrite that still breaks one goes back once with the
// exact problems; the version with the fewest problems is kept, and the draft
// stands when no rewrite beats it. The length fit (linkedin-length.ts) runs
// after this as a last check.
//
// Cost: one call per post on the review model (about two cents on gpt-4o),
// two when the first rewrite misses a rule. Run one post at a time, so three
// posts do not hit gpt-4o's per-minute token limit together. Off with
// OPENAI_REVIEW=off, like Instagram's. Never fatal: any failure keeps the draft.
import { z } from "zod";

import { costOf, type GenerationCost } from "@/lib/ai-cost";
import type { ContentIdea } from "@/lib/ai-types";
import { hookIssue } from "@/lib/hook-check";
import { linkedInShapesBlock } from "@/lib/linkedin-shapes";
import { factSheetText } from "@/lib/research";
import type { SourceItem } from "@/lib/sources";
import { linkedInLength, voiceFlags } from "@/lib/voice-check";

import { completeJson } from "./client";
import { addCosts, reviewEnabled, reviewModel } from "./review";
import { LINKEDIN_VOICE } from "./voice";

const ROUNDS = 2;
/** Less time than this before the deadline, and a review round is not started. */
const ROUND_MIN_MS = 45_000;

type RawPost = Record<string, unknown> & {
  format?: unknown;
  title?: unknown;
  angle?: unknown;
  hook?: unknown;
  contentLane?: unknown;
  source?: { sourceId?: unknown } | null;
  post?: { body?: unknown; sections?: unknown; notes?: unknown } | null;
};

interface Section {
  heading: string;
  text: string;
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["body", "sections", "changeNotes", "needsVerification"],
  properties: {
    body: {
      type: "string",
      description:
        "Text post: the complete post. Article: the introduction. Document: the post above the PDF. First line first, short paragraphs separated by a blank line.",
    },
    sections: {
      type: "array",
      description:
        "Article sections or document pages, rewritten, in order. Empty for a text post.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "text"],
        properties: { heading: { type: "string" }, text: { type: "string" } },
      },
    },
    changeNotes: {
      type: "array",
      items: { type: "string" },
      description: "At most three short notes on the most important changes.",
    },
    needsVerification: {
      type: "array",
      items: { type: "string" },
      description: "Each factual claim the team must check before posting.",
    },
  },
} as const;

const parsed = z.object({
  body: z.string(),
  sections: z.array(z.object({ heading: z.string(), text: z.string() })),
  changeNotes: z.array(z.string()),
  needsVerification: z.array(z.string()),
});
type Review = z.infer<typeof parsed>;

/** What the CODE finds wrong with a post. Empty when it passes. */
function problemsOf(raw: RawPost, body: string, sections: Section[]): string[] {
  const problems: string[] = [];
  if (raw.format === "text_post") {
    const length = linkedInLength(body);
    if (length && !length.ok) {
      problems.push(
        `It is ${length.count} words; ${length.kind} of his runs ${length.min} to ${length.max}.`,
      );
    }
  }
  const firstLine = body.trim().split("\n")[0]?.trim() ?? "";
  const subject = `${typeof raw.title === "string" ? raw.title : ""} ${typeof raw.angle === "string" ? raw.angle : ""}`;
  const issue = hookIssue(firstLine, subject);
  if (issue) problems.push(`The first line: ${issue.replace(/reel/g, "post")}.`);
  const probe = {
    ...raw,
    hook: firstLine,
    altHooks: [],
    shots: [],
    caption: "",
    post: { body, sections },
  };
  for (const flag of voiceFlags(probe as unknown as ContentIdea)) {
    if (/ words: |hook opens on a hypothetical/.test(flag)) continue;
    problems.push(`It ${flag}.`);
  }
  return problems;
}

/** The facts the post may state: the fact sheet, one article, or the headline. */
function storyFor(raw: RawPost, sources: SourceItem[]): string {
  const id = typeof raw.source?.sourceId === "string" ? raw.source.sourceId : null;
  const source = id ? sources.find((item) => item.id === id) : undefined;
  if (!source) {
    return "THE STORY: none beyond the draft. Any figure, date, capability or result in the draft that is not common knowledge goes in needsVerification.";
  }
  if (source.research) {
    return `THE STORY, researched across several outlets; each fact names the outlets that state it:
Headline: ${source.title}
${factSheetText(source.research)}
Keep every specific fact the draft uses, and where the draft is thin, add the fact sheet's specifics in his words. A fact marked CONFLICTING is said only as its outlet reported it. Anything not here goes in needsVerification, never into the post as fact.`;
  }
  if (source.article?.text) {
    return `THE STORY, from ${source.article.publisher ?? "another outlet"}:
Headline: ${source.title}
${source.article.text}
State only what this article says, in his words. Anything else goes in needsVerification.`;
  }
  return `THE STORY: only the headline was read.
Headline: ${source.title}
Anything beyond this headline is removed, written as a bracketed "[verify: …]" note, or listed in needsVerification.`;
}

function draftText(body: string, sections: Section[]): string {
  return [body, ...sections.map((section) => `## ${section.heading}\n${section.text}`)].join(
    "\n\n",
  );
}

/**
 * Reviews and rewrites every LinkedIn post and article in a generation's raw
 * reply, one at a time. Instagram and anything without a post pass through.
 */
export async function reviewLinkedInDrafts(
  data: unknown,
  sources: SourceItem[],
  deadline?: number,
): Promise<{ data: unknown; cost: GenerationCost | undefined; reviewed: number; failed: number }> {
  const ideas = (data as { ideas?: unknown })?.ideas;
  if (!reviewEnabled() || !Array.isArray(ideas)) {
    return { data, cost: undefined, reviewed: 0, failed: 0 };
  }

  let cost: GenerationCost | undefined;
  let reviewed = 0;
  let failed = 0;
  const next: unknown[] = [];

  for (const raw of ideas as RawPost[]) {
    const body = typeof raw.post?.body === "string" ? raw.post.body : "";
    if (!body.trim()) {
      next.push(raw);
      continue;
    }
    const sections: Section[] = Array.isArray(raw.post?.sections)
      ? (raw.post.sections as Section[])
      : [];
    const kind =
      raw.format === "article" ? "article" : raw.format === "document" ? "document post" : "post";
    const lane = typeof raw.contentLane === "string" ? raw.contentLane : "";
    const draftProblems = problemsOf(raw, body, sections);

    let best: { review: Review; problems: string[] } | null = null;
    let feedback: string[] = [];
    try {
      for (let round = 0; round < ROUNDS; round += 1) {
        if (deadline && deadline - Date.now() < ROUND_MIN_MS) break;
        const result = await completeJson<unknown>({
          system: [
            LINKEDIN_VOICE,
            lane ? linkedInShapesBlock([{ name: lane, definition: "" }]) : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          user: `REVIEW AND REWRITE (the dashboard's task, built from his own quality check above):
Review this LinkedIn ${kind} draft against Pritesh Patel's voice and his "Final Pritesh quality check"
above, and the LinkedIn post shape. Rewrite it so it reads like him explaining something useful to
one person: simpler where it can be simpler, specific where it is vague, never overselling AI.
- Keep the useful idea and the subject. The first line names the brand, tool, platform or figure.
- Replace every general statement with the specific fact, example or business situation it stands
  for, from the story below. Never invent a fact, statistic, quote, client or experience.
- Remove anything generic, repeated, corporate or promotional, and any word his voice rules out.
${
  raw.format === "text_post"
    ? "- 150 to 300 words (75 to 125 if it is a teaser pointing to his article). End on a question that\n  the post has earned, then one closing line, as the post shape says."
    : `- Keep every ${raw.format === "document" ? "page" : "section"} and its heading's purpose; tighten and make each one specific.`
}
${feedback.length ? `\nYOUR LAST REWRITE STILL HAD THESE PROBLEMS, counted by code. Fix each one:\n${feedback.map((problem) => `- ${problem}`).join("\n")}\n` : ""}
${storyFor(raw, sources)}

TITLE: ${typeof raw.title === "string" ? raw.title : ""}
THE DRAFT:
${draftText(body, sections)}`,
          schemaName: "linkedin_review",
          schema: schema as unknown as Record<string, unknown>,
          model: reviewModel(),
          temperature: 0.5,
          effort: "medium",
          timeoutMs: 150_000,
          ...(deadline ? { deadline } : {}),
        });
        if (result.usage) cost = addCosts(cost, costOf(result.usage, result.model));
        const reply = parsed.safeParse(result.data);
        if (!reply.success || !reply.data.body.trim()) continue;
        const problems = problemsOf(raw, reply.data.body, reply.data.sections);
        if (!best || problems.length <= best.problems.length) {
          best = { review: reply.data, problems };
        }
        if (!problems.length) break;
        feedback = problems;
      }
    } catch (error) {
      console.warn("[ai:linkedin] review failed; keeping the draft:", error);
    }

    // A rewrite that breaks more rules than the draft did is not an improvement.
    if (!best || best.problems.length > draftProblems.length) {
      failed += 1;
      next.push(raw);
      continue;
    }
    reviewed += 1;
    const { review } = best;
    const firstLine = review.body.trim().split("\n")[0]!.trim();
    next.push({
      ...raw,
      // The post's first line is its hook; the alternatives stay as offered.
      hook: firstLine || raw.hook,
      post: {
        ...raw.post,
        body: review.body.trim(),
        sections: raw.format === "text_post" ? [] : review.sections,
        notes: [
          ...review.changeNotes.slice(0, 3).map((note) => `Review: ${note}`),
          ...review.needsVerification.map((claim) => `Verify before posting: ${claim}`),
        ],
      },
    });
  }

  return { data: { ...(data as object), ideas: next }, cost, reviewed, failed };
}
