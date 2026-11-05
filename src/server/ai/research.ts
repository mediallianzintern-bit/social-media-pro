// Staged research for "Write script" on a news story: read the story from
// several outlets, combine their facts into one fact sheet with sources, and
// stop as soon as the facts are sufficient. See lib/research.ts for why.
//
//   Stage 1  the story's own outlet and up to two more covering the same
//            story; one fact sheet from all of them.
//   Stage 2  only if the checklist is not met: up to two more outlets (five
//            in all), and the fact sheet rebuilt from every outlet read.
//   Background (5 Nov 2026), read with stage 1: up to two older articles
//            that explain the story's subject ("What Is Meta Andromeda?"),
//            when the reports name one (storySubject). Their facts are marked
//            BACKGROUND, never the news, and never count toward the checklist.
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
  monthOf,
  type ResearchFact,
  type StoryResearch,
} from "@/lib/research";
import type { SourceItem } from "@/lib/sources";

import { completeJson } from "./client";
import { addCosts } from "./review";
import {
  backgroundReading,
  coverageReader,
  storySubject,
  type ArticleText,
} from "../sources/article";

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
- At most ${MAX_FACTS} facts, the most useful first.
- An article marked BACKGROUND is older and explains the subject; it is not a report of this
  story. Take from it only what explains the subject (what it is, how it works), keep its
  figures with their date ("in early 2026"), and never present them as this story's news.`,
    user: `STORY: ${headline}

${articles
  .map((article, index) =>
    article.background
      ? `ARTICLE ${index + 1}, BACKGROUND from ${article.publisher ?? "unknown outlet"}, published ${monthOf(article.publishedAt) ?? "earlier"}, before this story:\n${article.text}`
      : `ARTICLE ${index + 1}, from ${article.publisher ?? "unknown outlet"}:\n${article.text}`,
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
    .map((fact) => {
      const sources = [...new Set(fact.sources)].filter((n) => n >= 1 && n <= articles.length);
      // Decided in code, not by the model: a fact only background states is background.
      const background = sources.length > 0 && sources.every((n) => articles[n - 1]?.background);
      return {
        ...fact,
        text: fact.text.trim(),
        sources,
        conflict: fact.conflict.trim(),
        ...(background ? { background: true } : {}),
      };
    })
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
  const reports = await reader.next(FIRST_STAGE);
  if (!reports.length) return null;

  // Background on the story's subject, found from the reports just read.
  const subject = storySubject(
    source.title,
    reports.map((article) => article.text),
    inboxTitles,
  );
  const background = subject
    ? await backgroundReading(source, subject, [
        source.url,
        ...reports.flatMap((article) => [article.url, article.publisher ?? ""]),
      ]).catch(() => [])
    : [];
  // The reports first, so outlet 1 stays the story's own; background after.
  const all = () => [...reports, ...background];
  const news = (facts: ResearchFact[]) => facts.filter((fact) => !fact.background);

  // The articles the kept sheet numbered its sources against.
  let articles = all();
  let { facts, cost } = await factSheet(source.title, articles, deadline);
  let stages = 1;
  if (
    !isSufficient(news(facts), reports.length) &&
    (!deadline || deadline - Date.now() > STAGE_MIN_MS)
  ) {
    const more = await reader.next(SECOND_STAGE);
    if (more.length) {
      reports.push(...more);
      const read = all();
      const second = await factSheet(source.title, read, deadline);
      // A second sheet that came back thinner (a failed reply) does not replace the first.
      if (second.facts.length >= facts.length) {
        facts = second.facts;
        articles = read;
      }
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
        ...(article.background
          ? { background: true, publishedAt: article.publishedAt ?? null }
          : {}),
      })),
      facts,
      missing: missingFacts(news(facts)),
      sufficient: isSufficient(
        news(facts),
        articles.filter((article) => !article.background).length,
      ),
      stages,
      unreadable: reader.unreadable(),
      ...(background.length && subject ? { subject } : {}),
    },
    cost,
  };
}
