// Staged research for "Write script" on a news story: read the story from
// several outlets, combine their facts into one fact sheet with sources, and
// stop as soon as the facts are sufficient. See lib/research.ts for why.
//
//   Stage 1  the story's own outlet and up to two more covering the same
//            story; one fact sheet from all of them.
//   Stage 2  only if the checklist is not met: up to two more outlets (five
//            in all), and the fact sheet rebuilt from every outlet read.
//
// Outlets come from the open news search for now. Rashmi's preferred sites,
// in priority order, become the first stage when she sends them.
//
// Cost: reading is free (plain page fetches). Each fact sheet is one call on
// the default model, about a tenth of a cent. Never fatal: with nothing
// readable, or OpenAI failing, the script is written as before.
import { z } from "zod";

import { costOf, type GenerationCost } from "@/lib/ai-cost";
import {
  FACT_CATEGORIES,
  isSufficient,
  missingFacts,
  type ResearchFact,
  type StoryResearch,
} from "@/lib/research";
import type { SourceItem } from "@/lib/sources";

import { completeJson } from "./client";
import { addCosts } from "./review";
import { coverageReader, type ArticleText } from "../sources/article";

const FIRST_STAGE = 3;
const SECOND_STAGE = 2;
/** Facts kept per sheet: enough for a detailed script, few enough to read. */
const MAX_FACTS = 30;
/** Less time than this left before the deadline, and a stage is not started. */
const STAGE_MIN_MS = 60_000;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["facts"],
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "category", "sources", "conflict"],
        properties: {
          text: { type: "string", description: "One fact, in plain words, one sentence." },
          category: { type: "string", enum: [...FACT_CATEGORIES] },
          sources: {
            type: "array",
            items: { type: "integer" },
            description: "The numbers of every article that states this fact.",
          },
          conflict: {
            type: "string",
            description: "How the articles disagree on this fact; empty when they agree.",
          },
        },
      },
    },
  },
} as const;

const parsed = z.object({
  facts: z.array(
    z.object({
      text: z.string(),
      category: z.enum(FACT_CATEGORIES),
      sources: z.array(z.number().int()),
      conflict: z.string(),
    }),
  ),
});

/** One fact sheet from every article read so far. */
async function factSheet(
  headline: string,
  articles: ArticleText[],
  deadline: number | undefined,
): Promise<{ facts: ResearchFact[]; cost: GenerationCost | undefined }> {
  const result = await completeJson<unknown>({
    system: `You combine several news reports of ONE story into a single fact sheet for a script writer.
Rules:
- Only facts the articles state. Never add one from your own knowledge, never guess.
- One fact per item, in plain words. Keep names, places, dates and figures exactly as written.
- "sources" lists the number of EVERY article that states the fact, so a fact two reports agree
  on carries both numbers.
- Where articles disagree (a different figure, date or claim), keep one item and describe the
  disagreement in "conflict".
- Cover the whole story: who, what happened, when, where, figures and specific details, how it
  was done or how it works, the result or impact, why it matters, and useful context. Prefer
  specific details a single report might leave out over general statements.
- At most ${MAX_FACTS} facts, the most useful first.`,
    user: `STORY: ${headline}

${articles
  .map(
    (article, index) =>
      `ARTICLE ${index + 1}, from ${article.publisher ?? "unknown outlet"}:\n${article.text}`,
  )
  .join("\n\n")}`,
    schemaName: "story_fact_sheet",
    schema: schema as unknown as Record<string, unknown>,
    temperature: 0.1,
    effort: "low",
    timeoutMs: 90_000,
    ...(deadline ? { deadline } : {}),
  });
  const reply = parsed.safeParse(result.data);
  const cost = result.usage ? costOf(result.usage, result.model) : undefined;
  if (!reply.success) return { facts: [], cost };
  const facts = reply.data.facts
    .map((fact) => ({
      ...fact,
      text: fact.text.trim(),
      sources: [...new Set(fact.sources)].filter((n) => n >= 1 && n <= articles.length),
      conflict: fact.conflict.trim(),
    }))
    .filter((fact) => fact.text && fact.sources.length)
    .slice(0, MAX_FACTS);
  return { facts, cost };
}

/**
 * Researches one news story. Null when nothing could be read, in which case
 * the script is written from the headline exactly as before.
 */
export async function researchStory(
  source: SourceItem,
  inboxTitles: string[],
  deadline?: number,
): Promise<{ research: StoryResearch; cost: GenerationCost | undefined } | null> {
  const reader = await coverageReader(source, inboxTitles);
  const articles = await reader.next(FIRST_STAGE);
  if (!articles.length) return null;

  let { facts, cost } = await factSheet(source.title, articles, deadline);
  let stages = 1;
  if (
    !isSufficient(facts, articles.length) &&
    (!deadline || deadline - Date.now() > STAGE_MIN_MS)
  ) {
    const more = await reader.next(SECOND_STAGE);
    if (more.length) {
      articles.push(...more);
      const second = await factSheet(source.title, articles, deadline);
      // A second sheet that came back thinner (a failed reply) does not replace the first.
      if (second.facts.length >= facts.length) facts = second.facts;
      cost = addCosts(cost, second.cost);
      stages = 2;
    }
  }

  return {
    research: {
      sources: articles.map((article) => ({
        publisher: article.publisher,
        url: article.url,
        words: article.words,
      })),
      facts,
      missing: missingFacts(facts),
      sufficient: isSufficient(facts, articles.length),
      stages,
      unreadable: reader.unreadable(),
    },
    cost,
  };
}
