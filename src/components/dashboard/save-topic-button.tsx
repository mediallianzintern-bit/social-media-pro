import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { saveTopic, savedTopicsQueryOptions } from "@/lib/analytics.functions";
import { savedKey, type SavedKind } from "@/lib/saved-topics";
import { cn } from "@/lib/utils";
import type { PlatformId } from "@/lib/analytics-types";

/**
 * The bookmark toggle on a topic row.
 *
 * Shown on every row in "Topics in the news" and "Rising on <platform>". One
 * press drops the topic onto the shared Saved screen, where the whole team can
 * come back to it; pressing again removes it. Self-contained on purpose — it
 * reads the saved list and owns its own mutation — so each caller adds it with
 * a single line and the two lists can never drift apart on what "saved" looks
 * like.
 *
 * The snapshot (title, link, label, lane) travels with the save, so the Saved
 * screen never has to go back to a source row that has since aged out.
 */
export function SaveTopicButton({
  platform,
  kind,
  itemId,
  title,
  url,
  sourceLabel,
  lane,
  className,
}: {
  platform: PlatformId;
  kind: SavedKind;
  itemId: string;
  title: string;
  url?: string | null;
  sourceLabel?: string | null;
  lane?: string | null;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const { data } = useQuery(savedTopicsQueryOptions(platform));
  const saved =
    data?.saved.some((topic) => savedKey(topic.kind, topic.itemId) === savedKey(kind, itemId)) ??
    false;

  const toggle = useMutation({
    mutationFn: () =>
      saveTopic({
        data: {
          platform,
          kind,
          itemId,
          saved: !saved,
          title,
          url: url ?? null,
          sourceLabel: sourceLabel ?? null,
          lane: lane ?? null,
        },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: savedTopicsQueryOptions(platform).queryKey }),
  });

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn(
        "h-auto shrink-0 gap-1.5 px-2 py-1 text-xs",
        saved ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        className,
      )}
      disabled={toggle.isPending}
      onClick={() => toggle.mutate()}
      aria-pressed={saved}
      title={saved ? "Saved — press to remove from the Saved screen" : "Save to the Saved screen"}
    >
      {toggle.isPending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : saved ? (
        <BookmarkCheck className="size-3.5" aria-hidden />
      ) : (
        <Bookmark className="size-3.5" aria-hidden />
      )}
      {saved ? "Saved" : "Save"}
    </Button>
  );
}
