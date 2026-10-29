// What happened to a filmed idea: the live reel, what of the script it used,
// and, after 14 days, whether it worked and why.
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
  Timer,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContentIdea } from "@/lib/ai-types";
import { CTA_TYPE_LABEL, HOOK_TYPE_LABEL } from "@/lib/reel-parts";
import { dateTime, fullNumber, shortDate } from "@/lib/format";
import {
  ELEMENT_VERDICT_LABEL,
  isFinalReview,
  REEL_REVIEW_DAYS,
  REEL_USAGE_LABEL,
  VIRAL_RATIO,
  type ElementVerdict,
  type ReelLearning,
  type ReelMatch,
} from "@/lib/reel-learning-types";
import {
  analyseFilmed,
  linkFilmedByHand,
  reelLearningQueryOptions,
  reelPatternsQueryOptions,
  reviewFilmed,
} from "@/lib/reel-learning.functions";

/** How the reel was found, in words. */
function matchedBy(match: ReelMatch | null): string {
  const words = match?.words.length ? `: ${match.words.join(", ")}` : "";
  switch (match?.by) {
    case "manual":
      return "Linked by hand.";
    case "article":
      return `Matched on the source article${words}.`;
    case "timing":
      return "Matched by timing: the only reel posted around when it was filmed.";
    default:
      return `Matched on its topic${words}.`;
  }
}

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
    mutationFn: (early: boolean) => reviewFilmed({ data: { ideaId: idea.id, early } }),
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
          reviewing={review.isPending ? (review.variables ? "early" : "final") : null}
          onReview={(early) => review.mutate(early)}
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
  reviewing: "early" | "final" | null;
  onReview: (early: boolean) => void;
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
        <p className="text-xs text-muted-foreground">{matchedBy(learning.match)}</p>
        {learning.match && !learning.match.confirmed ? (
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Probably this reel, but not confirmed. Analyse reads it and checks the topic: if it
            covers a different story it is unlinked and the search goes on. It is not scored until
            then.
          </p>
        ) : null}
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
        <Comparison learning={learning} analysing={analysing} onAnalyse={onAnalyse} />
      )}

      {comparison && !isFinalReview(learning) ? (
        <div className="space-y-2 border-t pt-4">
          {reviewReady ? (
            <Button
              className="w-full gap-2"
              disabled={reviewing !== null}
              onClick={() => onReview(false)}
            >
              {reviewing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {reviewing ? "Reviewing…" : "Review how it did"}
            </Button>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                className="gap-2"
                disabled={reviewing !== null}
                onClick={() => onReview(true)}
              >
                {reviewing === "early" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Timer className="size-4" aria-hidden />
                )}
                {reviewing === "early"
                  ? "Checking…"
                  : learning.review
                    ? "Check again now"
                    : "Get results now"}
              </Button>
              <Button variant="outline" disabled>
                Results ready{" "}
                {learning.reviewableAt
                  ? shortDate(learning.reviewableAt)
                  : `after ${REEL_REVIEW_DAYS} days`}
              </Button>
            </div>
          )}
          <p className="text-center text-[10px] text-muted-foreground">
            {reviewReady
              ? `About 2¢, one AI call. Whether it worked is measured against your typical reel; the AI explains why.${learning.review ? " Replaces the early check." : ""}`
              : `Get results now: about 2¢, an early check of the figures so far. It is shown here but not learned from; the full result${learning.reviewableAt ? ` on ${shortDate(learning.reviewableAt)}` : ""} replaces it and is what the system learns from.`}
          </p>
          {reviewNote ? <p className="text-xs text-destructive">{reviewNote}</p> : null}
        </div>
      ) : null}

      {learning.review ? <Review learning={learning} /> : null}
      {isFinalReview(learning) ? <Patterns platform={learning.platform} /> : null}
    </div>
  );
}

function Comparison({
  learning,
  analysing,
  onAnalyse,
}: {
  learning: ReelLearning;
  analysing: boolean;
  onAnalyse: () => void;
}) {
  const comparison = learning.comparison!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label>What was used</Label>
        {learning.usage ? <Badge>{REEL_USAGE_LABEL[learning.usage]}</Badge> : null}
      </div>

      {!comparison.parts ? (
        <p className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 text-xs">
          Analysed before the hook, body and CTA breakdown existed.
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={analysing}
            onClick={onAnalyse}
          >
            {analysing ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            Analyse again (about 1¢)
          </Button>
        </p>
      ) : (
        <Parts learning={learning} />
      )}

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

      {comparison.research ? (
        <div className="space-y-1">
          <span className="text-sm font-medium">Research</span>
          <p className="text-xs text-muted-foreground">
            {comparison.research.factsUsed} of {comparison.research.facts} researched facts reached
            the reel, from {comparison.research.sources}{" "}
            {comparison.research.sources === 1 ? "outlet" : "outlets"}
            {comparison.research.fromOtherOutlets
              ? `; ${comparison.research.fromOtherOutlets} of them only other outlets reported, details one article would have missed`
              : ""}
            .
          </p>
        </div>
      ) : null}

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

/** Hook, main body and CTA, ours against the team's, with the reel's shape. */
function Parts({ learning }: { learning: ReelLearning }) {
  const c = learning.comparison!;
  const parts = c.parts!;
  const rows: Array<[string, (typeof parts)["hook"], string | null]> = [
    ["Hook", parts.hook, c.hookType ? HOOK_TYPE_LABEL[c.hookType] : null],
    ["Main body", parts.body, c.body ? `${c.body.shape} · example: ${c.body.exampleType}` : null],
    ["CTA", parts.cta, c.cta ? CTA_TYPE_LABEL[c.cta.type] : null],
  ];
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-medium">Part</th>
              <th className="px-2 py-1.5 font-medium">Ours</th>
              <th className="px-2 py-1.5 font-medium">What the reel said</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, part, kind]) => (
              <tr key={name} className="border-t align-top">
                <td className="w-28 px-2 py-1.5">
                  <span className="font-medium">{name}</span>
                  <span className="mt-1 block">
                    <Verdict verdict={part.verdict} />
                  </span>
                  <span className="mt-1 block text-muted-foreground">
                    {percent(part.overlap)} kept
                  </span>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">
                  {part.ours || "–"}
                  <span className="mt-1 block text-[10px]">{part.oursWords} words</span>
                </td>
                <td className="px-2 py-1.5">
                  {part.theirs || "–"}
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {part.theirsWords} words{kind ? ` · ${kind}` : ""}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {c.cta ? (
          <span
            className={
              c.cta.usedLaneCta
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-amber-700 dark:text-amber-400"
            }
          >
            {c.cta.usedLaneCta
              ? "Ended on the lane's CTA"
              : c.cta.expected
                ? "Did not end on the lane's CTA"
                : "This lane has no fixed CTA"}
          </span>
        ) : null}
        {c.reel?.seconds ? (
          <span>
            Reel length: {c.reel.measured ? "" : "about "}
            {c.reel.seconds} s, {c.reel.words} words
          </span>
        ) : null}
        {c.captionStats ? (
          <span>
            Caption: {c.captionStats.words} words
            {c.captionStats.asksQuestion ? ", asks a question" : ""}
            {c.captionStats.hasCta ? ", has an ask" : ""} · {c.captionStats.hashtags} hashtags
          </span>
        ) : null}
      </div>
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
        <Label>{review.early ? "How it is doing so far" : "How it did"}</Label>
        {review.early ? (
          <Badge
            variant="outline"
            className="gap-1 border-amber-300 font-normal text-amber-800 dark:border-amber-800 dark:text-amber-300"
          >
            <Timer className="size-3" aria-hidden /> Early check · day {review.early.days} of{" "}
            {REEL_REVIEW_DAYS}
          </Badge>
        ) : review.primaryRatio >= VIRAL_RATIO ? (
          <Badge className="gap-1 bg-violet-600 hover:bg-violet-600">
            <TrendingUp className="size-3" aria-hidden /> Viral
          </Badge>
        ) : learning.worked ? (
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
          {review.early ? " so far" : ""}
        </span>
      </div>
      {review.early ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          An early check, after {review.early.days} day{review.early.days === 1 ? "" : "s"}: this
          reel&rsquo;s figures are still growing while the typical reel&rsquo;s are final, so views,
          reach, saves and shares will rise. Skip rate and watch time already mean something. Not
          counted in patterns or rules until the full result after {REEL_REVIEW_DAYS} days.
        </p>
      ) : null}
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

/** What every reviewed reel adds up to so far, counted in code. */
export function Patterns({ platform }: { platform: "instagram" | "linkedin" }) {
  const { data: patterns } = useQuery(reelPatternsQueryOptions(platform));
  if (!patterns?.length) return null;
  return (
    <div className="space-y-2 border-t pt-4">
      <Label>Across every reviewed reel so far</Label>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-medium">Pattern</th>
              <th className="px-2 py-1.5 text-right font-medium">Reels</th>
              <th className="px-2 py-1.5 text-right font-medium">Worked</th>
              <th className="px-2 py-1.5 text-right font-medium">Median vs typical</th>
            </tr>
          </thead>
          <tbody>
            {patterns.slice(0, 10).map((pattern) => (
              <tr key={`${pattern.dimension}:${pattern.value}`} className="border-t">
                <td className="px-2 py-1.5">
                  <span className="text-muted-foreground">{pattern.dimension}: </span>
                  {pattern.value}
                  {pattern.strong ? (
                    <Badge variant="outline" className="ml-1.5 font-normal">
                      strong
                    </Badge>
                  ) : null}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{pattern.reels}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{pattern.worked}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {pattern.medianRatio.toFixed(2)}×
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Counted from the figures, not judged. A pattern is strong with 3 or more reels behind it;
        the writer weighs strong patterns above any single reel.
      </p>
    </div>
  );
}
