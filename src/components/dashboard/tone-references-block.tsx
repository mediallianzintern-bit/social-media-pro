// Which of Pritesh's posted reels informed this script's tone, where each
// conflicted with his Tone and Voice brief (the brief was followed), and the
// team's check: does the script sound like him? (lib/tone-references.ts)
import { useMutation } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ContentIdea, ToneCheck } from "@/lib/ai-types";
import { shortDate } from "@/lib/format";
import { checkScriptTone } from "@/lib/tone-references.functions";

export function ToneReferencesBlock({ idea }: { idea: ContentIdea }) {
  const [check, setCheck] = useState<ToneCheck | undefined>(idea.toneCheck);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (verdict: "yes" | "no") =>
      checkScriptTone({ data: { ideaId: idea.id, verdict, note } }),
    onSuccess: (result, verdict) => {
      if (!result.ok) {
        setMessage(result.reason ?? "Not saved.");
        return;
      }
      setCheck({ verdict, note, by: null, at: new Date().toISOString() });
      setAsking(false);
      setMessage(null);
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : String(error)),
  });

  const references = idea.toneReferences ?? [];
  if (!references.length) return null;

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Tone references
        <span aria-hidden className="h-px flex-1 bg-border" />
      </h3>
      <div className="space-y-3 rounded-lg border bg-card p-3.5 text-sm">
        <p className="text-xs leading-relaxed text-muted-foreground">
          The writer was given these reels Pritesh posted, for how he sounds only: never their
          facts, never their sentences. Where one breaks his Tone and Voice brief, the brief was
          followed.
        </p>
        <ol className="space-y-2">
          {references.map((reference, index) => (
            <li key={reference.id}>
              <p className="font-medium leading-snug">
                {index + 1}. {reference.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {[reference.postedAt ? shortDate(reference.postedAt) : null, reference.lane]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {reference.conflicts.length ? (
                <ul className="mt-1 list-inside list-disc text-xs text-amber-700 dark:text-amber-400">
                  {reference.conflicts.map((conflict) => (
                    <li key={conflict}>Conflicts with the brief: {conflict}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>

        <div className="space-y-2 border-t pt-3">
          {check ? (
            <p className="text-xs">
              <span className="font-medium">
                {check.verdict === "yes" ? "Sounds like Pritesh" : "Does not sound like Pritesh"}
              </span>
              {check.note ? <span className="text-muted-foreground">: {check.note}</span> : null}
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 h-auto px-1.5 py-0.5 text-xs"
                onClick={() => setCheck(undefined)}
              >
                Change
              </Button>
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium">Sounds like Pritesh?</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-auto gap-1 px-2.5 py-1 text-xs"
                  disabled={save.isPending}
                  onClick={() => save.mutate("yes")}
                >
                  <Check className="size-3" aria-hidden />
                  Yes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-auto gap-1 px-2.5 py-1 text-xs"
                  disabled={save.isPending}
                  onClick={() => setAsking(true)}
                >
                  <X className="size-3" aria-hidden />
                  No
                </Button>
              </div>
              {asking ? (
                <div className="space-y-2">
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="What sounds off? (optional)"
                    rows={2}
                    className="w-full rounded-md border bg-background p-2 text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-auto px-2.5 py-1 text-xs"
                    disabled={save.isPending}
                    onClick={() => save.mutate("no")}
                  >
                    Save
                  </Button>
                </div>
              ) : null}
            </>
          )}
          {message ? <p className="text-xs text-destructive">{message}</p> : null}
        </div>
      </div>
    </section>
  );
}
