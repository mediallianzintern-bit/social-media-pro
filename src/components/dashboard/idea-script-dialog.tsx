import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FORMAT_LABEL, type ContentIdea } from "@/lib/ai-types";

/**
 * One written script, read-only.
 *
 * Shown wherever an idea already exists but the full idea card is not on
 * screen — today that is "Topics in the news", where a story that has already
 * been written up should let you read the script without hunting for it under
 * "Next reel to make".
 *
 * Deliberately a separate, shared component rather than a third copy of the
 * script markup: the idea cards have their own drawer and the reaction clips
 * have their own dialog, and a third inline version would be the one that
 * quietly drifts out of step with the other two.
 */
export function IdeaScriptDialog({
  idea,
  open,
  onOpenChange,
}: {
  idea: ContentIdea;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogDescription className="text-xs">
            {FORMAT_LABEL[idea.format] ?? idea.format}
            {idea.contentLane ? ` · ${idea.contentLane}` : ""}
            {idea.production ? ` · ${idea.production.durationSeconds}s` : ""}
          </DialogDescription>
          <DialogTitle className="text-left text-base leading-snug">{idea.title}</DialogTitle>
        </DialogHeader>
        <IdeaScriptBody idea={idea} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The script itself, outside the dialog shell.
 *
 * Separated so it can be rendered and checked without a DOM — a Radix dialog
 * renders through a portal, which produces nothing in a server render, so a
 * test against the whole component silently passes on an empty string.
 */
export function IdeaScriptBody({ idea }: { idea: ContentIdea }) {
  // The hook the team picked, where they picked one — the same rule the
  // handover document follows, so the two never disagree.
  const hook = idea.chosenHook?.trim() || idea.hook;
  const written = Boolean(idea.post);

  return (
    <>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {written ? "Opening line" : "Hook"}
        </p>
        <p className="rounded-lg border bg-muted/40 p-3 text-sm font-semibold leading-snug">
          “{hook}”
        </p>
      </div>

      {idea.source?.verified && idea.source.url ? (
        <p className="text-xs text-muted-foreground">
          Built on:{" "}
          <a
            href={idea.source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
          >
            {idea.source.headline ?? idea.source.subject}
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
          . Anything in [square brackets] is a detail to take from the article before filming.
          {idea.source.readFrom ? (
            <>
              {" "}
              Written from{" "}
              <a
                href={idea.source.readFrom.url}
                target="_blank"
                rel="noreferrer noopener"
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                {idea.source.readFrom.publisher ?? "another outlet"}&rsquo;s article
              </a>
              .
            </>
          ) : (
            " Written from the headline only."
          )}
        </p>
      ) : null}

      {idea.shots.length ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {idea.format === "carousel" ? "Slides" : "Shot list"}
          </p>
          <ol className="divide-y rounded-lg border">
            {idea.shots.map((shot, index) => (
              <li key={index} className="grid grid-cols-[5rem_1fr] gap-3 px-3 py-2.5">
                <span className="text-xs font-bold tabular-nums text-muted-foreground">
                  {shot.mark}
                </span>
                <div className="space-y-1">
                  <p className="text-sm leading-relaxed">{shot.visual}</p>
                  {shot.voiceover ? (
                    <p className="text-sm font-medium leading-relaxed">“{shot.voiceover}”</p>
                  ) : null}
                  {shot.onScreenText ? (
                    <p className="text-xs text-muted-foreground">On screen: {shot.onScreenText}</p>
                  ) : null}
                  {shot.transition ? (
                    <p className="text-xs italic text-muted-foreground">{shot.transition}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {idea.post ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            The post
          </p>
          <p className="whitespace-pre-line rounded-lg border p-3 text-sm leading-relaxed">
            {idea.post.body}
          </p>
          {idea.post.sections.map((section) => (
            <div key={section.heading} className="rounded-lg border p-3">
              <p className="text-sm font-semibold">{section.heading}</p>
              <p className="whitespace-pre-line text-sm leading-relaxed">{section.text}</p>
            </div>
          ))}
        </div>
      ) : null}

      {idea.caption ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Caption
          </p>
          <p className="whitespace-pre-line rounded-lg border p-3 text-sm leading-relaxed">
            {idea.caption}
          </p>
        </div>
      ) : null}

      {idea.hashtags.length ? (
        <p className="flex flex-wrap gap-1.5">
          {idea.hashtags.map((tag) => (
            <Badge key={tag} variant="outline" className="font-normal">
              {tag}
            </Badge>
          ))}
        </p>
      ) : null}
    </>
  );
}
