// The second pass: Pritesh's own "review and rewrite" prompt, run on each
// Instagram reel draft before it is checked and saved.
//
// Why it exists. The strategist call carries about seventy thousand tokens of
// account data, and on gpt-4o-mini (production, for its per-minute limit) the
// voice instructions get lost in it: drafts came back at 45-85 spoken words
// against a 90-115 target, as slides instead of a demo, with "revolutionize"
// in them. Measured on stored ideas and on a live test, Oct 2026.
//
// So the draft is handed to a second, SMALL request: his master prompt, his
// review prompt, the source the idea is built on, and the draft. A few thousand
// tokens, which fits a stronger model's per-minute limit (gpt-4o by default,
// OPENAI_REVIEW_MODEL to change it) for about a cent per script.
//
// Never allowed to lose work: if the review fails, or returns something that
// does not validate, the draft goes on exactly as it was. The review's change
// notes and the claims it says need checking are added to the editor notes, so
// the team sees them.
import { z } from "zod";

import type { GenerationCost } from "@/lib/ai-cost";
import { costOf } from "@/lib/ai-cost";
import type { PlatformId } from "@/lib/analytics-types";
import type { SourceItem } from "@/lib/sources";

import { completeJson } from "./client";
import { factSheetText, factUsed, type FactCategory, type StoryResearch } from "@/lib/research";
import { voiceFlags } from "@/lib/voice-check";
import { toneReferencesBlock, type ToneReference } from "@/lib/tone-references";
import type { ContentIdea } from "@/lib/ai-types";
import { brandRule, ctaRule } from "@/lib/script-families";

import { isAiToolWorkflowLane, toolWorkflowIssues, toolWorkflowPrompt } from "./tool-workflow";
import { workflowCtaIssue } from "@/lib/tool-workflow";
import { HYPOTHETICAL_OPENER, hookIssue } from "@/lib/hook-check";
import { NO_RULES, type LearnedRules } from "@/lib/reel-learning-types";
import { HOOK_TYPE_LABEL, hookTypeOf } from "@/lib/reel-parts";
import { DASHBOARD_HANDOVER, INSTAGRAM_MASTER_PROMPT, INSTAGRAM_REVIEW_PROMPT } from "./voice";
import { REEL_MAX_SECONDS, REEL_MIN_SECONDS, REEL_WORDS } from "@/lib/reel-length";

const REVIEW_MODEL_DEFAULT = "gpt-4o";

export function reviewModel(): string {
  return process.env["OPENAI_REVIEW_MODEL"]?.trim() || REVIEW_MODEL_DEFAULT;
}

/** Off with OPENAI_REVIEW=off, which leaves generation exactly as before. */
export function reviewEnabled(): boolean {
  return !/^(off|false|0|no)$/i.test(process.env["OPENAI_REVIEW"]?.trim() ?? "");
}

const shotJson = {
  type: "object",
  additionalProperties: false,
  required: ["mark", "shotType", "visual", "voiceover", "onScreenText", "transition"],
  properties: {
    mark: { type: "string", description: 'Time range like "0:00–0:04".' },
    shotType: {
      type: "string",
      description: 'e.g. "Talking head — medium", "Screen recording", "B-roll", "Text card".',
    },
    visual: { type: "string", description: "What is on screen. Concrete enough to shoot." },
    voiceover: {
      type: "string",
      description: "The spoken words for this shot: one short paragraph of the script.",
    },
    onScreenText: {
      type: "string",
      description: "Burned-in text. At most three shots in the whole reel have any.",
    },
    transition: { type: "string" },
  },
} as const;

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  // Order matters: the model writes fields in this order. The whole script is
  // written FIRST, as prose, and only then cut into shots. Writing it shot by
  // shot produced ~10 words a shot and ~60 in total, however often the target
  // was repeated; as one piece, it is written the way he asks for it.
  required: [
    "script",
    "spokenWordCount",
    "hook",
    "altHooks",
    "shots",
    "durationSeconds",
    "caption",
    "hashtags",
    "changeNotes",
    "needsVerification",
  ],
  properties: {
    script: {
      type: "string",
      description:
        "OUTPUT item 1: the one ready-to-record script, complete, as 5-8 short paragraphs " +
        "separated by blank lines, following SCRIPT FLOW without labels: the Opening, the " +
        "Explanation in simple words, ONE familiar business Example, and a Closing with one " +
        `practical next step or a clear takeaway. ${REEL_WORDS.min}-${REEL_WORDS.max} spoken words (${REEL_MIN_SECONDS}-${REEL_MAX_SECONDS} seconds), never more than ${REEL_WORDS.max}.`,
    },
    spokenWordCount: {
      type: "integer",
      description: "OUTPUT item 2: the words in `script`, counted one by one.",
    },
    hook: {
      type: "string",
      description:
        'The script\'s first line, word for word. It names what the reel is about (the tool, brand, campaign or development), never a hypothetical like "Imagine…" or the everyday example.',
    },
    altHooks: {
      type: "array",
      items: { type: "string" },
      description: "OUTPUT item 3: exactly two alternative opening lines for the same script.",
    },
    shots: {
      type: "array",
      items: shotJson,
      description:
        "The script above cut into shots for the editor, in order. Each shot's voiceover is " +
        "one paragraph of `script`, WORD FOR WORD: every spoken word of the script appears in " +
        "exactly one shot, and no shot adds spoken words the script does not have.",
    },
    durationSeconds: { type: "integer", minimum: 50, maximum: 60 },
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" }, description: "Exactly 5." },
    changeNotes: {
      type: "array",
      items: { type: "string" },
      description: "A maximum of three brief notes on the most important changes.",
    },
    needsVerification: {
      type: "array",
      items: { type: "string" },
      description: "Every factual claim in the script that needs verification. Empty if none.",
    },
  },
} as const;

const reviewResult = z.object({
  script: z.string().min(1),
  hook: z.string().min(1),
  altHooks: z.array(z.string()),
  shots: z
    .array(
      z.object({
        mark: z.string(),
        shotType: z.string(),
        visual: z.string(),
        voiceover: z.string(),
        onScreenText: z.string(),
        transition: z.string(),
      }),
    )
    .min(3),
  durationSeconds: z.number().int(),
  spokenWordCount: z.number().int(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  changeNotes: z.array(z.string()),
  needsVerification: z.array(z.string()),
});

type RawIdea = Record<string, unknown> & {
  format?: unknown;
  contentLane?: unknown;
  source?: { sourceId?: unknown } | null;
  production?: Record<string, unknown> | null;
};

/** The parts of a draft the review reads. Everything else passes through untouched. */
function draftFor(idea: RawIdea) {
  return {
    title: idea["title"],
    contentLane: idea.contentLane,
    hook: idea["hook"],
    altHooks: idea["altHooks"],
    shots: idea["shots"],
    durationSeconds: idea.production?.["durationSeconds"],
    caption: idea["caption"],
    hashtags: idea["hashtags"],
  };
}

function sourceBlock(idea: RawIdea, sources: SourceItem[]): string {
  const id = typeof idea.source?.sourceId === "string" ? idea.source.sourceId : null;
  const source = id ? sources.find((item) => item.id === id) : undefined;
  if (!source) {
    return "SOURCE MATERIAL: none beyond the draft itself. Any figure, date, capability or result in the draft that is not common knowledge goes in needsVerification.";
  }
  if (source.research) {
    return `SOURCE MATERIAL — the only facts available. The story was researched across several outlets; each fact names the outlets that state it:
Headline: ${source.title}
${factSheetText(source.research)}

Keep every specific fact the draft uses, and where the draft is thin, add the fact sheet's specifics (who, where, the figures, how it was done, the result) in Pritesh's words. A fact marked CONFLICTING is said only as its outlet reported it. Anything not in the fact sheet goes in needsVerification, never into the script as fact.`;
  }
  if (source.article?.text) {
    return `SOURCE MATERIAL — the only facts available. The article was read from ${source.article.publisher ?? "another outlet"}${source.publisher && source.article.publisher !== source.publisher ? ` (the story's own outlet, ${source.publisher}, could not be read)` : ""}:
Headline: ${source.title}
Article text:
${source.article.text}

The script may state what this article says, and nothing beyond it. Say it in Pritesh's words: never copy the article's sentences, and quote only a short phrase the brand itself used, such as a slogan or campaign name. A figure, quote or result the article does not contain goes in needsVerification, never into the script as fact.`;
  }
  return `SOURCE MATERIAL — the only facts available. Only the headline was fetched, not the article:
Headline: ${source.title}
Publisher: ${source.publisher ?? "unknown"}${source.publishedAt ? `, ${source.publishedAt.slice(0, 10)}` : ""}
Link: ${source.url}
Anything the draft states beyond this headline, such as how the tool works, which buttons to press, what it costs or what results it gets, is either removed, written as a bracketed "[verify: ...]" note for the team, or listed in needsVerification. Never present it as confirmed.`;
}

function reviewSystem(lane: string | null): string {
  const workflow =
    lane && isAiToolWorkflowLane(lane) ? toolWorkflowPrompt("instagram", [lane]) : "";
  return [INSTAGRAM_MASTER_PROMPT, DASHBOARD_HANDOVER, workflow].filter(Boolean).join("\n\n");
}

/**
 * A relaxed speaking pace. His brief puts 90-110 words at roughly 45-55
 * seconds, which is about two words a second.
 */
const WORDS_PER_SECOND = 2;

/** Two rounds at most: the first rewrite, and one more if it misses a hard rule. */
const REVIEW_ROUNDS = 2;
/**
 * One more round, only when the best rewrite so far is still short of the
 * reel length: two rounds left scripts at 101 words, short of 110 (29 Oct
 * 2026), and length is the rule the model most often misses.
 */
const MAX_REVIEW_ROUNDS = 3;
const isLengthProblem = (problem: string) => /spoken words; it needs/.test(problem);

/**
 * A closing line that is still the example, not the point. Checked loosely on
 * purpose: his own posted reels close on takeaways in many shapes ("Making it
 * profitable is.", "Is the website updated?"), and a stricter word test
 * rejected four of them. What it catches is the one clear miss, a reel that
 * goes from "Imagine…" straight to the sign-off.
 */
const STILL_THE_EXAMPLE = /\b(imagine|let'?s say|for example|for instance|suppose|picture this)\b/i;
/** A last line that is the reel's sign-off rather than its point. */
const SIGN_OFF = /follow for daily|see you tomorrow|\bcomment \W*[A-Z]{2,}/i;

const LENGTH_GUIDANCE = `LENGTH WITHOUT INVENTING: reach ${REEL_WORDS.min}–${REEL_WORDS.max} spoken words (a ${REEL_MIN_SECONDS}–${REEL_MAX_SECONDS} second reel) through the Explanation and the Example,
never through invented facts or filler. When the source is only a headline, the Example is a
clearly hypothetical business situation ("Let's say you run a small bakery…") showing how the
viewer would use it. Count the words across every shot's voiceover before returning.`;

const WORKFLOW_GUIDANCE = `AI TOOL WORKFLOW: in this lane the EXAMPLE IS THE WORKFLOW, SHOWN. Set up the example in one
line ("Let's say you run a small bakery."), then show 2–4 steps the viewer does, each its OWN short
paragraph that STARTS with the action verb: "Open…", "Type…", "Upload…", "Then click…". Each step
paragraph is its own shotType "Screen recording" shot. Describing what the tool does ("you can
input details and it does the rest") is NOT a step. Where the source does not say exactly where a
control is or what it is called, keep the step and mark the unknown part for the recording team,
e.g. "Open the tool [VERIFY: where it sits in the app]." Never invent menus as if
confirmed. The steps count toward the ${REEL_WORDS.min}–${REEL_WORDS.max} words; keep each one short.
The LAST line is this lane's CTA, its own shot: "Comment KEYWORD and I'll send you the full
step-by-step guide.", with ONE keyword in capitals from this reel's tool or task. The team sends the
guide to every commenter, so this promise is confirmed. A stock sign-off is wrong here.`;

function reviewUser(
  idea: RawIdea,
  sources: SourceItem[],
  feedback: { previous: ReviewResult; problems: string[] } | null,
  lessons = "",
): string {
  const lane = typeof idea.contentLane === "string" ? idea.contentLane : null;
  return [
    INSTAGRAM_REVIEW_PROMPT,
    sourceBlock(idea, sources),
    lessons,
    LENGTH_GUIDANCE,
    lane && isAiToolWorkflowLane(lane) ? WORKFLOW_GUIDANCE : "",
    // The team's call to action for this lane — the "when a call to action is
    // requested" case in his ENDING section.
    ctaRule(lane),
    // Frontier AI developments: a brand, real or clearly hypothetical, and the
    // marketing angle — kept through the rewrite, not only asked of the writer.
    brandRule(lane),
    `Draft:\n${JSON.stringify(draftFor(idea), null, 2)}`,
    feedback
      ? `YOUR PREVIOUS REWRITE broke these hard rules, counted by code, not estimated:\n${feedback.problems
          .map((problem) => `- ${problem}`)
          .join(
            "\n",
          )}\nFix every one, keep what was good, and return the full corrected script.\n` +
        `Previous rewrite:\n${JSON.stringify(
          { script: feedback.previous.script, shots: feedback.previous.shots },
          null,
          2,
        )}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

type ReviewResult = z.infer<typeof reviewResult>;

/**
 * Words actually SPOKEN. Bracketed notes such as "[VERIFY: where to click]"
 * are instructions for the team, never said aloud, so they are not counted:
 * counting them let an 86-word script pass as 99.
 */
const words = (text: string) =>
  text
    .replace(/\[[^\]]*\]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const spokenWords = (review: ReviewResult) =>
  words(review.shots.map((shot) => shot.voiceover).join(" "));

/** Specific facts a script should carry from its research, not general ones. */
const SPECIFIC_FACTS = new Set<FactCategory>(["who", "where", "figure", "how", "result"]);
/** Specific researched facts a reel must use, when the research has that many. */
const MIN_FACTS_USED = 4;

/** The multi-outlet research behind a draft, when its story was researched. */
function researchFor(idea: RawIdea, sources: SourceItem[]): StoryResearch | undefined {
  const id = typeof idea.source?.sourceId === "string" ? idea.source.sourceId : null;
  return id ? sources.find((item) => item.id === id)?.research : undefined;
}

/**
 * The hard rules a rewrite can be held to in code. Judgement rules — voice,
 * one idea, a good example — are left to the model; these are counted.
 */
function problemsOf(
  review: ReviewResult,
  lane: string | null,
  subject: string,
  rules: LearnedRules = NO_RULES,
  research?: StoryResearch,
): string[] {
  const problems: string[] = [];
  const count = spokenWords(review);
  const spoken = review.shots.map((shot) => shot.voiceover).join("\n");

  // Every reel closes on its point before the sign-off, as his posted reels
  // do ("Here's what matters for your business…", "The lesson? …"): an
  // example followed straight by the CTA leaves the viewer without one.
  const lines = review.shots.map((shot) => shot.voiceover.trim()).filter(Boolean);
  const point = SIGN_OFF.test(lines.at(-1) ?? "") ? lines.at(-2) : lines.at(-1);
  if (point && (STILL_THE_EXAMPLE.test(point) || HYPOTHETICAL_OPENER.test(point))) {
    problems.push(
      `the line before the sign-off is not a takeaway ("${point.slice(0, 80)}"); end on what this ` +
        `means for the viewer's business or work, or the lesson, as his posted reels do ` +
        `("Here's what matters for your business…", "The lesson? …"). An example is not a takeaway`,
    );
  }

  // A word or formula his voice rules out (voice-check.ts), sent back to be
  // fixed instead of only flagged on the idea afterwards.
  const probe = {
    hook: review.hook,
    altHooks: review.altHooks,
    shots: review.shots,
    caption: review.caption,
    title: subject,
    angle: "",
  } as unknown as ContentIdea;
  for (const flag of voiceFlags(probe)) {
    if (/^uses “|formula|opener/.test(flag) && !/emoji/.test(flag)) {
      problems.push(`the script ${flag}; rewrite that line in plain words`);
    }
  }

  // The research is only worth doing if the script carries it. Fewer than
  // MIN_FACTS_USED specific facts (a figure, a name, a place, how it works,
  // the result) and the rewrite goes back with the unused ones listed.
  if (research) {
    const specific = research.facts.filter((fact) => SPECIFIC_FACTS.has(fact.category));
    const used = specific.filter((fact) => factUsed(fact, spoken));
    const needed = Math.min(MIN_FACTS_USED, specific.length);
    if (used.length < needed) {
      const unused = specific
        .filter((fact) => !used.includes(fact) && !fact.conflict)
        .sort((a, b) => Number(b.category === "figure") - Number(a.category === "figure"))
        .slice(0, 6);
      problems.push(
        `the script uses only ${used.length} of the specific researched facts; it needs at least ${needed}. ` +
          `Work in the strongest of these, in Pritesh's words, in place of general statements: ` +
          unused.map((fact) => `"${fact.text}"`).join("; "),
      );
    }
  }
  // The shots are what the editor cuts from, so they are what is counted. A
  // script whose words did not all make it into the shots is a lost paragraph.
  const scripted = words(review.script);
  if (scripted - count > 8) {
    problems.push(
      `the script has ${scripted} words but the shots' voiceover only ${count}; ` +
        `every paragraph of the script must be one shot's voiceover, word for word`,
    );
  }
  // The team's 110-140 (lib/reel-length.ts), not his brief's 90-115: the reels
  // he posted run that long, and shorter scripts came out too thin.
  if (count < REEL_WORDS.min) {
    problems.push(
      `${count} spoken words; it needs ${REEL_WORDS.min}–${REEL_WORDS.max} for a ${REEL_MIN_SECONDS}–${REEL_MAX_SECONDS} second reel, never more than ${REEL_WORDS.max}`,
    );
  }
  if (count > REEL_WORDS.max)
    problems.push(`${count} spoken words; the maximum is ${REEL_WORDS.max}`);
  for (const hook of [review.hook, ...review.altHooks]) {
    const issue = hookIssue(hook, subject, {
      allowHypothetical: Boolean(rules.allowHypotheticalHooks),
    });
    if (issue) problems.push(issue);
    // A kind of hook that has kept losing on filmed reels is not written again.
    const blocked = rules.blockedHookTypes.find((rule) => rule.type === hookTypeOf(hook));
    if (blocked) {
      problems.push(
        `the hook "${hook}" is a ${HOOK_TYPE_LABEL[blocked.type].toLowerCase()} opening, which lost on ${blocked.reels} filmed reels (median ${blocked.medianRatio.toFixed(2)}x typical views); use a different kind of opening`,
      );
    }
  }
  const said = [review.hook, ...review.altHooks, ...review.shots.map((shot) => shot.voiceover)];
  if (said.some((line) => line.includes("!"))) {
    problems.push(
      "an exclamation mark in a hook or the voiceover; say it calmly, end on a full stop",
    );
  }
  const onScreen = review.shots.filter((shot) => shot.onScreenText.trim()).length;
  if (onScreen > 3) {
    problems.push(`${onScreen} shots have on-screen text; at most three may, the rest empty`);
  }
  if (review.durationSeconds > REEL_MAX_SECONDS) {
    problems.push(`the duration is over ${REEL_MAX_SECONDS} seconds`);
  }
  if (lane && isAiToolWorkflowLane(lane)) {
    const asIdea = {
      format: "reel",
      contentLane: lane,
      production: { durationSeconds: review.durationSeconds },
      shots: review.shots,
    } as unknown as ContentIdea;
    // Restated with the fix spelled out: the check's own wording ("show at
    // least two actions") was not enough for the model to act on.
    for (const issue of toolWorkflowIssues("instagram", asIdea)) {
      problems.push(
        /actions/.test(issue)
          ? "the workflow is described, not shown: the Example must contain 2–4 separate step " +
              "paragraphs that each START with the action verb (Open…, Type…, Then click…), " +
              'each its own shot with shotType "Screen recording"'
          : issue,
      );
    }
    const cta = workflowCtaIssue(review.shots.at(-1)?.voiceover ?? "", subject);
    if (cta) problems.push(cta);
  }
  return problems;
}

/** Adds two costs together. usd stays null if either side has no published rate. */
export function addCosts(a: GenerationCost | undefined, b: GenerationCost | undefined) {
  if (!a) return b;
  if (!b) return a;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    usd: a.usd != null && b.usd != null ? a.usd + b.usd : null,
    model: a.model === b.model ? a.model : `${a.model} + ${b.model} review`,
  } satisfies GenerationCost;
}

/**
 * Reviews every Instagram reel draft in a strategist reply, in place of the
 * draft, before the reply is checked and saved.
 *
 * Returns the reply in the same shape it came in, so finalizeIdeas and every
 * check after it run unchanged on the reviewed script. Carousels and LinkedIn
 * are passed through: his prompt is written for spoken reels.
 */
/** A review round needs about this long; with less left before the deadline it is skipped. */
const REVIEW_ROUND_MIN_MS = 45_000;

export async function reviewDrafts(
  platform: PlatformId,
  data: unknown,
  sources: SourceItem[],
  /** What filmed reels taught, so the rewrite does not undo a lesson. */
  lessons = "",
  /** Rules learned from filmed reels, enforced in the checks below. */
  rules: LearnedRules = NO_RULES,
  /**
   * When the whole request must be done (epoch ms). A round that cannot
   * finish before it is not started, and the draft or the best round so far
   * is kept: a reviewed script is better, but an unreviewed one is better
   * than none.
   */
  deadline?: number,
  /** His posted reels, for how he sounds: the same ones the writer was given. */
  toneReferences: ToneReference[] = [],
): Promise<{ data: unknown; cost: GenerationCost | undefined; reviewed: number; failed: number }> {
  const ideas = (data as { ideas?: unknown })?.ideas;
  if (platform !== "instagram" || !reviewEnabled() || !Array.isArray(ideas)) {
    return { data, cost: undefined, reviewed: 0, failed: 0 };
  }

  let cost: GenerationCost | undefined;
  let reviewed = 0;
  let failed = 0;

  const next = await Promise.all(
    (ideas as RawIdea[]).map(async (idea) => {
      if (idea?.format !== "reel" || !Array.isArray(idea["shots"])) return idea;
      const lane = typeof idea.contentLane === "string" ? idea.contentLane : null;
      try {
        // Up to two rounds. The model cannot be trusted to count its own
        // words (it reported 75 for a 61-word script), so the CODE counts, and
        // a reply that misses a hard rule goes back once with the exact
        // problems listed. The reply with the fewest problems is kept.
        let best: { review: ReviewResult; problems: string[] } | null = null;
        let feedback: { previous: ReviewResult; problems: string[] } | null = null;
        for (let round = 0; round < MAX_REVIEW_ROUNDS; round += 1) {
          if (round >= REVIEW_ROUNDS && !best?.problems.some(isLengthProblem)) break;
          if (deadline && deadline - Date.now() < REVIEW_ROUND_MIN_MS) break;
          const result = await completeJson<unknown>({
            system: [reviewSystem(lane), toneReferencesBlock(toneReferences)]
              .filter(Boolean)
              .join("\n\n"),
            user: reviewUser(idea, sources, feedback, lessons),
            schemaName: "reel_review",
            schema: reviewSchema as unknown as Record<string, unknown>,
            model: reviewModel(),
            temperature: 0.6,
            effort: "medium",
            timeoutMs: 180_000,
            ...(deadline ? { deadline } : {}),
          });
          if (result.usage) cost = addCosts(cost, costOf(result.usage, result.model));
          const parsed = reviewResult.safeParse(result.data);
          if (!parsed.success) {
            console.warn(`[ai:review] invalid review reply:`, parsed.error.message);
            continue;
          }
          const problems = problemsOf(
            parsed.data,
            lane,
            `${String(idea["title"] ?? "")} ${String(idea["angle"] ?? "")}`,
            rules,
            researchFor(idea, sources),
          );
          console.info(
            `[ai:review] "${String(idea["title"])}" round ${round + 1}: ` +
              `${spokenWords(parsed.data)} spoken words (reply said ${parsed.data.spokenWordCount})` +
              (problems.length ? `; ${problems.join("; ")}` : "; meets the hard rules"),
          );
          if (!best || problems.length < best.problems.length) {
            best = { review: parsed.data, problems };
          }
          if (!problems.length) break;
          feedback = { previous: parsed.data, problems };
        }
        if (!best) {
          failed += 1;
          return idea;
        }
        const review = best.review;
        reviewed += 1;
        const notes = [
          ...review.changeNotes.slice(0, 3).map((note) => `Review: ${note}`),
          ...review.needsVerification.map((claim) => `Verify before filming: ${claim}`),
        ];
        return {
          ...idea,
          hook: review.hook,
          altHooks: review.altHooks.slice(0, 2),
          shots: review.shots,
          caption: review.caption,
          hashtags: review.hashtags,
          production: {
            ...(idea.production ?? {}),
            // From the counted words at a relaxed pace, not the reply's figure,
            // which put 97 words at 30 seconds. Never under what the words need,
            // never past the team's limit (lib/reel-length.ts).
            durationSeconds: Math.min(
              REEL_MAX_SECONDS,
              Math.max(review.durationSeconds, Math.round(spokenWords(review) / WORDS_PER_SECOND)),
            ),
            editorNotes: [
              ...(Array.isArray(idea.production?.["editorNotes"])
                ? (idea.production["editorNotes"] as string[])
                : []),
              ...notes,
            ],
          },
        };
      } catch (error) {
        failed += 1;
        console.warn(`[ai:review] review failed, keeping the draft:`, error);
        return idea;
      }
    }),
  );

  return { data: { ...(data as object), ideas: next }, cost, reviewed, failed };
}
