// The ideas waiting for someone to look at them, across both accounts: the
// To do count in the menu, the first "Do next" on Home, and the queue the
// one-card review walks through (13 Nov 2026, UI review).
//
// Waiting means written and not yet decided: not approved or rejected, not
// dismissed, and not already used for a post. Free: it reads the stored ideas
// and verdicts the account pages already load.
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import type { ContentIdea } from "@/lib/ai-types";
import type { PlatformId } from "@/lib/analytics-types";
import { analysisQueryOptions } from "@/lib/analytics.functions";
import { scriptVerdictsQueryOptions } from "@/lib/script-feedback.functions";

const PLATFORMS: PlatformId[] = ["instagram", "linkedin"];

export interface WaitingIdea {
  idea: ContentIdea;
  platform: PlatformId;
}

export function useWaitingIdeas(): {
  waiting: WaitingIdea[];
  byPlatform: Record<PlatformId, number>;
  loading: boolean;
} {
  const results = useQueries({
    queries: [
      ...PLATFORMS.map((platform) => analysisQueryOptions(platform)),
      ...PLATFORMS.map((platform) => scriptVerdictsQueryOptions(platform)),
    ],
  });
  const loading = results.some((result) => result.isLoading);
  const analyses = results.slice(0, PLATFORMS.length);
  const verdicts = results.slice(PLATFORMS.length);

  return useMemo(() => {
    const decided = new Set(
      verdicts.flatMap((result) =>
        ((result.data as Array<{ ideaId: string }> | undefined) ?? []).map((v) => v.ideaId),
      ),
    );
    const waiting: WaitingIdea[] = [];
    PLATFORMS.forEach((platform, index) => {
      const ideas = (analyses[index]?.data as { ideas?: ContentIdea[] } | undefined)?.ideas ?? [];
      for (const idea of ideas) {
        if (!idea.id || decided.has(idea.id)) continue;
        if (idea.status === "used" || idea.status === "dismissed") continue;
        waiting.push({ idea, platform });
      }
    });
    const byPlatform = {
      instagram: waiting.filter((entry) => entry.platform === "instagram").length,
      linkedin: waiting.filter((entry) => entry.platform === "linkedin").length,
    } as Record<PlatformId, number>;
    return { waiting, byPlatform, loading };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, ...analyses.map((r) => r.data), ...verdicts.map((r) => r.data)]);
}
