// What filmed reels taught, as a block for the writer and the reviewer.
//
// Two kinds of learning, both from reels the team actually posted:
//   - results: reviewed reels, what worked and what did not, each lesson tied
//     to the figure it rests on, newest first;
//   - the team's own style: where they changed the dashboard's script, what
//     they did instead. A rewrite is the team telling the writer something it
//     got wrong, before any figure comes in.
//
// Read-only and free. Empty until something has been reviewed or analysed.
import type { PlatformId } from "@/lib/analytics-types";
import { REEL_USAGE_LABEL } from "@/lib/reel-learning-types";

import { readAllReelLearning } from "./store";

/** Reviewed reels quoted at most: the newest are the most relevant. */
const MAX_REVIEWED = 10;
const MAX_STYLE_NOTES = 6;

export async function filmedLessonsBlock(platform: PlatformId): Promise<string> {
  const rows = await readAllReelLearning(platform).catch(() => []);
  const reviewed = rows.filter((row) => row.review).slice(0, MAX_REVIEWED);
  const restyled = rows
    .filter((row) => row.comparison?.teamStyle?.trim() && row.usage !== "as_written")
    .slice(0, MAX_STYLE_NOTES);
  if (!reviewed.length && !restyled.length) return "";

  const results = reviewed.map((row) => {
    const review = row.review!;
    const head = `- ${row.worked ? "WORKED" : "DID NOT WORK"} (${review.primaryRatio.toFixed(2)}x typical views; ${REEL_USAGE_LABEL[row.usage ?? "partly"].toLowerCase()}; hook: ${row.comparison?.hook.style ?? "?"}): ${review.summary}`;
    const lessons = review.lessons.map(
      (lesson) =>
        `    ${lesson.kind === "repeat" ? "REPEAT" : "AVOID"} [${lesson.element}] ${lesson.lesson} (${lesson.evidence})`,
    );
    return [head, ...lessons].join("\n");
  });

  const styles = restyled.map(
    (row) =>
      `- ${REEL_USAGE_LABEL[row.usage ?? "partly"]}; their opening was ${row.comparison!.hook.style}: ${row.comparison!.teamStyle}`,
  );

  return [
    `WHAT FILMED REELS TAUGHT US — reels the team actually posted, measured after a week. Each one
is a single reel, so treat a lesson as strong only when several reels agree. Follow REPEAT lessons,
never repeat AVOID ones, and prefer the team's own style where they keep rewriting the same thing.`,
    results.length ? `RESULTS:\n${results.join("\n")}` : "",
    styles.length
      ? `HOW THE TEAM CHANGES OUR SCRIPTS (they film their version, so learn from it):\n${styles.join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
