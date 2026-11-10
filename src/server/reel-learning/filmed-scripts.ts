// The filmed scripts for one lane, read for the writer (lib/filmed-scripts.ts).
// Free: stored transcripts and synced posts.
import type { PlatformId } from "@/lib/analytics-types";
import { filmedScriptsBlock, type FilmedScript } from "@/lib/filmed-scripts";
import { isFinalReview, laneChange } from "@/lib/reel-learning-types";
import { HOOK_TYPE_LABEL } from "@/lib/reel-parts";

import { readIdeaById } from "../store";
import { postedLanes } from "./lane";
import { readAllReelLearning } from "./store";

/** Every analysed, confirmed filmed reel with what was said in it. */
export async function readFilmedScripts(platform: PlatformId): Promise<FilmedScript[]> {
  const rows = (await readAllReelLearning(platform)).filter(
    (row) => row.shortcode && row.match?.confirmed && row.transcript?.trim(),
  );
  if (!rows.length) return [];
  const lanes = await postedLanes(platform);
  const scripts = await Promise.all(
    rows.map(async (row): Promise<FilmedScript | null> => {
      const idea = await readIdeaById(row.ideaId).catch(() => null);
      const posted = lanes.get(row.shortcode!);
      const lane = laneChange(idea?.contentLane, posted)?.to ?? idea?.contentLane ?? null;
      if (!lane) return null;
      const comparison = row.comparison;
      const final = isFinalReview(row);
      return {
        ideaId: row.ideaId,
        title: idea?.title ?? idea?.hook ?? "A filmed script",
        lane,
        transcript: row.transcript!,
        filmedAt: row.filmedAt,
        worked: final ? Boolean(row.worked) : null,
        ratio: final ? (row.review?.primaryRatio ?? null) : null,
        hookType: comparison?.hookType
          ? HOOK_TYPE_LABEL[comparison.hookType]
          : (comparison?.hook.style ?? null),
        bodyShape: comparison?.body?.shape ?? null,
        cta: comparison?.cta?.spoken?.trim() || null,
        seconds: comparison?.reel?.seconds ?? null,
        words: comparison?.reel?.words ?? null,
      };
    }),
  );
  return scripts.filter((script): script is FilmedScript => script !== null);
}

/** The writer's block for a script in `lane`, or "" when that lane has nothing filmed. Never fatal. */
export async function filmedScriptsFor(
  platform: PlatformId,
  lane: string | null | undefined,
): Promise<string> {
  if (!lane?.trim()) return "";
  const scripts = await readFilmedScripts(platform).catch(() => []);
  return filmedScriptsBlock(scripts, lane, platform === "linkedin");
}
