// What filmed reels taught, as a block for the writer and the reviewer, and
// the rules it justifies.
//
// Everything here comes from reels the team actually posted:
//   - RULES: strong patterns (3+ reviewed reels) turned into rules, enforced in
//     code where they can be (lib/reel-patterns.ts deriveRules);
//   - VIRAL REELS: reels at 3x the typical views or more, quoted part by part,
//     the clearest example there is of what works for this audience;
//   - MEASURED PATTERNS: every reviewed reel counted by hook type, body shape,
//     example, CTA, length, caption, hashtags and lane;
//   - RESULTS: each review's lessons, with the figure each rests on;
//   - the TEAM'S OWN STYLE, but only once a review proves it worked. Copying
//     the team's habits before any result would let the system learn a
//     preference instead of a fact (Pritesh, 19 Oct: "who's making changes is
//     right or the system is right?" — the results decide).
//
// Read-only and free. Empty until something has been reviewed.
import type { PlatformId } from "@/lib/analytics-types";
import {
  isFinalReview,
  laneChange,
  LEARNING_WORDS,
  NO_RULES,
  REEL_USAGE_LABEL,
  VIRAL_RATIO,
  type LearnedRules,
  type ReelPattern,
} from "@/lib/reel-learning-types";
import { CTA_TYPE_LABEL, HOOK_TYPE_LABEL } from "@/lib/reel-parts";
import { deriveRules, reelPatterns, type ReviewedReel } from "@/lib/reel-patterns";

import { readIdeaById } from "../store";

import { postedLanes } from "./lane";
import { readAllReelLearning, type ReelLearningRow } from "./store";

/** Reviewed reels quoted at most: the newest are the most relevant. */
const MAX_REVIEWED = 10;
const MAX_VIRAL = 3;
const MAX_STYLE_NOTES = 6;

async function reviewedReels(rows: ReelLearningRow[]): Promise<ReviewedReel[]> {
  const reviewed = rows.filter(isFinalReview);
  const platform = reviewed[0]?.platform;
  const lanes = platform ? await postedLanes(platform) : new Map<string, string>();
  return Promise.all(
    reviewed.map(async (row) => {
      const comparison = row.comparison;
      // A LinkedIn post is its own caption: its caption figures say nothing new.
      const post = row.platform === "linkedin" ? (comparison?.post ?? null) : null;
      const scriptLane = (await readIdeaById(row.ideaId).catch(() => null))?.contentLane ?? null;
      // A reel taught the lane it went live in, not the one its script was
      // written for (lane.ts).
      const moved = laneChange(scriptLane, row.shortcode ? lanes.get(row.shortcode) : null);
      return {
        lane: moved?.to ?? scriptLane,
        hookStyle: comparison?.hook.style ?? null,
        hookVerdict: comparison?.hook.verdict ?? null,
        scriptVerdict: comparison?.script.verdict ?? null,
        captionVerdict: post ? null : (comparison?.caption.verdict ?? null),
        usage: row.usage,
        hookType: comparison?.hookType ?? null,
        ctaType: comparison?.cta?.type ?? null,
        bodyShape: comparison?.body?.shape ?? null,
        exampleType: comparison?.body?.exampleType ?? null,
        seconds: comparison?.reel?.seconds ?? null,
        captionWords: post ? null : (comparison?.captionStats?.words ?? null),
        postWords: post?.words ?? null,
        grade: post?.grade ?? null,
        points: post?.points ?? null,
        openingVariant: post ? (comparison?.hook.variant ?? null) : null,
        hashtags: comparison ? [...comparison.hashtags.used, ...comparison.hashtags.added] : null,
        researchSources: comparison?.research?.sources ?? null,
        researchUsed: comparison?.research?.facts
          ? comparison.research.factsUsed / comparison.research.facts
          : null,
        ratio: row.review!.primaryRatio,
        worked: Boolean(row.worked),
      };
    }),
  );
}

/** Every reviewed reel's counts, grouped (lib/reel-patterns.ts). Free. */
export async function filmedPatterns(platform: PlatformId): Promise<ReelPattern[]> {
  const rows = await readAllReelLearning(platform).catch(() => []);
  return reelPatterns(await reviewedReels(rows));
}

/** The rules the patterns justify, for the writer, the reviewer and Get more hooks. */
export async function learnedRules(platform: PlatformId): Promise<LearnedRules> {
  const patterns = await filmedPatterns(platform).catch(() => []);
  return patterns.length ? deriveRules(patterns) : NO_RULES;
}

/** A filmed reel's parts, as the writer should see them. */
function anatomy(row: ReelLearningRow): string[] {
  const c = row.comparison;
  if (!c) return [];
  const lines = [
    `    HOOK (${c.hookType ? HOOK_TYPE_LABEL[c.hookType] : c.hook.style}): "${c.hook.spoken}"`,
  ];
  if (c.body) lines.push(`    BODY: ${c.body.shape}; example: ${c.body.exampleType}`);
  if (c.cta)
    lines.push(
      `    CTA (${CTA_TYPE_LABEL[c.cta.type]}): ${c.cta.spoken ? `"${c.cta.spoken}"` : "none"}`,
    );
  if (c.reel?.seconds)
    lines.push(`    LENGTH: about ${c.reel.seconds} seconds, ${c.reel.words} words`);
  if (c.post) {
    lines.push(
      `    SHAPE: ${c.post.words} words, about Grade ${c.post.grade}, ${c.post.points} numbered points, ${c.post.figures} figures${c.post.closingQuestion ? ", a closing question" : ""}${c.post.repost ? ", a Repost line" : ""}`,
    );
  }
  return lines;
}

export async function filmedLessonsBlock(platform: PlatformId): Promise<string> {
  const rows = await readAllReelLearning(platform).catch(() => []);
  // Early checks are not learned from: their figures were still growing.
  const reviewed = rows.filter(isFinalReview);
  if (!reviewed.length) return "";
  const patterns = reelPatterns(await reviewedReels(rows));
  const rules = deriveRules(patterns);
  // A LinkedIn post is judged on impressions after a week, a reel on views after two.
  const w = LEARNING_WORDS[platform === "linkedin" ? "linkedin" : "instagram"];
  const linkedin = platform === "linkedin";

  const ruleLines = [
    ...rules.blockedHookTypes.map(
      (rule) =>
        `- NEVER open with a ${HOOK_TYPE_LABEL[rule.type].toLowerCase()} hook: it lost on ${rule.reels} ${w.things} (median ${rule.medianRatio.toFixed(2)}x typical ${w.measure}). Enforced: such a hook is sent back to be rewritten.`,
    ),
    ...(rules.allowHypotheticalHooks
      ? [
          `- RULE LIFTED: hypothetical openers ("Imagine…", "What if…") WORKED on ${rules.allowHypotheticalHooks.reels} ${w.things} (median ${rules.allowHypotheticalHooks.medianRatio.toFixed(2)}x). They are allowed again, as long as the same opening line names the subject.`,
        ]
      : []),
    ...rules.blockedHashtags.map(
      (rule) =>
        `- Do not use ${rule.tag}: it was on ${rule.reels} ${w.things} that lost (median ${rule.medianRatio.toFixed(2)}x). Enforced: removed from new scripts.`,
    ),
  ];

  const viral = reviewed
    .filter((row) => row.review!.primaryRatio >= VIRAL_RATIO)
    .sort((a, b) => b.review!.primaryRatio - a.review!.primaryRatio)
    .slice(0, MAX_VIRAL)
    .map((row) =>
      [
        `- ${row.review!.primaryRatio.toFixed(2)}x typical ${w.measure} (${REEL_USAGE_LABEL[row.usage ?? "partly"].toLowerCase()}): ${row.review!.summary}`,
        ...anatomy(row),
        ...row
          .review!.lessons.filter((lesson) => lesson.kind === "repeat")
          .map((lesson) => `    REPEAT [${lesson.element}] ${lesson.lesson} (${lesson.evidence})`),
      ].join("\n"),
    );

  const results = reviewed.slice(0, MAX_REVIEWED).map((row) => {
    const review = row.review!;
    const verdict =
      review.primaryRatio >= VIRAL_RATIO ? "VIRAL" : row.worked ? "WORKED" : "DID NOT WORK";
    const head = `- ${verdict} (${review.primaryRatio.toFixed(2)}x typical ${w.measure}; ${REEL_USAGE_LABEL[row.usage ?? "partly"].toLowerCase()}; hook: ${row.comparison?.hookType ? HOOK_TYPE_LABEL[row.comparison.hookType] : (row.comparison?.hook.style ?? "?")}): ${review.summary}`;
    const lessons = review.lessons.map(
      (lesson) =>
        `    ${lesson.kind === "repeat" ? "REPEAT" : "AVOID"} [${lesson.element}] ${lesson.lesson} (${lesson.evidence})`,
    );
    return [head, ...lessons].join("\n");
  });

  // The team's own changes, only where a review has proved them right or wrong.
  const teamChanges = reviewed
    .filter((row) => row.comparison?.teamStyle?.trim() && row.usage !== "as_written")
    .slice(0, MAX_STYLE_NOTES)
    .map(
      (row) =>
        `- ${row.worked ? "PROVEN — copy this" : "DID NOT WORK — do not copy"} (${row.review!.primaryRatio.toFixed(2)}x): ${row.comparison!.teamStyle}`,
    );

  return [
    linkedin
      ? `WHAT PUBLISHED POSTS TAUGHT US — LinkedIn posts the team actually published from this dashboard,
measured on LinkedIn's own impressions after a week. Follow the RULES; copy what made the posts at
3x or more work; trust a pattern marked STRONG (3+ posts) over any single result; follow REPEAT
lessons and never repeat AVOID ones. Pritesh Sir's brief and the team's model post still decide
the voice: these results decide between ways of following it.`
      : `WHAT FILMED REELS TAUGHT US — reels the team actually posted, measured after two weeks. Follow the
RULES; copy what made the VIRAL reels work; trust a pattern marked STRONG (3+ reels) over any single
result; follow REPEAT lessons and never repeat AVOID ones.`,
    ruleLines.length ? `RULES LEARNED FROM RESULTS:\n${ruleLines.join("\n")}` : "",
    viral.length
      ? `${linkedin ? "POSTS AT 3X OR MORE" : "VIRAL REELS"} — the clearest proof of what this audience wants:\n${viral.join("\n")}`
      : "",
    patterns.length
      ? `MEASURED PATTERNS, counted across every reviewed ${w.thing} (median ${w.measure} vs the typical ${w.thing}):\n${patterns
          .slice(0, 24)
          .map(
            (pattern) =>
              `- ${pattern.strong ? "STRONG" : "early"} · ${pattern.dimension}: ${pattern.value} — ${pattern.reels} ${pattern.reels === 1 ? w.thing : w.things}, ${pattern.worked} worked, median ${pattern.medianRatio.toFixed(2)}x`,
          )
          .join("\n")}`
      : "",
    results.length ? `RESULTS:\n${results.join("\n")}` : "",
    teamChanges.length
      ? `WHEN THE TEAM REWROTE OUR SCRIPT, AND HOW IT DID:\n${teamChanges.join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
