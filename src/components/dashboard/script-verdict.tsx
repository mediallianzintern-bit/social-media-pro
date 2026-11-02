import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { PlatformId } from "@/lib/analytics-types";
import { REJECT_REASON_KEYS, REJECT_REASONS, type RejectReason } from "@/lib/script-feedback";
import { judgeScript, scriptVerdictsQueryOptions } from "@/lib/script-feedback.functions";
import { cn } from "@/lib/utils";

/**
 * Approve a script, or reject it and say why (0033_script_feedback).
 *
 * An approval makes the script an example of how he sounds for the writer; a
 * rejection's reasons tell it what the team keeps sending back. Clicking the
 * chosen mark again clears it, like the topic ticks. A rejection opens the
 * reasons straight away, because a cross with no reason teaches the writer
 * nothing it can fix.
 */
export function ScriptVerdictButtons({
  platform,
  ideaId,
}: {
  platform: PlatformId;
  ideaId: string;
}) {
  const queryClient = useQueryClient();
  const options = scriptVerdictsQueryOptions(platform);
  const { data } = useQuery(options);
  const current = data?.find((verdict) => verdict.ideaId === ideaId) ?? null;
  const [picking, setPicking] = useState(false);
  const [reasons, setReasons] = useState<RejectReason[]>([]);
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: (input: {
      verdict: "approve" | "reject" | null;
      reasons: RejectReason[];
      note: string | null;
    }) => judgeScript({ data: { platform, ideaId, ...input } }),
    onSuccess: () => {
      setPicking(false);
      void queryClient.invalidateQueries({ queryKey: options.queryKey });
      void queryClient.invalidateQueries({ queryKey: ["topic-feedback", platform] });
    },
  });

  const approve = () =>
    mutation.mutate({
      verdict: current?.verdict === "approve" ? null : "approve",
      reasons: [],
      note: null,
    });
  const reject = () => {
    if (current?.verdict === "reject") {
      mutation.mutate({ verdict: null, reasons: [], note: null });
      return;
    }
    setReasons([]);
    setNote("");
    setPicking((open) => !open);
  };
  const toggle = (reason: RejectReason) =>
    setReasons((now) =>
      now.includes(reason) ? now.filter((entry) => entry !== reason) : [...now, reason],
    );

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {current?.verdict === "approve"
            ? "Approved: the writer learns from this one."
            : current?.verdict === "reject"
              ? `Rejected: ${current.reasons.map((reason) => REJECT_REASONS[reason]).join(", ") || "no reason given"}.`
              : "Is this script right?"}
        </span>
        <div className="inline-flex items-center gap-0.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-emerald-700",
              current?.verdict === "approve" &&
                "bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/15 dark:text-emerald-400",
            )}
            aria-pressed={current?.verdict === "approve"}
            title={
              current?.verdict === "approve"
                ? "Approved — click to clear"
                : "Approve: the writer uses it as an example of how he sounds"
            }
            disabled={mutation.isPending}
            onClick={approve}
          >
            <Check className="size-3.5" aria-hidden />
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive",
              (current?.verdict === "reject" || picking) &&
                "bg-destructive/10 text-destructive hover:bg-destructive/15",
            )}
            aria-pressed={current?.verdict === "reject"}
            title={
              current?.verdict === "reject"
                ? "Rejected — click to clear"
                : "Reject, and say what is wrong"
            }
            disabled={mutation.isPending}
            onClick={reject}
          >
            <X className="size-3.5" aria-hidden />
            Reject
          </Button>
        </div>
      </div>

      {picking ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-semibold">What is wrong with it? Pick all that apply.</p>
          <div className="flex flex-wrap gap-1.5">
            {REJECT_REASON_KEYS.map((reason) => (
              <button
                key={reason}
                type="button"
                aria-pressed={reasons.includes(reason)}
                onClick={() => toggle(reason)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  reasons.includes(reason)
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "hover:bg-muted",
                )}
              >
                {REJECT_REASONS[reason]}
              </button>
            ))}
          </div>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="Anything else? (optional)"
            className="h-8 w-full rounded-md border bg-background px-2.5 text-xs"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={mutation.isPending || (!reasons.length && !note.trim())}
              onClick={() =>
                mutation.mutate({ verdict: "reject", reasons, note: note.trim() || null })
              }
            >
              Reject script
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setPicking(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {mutation.error ? <p className="text-xs text-destructive">{mutation.error.message}</p> : null}
    </div>
  );
}
