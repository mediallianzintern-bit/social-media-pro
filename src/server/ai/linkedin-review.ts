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
// checks the rewrite: his length, his banned words, a first line that names
// the subject and does not read like a news report, and, from the team's
// LinkedIn brief (2 Nov 2026), a few facts rather than the whole fact sheet
// and an ending on "Repost to help". "Why it matters is the largest part" is
// the reviewer's to judge: counted as words before the turn line, it flagged
// three of his own 19 posted posts, whose opening explains rather than
// retells. A rewrite that still breaks one goes back once with the
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
import { linkedInShapesBlock } from "@/lib/linkedin-shapes";
import { factSheetText, type StoryResearch } from "@/lib/research";
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
export function problemsOf(
  raw: RawPost,
  body: string,
  sections: Section[],
  research?: StoryResearch,
): string[] {
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
  // The opening (the subject named within the first few lines), the news-
  // report first line, and how it reads on a phone (line and sentence length,
  // reading ease, jargon) all come from voiceFlags, so the drawer, this
  // review and the length fit hold a post to the same rules.
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
  const teaser = POINTS_TO_ARTICLE.test(body);
  if (raw.format === "text_post" && !teaser) {
    if (!LINKEDIN_TURN.test(body)) {
      problems.push(
        `It has no turn line where it moves from what happened to why it matters; add one on its own line, as his posts do ("Here's why this matters.", "But there's a catch.", "Think about that for a moment.")`,
      );
    }
    if (!REPOST_HELP.test(body)) {
      problems.push(
        `It does not end on "Repost to help [a specific person] [a specific benefit]." as his full posts do; the word "help" is always in it.`,
      );
    }
    // One idea, not the research report (the brief's three to five facts).
    const figures = figuresIn(body);
    if (figures.length > MAX_FIGURES) {
      problems.push(
        `It carries ${figures.length} figures (${figures.slice(0, 6).join(", ")}…); keep only the three to five facts that serve its one idea and cut the rest.`,
      );
    }
  }
  if (teaser && !/#\w/.test(body) && !/\brepost\b/i.test(body)) {
    problems.push(
      "It is an article teaser with neither hashtags nor a Repost line; his teasers end with one.",
    );
  }
  // A numbered list's "1." is not a figure.
  if (research && figuresIn(body).length && !NAMED_SOURCE.test(body)) {
    problems.push(
      `It states figures from the research without naming where they come from; name the source as his posts do ("According to The Wall Street Journal…", "A 2026 BCG study found…").`,
    );
  }
  return problems;
}

/** More distinct figures than this, and the post is reproducing the fact sheet. */
const MAX_FIGURES = 5;
/** His closing line, with the word the team's brief requires in it. */
const REPOST_HELP = /\brepost\b[^\n]*\bhelp/i;

/**
 * The distinct figures a post states: amounts, percentages, counts, dates.
 * A numbered list's "1." is not a figure, and a year on its own is context.
 */
function figuresIn(body: string): string[] {
  const text = body.replace(/^\s*\d+[.)]\s/gm, " ");
  const found = text.match(
    /(?:[$₹€£]\s?)?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|percent|per cent|billion|million|trillion|crore|lakh|x\b))?/gi,
  );
  return [
    ...new Set(
      (found ?? [])
        .map((figure) => figure.trim())
        .filter((figure) => !/^(19|20)\d\d$/.test(figure)),
    ),
  ];
}

const POINTS_TO_ARTICLE = /\b(article|read the full|full breakdown)\b/i;
/**
 * His turn lines on LinkedIn, the way his posts pivot to why it matters, and
 * those of the post the team approved as the reference (voice.ts LINKEDIN_EDITORIAL).
 */
const LINKEDIN_TURN =
  /\b(here['’]?s (why|what|where|how)|but there['’]?s a catch|think about (that|it|this|the impact)|but here['’]?s|there is a bigger lesson|that['’]?s (where|when)|this is where|now look at|now,? here['’]?s|i['’]?ve seen this pattern|what does this mean|so,? what should|my takeaway|but what happens (when|if)|consider the (potential )?implications|for businesses,? this)\b/i;
/** Wording that names where a fact comes from. */
const NAMED_SOURCE =
  /\b(according to|study|survey|report(ed|s)?|found that|research|data from|announced|said|says|told)\b/i;

/** The multi-outlet research behind a post, when its story was researched. */
function researchOf(raw: RawPost, sources: SourceItem[]): StoryResearch | undefined {
  const id = typeof raw.source?.sourceId === "string" ? raw.source.sourceId : null;
  return id ? sources.find((item) => item.id === id)?.research : undefined;
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
Use only the three to five facts that serve the post's one idea, in his words; leave the rest of the sheet out. A fact marked CONFLICTING is said only as its outlet reported it. A claim, warning or prediction stays one, said as the person who made it said it, never as something that happened. Never connect two events the fact sheet does not connect. Anything not here goes in needsVerification, never into the post as fact.`;
  }
  if (source.article?.text) {
    return `THE STORY, from ${source.article.publisher ?? "another outlet"}:
Headline: ${source.title}
${source.article.text}
State only what this article says, in his words, and only the facts that serve the post's one idea. A claim, warning or prediction stays one, never something that happened. Anything else goes in needsVerification.`;
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
  /**
   * The team's approvals and rejections of earlier scripts (lib/script-feedback.ts)
   * and his own best recent posts (ai/linkedin-references.ts), for the system
   * prompt. Named apart from the per-round problem list below: as "feedback"
   * it was shadowed by that list, and the reviewer was sent last round's
   * problems where the team's verdicts belonged (found 4 Nov 2026).
   */
  context = "",
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
    const draftProblems = problemsOf(raw, body, sections, researchOf(raw, sources));

    let best: { review: Review; problems: string[] } | null = null;
    let feedback: string[] = [];
    try {
      for (let round = 0; round < ROUNDS; round += 1) {
        if (deadline && deadline - Date.now() < ROUND_MIN_MS) break;
        const result = await completeJson<unknown>({
          system: [
            LINKEDIN_VOICE,
            lane ? linkedInShapesBlock([{ name: lane, definition: "" }]) : "",
            context,
          ]
            .filter(Boolean)
            .join("\n\n"),
          user: `REVIEW AND REWRITE (the dashboard's task, built from his own quality check above):
Review this LinkedIn ${kind} draft against Pritesh Patel's voice and his "Final Pritesh quality check"
above, and the LinkedIn post shape. Rewrite it so it reads like him explaining something useful to
one person: simpler where it can be simpler, specific where it is vague, never overselling AI.
- Apply the team's LinkedIn writing brief above: a post, not a news summary and not a reel script.
  Keep the subject and find its ONE idea for businesses.
- CHECK, AND FIX, EACH OF THESE (the review the team asked for on 4 Nov):
  1. Hook strength: does the opening raise a question the reader wants answered? If it opens like
     a news report or a general statement, write a new opening.
  2. Does the opening give too much away? If the first line already holds the key example or the
     conclusion, hold it back a line or two. For a brand case study the name can wait ("One brand
     held a funeral for its mascot."), but that is one way, not a template. The subject must still
     be named within the first few lines.
  3. Jargon: replace every marketing or tech term a broad reader would stop at with the concrete
     thing it means ("how much people like the brand", not "favorability").
  4. Paragraph length and mobile reading: one sentence per line, about nine words, a blank line
     between. Split any line that holds two sentences of explanation. No block of text.
  5. Does it sound like his own recent posts quoted above: their line length, their rhythm, their
     plain words? If it reads like a report or an article, rewrite it in that voice.
- What happened in two or three short sentences, then why it matters as the largest part, two or
  three real business implications and the bigger lesson. Cut every fact that does not serve the
  one idea, even when the draft used it.
- Replace every general statement with the specific fact, example or business situation it stands
  for, from the story below. Never invent a fact, statistic, quote, client or experience.
- Remove anything generic, repeated, corporate or promotional, and any word his voice rules out.
${
  raw.format === "text_post"
    ? '- About 150 to 220 words, never more than 300 (75 to 125 if it is a teaser pointing to his article):\n  shorter is better than padded. End on a question the post has earned, then "♻️ Repost to help …".'
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
        const problems = problemsOf(
          raw,
          reply.data.body,
          reply.data.sections,
          researchOf(raw, sources),
        );
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
