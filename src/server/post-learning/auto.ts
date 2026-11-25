// After each LinkedIn sync: analyse his new posts, and review the ones that
// have run their 14 days, without anyone pressing a button (lib/post-learning.ts).
// Paid, within a monthly cap, a few steps per sync; never fatal.
import { planPostSteps } from "@/lib/post-learning";

import { hasOpenAi } from "../ai/client";
import { ownerAccount } from "../apify/accounts";
import { readPosts } from "../store";
import { analysePost } from "./analyse";
import { reviewPost } from "./review";
import { PostLearningNotReady, readPostLearning } from "./store";

/** No new step starts this long after the pass began, to stay inside the sync's 300 s. */
const TIME_BUDGET_MS = 90_000;

export async function learnFromPublishedPosts(): Promise<{
  analysed: number;
  reviewed: number;
  skipped: string | null;
}> {
  const done = { analysed: 0, reviewed: 0 };
  if (!hasOpenAi()) return { ...done, skipped: "OPENAI_API_KEY is not set." };
  const started = Date.now();
  try {
    const [rows, posts] = await Promise.all([
      readPostLearning(),
      readPosts("linkedin", ownerAccount("linkedin").handle, 1000),
    ]);
    const plan = planPostSteps(rows, posts);
    if (!plan.cap) return { ...done, skipped: "Turned off (LINKEDIN_LEARNING_MONTHLY_USD=0)." };
    if (!plan.steps.length) {
      return {
        ...done,
        skipped: plan.waiting ? `This month's $${plan.cap.toFixed(2)} is spent.` : null,
      };
    }

    const { readLinkedInAnalytics } = await import("../linkedin-analytics");
    const analytics = await readLinkedInAnalytics().catch(() => null);
    const stats = new Map(
      (analytics?.posts ?? []).map((entry) => [
        entry.postId,
        {
          impressions: entry.impressions ?? undefined,
          membersReached: entry.membersReached ?? undefined,
          saves: entry.saves ?? undefined,
          sends: entry.sends ?? undefined,
        },
      ]),
    );
    const titles = new Map((analytics?.articles ?? []).map((row) => [row.postId, row.title]));
    const byId = new Map(posts.map((post) => [post.postId, post]));
    const rowById = new Map(rows.map((row) => [row.postId, row]));

    for (const step of plan.steps) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      const post = byId.get(step.postId);
      if (!post) continue;
      const title = titles.get(post.postId) ?? null;
      try {
        if (step.kind === "analyse") {
          const result = await analysePost(post, title);
          if ("reason" in result) {
            console.warn(`[post-learning] analyse ${post.postId} not done: ${result.reason}`);
            continue;
          }
          done.analysed += 1;
        } else {
          const analysis = rowById.get(post.postId)?.analysis;
          if (!analysis) continue;
          const result = await reviewPost(
            post,
            analysis,
            posts,
            stats as unknown as Parameters<typeof reviewPost>[3],
            title,
          );
          if ("reason" in result) {
            console.warn(`[post-learning] review ${post.postId} not done: ${result.reason}`);
            continue;
          }
          done.reviewed += 1;
        }
      } catch (error) {
        if (error instanceof PostLearningNotReady) throw error;
        console.warn(`[post-learning] ${step.kind} ${post.postId} failed:`, error);
      }
    }
    console.info(
      `[post-learning] analysed ${done.analysed}, reviewed ${done.reviewed}; ` +
        `$${plan.spent.toFixed(3)} of $${plan.cap.toFixed(2)} spent this month before this pass; ` +
        `${plan.waiting} step(s) left for later syncs.`,
    );
    return { ...done, skipped: null };
  } catch (error) {
    if (error instanceof PostLearningNotReady) {
      return { ...done, skipped: error.message };
    }
    console.error("[post-learning] skipped:", error);
    return { ...done, skipped: error instanceof Error ? error.message : String(error) };
  }
}
