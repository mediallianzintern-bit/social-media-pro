import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clapperboard, ExternalLink, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmReactionFactsFn, getReactionSource } from "@/lib/analytics.functions";
import type { ContentIdea } from "@/lib/ai-types";
import {
  approvalBlockers,
  BEAT_LABEL,
  PIVOT_LABEL,
  RIGHTS_LABEL,
  SOURCE_PLATFORM_LABEL,
  SOURCE_TYPE_LABEL,
} from "@/lib/reaction";

/**
 * Addendum E — the reaction-specific half of a script.
 *
 * The source clip is read LIVE from its stored row rather than from the copy
 * on the idea: if the team corrects the credit or clears the rights after the
 * script was written, this shows what is true now, and it is what the
 * approval gate checks. The beats are listed in E.2's order so the structure
 * the format depends on can be checked at a glance.
 */
export function ReactionPanel({ idea }: { idea: ContentIdea }) {
  const queryClient = useQueryClient();
  const reaction = idea.reaction;
  const { data: live } = useQuery({
    queryKey: ["reaction-source", reaction?.sourceId],
    queryFn: () => getReactionSource({ data: reaction!.sourceId }),
    enabled: Boolean(reaction?.sourceId),
    staleTime: 30 * 1000,
  });

  const confirm = useMutation({
    mutationFn: () => confirmReactionFactsFn({ data: idea.id }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["analysis"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace"] }),
      ]);
    },
  });

  if (!reaction) return null;

  // Prefer the live row; fall back to the copy only if the source was removed.
  const source = live ?? null;
  const url = source?.sourceUrl ?? reaction.sourceUrl;
  const credit = source?.creditText ?? reaction.creditOverlayText;
  const rights = source?.rightsStatus ?? reaction.rightsStatus;
  const handle = source?.sourceCreatorHandle ?? reaction.sourceCreatorHandle;
  const blockers = approvalBlockers({ sourceUrl: url, creditText: credit, rightsStatus: rights });
  const verified = Boolean(reaction.verifiedAt) || confirm.data?.ok === true;

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Clapperboard className="size-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold">Reaction hook</h3>
        <Badge variant="outline" className="font-normal">
          {PIVOT_LABEL[reaction.pivotType]}
        </Badge>
      </div>

      {/* The source — the one thing this format must never get wrong. */}
      <div className="space-y-1.5 rounded-md bg-muted/50 p-3">
        <p className="text-xs font-medium text-muted-foreground">Source clip</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
        >
          {handle ? `@${handle}` : "Open the source clip"} on{" "}
          {SOURCE_PLATFORM_LABEL[source?.sourcePlatform ?? reaction.sourcePlatform]}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
        <p className="break-all text-[11px] text-muted-foreground">{url}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>
            <span className="text-muted-foreground">Type: </span>
            {SOURCE_TYPE_LABEL[source?.sourceType ?? reaction.sourceType]}
          </span>
          <span>
            <span className="text-muted-foreground">Borrow: </span>
            {reaction.sourceIn}–{reaction.sourceOut} of the original
          </span>
          <span>
            <span className="text-muted-foreground">Rights: </span>
            {RIGHTS_LABEL[rights]}
          </span>
        </div>
        <p className="text-xs">
          <span className="text-muted-foreground">On-screen credit: </span>
          <span className="font-medium">{credit || "— not set"}</span>
        </p>
        {source == null && live === null ? (
          <p className="text-xs text-destructive">
            The stored source clip has been removed. Re-add it before approving.
          </p>
        ) : null}
      </div>

      <p className="text-sm">
        <span className="text-muted-foreground">Claim it responds to: </span>
        {reaction.claim}
      </p>

      <ol className="space-y-2">
        {reaction.beats.map((entry) => (
          <li key={entry.beat} className="text-sm">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {BEAT_LABEL[entry.beat]}
            </span>
            {entry.line ? (
              <span
                className={
                  /\[VERIFY\]/i.test(entry.line) ? "text-amber-800 dark:text-amber-300" : ""
                }
              >
                {entry.line}
              </span>
            ) : (
              <span className="text-destructive">Missing — fill before filming.</span>
            )}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        Expert segment about {reaction.expertSeconds}s, after the borrowed clip.
      </p>

      {reaction.verifyItems.length ? (
        <div className="space-y-2 rounded-md border border-amber-500/30 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-3.5" aria-hidden />
            {reaction.verifyItems.length} fact{reaction.verifyItems.length === 1 ? "" : "s"} for the
            client to confirm before filming
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            {reaction.verifyItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {verified ? (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" aria-hidden />
              Confirmed by the client — this can go into production.
            </p>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => confirm.mutate()}
              disabled={confirm.isPending || !idea.id}
            >
              {confirm.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              The client has confirmed these facts
            </Button>
          )}
        </div>
      ) : null}

      {blockers.length ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Cannot be approved yet: {blockers.join(" ")} Edit the clip on the Reaction hooks page.
        </p>
      ) : null}
    </section>
  );
}
