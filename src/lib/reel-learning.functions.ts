import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { ReelLearning } from "@/lib/reel-learning-types";
import { requireStaff } from "@/lib/require-staff";

const ideaInput = z.object({ ideaId: z.string().uuid() });

/** A stored row as the drawer shows it, with the reel's publish time and review date. */
async function view(ideaId: string): Promise<ReelLearning | null> {
  const [{ readReelLearning }, { linkFilmedReel, linkedPost }, { reviewableAt }] =
    await Promise.all([
      import("@/server/reel-learning/store"),
      import("@/server/reel-learning/match"),
      import("@/server/reel-learning/review"),
    ]);
  let row = await readReelLearning(ideaId);
  if (!row) return null;
  // Free: looks for the live reel among the synced posts.
  if (!row.shortcode) row = await linkFilmedReel(row);
  const post = row.shortcode ? await linkedPost(row) : null;
  const { costUsd: _cost, ...rest } = row;
  return {
    ...rest,
    publishedAt: post?.publishedAt ?? null,
    reviewableAt: post ? reviewableAt(post.publishedAt) : null,
  };
}

/** Where a filmed idea has got to. Free: never transcribes, never calls a model. */
export const getReelLearning = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .validator((input: unknown) => ideaInput.parse(input))
  .handler(async ({ data }) => view(data.ideaId));

/**
 * "I filmed this": one click, nothing to paste. The live reel is then found by
 * its topic, now if it is already synced and after each sync until it is.
 */
export const markFilmed = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) =>
    ideaInput.extend({ platform: z.enum(["instagram", "linkedin"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ readIdeaById }, { recordFilmed }] = await Promise.all([
      import("@/server/store"),
      import("@/server/reel-learning/store"),
    ]);
    if (!(await readIdeaById(data.ideaId))) throw new Error("That idea is not stored.");
    await recordFilmed(data.ideaId, data.platform, context.staffEmail);
    return view(data.ideaId);
  });

/** Analyse (paid, ~3¢): transcript + what was kept, changed or replaced. */
export const analyseFilmed = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) => ideaInput.parse(input))
  .handler(async ({ data }): Promise<{ learning: ReelLearning | null; reason?: string }> => {
    const { analyseFilmedReel } = await import("@/server/reel-learning/analyse");
    const result = await analyseFilmedReel(data.ideaId);
    if ("reason" in result) return { learning: await view(data.ideaId), reason: result.reason };
    return { learning: await view(data.ideaId) };
  });

/** Review (paid, ~2¢, after a week): did it work, and why, element by element. */
export const reviewFilmed = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) => ideaInput.parse(input))
  .handler(async ({ data }): Promise<{ learning: ReelLearning | null; reason?: string }> => {
    const { reviewFilmedReel } = await import("@/server/reel-learning/review");
    const result = await reviewFilmedReel(data.ideaId);
    if ("reason" in result) return { learning: await view(data.ideaId), reason: result.reason };
    return { learning: await view(data.ideaId) };
  });

/** For the rare reel the topic cannot find, or a wrong match: link it by its URL. */
export const linkFilmedByHand = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) =>
    ideaInput.extend({ permalink: z.string().min(10).max(500) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { linkReelByHand } = await import("@/server/reel-learning/match");
    await linkReelByHand(data.ideaId, data.permalink);
    return view(data.ideaId);
  });

export const reelLearningQueryOptions = (ideaId: string) => ({
  queryKey: ["reel-learning", ideaId] as const,
  queryFn: () => getReelLearning({ data: { ideaId } }),
  staleTime: 30 * 1000,
});
