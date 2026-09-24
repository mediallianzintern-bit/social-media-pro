import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Clapperboard,
  Copy,
  ExternalLink,
  Gauge,
  Loader2,
  Newspaper,
  Search,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { dateTime } from "@/lib/format";
import {
  analysisQueryOptions,
  dismissIdea,
  generateOneIdea,
  markIdeaUsed,
  topicInboxQueryOptions,
} from "@/lib/analytics.functions";
import { PLATFORM_META } from "@/lib/platform-meta";
import type { Prediction } from "@/lib/prediction";
import { FORMAT_LABEL, type AiAnalysis, type ContentIdea } from "@/lib/ai-types";
import type { PlatformId } from "@/lib/analytics-types";

/**
 * The handover document, as plain text.
 *
 * Formatted to be pasted straight into a brief or a message to an editor: a
 * header of production constraints, then a numbered shot list where every shot
 * states its visual, audio, overlay and outgoing transition.
 */
function toPlainText(idea: ContentIdea): string {
  const p = idea.production;
  const lines: string[] = [
    idea.title.toUpperCase(),
    [FORMAT_LABEL[idea.format] ?? idea.format, p ? `${p.durationSeconds}s` : null, p?.aspectRatio]
      .filter(Boolean)
      .join(" · "),
    "",
    `ANGLE:    ${idea.angle}`,
    `WHY NOW:  ${idea.whyNow}`,
    `HOOK:     ${idea.hook}`,
    "",
  ];

  // The source goes near the top: it is the first thing whoever picks this up
  // has to do — read the story — before a word of it is filmed or posted.
  const source = idea.source;
  if (source?.verified && source.url) {
    lines.push("--- SOURCE: READ THIS BEFORE MAKING IT ---");
    lines.push(`Headline:  ${source.headline ?? source.subject}`);
    lines.push(
      `Published: ${[source.publisher, source.publishedAt ? dateTime(source.publishedAt) : null]
        .filter(Boolean)
        .join(
          " · ",
        )}${source.coverage && source.coverage > 1 ? ` · carried by ${source.coverage} outlets` : ""}`,
    );
    lines.push(`Link:      ${source.url}`);
    lines.push(`Video:     ${searchLinks(source.searchQuery)[1]?.href ?? ""}`);
    lines.push(
      "Anything in [square brackets] below is a detail to take from the article before filming.",
      "",
    );
  } else if (source) {
    lines.push("--- SOURCE: UNVERIFIED ---");
    lines.push(`Subject: ${source.subject}`);
    lines.push(`Where it ran: ${source.origin}`);
    for (const link of searchLinks(source.searchQuery)) lines.push(`  ${link.label}: ${link.href}`);
    lines.push(
      "No live source was available — written from the model's knowledge. Confirm every detail first.",
      "",
    );
  }

  if (p) {
    lines.push(
      "--- PRODUCTION ---",
      `Cover text:  ${p.coverText}`,
      `Music:       ${p.musicDirection}`,
      `Subtitles:   ${p.subtitleStyle}`,
    );
    if (p.assetsNeeded.length) lines.push(`Assets:      ${p.assetsNeeded.join("; ")}`);
    lines.push("");
  }

  if (idea.shots.length) {
    lines.push(idea.format === "carousel" ? "--- SLIDES ---" : "--- SHOT LIST ---");
    idea.shots.forEach((shot, index) => {
      lines.push(`${index + 1}. [${shot.mark}] ${shot.shotType}`);
      lines.push(`   VISUAL:  ${shot.visual}`);
      lines.push(shot.voiceover ? `   VO:      "${shot.voiceover}"` : "   VO:      (silent)");
      if (shot.onScreenText) lines.push(`   TEXT:    ${shot.onScreenText}`);
      lines.push(`   OUT:     ${shot.transition}`, "");
    });
  }

  if (idea.post) {
    lines.push(
      idea.format === "text_post" ? "--- THE POST ---" : "--- OPENING ---",
      idea.post.body,
      "",
    );
    idea.post.sections.forEach((section, index) => {
      lines.push(
        idea.format === "document"
          ? `PAGE ${index + 1}: ${section.heading}`
          : section.heading.toUpperCase(),
        section.text,
        "",
      );
    });
  }

  if (p?.editorNotes.length) {
    lines.push("--- EDITOR NOTES ---", ...p.editorNotes.map((note) => `- ${note}`), "");
  }

  if (idea.caption) lines.push("--- CAPTION ---", idea.caption, "");
  if (idea.hashtags.length) lines.push(idea.hashtags.join(" "), "");

  // The trail travels with the doc. A handover pasted into a brief or a DM
  // loses the dashboard around it, and "why are we making this?" is the first
  // question it will be asked.
  lines.push("--- WHY WE PICKED IT ---");
  lines.push(`Signal: ${SOURCE_LABEL[idea.sourceSignal] ?? idea.sourceSignal}`);
  if (idea.contentLane) lines.push(`Lane: ${idea.contentLane}`);
  if (idea.winningTrait) lines.push(`Trait reused: ${idea.winningTrait}`);
  if (idea.prediction?.goal) {
    const g = idea.prediction.goal;
    lines.push(
      `Goal fit: ${g.multiple == null ? `${g.metric} not measured for this lane` : `${g.metric} ${g.multiple}x median${g.servesGoal ? "" : " — below par for the goal"}`}`,
    );
  }
  lines.push(`Evidence: ${idea.whyNow}`);

  return lines.join("\n");
}

/**
 * Search links for a source, built here rather than asked for.
 *
 * The strategist supplies the QUERY; this builds the URL. That split is the
 * whole reason the source block can be trusted: a search URL assembled from an
 * encoded string is real by construction and lands on live results, whereas a
 * link the model wrote out would be a guess that merely looks checkable. The
 * team gets something that always works, and nothing in the citation is
 * invented.
 */
function searchLinks(query: string): Array<{ label: string; href: string }> {
  const q = encodeURIComponent(query);
  return [
    { label: "Google", href: `https://www.google.com/search?q=${q}` },
    { label: "YouTube", href: `https://www.youtube.com/results?search_query=${q}` },
  ];
}

/** How the subject was chosen, in words the team can act on. */
const SOURCE_LABEL: Record<string, string> = {
  owner: "This account's own measured performance",
  niche: "Lane-vs-lane across the tracked accounts (public signal)",
  niche_trend: "A rising trend detected by the niche listener",
};

/**
 * What this idea is expected to do — Layer 7's honest confidence display.
 *
 * Two modes, and the difference is the point. In cold-start there is no
 * absolute number anywhere in this component, because none has been earned: the
 * reader gets the lane's measured multiple and a plain note that accuracy
 * improves with more tracked posts. Only a niche that has passed the graduation
 * gate renders a range, and then the interval is stated alongside it.
 *
 * This replaced a row of 1–5 pips filled in from a number the script-writing
 * model produced about its own work.
 */
function ExpectationNote({ prediction }: { prediction: Prediction }) {
  const calibrated = prediction.mode === "calibrated" && prediction.range;

  return (
    <div className="mt-4 rounded-lg border border-dashed bg-muted/30 p-2.5">
      <span className="flex items-center gap-1.5">
        {calibrated ? (
          <Target className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <Gauge className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          {calibrated ? "Predicted" : "What the data says"}
        </span>
      </span>

      {calibrated && prediction.range ? (
        <>
          <span className="mt-1 block text-sm font-semibold">
            {prediction.range.low.toLocaleString()}–{prediction.range.high.toLocaleString()}{" "}
            {prediction.range.metric}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {Math.round(prediction.range.intervalPct * 100)}% interval, validated against measured
            results in this niche.
          </span>
        </>
      ) : (
        <>
          <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
            This idea {prediction.statement}
          </span>
          <span className="mt-1 block text-[10px] italic text-muted-foreground/70">
            A measured comparison, not a forecast — accuracy improves as we track more posts.
          </span>
        </>
      )}
    </div>
  );
}

export function AiIdeaCards({
  ideas,
  platform,
  generatedAt,
  model,
}: {
  ideas: ContentIdea[];
  platform: PlatformId;
  /** When this batch was produced — part of the provenance trail. */
  generatedAt?: string;
  model?: string;
}) {
  // Holds the id, not the idea object: the object is a snapshot from `ideas`,
  // and once a mutation below patches that array in the query cache, looking
  // the current idea up by id (rather than keeping the stale snapshot) is what
  // makes the drawer show "filmed" the moment it lands, without a page reload.
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linking, setLinking] = useState(false);
  const [permalink, setPermalink] = useState("");
  const accent = PLATFORM_META[platform].color;
  const queryClient = useQueryClient();

  const open = ideas.find((idea) => idea.id === openId) ?? null;

  /** Patches one idea's status in the cached analysis, in place. */
  function patchIdea(ideaId: string, patch: Partial<ContentIdea>) {
    queryClient.setQueryData(
      analysisQueryOptions(platform).queryKey,
      (prev: AiAnalysis | null | undefined) =>
        prev
          ? {
              ...prev,
              ideas: prev.ideas.map((idea) => (idea.id === ideaId ? { ...idea, ...patch } : idea)),
            }
          : prev,
    );
  }

  const useThis = useMutation({
    mutationFn: (vars: { ideaId: string; permalink: string }) => markIdeaUsed({ data: vars }),
    onSuccess: (result, vars) => {
      patchIdea(vars.ideaId, { status: "used", publishedShortcode: result.shortcode });
      setLinking(false);
      setPermalink("");
    },
  });

  const dismiss = useMutation({
    mutationFn: (ideaId: string) => dismissIdea({ data: { ideaId } }),
    onSuccess: (_result, ideaId) => patchIdea(ideaId, { status: "dismissed" }),
  });

  // One model call, on an explicit click only — never fired by marking an idea
  // filmed. The new idea lands at the front of the set and opens straight away.
  const next = useMutation({
    mutationFn: () => generateOneIdea({ data: { platform } }),
    onSuccess: (result) => {
      if (result.analysis) {
        queryClient.setQueryData(analysisQueryOptions(platform).queryKey, result.analysis);
      }
      void queryClient.invalidateQueries({ queryKey: topicInboxQueryOptions(platform).queryKey });
      if (result.idea) setOpenId(result.idea.id);
    },
  });

  const copy = async () => {
    if (!open) return;
    await navigator.clipboard.writeText(toPlainText(open));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        {ideas.map((idea, index) => (
          <button
            key={idea.id || index}
            type="button"
            onClick={() => setOpenId(idea.id)}
            className="group rounded-xl border bg-card text-left text-card-foreground shadow transition-all hover:-translate-y-0.5 hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <CardContent className="relative p-5">
              <span className="absolute right-5 top-5 flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold">
                <Sparkles className="size-2.5" style={{ color: accent }} aria-hidden />
                {FORMAT_LABEL[idea.format] ?? idea.format}
              </span>
              {/* The reasoning grew from a one-line kicker into a full paragraph
                  once the model was given reach, saves and the weak-post contrast
                  to cite. Uppercase and unclamped, it swamped the card and buried
                  the title; the whole text still reads properly in the drawer. */}
              <p className="pr-24 text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
                {idea.whyNow}
              </p>
              <span className="mt-2.5 flex items-center gap-2">
                <h3 className="text-base font-bold leading-snug tracking-tight">{idea.title}</h3>
                {idea.status && idea.status !== "suggested" ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                      idea.status === "used"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {idea.status === "used" ? "Filmed" : "Dismissed"}
                  </span>
                ) : null}
              </span>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{idea.angle}</p>

              {idea.source ? (
                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Newspaper className="size-3 shrink-0" aria-hidden />
                  {idea.source.verified ? (
                    <span className="truncate">
                      {idea.source.publisher ?? "News source"}
                      {idea.source.publishedAt ? ` · ${dateTime(idea.source.publishedAt)}` : ""}
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400">Unverified source</span>
                  )}
                </p>
              ) : null}

              {idea.prediction ? <ExpectationNote prediction={idea.prediction} /> : null}

              <span className="mt-3 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold" style={{ color: accent }}>
                  Open script
                </span>
                <ArrowRight
                  className="size-3.5 transition-transform group-hover:translate-x-0.5"
                  style={{ color: accent }}
                  aria-hidden
                />
              </span>
            </CardContent>
          </button>
        ))}
      </div>

      <Sheet open={open !== null} onOpenChange={(next) => !next && setOpenId(null)}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          {open ? (
            <>
              <SheetHeader className="border-b p-6 text-left">
                <SheetDescription
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: accent }}
                >
                  {FORMAT_LABEL[open.format] ?? open.format}
                  {open.post ? "" : " script"}
                </SheetDescription>
                <SheetTitle className="text-xl leading-snug">{open.title}</SheetTitle>
              </SheetHeader>

              <div className="flex-1 space-y-7 overflow-y-auto p-6">
                <section>
                  <SectionLabel>Why this, from your data</SectionLabel>
                  <p className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
                    {open.whyNow}
                  </p>
                </section>

                {/* Read the story first — so it sits above the script. */}
                {open.source ? <SourceBlock source={open.source} /> : null}

                <section>
                  <SectionLabel>{open.post ? "Opening line" : "Hook"}</SectionLabel>
                  <p
                    className="rounded-lg border border-l-[3px] bg-muted/40 p-4 text-base font-semibold leading-snug"
                    style={{ borderLeftColor: accent }}
                  >
                    “{open.hook}”
                  </p>
                </section>

                {open.production ? (
                  <section>
                    <SectionLabel>Production</SectionLabel>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg border bg-card p-4 text-sm">
                      <Spec label="Duration" value={`${open.production.durationSeconds}s`} />
                      <Spec label="Aspect" value={open.production.aspectRatio} />
                      <Spec label="Cover text" value={open.production.coverText} wide />
                      <Spec label="Music" value={open.production.musicDirection} wide />
                      <Spec label="Subtitles" value={open.production.subtitleStyle} wide />
                    </dl>
                    {open.production.assetsNeeded.length ? (
                      <div className="mt-3">
                        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                          Assets to source
                        </p>
                        <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed text-muted-foreground">
                          {open.production.assetsNeeded.map((asset) => (
                            <li key={asset}>{asset}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {open.shots.length ? (
                  <section>
                    <SectionLabel>
                      {open.format === "carousel" ? "Slides" : "Shot list"}
                    </SectionLabel>
                    <ol className="space-y-3">
                      {open.shots.map((shot, index) => (
                        <li key={index} className="rounded-lg border bg-card p-3.5">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span
                              className="text-xs font-bold tabular-nums"
                              style={{ color: accent }}
                            >
                              {shot.mark}
                            </span>
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {shot.shotType}
                            </Badge>
                            <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                              {shot.transition}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed">{shot.visual}</p>
                          {shot.voiceover ? (
                            <p
                              className="mt-2 border-l-2 pl-2.5 text-sm italic leading-relaxed"
                              style={{ borderLeftColor: accent }}
                            >
                              &ldquo;{shot.voiceover}&rdquo;
                            </p>
                          ) : null}
                          {shot.onScreenText ? (
                            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              On screen: {shot.onScreenText}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}

                {open.post ? (
                  <section>
                    <SectionLabel>
                      {open.format === "text_post" ? "The post" : "Opening"}
                    </SectionLabel>
                    <p className="whitespace-pre-line rounded-lg border bg-card p-4 text-sm leading-relaxed">
                      {open.post.body}
                    </p>
                    {open.post.sections.length ? (
                      <ol className="mt-3 space-y-3">
                        {open.post.sections.map((section, index) => (
                          <li key={index} className="rounded-lg border bg-card p-3.5">
                            <p className="text-xs font-bold" style={{ color: accent }}>
                              {open.format === "document" ? `Page ${index + 1} · ` : ""}
                              {section.heading}
                            </p>
                            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed">
                              {section.text}
                            </p>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </section>
                ) : null}

                {open.production?.editorNotes.length ? (
                  <section>
                    <SectionLabel>Editor notes</SectionLabel>
                    <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                      {open.production.editorNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {open.caption ? (
                  <section>
                    <SectionLabel>Caption</SectionLabel>
                    <p className="whitespace-pre-line rounded-lg border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
                      {open.caption}
                    </p>
                  </section>
                ) : null}

                <section>
                  <SectionLabel>Hashtags</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {open.hashtags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="font-normal">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </section>

                {/* Provenance, for the team rather than the viewer.
                    Anyone asked to film this can see WHY it was chosen without
                    taking it on trust: which signal drove it, which lane, which
                    trait it reproduces, and what produced it. A suggestion
                    nobody can trace is one nobody can argue with. */}
                <section>
                  <SectionLabel>Why we picked it</SectionLabel>
                  <dl className="space-y-1.5 rounded-lg border border-dashed bg-muted/30 p-3 text-xs">
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-muted-foreground">Signal</dt>
                      <dd className="font-medium">
                        {SOURCE_LABEL[open.sourceSignal] ?? open.sourceSignal}
                      </dd>
                    </div>
                    {open.contentLane ? (
                      <div className="flex gap-2">
                        <dt className="w-28 shrink-0 text-muted-foreground">Lane</dt>
                        <dd className="font-medium capitalize">{open.contentLane}</dd>
                      </div>
                    ) : null}
                    {open.winningTrait ? (
                      <div className="flex gap-2">
                        <dt className="w-28 shrink-0 text-muted-foreground">Trait reused</dt>
                        <dd className="font-medium">{open.winningTrait}</dd>
                      </div>
                    ) : null}
                    {open.prediction?.goal ? (
                      <div className="flex gap-2">
                        <dt className="w-28 shrink-0 text-muted-foreground">Goal fit</dt>
                        <dd className="font-medium">
                          {open.prediction.goal.multiple == null
                            ? `${open.prediction.goal.metric} not measured for this lane`
                            : `${open.prediction.goal.metric} ${open.prediction.goal.multiple}\u00d7 median` +
                              (open.prediction.goal.servesGoal ? "" : " — below par for the goal")}
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-muted-foreground">Evidence</dt>
                      <dd className="leading-relaxed text-muted-foreground">{open.whyNow}</dd>
                    </div>
                    {generatedAt || model ? (
                      <div className="flex gap-2">
                        <dt className="w-28 shrink-0 text-muted-foreground">Generated</dt>
                        <dd className="text-muted-foreground">
                          {generatedAt ? dateTime(generatedAt) : ""}
                          {generatedAt && model ? " \u00b7 " : ""}
                          {model ?? ""}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </section>
              </div>

              <div className="space-y-3 border-t p-4">
                <Button onClick={copy} className="w-full gap-2">
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy handover doc"}
                </Button>

                {/* The feedback loop: every idea is kept permanently once
                    generated, and this is the only way one gets linked to what
                    was actually filmed. Auto-matching by caption text was
                    explicitly ruled out — it misattributes and is unfixable
                    once wrong, so a person has to say it themselves. */}
                {!open.status || open.status === "suggested" ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={() => setLinking(true)}
                    >
                      <Clapperboard className="size-4" aria-hidden />I filmed this
                    </Button>
                    <Button
                      variant="ghost"
                      className="gap-2 text-muted-foreground"
                      disabled={dismiss.isPending}
                      onClick={() => dismiss.mutate(open.id)}
                    >
                      <X className="size-4" aria-hidden />
                      Not this one
                    </Button>
                  </div>
                ) : open.status === "used" ? (
                  <div className="space-y-2.5">
                    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
                      Linked to the post you published. Once it has run for a week, how it did on
                      the goal metric is scored and feeds which ideas get suggested next.
                    </p>
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      disabled={next.isPending}
                      onClick={() => next.mutate()}
                    >
                      {next.isPending ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Sparkles className="size-4" aria-hidden />
                      )}
                      {next.isPending ? "Writing the next one…" : "Suggest the next one"}
                    </Button>
                    <p className="text-center text-[10px] text-muted-foreground">
                      Uses one AI call. Built on a fresh story you haven&rsquo;t used yet.
                    </p>
                    {next.data && !next.data.idea ? (
                      <p className="text-xs text-destructive">{next.data.reason}</p>
                    ) : null}
                    {next.error ? (
                      <p className="text-xs text-destructive">
                        {next.error instanceof Error ? next.error.message : "Couldn't write one."}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Marked as not used.</p>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={linking}
        onOpenChange={(next) => {
          setLinking(next);
          if (!next) setPermalink("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link the post you filmed</DialogTitle>
            <DialogDescription>
              {platform === "linkedin"
                ? "Paste the LinkedIn post link. Once linked, how the post actually performs feeds back into which ideas get suggested next."
                : "Paste the Instagram permalink. Once linked, how this post actually performs — saves, shares, watch time — feeds back into which ideas get suggested next."}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder={
              platform === "linkedin"
                ? "https://www.linkedin.com/posts/..."
                : "https://www.instagram.com/reel/..."
            }
            value={permalink}
            onChange={(event) => setPermalink(event.target.value)}
          />
          {useThis.error ? (
            <p className="text-xs text-destructive">
              {useThis.error instanceof Error
                ? useThis.error.message
                : "Couldn't link that post — try the permalink again."}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              disabled={!permalink.trim() || useThis.isPending || !open}
              onClick={() =>
                open && useThis.mutate({ ideaId: open.id, permalink: permalink.trim() })
              }
            >
              {useThis.isPending ? "Linking…" : "Link post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Where the subject came from — the first thing to read before making it.
 *
 * Two honest states, never blended. Verified: a story this system fetched, with
 * its real headline, outlet and date and a link to the article; every one of
 * those came from the stored row, none from the model. Unverified: no live
 * source was available, so the subject is the model's own, and the block says
 * that plainly and offers searches instead of a link.
 *
 * The video search is offered in both states. The feed returns articles; a
 * YouTube search on the same story is how the team finds video coverage of it,
 * and a search URL built from an encoded string is real by construction.
 */
function SourceBlock({ source }: { source: NonNullable<ContentIdea["source"]> }) {
  const video = searchLinks(source.searchQuery).find((link) => link.label === "YouTube");

  if (source.verified && source.url) {
    return (
      <section>
        <SectionLabel>Source &mdash; read this first</SectionLabel>
        <div className="space-y-2.5 rounded-lg border bg-card p-3.5">
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="group flex items-start gap-2 text-sm font-medium leading-snug hover:underline"
          >
            <Newspaper className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex-1">{source.headline ?? source.subject}</span>
            <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </a>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {source.publisher ? <span className="font-medium">{source.publisher}</span> : null}
            {source.publishedAt ? <span>{dateTime(source.publishedAt)}</span> : null}
            {source.coverage && source.coverage > 1 ? (
              <Badge variant="secondary" className="font-normal">
                {source.coverage} outlets
              </Badge>
            ) : null}
            <Badge
              variant="outline"
              className="border-emerald-500/40 font-normal text-emerald-700 dark:text-emerald-400"
            >
              Fetched, not generated
            </Badge>
          </p>
          <div className="flex flex-wrap gap-2 pt-0.5 text-xs">
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ExternalLink className="size-3" aria-hidden />
              Read the article
            </a>
            {video ? (
              <a
                href={video.href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Search className="size-3" aria-hidden />
                Find video coverage
              </a>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The script was written from this headline, not the full article. Anything in [square
            brackets] is a detail to take from the article before filming.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionLabel>Source &mdash; unverified</SectionLabel>
      <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3.5 text-xs">
        <p className="text-sm font-medium leading-snug">{source.subject}</p>
        <p className="text-muted-foreground">{source.origin}</p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {searchLinks(source.searchQuery).map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Search className="size-3" aria-hidden />
              Find on {link.label}
            </a>
          ))}
        </div>
        <p className="pt-1 leading-relaxed text-muted-foreground">
          No live source was available when this was written, so the subject comes from the
          model&rsquo;s own knowledge. Confirm names, dates and figures before any of them go on
          camera.
        </p>
      </div>
    </section>
  );
}

function Spec({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 leading-snug">{value}</dd>
    </div>
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
