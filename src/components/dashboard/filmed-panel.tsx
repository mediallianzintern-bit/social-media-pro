// What happened to a filmed idea: the live reel, what of the script it used,
// and, after a week, whether it worked and why.
//
// The team presses "I filmed this" and nothing else is asked of them (Pritesh,
// 19 Oct). Finding the reel is free and automatic. The two paid steps,
// Analyse and Review, are buttons, and say what they cost.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Microscope,
  Search,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContentIdea } from "@/lib/ai-types";
import { dateTime, fullNumber, shortDate } from "@/lib/format";
import {
  ELEMENT_VERDICT_LABEL,
  REEL_USAGE_LABEL,
  type ElementVerdict,
  type ReelLearning,
} from "@/lib/reel-learning-types";
import {
  analyseFilmed,
  linkFilmedByHand,
  reelLearningQueryOptions,
  reviewFilmed,
} from "@/lib/reel-learning.functions";

const VERDICT_TONE: Record<ElementVerdict, string> = {
  as_written: "border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-300",
  adapted: "border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-300",
  own: "border-sky-300 text-sky-800 dark:border-sky-800 dark:text-sky-300",
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{children}</h3>
  );
}

function Verdict({ verdict }: { verdict: ElementVerdict }) {
  return (
    <Badge variant="outline" className={`font-normal ${VERDICT_TONE[verdict]}`}>
      {ELEMENT_VERDICT_LABEL[verdict]}
    </Badge>
  );
}

/** Link the right reel by its URL: for a reel the topic could not find, or a wrong match. */
function LinkByHand({ idea, label }: { idea: ContentIdea; label: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const link = useMutation({
    mutationFn: () => linkFilmedByHand({ data: { ideaId: idea.id, permalink: url.trim() } }),
    onSuccess: (learning) => {
      queryClient.setQueryData(reelLearningQueryOptions(idea.id).queryKey, learning);
      setOpen(false);
      setUrl("");
    },
  });
  if (!open) {
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          autoFocus
          placeholder="https://www.instagram.com/reel/..."
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button size="sm" disabled={!url.trim() || link.isPending} onClick={() => link.mutate()}>
          {link.isPending ? "Linking…" : "Link"}
        </Button>
      </div>
      {link.error ? (
        <p className="text-xs text-destructive">
          {link.error instanceof Error ? link.error.message : "Couldn't link that reel."}
        </p>
      ) : null}
    </div>
  );
}

export function FilmedPanel({ idea }: { idea: ContentIdea }) {
  const queryClient = useQueryClient();
  const key = reelLearningQueryOptions(idea.id).queryKey;
  const { data: learning } = useQuery({
    ...reelLearningQueryOptions(idea.id),
    enabled: Boolean(idea.id),
  });

  const analyse = useMutation({
    mutationFn: () => analyseFilmed({ data: { ideaId: idea.id } }),
    onSuccess: (result) => queryClient.setQueryData(key, result.learning),
  });
  const review = useMutation({
    mutationFn: () => reviewFilmed({ data: { ideaId: idea.id } }),
    onSuccess: (result) => queryClient.setQueryData(key, result.learning),
  });

  if (!learning) return null;

  return (
    <section className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <Microscope className="size-4 text-muted-foreground" aria-hidden />
        <Label>After filming</Label>
      </div>

      <p className="text-xs text-muted-foreground">
        Marked filmed {dateTime(learning.filmedAt)}
        {learning.filmedBy ? ` by ${learning.filmedBy}` : ""}.
      </p>

      {!learning.shortcode ? (
        <div className="space-y-2">
          <p className="flex items-start gap-2 text-sm">
            <Search className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            Waiting for the reel to go live. Once it is posted, the next Sync finds it by its topic,
            with nothing to paste and nothing spent.
          </p>
          <LinkByHand idea={idea} label="Posted already and not found? Link it yourself" />
        </div>
      ) : (
        <Found
          learning={learning}
          idea={idea}
          analysing={analyse.isPending}
          onAnalyse={() => analyse.mutate()}
          analyseNote={analyse.data?.reason ?? (analyse.error ? String(analyse.error) : null)}
          reviewing={review.isPending}
          onReview={() => review.mutate()}
          reviewNote={review.data?.reason ?? (review.error ? String(review.error) : null)}
        />
      )}
    </section>
  );
}

function Found({
  learning,
  idea,
  analysing,
  onAnalyse,
  analyseNote,
  reviewing,
  onReview,
  reviewNote,
}: {
  learning: ReelLearning;
  idea: ContentIdea;
  analysing: boolean;
  onAnalyse: () => void;
  analyseNote: string | null;
  reviewing: boolean;
  onReview: () => void;
  reviewNote: string | null;
}) {
  const comparison = learning.comparison;
  const reviewReady = learning.reviewableAt
    ? Date.now() >= Date.parse(learning.reviewableAt)
    : false;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
          Live reel found
          {learning.publishedAt ? `, posted ${shortDate(learning.publishedAt)}` : ""}.
          {learning.reelUrl ? (
            <a
              href={learning.reelUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
            >
              Open <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {learning.match?.by === "manual"
            ? "Linked by hand."
            : `Matched on its topic: ${learning.match?.words.join(", ") || "the story"}.`}
        </p>
        <LinkByHand idea={idea} label="Wrong reel? Link the right one" />
      </div>

      {!comparison ? (
        <div className="space-y-2">
          <Button className="w-full gap-2" disabled={analysing} onClick={onAnalyse}>
            {analysing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {analysing ? "Reading the reel…" : "Analyse what was used"}
          </Button>
          <p className="text-center text-[10px] text-muted-foreground">
            About 3¢: one transcript of the reel and one AI call. Compares the hook, script, caption
            and hashtags with what was suggested.
          </p>
          {analyseNote ? <p className="text-xs text-destructive">{analyseNote}</p> : null}
        </div>
      ) : (
        <Comparison learning={learning} />
      )}

      {comparison && !learning.review ? (
        <div className="space-y-2 border-t pt-4">
          <Button
            variant={reviewReady ? "default" : "outline"}
            className="w-full gap-2"
            disabled={!reviewReady || reviewing}
            onClick={onReview}
          >
            {reviewing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {reviewing
              ? "Reviewing…"
              : reviewReady
                ? "Review how it did"
                : `Results ready ${learning.reviewableAt ? shortDate(learning.reviewableAt) : "after a week"}`}
          </Button>
          <p className="text-center text-[10px] text-muted-foreground">
            About 2¢, one AI call, once the reel has run 7 days. Whether it worked is measured
            against your typical reel; the AI explains why.
          </p>
          {reviewNote ? <p className="text-xs text-destructive">{reviewNote}</p> : null}
        </div>
      ) : null}

      {learning.review ? <Review learning={learning} /> : null}
    </div>
  );
}

function Comparison({ learning }: { learning: ReelLearning }) {
  const comparison = learning.comparison!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label>What was used</Label>
        {learning.usage ? <Badge>{REEL_USAGE_LABEL[learning.usage]}</Badge> : null}
      </div>

      {!comparison.topic.same ? (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          This reel seems to cover a different story: {comparison.topic.note} If it is the wrong
          reel, link the right one above.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Topic: {comparison.topic.note}</p>
      )}

      {!comparison.hadTranscript ? (
        <p className="text-xs text-muted-foreground">
          The reel has no speech to transcribe, so its caption was compared instead.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Hook</span>
          <Verdict verdict={comparison.hook.verdict} />
          <span className="text-xs text-muted-foreground">
            {comparison.hook.variant
              ? `hook ${comparison.hook.variant}`
              : "none of the offered hooks"}{" "}
            · {comparison.hook.style} · {percent(comparison.hook.overlap)} of the closest
            hook&rsquo;s words
          </span>
        </div>
        <p className="text-sm italic">&ldquo;{comparison.hook.spoken}&rdquo;</p>
        {comparison.hook.note ? (
          <p className="text-xs text-muted-foreground">{comparison.hook.note}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Script</span>
          <Verdict verdict={comparison.script.verdict} />
          <span className="text-xs text-muted-foreground">
            {percent(comparison.script.overlap)} of the suggested script was said, in order
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{comparison.script.structure}</p>
        <ChangeList label="Kept" items={comparison.script.kept} />
        <ChangeList label="Dropped" items={comparison.script.dropped} />
        <ChangeList label="Added by the team" items={comparison.script.added} />
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Caption</span>
          <Verdict verdict={comparison.caption.verdict} />
          <span className="text-xs text-muted-foreground">
            {percent(comparison.caption.overlap)} of the suggested caption kept
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{comparison.caption.note}</p>
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Hashtags</span>
        <TagRow label="Used" tags={comparison.hashtags.used} />
        <TagRow label="Dropped" tags={comparison.hashtags.dropped} />
        <TagRow label="Added by the team" tags={comparison.hashtags.added} />
      </div>

      {comparison.teamStyle ? (
        <p className="rounded-md border bg-background p-2 text-xs leading-relaxed">
          <span className="font-medium">The team&rsquo;s own style here: </span>
          {comparison.teamStyle}
        </p>
      ) : null}
    </div>
  );
}

function ChangeList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <p className="text-xs">
      <span className="font-medium">{label}: </span>
      {items.join(" · ")}
    </p>
  );
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  if (!tags.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-1 text-xs">
      <span className="mr-1 font-medium">{label}:</span>
      {tags.map((tag) => (
        <Badge key={tag} variant="outline" className="font-normal">
          {tag}
        </Badge>
      ))}
    </p>
  );
}

const EFFECT_ICON = {
  helped: <TrendingUp className="size-3.5 text-emerald-600" aria-hidden />,
  hurt: <TrendingDown className="size-3.5 text-rose-600" aria-hidden />,
  unclear: <span className="inline-block size-3.5 text-center text-muted-foreground">–</span>,
};

function Review({ learning }: { learning: ReelLearning }) {
  const review = learning.review!;
  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label>How it did</Label>
        {learning.worked ? (
          <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
            <CheckCircle2 className="size-3" aria-hidden /> Worked
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="size-3" aria-hidden /> Did not work
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {review.primaryRatio.toFixed(2)}× your typical reel&rsquo;s views
        </span>
      </div>
      <p className="text-sm leading-relaxed">{review.summary}</p>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-medium">Measure</th>
              <th className="px-2 py-1.5 text-right font-medium">This reel</th>
              <th className="px-2 py-1.5 text-right font-medium">Typical</th>
              <th className="px-2 py-1.5 text-right font-medium">vs typical</th>
            </tr>
          </thead>
          <tbody>
            {review.metrics.map((metric) => (
              <tr key={metric.label} className="border-t">
                <td className="px-2 py-1.5">{metric.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fullNumber(metric.value)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {metric.typical !== null ? fullNumber(metric.typical) : "–"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {metric.ratio !== null ? `${metric.ratio.toFixed(2)}×` : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Typical is the median reel in the 90 days before this one.
      </p>

      <ul className="space-y-1.5">
        {review.elements.map((element) => (
          <li key={element.element} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5">{EFFECT_ICON[element.effect]}</span>
            <span>
              <span className="font-medium capitalize">{element.element}</span>{" "}
              <span className="text-muted-foreground">({element.effect})</span>: {element.why}
            </span>
          </li>
        ))}
      </ul>

      {review.lessons.length ? (
        <div className="space-y-1.5">
          <Label>Learned for the next scripts</Label>
          <ul className="space-y-1.5">
            {review.lessons.map((lesson, index) => (
              <li key={index} className="text-xs leading-relaxed">
                <Badge
                  variant="outline"
                  className={`mr-1.5 font-normal ${lesson.kind === "repeat" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}
                >
                  {lesson.kind === "repeat" ? "Repeat" : "Avoid"} · {lesson.element}
                </Badge>
                {lesson.lesson} <span className="text-muted-foreground">({lesson.evidence})</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground">
            New scripts are written and reviewed with these lessons.
          </p>
        </div>
      ) : null}

      {review.suggestions.length ? (
        <div className="space-y-1.5">
          <Label>How this reel could have been stronger</Label>
          <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed">
            {review.suggestions.map((suggestion, index) => (
              <li key={index}>{suggestion}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
