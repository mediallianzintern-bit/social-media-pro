// Writing a LinkedIn ARTICLE in the shape of his own nine (17 Nov 2026).
//
// The first article written after the article shape went live (ChatGPT
// Wallet, 17 Nov) came back as a 224-word post with a Repost line, and five
// three-sentence paragraphs under it: 417 words, a news-headline title. The
// writer runs on gpt-4o-mini under a prompt of about 150k tokens, nearly all
// of it rules for 150-300 word posts, and its examples were his short
// teasers; the article shape at the end of it lost. The review pass then
// held it to post rules again.
//
// So an article is written HERE, by one focused call after the story and
// angle are chosen: his voice prompt, the article shape with his best article
// in full, the story's checked facts, and nothing written for posts. On the
// review model (gpt-4o), since this is the piece that is published. The code
// checks its length and shape (lib/linkedin-article-shape.ts) and its facts
// (linkedin-review.ts problemsOf); two rounds at most, the version with the
// least serious problems kept, and never a version worse than the draft.
// About 4-8¢ an article. Never fatal: on any failure the draft goes on to the
// review as before.
import { z } from "zod";

import { costOf, type GenerationCost } from "@/lib/ai-cost";
import { LINKEDIN_ARTICLE_SHAPE, articleShapeProblems } from "@/lib/linkedin-article-shape";
import type { SourceItem } from "@/lib/sources";

import { completeJson } from "./client";
import { lessSerious } from "./linkedin-length";
import { problemsOf, storyFor, storyTextOf } from "./linkedin-review";
import { addCosts, reviewModel } from "./review";
import { LINKEDIN_VOICE_PROMPT } from "./voice";

const ROUNDS = 2;
/** Less time than this before the deadline, and a round is not started. */
const ROUND_MIN_MS = 45_000;

type RawIdea = Record<string, unknown> & {
  format?: unknown;
  title?: unknown;
  angle?: unknown;
  hook?: unknown;
  source?: { sourceId?: unknown } | null;
  post?: { body?: unknown; sections?: unknown; notes?: unknown } | null;
};
type Section = { heading: string; text: string };

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "body", "sections", "needsVerification"],
  properties: {
    title: {
      type: "string",
      description:
        "The article's title, 8 to 17 words, in his title style: a striking fact with a question or twist, or a question that challenges an assumption. Never a news headline.",
    },
    body: {
      type: "string",
      description:
        "The introduction, 60 to 150 words, one sentence per line with a blank line between, ending on a short handover line. No closing question, no Repost line.",
    },
    sections: {
      type: "array",
      description:
        "5 to 8 sections in the order the article shape gives, the last being his takeaway with the closing contrast, the question, the Repost line and the Source line.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "text"],
        properties: {
          heading: { type: "string" },
          text: {
            type: "string",
            description: "One sentence per line, a blank line between lines. Never a paragraph.",
          },
        },
      },
    },
    needsVerification: {
      type: "array",
      items: { type: "string" },
      description: "Any claim the team should check in the original reporting before posting.",
    },
  },
} as const;

const parsed = z.object({
  title: z.string(),
  body: z.string(),
  sections: z.array(z.object({ heading: z.string(), text: z.string() })),
  needsVerification: z.array(z.string()),
});

/** How his classroom prompt reads for an article. Added by the dashboard. */
const ARTICLE_READING = `HOW TO READ THE VOICE ABOVE FOR A LINKEDIN ARTICLE (added by the dashboard, not part of his prompt):
the "participants" are the people reading his article, and "what I want participants to remember" is
the takeaway the article ends on. Every voice, simplicity, example, accuracy and anti-hype rule above
applies exactly as written. The structure and length come from the LINKEDIN ARTICLE SHAPE below.
Never an em dash or en dash, never an emoji except the ♻️ before "Repost".`;

const SYSTEM = [LINKEDIN_VOICE_PROMPT, ARTICLE_READING, LINKEDIN_ARTICLE_SHAPE].join("\n\n");

/** Everything the code finds wrong with an article, facts first. */
function articleProblems(
  raw: RawIdea,
  title: string,
  body: string,
  sections: Section[],
  sources: SourceItem[],
  story: string,
): string[] {
  const id = typeof raw.source?.sourceId === "string" ? raw.source.sourceId : null;
  const research = id ? sources.find((item) => item.id === id)?.research : undefined;
  return [
    ...problemsOf(raw, body, sections, research, story),
    ...articleShapeProblems(title, body, sections),
  ];
}

const textOf = (value: unknown) => (typeof value === "string" ? value : "");
const sectionsOf = (value: unknown): Section[] =>
  Array.isArray(value)
    ? (value as Section[]).filter(
        (section) => typeof section?.heading === "string" && typeof section?.text === "string",
      )
    : [];

/**
 * Writes every LinkedIn article in a generation's raw reply in his article
 * shape. Returns the ideas it wrote, so the post review leaves
 * them alone (its rules are a post's).
 */
export async function writeLinkedInArticles(
  data: unknown,
  sources: SourceItem[],
  deadline?: number,
): Promise<{
  data: unknown;
  cost: GenerationCost | undefined;
  written: Set<unknown>;
  failed: number;
}> {
  const written = new Set<unknown>();
  const ideas = (data as { ideas?: unknown })?.ideas;
  if (!Array.isArray(ideas)) return { data, cost: undefined, written, failed: 0 };

  let cost: GenerationCost | undefined;
  let failed = 0;

  const next = await Promise.all(
    (ideas as RawIdea[]).map(async (raw) => {
      if (raw.format !== "article") return raw;
      const story = storyTextOf(raw, sources);
      const draft = {
        title: textOf(raw.title),
        body: textOf(raw.post?.body),
        sections: sectionsOf(raw.post?.sections),
      };
      const draftProblems = articleProblems(
        raw,
        draft.title,
        draft.body,
        draft.sections,
        sources,
        story,
      );
      let best: { article: z.infer<typeof parsed>; problems: string[] } | null = null;
      let feedback: string[] = [];
      try {
        for (let round = 0; round < ROUNDS; round += 1) {
          if (deadline && deadline - Date.now() < ROUND_MIN_MS) break;
          const result = await completeJson<unknown>({
            system: SYSTEM,
            user: `Write a LinkedIn ARTICLE by Pritesh Patel on this story, built exactly as the LINKEDIN ARTICLE
SHAPE says and in his voice: 700 to 1,000 words in all, introduction and sections together.

ITS ONE IDEA, chosen by the team's strategist: ${textOf(raw.angle) || draft.title}

- Teach the development the way his best article does: explain the idea in everyday words before
  any term, what is new, a worked example from the reader's work (clearly hypothetical: "Imagine…",
  "Suppose…"), the honest limit, what it means for the reader, his takeaway, then the two-line
  closing contrast, one question about the reader's own business, one "♻️ Repost to help …" line and
  a "Source: …" line naming the outlets (no link).
- An article uses more of the story than a post does: every fact that helps teach the one idea, from
  THE STORY below only, each company figure saying whose it is. Leave out facts that teach nothing.
- Never invent a fact, figure, quote, client, company result or experience. A detail the story does
  not give is left out, or written as a bracketed "[verify: …]" note for the team.
${feedback.length ? `\nYOUR LAST VERSION HAD THESE PROBLEMS, counted by code. Fix each one:\n${feedback.map((problem) => `- ${problem}`).join("\n")}\n` : ""}
${storyFor(raw, sources)}

THE DRAFT, for its angle only (it was written to a post's rules; do not keep its shape):
TITLE: ${draft.title}
${draft.body}
${draft.sections.map((section) => `${section.heading}\n${section.text}`).join("\n\n")}`,
            schemaName: "linkedin_article",
            schema: schema as unknown as Record<string, unknown>,
            model: reviewModel(),
            temperature: 0.6,
            effort: "medium",
            timeoutMs: 150_000,
            ...(deadline ? { deadline } : {}),
          });
          if (result.usage) cost = addCosts(cost, costOf(result.usage, result.model));
          const reply = parsed.safeParse(result.data);
          if (!reply.success || !reply.data.body.trim() || !reply.data.sections.length) continue;
          const problems = articleProblems(
            raw,
            reply.data.title,
            reply.data.body,
            reply.data.sections,
            sources,
            story,
          );
          if (!best || lessSerious(problems, best.problems))
            best = { article: reply.data, problems };
          if (!problems.length) break;
          feedback = problems;
        }
      } catch (error) {
        console.warn("[ai:linkedin] article writing failed; keeping the draft:", error);
      }
      // A version that breaks more serious rules than the draft is not an improvement.
      if (!best || lessSerious(draftProblems, best.problems)) {
        failed += 1;
        return raw;
      }
      const { article } = best;
      const firstLine = article.body
        .trim()
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean);
      const done = {
        ...raw,
        title: article.title.trim() || raw.title,
        hook: firstLine ?? raw.hook,
        post: {
          ...raw.post,
          body: article.body.trim(),
          sections: article.sections.map((section) => ({
            heading: section.heading.trim(),
            text: section.text.trim(),
          })),
          notes: [
            "Written in the shape of his own nine LinkedIn articles.",
            ...best.problems.map((problem) => `Still to fix: ${problem}`),
            ...article.needsVerification.map((claim) => `Verify before posting: ${claim}`),
          ],
        },
      };
      written.add(done);
      return done;
    }),
  );

  return { data: { ...(data as object), ideas: next }, cost, written, failed };
}
