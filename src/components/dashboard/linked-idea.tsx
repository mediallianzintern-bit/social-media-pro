// A script opened from a link: the platform page with ?idea=<id> opens that
// script's full drawer (Approve, Reject, I posted this, Copy handover doc), so
// "Go to LinkedIn" from Trends lands on the script itself, not on the page top.
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { AiIdeaCards } from "@/components/dashboard/ai-idea-cards";
import type { PlatformId } from "@/lib/analytics-types";
import { getTrendIdea } from "@/lib/universal-trends.functions";

export function LinkedIdea({ platform }: { platform: PlatformId }) {
  const { idea: ideaId } = useSearch({ from: "/_app" });
  const navigate = useNavigate();
  const { data: idea, error } = useQuery({
    queryKey: ["linked-idea", ideaId],
    queryFn: () => getTrendIdea({ data: { ideaId: ideaId! } }),
    enabled: Boolean(ideaId),
    staleTime: 60_000,
  });
  const close = () =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, idea: undefined }), replace: true });

  if (!ideaId) return null;
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error instanceof Error ? error.message : "That script could not be opened."}
      </p>
    );
  }
  if (!idea) return null;
  return (
    <AiIdeaCards
      key={idea.id}
      ideas={[idea]}
      platform={platform}
      initialOpenId={idea.id}
      panelOnly
      onClose={close}
    />
  );
}
