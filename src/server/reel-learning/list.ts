// Every filmed idea for a platform, with where it has got to, for the
// Filmed reels page. Free: reads stored rows and synced posts, and looks for
// any reel still waiting (the same free matching the drawer does).
import type { ContentIdea } from "@/lib/ai-types";
import type { PlatformId } from "@/lib/analytics-types";
import type { ReelLearning } from "@/lib/reel-learning-types";
import { shortcodeFromUrl } from "@/lib/reel-match";

import { OWNER_ACCOUNTS } from "../apify/accounts";
import { readIdeaById, readPosts } from "../store";
import { linkFilmedReels } from "./match";
import { reviewableAt } from "./review";
import { readAllReelLearning } from "./store";

export interface FilmedItem {
  learning: ReelLearning;
  idea: ContentIdea | null;
}

export async function listFilmed(platform: PlatformId): Promise<FilmedItem[]> {
  // Anything still waiting gets one more free look before the list is read.
  await linkFilmedReels(platform);
  const [rows, posts] = await Promise.all([
    readAllReelLearning(platform),
    readPosts(platform, OWNER_ACCOUNTS[platform].handle, 1000).catch(() => []),
  ]);
  const byCode = new Map(posts.map((post) => [shortcodeFromUrl(post.url) ?? post.postId, post]));
  return Promise.all(
    rows.map(async (row) => {
      const { costUsd: _cost, sourceWords: _words, ...rest } = row;
      const post = row.shortcode ? byCode.get(row.shortcode) : undefined;
      return {
        learning: {
          ...rest,
          publishedAt: post?.publishedAt ?? null,
          reviewableAt: post ? reviewableAt(post.publishedAt) : null,
        },
        idea: await readIdeaById(row.ideaId).catch(() => null),
      };
    }),
  );
}
