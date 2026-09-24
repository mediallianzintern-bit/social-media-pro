import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PLATFORM_META } from "@/lib/platform-meta";
import type { Recommendation } from "@/lib/recommendations";

/** Flattens a script into the plain text a teleprompter or Notes app wants. */
function toPlainText(rec: Recommendation): string {
  return [
    rec.title,
    "",
    `WHY: ${rec.evidence}`,
    "",
    `HOOK: ${rec.hook}`,
    "",
    rec.beats
      .map(
        (beat) => `[${beat.mark}] ${beat.line}${beat.direction ? `\n   (${beat.direction})` : ""}`,
      )
      .join("\n"),
    "",
    rec.caption,
    "",
    rec.tags.join(" "),
  ].join("\n");
}

export function ScriptDrawer({
  recommendation,
  onClose,
}: {
  recommendation: Recommendation | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!recommendation) return;
    await navigator.clipboard.writeText(toPlainText(recommendation));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const accent = recommendation ? PLATFORM_META[recommendation.platform].color : undefined;
  const isReel = recommendation?.platform === "instagram";

  return (
    <Sheet open={recommendation !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {recommendation ? (
          <>
            <SheetHeader className="border-b p-6 text-left">
              <SheetDescription
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: accent }}
              >
                {recommendation.kicker}
              </SheetDescription>
              <SheetTitle className="text-xl leading-snug">{recommendation.title}</SheetTitle>
            </SheetHeader>

            <div className="flex-1 space-y-7 overflow-y-auto p-6">
              <section>
                <SectionLabel>Why this, from your data</SectionLabel>
                <p className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
                  {recommendation.evidence}.
                </p>
              </section>

              <section>
                <SectionLabel>Hook — first 2 seconds</SectionLabel>
                <p
                  className="rounded-lg border border-l-[3px] bg-muted/40 p-4 text-base font-semibold leading-snug"
                  style={{ borderLeftColor: accent }}
                >
                  “{recommendation.hook}”
                </p>
              </section>

              <section>
                <SectionLabel>{isReel ? "Beat sheet" : "Post structure"}</SectionLabel>
                <ol className="divide-y">
                  {recommendation.beats.map((beat, index) => (
                    <li key={index} className="grid grid-cols-[4.5rem_1fr] gap-3 py-3 first:pt-0">
                      <span
                        className="pt-0.5 text-xs font-bold tabular-nums"
                        style={{ color: accent }}
                      >
                        {beat.mark}
                      </span>
                      <div>
                        <p className="whitespace-pre-line text-sm leading-relaxed">{beat.line}</p>
                        {beat.direction ? (
                          <p className="mt-1 text-xs italic text-muted-foreground">
                            {beat.direction}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <SectionLabel>{isReel ? "Caption" : "Production note"}</SectionLabel>
                <p className="whitespace-pre-line rounded-lg border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
                  {recommendation.caption}
                </p>
              </section>

              <section>
                <SectionLabel>Tags</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {recommendation.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="font-normal">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </section>
            </div>

            <div className="border-t p-4">
              <Button onClick={copy} className="w-full gap-2">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy script"}
              </Button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      {children}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </h3>
  );
}
