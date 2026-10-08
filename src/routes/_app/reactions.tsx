import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { SectionHeading } from "@/components/dashboard/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteReactionClip,
  reactionSourceFile,
  reactionsQueryOptions,
  transcribeReactionClip,
  saveReactionClip,
  saveReactionSettingsFn,
  writeReactionScript,
} from "@/lib/analytics.functions";
import {
  BEAT_LABEL,
  approvalBlockers,
  defaultCredit,
  normalizeSourceUrl,
  RIGHTS_LABEL,
  SOURCE_PLATFORM_LABEL,
  SOURCE_TYPE_LABEL,
  type ReactionFields,
  type ReactionSource,
  type RightsStatus,
  type SourceType,
} from "@/lib/reaction";
import { REACTION_MIN_SAMPLE, type ReactionGroup } from "@/lib/reaction-learning";
import { STATUS_LABEL, type IdeaStatus } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useDashboard } from "@/lib/use-dashboard";

/**
 * "React to this" on a rising post opens this page with the clip filled in —
 * the real permalink, the real handle, its public views — so a reaction
 * started from a trend never depends on anyone retyping a link.
 */
const searchSchema = z.object({
  url: z.string().optional(),
  handle: z.string().optional(),
  views: z.coerce.number().optional(),
  found: z.enum(["team", "trend_listener"]).optional(),
});

export const Route = createFileRoute("/_app/reactions")({
  validateSearch: searchSchema,
  component: ReactionsPage,
});

const PLATFORM = "instagram" as const;
const SOURCE_TYPES: SourceType[] = [
  "podcast",
  "street_interview",
  "news",
  "tutorial",
  "meme",
  "movie_tv",
  "other",
];
const RIGHTS: RightsStatus[] = ["native_remix", "credited_clip", "needs_review"];

const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";

/**
 * Addendum E — the reaction-hook format.
 *
 * A borrowed clip from a bigger creator sets up a belief; the expert cuts in
 * with a correction or a deeper take that lands in their own lane. This page is
 * the v1 team-led flow: paste the clip and its transcript, then write the
 * expert's response. Instagram only for now — it is a reel format, and LinkedIn
 * has no video format in this system yet.
 */
function ReactionsPage() {
  const { data } = useQuery(reactionsQueryOptions(PLATFORM));
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Take a clip from a bigger creator that makes a claim in a field next to yours, credit it,
        and cut in with the expert&rsquo;s correction or deeper take — then land it in your own
        lane. The source link is stored exactly as you give it and attached to the script by the
        system; the AI never writes it.
      </p>

      <SettingsCard settings={data?.settings ?? null} />

      <SectionHeading
        title="Add a clip to react to"
        note="Tick a post in Rising on Instagram and press “React to this”, or paste a link here"
      />
      <NewClipCard />

      <SectionHeading
        title="Source clips"
        note={`${data?.sources.length ?? 0} stored · a script can be written from any clip with a transcript or claim`}
      />
      {data?.sources.length ? (
        <div className="space-y-3">
          {data.sources.map((source) => (
            <ClipCard
              key={source.id}
              source={source}
              // Newest first from the store, so the first match is this clip's
              // latest script. Undefined until one has been written.
              script={data.scripts?.find((entry) => entry.reaction.sourceId === source.id)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            No clips yet. Paste one above, or use &ldquo;React to this&rdquo; on a post in Rising on
            Instagram.
          </CardContent>
        </Card>
      )}

      {data?.learning ? <LearningCard learning={data.learning} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// E.4 — client settings
// ---------------------------------------------------------------------------

function SettingsCard({
  settings,
}: {
  settings: {
    standardCta: string | null;
    leadMagnet: string | null;
    brandSetNotes: string | null;
    ownedLaneForRedirect: string | null;
  } | null;
}) {
  const queryClient = useQueryClient();
  const raw = useDashboard();
  const lanes =
    raw.platforms
      .find((platform) => platform.platform === PLATFORM)
      ?.learning?.lanes.map((lane) => lane.lane)
      .filter((lane) => lane !== "other") ?? [];

  const [form, setForm] = useState({
    standardCta: "",
    leadMagnet: "",
    brandSetNotes: "",
    ownedLaneForRedirect: "",
  });
  useEffect(() => {
    if (!settings) return;
    setForm({
      standardCta: settings.standardCta ?? "",
      leadMagnet: settings.leadMagnet ?? "",
      brandSetNotes: settings.brandSetNotes ?? "",
      ownedLaneForRedirect: settings.ownedLaneForRedirect ?? "",
    });
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      saveReactionSettingsFn({
        data: {
          standardCta: form.standardCta || null,
          leadMagnet: form.leadMagnet || null,
          brandSetNotes: form.brandSetNotes || null,
          ownedLaneForRedirect: form.ownedLaneForRedirect || null,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reactions", PLATFORM] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reaction settings</CardTitle>
        <CardDescription>
          Reused in every reaction script. The CTA is used word for word, so write it exactly as it
          should be said.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="cta">Standard CTA (exact wording)</Label>
          <Input
            id="cta"
            value={form.standardCta}
            onChange={(event) => setForm({ ...form, standardCta: event.target.value })}
            placeholder='e.g. Comment "AI" and I&apos;ll send you my free prompt guide.'
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="magnet">Lead magnet</Label>
          <Input
            id="magnet"
            value={form.leadMagnet}
            onChange={(event) => setForm({ ...form, leadMagnet: event.target.value })}
            placeholder="e.g. Free prompt guide"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lane">Owned lane to redirect into</Label>
          <select
            id="lane"
            className={selectClass}
            value={form.ownedLaneForRedirect}
            onChange={(event) => setForm({ ...form, ownedLaneForRedirect: event.target.value })}
          >
            <option value="">Let the script choose</option>
            {lanes.map((lane) => (
              <option key={lane} value={lane}>
                {lane}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="brand">Brand set</Label>
          <Input
            id="brand"
            value={form.brandSetNotes}
            onChange={(event) => setForm({ ...form, brandSetNotes: event.target.value })}
            placeholder="e.g. Office set, branded screen with the course on it"
          />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            Save settings
          </Button>
          {save.data && !save.data.ok ? (
            <span className="text-xs text-destructive">{save.data.reason}</span>
          ) : save.isSuccess ? (
            <span className="text-xs text-muted-foreground">Saved.</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// E.5 — adding a clip (v1, team-led)
// ---------------------------------------------------------------------------

function NewClipCard() {
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const [url, setUrl] = useState(search.url ?? "");
  const [handle, setHandle] = useState(search.handle ?? "");
  const [type, setType] = useState<SourceType>("other");
  const [views, setViews] = useState(search.views != null ? String(search.views) : "");
  const [transcript, setTranscript] = useState("");
  const [claim, setClaim] = useState("");
  const [credit, setCredit] = useState("");
  const [rights, setRights] = useState<RightsStatus>("needs_review");
  const [failure, setFailure] = useState<string | null>(null);

  // Exactly what will be stored, shown before it is — the link the script
  // will credit, cleaned of tracking, and the platform it was read as.
  const preview = useMemo(() => (url.trim() ? normalizeSourceUrl(url) : null), [url]);
  const detectedHandle = preview?.ok ? preview.handle : null;
  const effectiveHandle = handle.trim().replace(/^@/, "") || detectedHandle;
  const creditPreview =
    credit.trim() || (preview?.ok ? defaultCredit(effectiveHandle ?? null, preview.platform) : "");

  const save = useMutation({
    mutationFn: () =>
      saveReactionClip({
        data: {
          platform: PLATFORM,
          sourceUrl: url,
          sourceCreatorHandle: effectiveHandle ?? null,
          sourceType: type,
          sourcePublicViews: views ? Number(views) : null,
          transcript: transcript || null,
          extractedClaim: claim || null,
          creditText: credit || null,
          rightsStatus: rights,
          foundBy: search.found ?? "team",
        },
      }),
    onSuccess: async (result) => {
      if ("reason" in result) {
        setFailure(result.reason);
        return;
      }
      setFailure(null);
      setUrl("");
      setHandle("");
      setViews("");
      setTranscript("");
      setClaim("");
      setCredit("");
      setRights("needs_review");
      await queryClient.invalidateQueries({ queryKey: ["reactions", PLATFORM] });
    },
    onError: (error) => setFailure(String(error)),
  });

  return (
    <Card>
      <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
        {search.url ? (
          <p className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
            Filled in from a rising post — the link and handle come from the post itself.
          </p>
        ) : null}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="url">Link to the source clip</Label>
          <Input
            id="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.instagram.com/reel/…"
          />
          {preview ? (
            preview.ok ? (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />
                Will be stored as{" "}
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {preview.url}
                </a>{" "}
                · {SOURCE_PLATFORM_LABEL[preview.platform]}
              </p>
            ) : (
              <p className="text-xs text-destructive">{preview.reason}</p>
            )
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="handle">Creator&rsquo;s handle</Label>
          <Input
            id="handle"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder={detectedHandle ? `@${detectedHandle} (read from the link)` : "@creator"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="type">Clip type</Label>
          <select
            id="type"
            className={selectClass}
            value={type}
            onChange={(event) => {
              const next = event.target.value as SourceType;
              setType(next);
              // E.7 — movie and TV scenes always start at needs review.
              if (next === "movie_tv") setRights("needs_review");
            }}
          >
            {SOURCE_TYPES.map((option) => (
              <option key={option} value={option}>
                {SOURCE_TYPE_LABEL[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="transcript">Transcript of the clip</Label>
          <Textarea
            id="transcript"
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            rows={4}
            placeholder="Paste what is said in the clip, with rough timestamps if you have them."
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="claim">
            Key claim (optional — extracted from the transcript if blank)
          </Label>
          <Input
            id="claim"
            value={claim}
            onChange={(event) => setClaim(event.target.value)}
            placeholder="e.g. You can rank on Google without any backlinks."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="credit">On-screen credit</Label>
          <Input
            id="credit"
            value={credit}
            onChange={(event) => setCredit(event.target.value)}
            placeholder={creditPreview || "🎥 @creator on Instagram"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rights">Rights</Label>
          <select
            id="rights"
            className={selectClass}
            value={rights}
            disabled={type === "movie_tv"}
            onChange={(event) => setRights(event.target.value as RightsStatus)}
          >
            {RIGHTS.map((option) => (
              <option key={option} value={option}>
                {RIGHTS_LABEL[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="views">Public views (optional)</Label>
          <Input
            id="views"
            inputMode="numeric"
            value={views}
            onChange={(event) => setViews(event.target.value.replace(/[^\d]/g, ""))}
            placeholder="Public signal only"
          />
        </div>
        <div className="flex items-end gap-3">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !preview?.ok || (!transcript.trim() && !claim.trim())}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Save clip
          </Button>
        </div>
        {failure ? <p className="text-xs text-destructive sm:col-span-2">{failure}</p> : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

function ClipCard({
  source,
  script,
}: {
  source: ReactionSource;
  /** The script already written from this clip, when there is one. */
  script?: ReactionScript | undefined;
}) {
  const queryClient = useQueryClient();
  const [credit, setCredit] = useState(source.creditText ?? "");
  const [rights, setRights] = useState<RightsStatus>(source.rightsStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [showScript, setShowScript] = useState(false);
  const blockers = approvalBlockers({ ...source, creditText: credit, rightsStatus: rights });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["reactions", PLATFORM] });

  // Re-saving the same link updates the row — this is how credit and rights
  // are edited, and it is what unblocks approval of ideas waiting on it.
  const update = useMutation({
    mutationFn: () =>
      saveReactionClip({
        data: {
          platform: source.platform,
          sourceUrl: source.sourceUrl,
          sourceCreatorHandle: source.sourceCreatorHandle,
          sourceType: source.sourceType,
          sourcePublicViews: source.sourcePublicViews,
          transcript: source.transcript,
          extractedClaim: source.extractedClaim,
          creditText: credit || null,
          rightsStatus: rights,
          foundBy: source.foundBy,
        },
      }),
    onSuccess: async (result) => {
      setMessage("reason" in result ? result.reason : "Saved.");
      await invalidate();
    },
  });

  const write = useMutation({
    mutationFn: () => writeReactionScript({ data: source.id }),
    onSuccess: async (result) => {
      setMessage(
        result.idea
          ? `Script written — it is in the Instagram ideas and the workspace queue.`
          : (result.reason ?? "The script could not be written."),
      );
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ["analysis", PLATFORM] }),
        queryClient.invalidateQueries({ queryKey: ["workspace"] }),
      ]);
    },
    onError: (error) => setMessage(String(error)),
  });

  const remove = useMutation({
    mutationFn: () => deleteReactionClip({ data: source.id }),
    onSuccess: invalidate,
  });

  const transcribe = useMutation({
    mutationFn: () => transcribeReactionClip({ data: source.id }),
    onSuccess: async (result) => {
      setMessage("reason" in result ? result.reason : "Transcript fetched, with timestamps.");
      await invalidate();
    },
    onError: (error) => setMessage(String(error)),
  });

  // A fresh link each time: Instagram's file links expire within days, so a
  // stored one would be dead by the time the editor needed it.
  const file = useMutation({
    mutationFn: () => reactionSourceFile({ data: source.id }),
    onSuccess: (result) => {
      if ("reason" in result) {
        setMessage(result.reason);
        return;
      }
      setMessage(
        `Source file ready — save it as ${result.filename}. The link works for about a day.`,
      );
      window.open(result.videoUrl, "_blank", "noopener,noreferrer");
    },
    onError: (error) => setMessage(String(error)),
  });
  const isInstagram = source.sourcePlatform === "instagram";

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={source.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            {source.sourceCreatorHandle ? `@${source.sourceCreatorHandle}` : "Source clip"}
            <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
          </a>
          <Badge variant="outline" className="font-normal">
            {SOURCE_PLATFORM_LABEL[source.sourcePlatform]}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {SOURCE_TYPE_LABEL[source.sourceType]}
          </Badge>
          {source.sourcePublicViews != null ? (
            <span className="text-xs text-muted-foreground">
              {source.sourcePublicViews.toLocaleString("en-US")} public views
            </span>
          ) : null}
          {source.foundBy === "trend_listener" ? (
            <Badge variant="secondary" className="font-normal">
              From Rising on Instagram
            </Badge>
          ) : null}
        </div>
        <p className="break-all text-[11px] text-muted-foreground">{source.sourceUrl}</p>

        {source.transcript ? (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Transcript</summary>
            <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-sans">
              {source.transcript}
            </pre>
          </details>
        ) : null}
        {source.extractedClaim ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Claim: </span>
            {source.extractedClaim}
          </p>
        ) : source.transcript ? (
          <p className="text-xs text-muted-foreground">
            The claim will be extracted from the transcript when the script is written.
          </p>
        ) : (
          // Without a transcript or a claim there is nothing for the script to
          // answer, so "Write reaction script" is disabled. Saying which of the
          // two to supply is the difference between a dead button and a step.
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Nothing to answer yet. Press &ldquo;Get transcript&rdquo;, or type the clip&rsquo;s key
            claim above and save — a script needs one of the two.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <Input
            value={credit}
            onChange={(event) => setCredit(event.target.value)}
            placeholder="On-screen credit"
            aria-label="On-screen credit"
            className="h-8 text-sm"
          />
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={rights}
            onChange={(event) => setRights(event.target.value as RightsStatus)}
            aria-label="Rights status"
          >
            {RIGHTS.map((option) => (
              <option key={option} value={option}>
                {RIGHTS_LABEL[option]}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => update.mutate()}
            disabled={update.isPending}
          >
            Save credit &amp; rights
          </Button>
        </div>

        {blockers.length ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Ideas from this clip cannot be approved yet: {blockers.join(" ")}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Credited and cleared — ideas from this clip can be approved.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* Once a script exists, reading it is the likely next action and
              writing another one costs an AI call — so View leads and Write
              steps back to an outline button that says it would rewrite. */}
          {script ? (
            <Button size="sm" className="gap-1.5" onClick={() => setShowScript(true)}>
              <FileText className="size-3.5" aria-hidden />
              View script
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={script ? "outline" : "default"}
            className="gap-1.5"
            onClick={() => write.mutate()}
            disabled={write.isPending || (!source.transcript && !source.extractedClaim)}
            title={
              !source.transcript && !source.extractedClaim
                ? "Get the transcript first, or type the clip's key claim"
                : script
                  ? "Writes a new script, replacing nothing — uses one AI call"
                  : "Uses one AI call"
            }
          >
            {write.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-3.5" aria-hidden />
            )}
            {write.isPending ? "Writing…" : script ? "Write another" : "Write reaction script"}
          </Button>
          {isInstagram ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => transcribe.mutate()}
              disabled={transcribe.isPending}
              title="Fetches the clip's transcript with timestamps — about 1.5¢"
            >
              {transcribe.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : null}
              {source.transcript ? "Re-fetch transcript" : "Get transcript"}
            </Button>
          ) : null}
          {isInstagram ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => file.mutate()}
              disabled={file.isPending || rights !== "credited_clip"}
              title={
                rights === "credited_clip"
                  ? "Fetches the clip's video file for the editor — about 0.3¢"
                  : rights === "native_remix"
                    ? "Native remix is made inside Instagram — no file needed"
                    : "Set the rights to Credited clip first"
              }
            >
              {file.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              Get source file
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-muted-foreground"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Remove
          </Button>
          {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
        </div>
      </CardContent>
      {script ? (
        <ScriptDialog script={script} open={showScript} onOpenChange={setShowScript} />
      ) : null}
    </Card>
  );
}

/** One script written from a clip, as the reactions query returns it. */
type ReactionScript = { id: string; status: string; reaction: ReactionFields };

/**
 * The script already written from this clip.
 *
 * Shown from the clip itself, not only in the Instagram ideas, because the
 * person setting credit and rights on this card is the person who needs to
 * read what was written from it. The beats ARE the format, so they are listed
 * in order and any the script left empty is named rather than silently absent.
 */
function ScriptDialog({
  script,
  open,
  onOpenChange,
}: {
  script: ReactionScript;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const reaction = script.reaction;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogDescription className="text-xs">
            Reaction script · {STATUS_LABEL[script.status as IdeaStatus] ?? script.status}
            {reaction.expertSeconds ? ` · about ${reaction.expertSeconds}s of expert` : ""}
          </DialogDescription>
          <DialogTitle className="text-left text-base leading-snug">
            {reaction.claim || "The claim being answered"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Shot 1 — the borrowed clip
          </p>
          <p className="rounded-lg border bg-muted/40 p-3 text-sm">
            Borrow <span className="font-semibold tabular-nums">{reaction.sourceIn}</span>–
            <span className="font-semibold tabular-nums">{reaction.sourceOut}</span> of the original
            {reaction.sourceCreatorHandle ? ` from @${reaction.sourceCreatorHandle}` : ""}.
            {reaction.creditOverlayText ? (
              <>
                {" "}
                On-screen credit: <span className="font-medium">{reaction.creditOverlayText}</span>
              </>
            ) : null}
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            The expert&rsquo;s answer, beat by beat
          </p>
          <ol className="divide-y rounded-lg border">
            {reaction.beats.map((entry) => (
              <li key={entry.beat} className="grid grid-cols-[9rem_1fr] gap-3 px-3 py-2.5">
                <span className="text-xs font-semibold text-muted-foreground">
                  {BEAT_LABEL[entry.beat]}
                </span>
                <span className="text-sm leading-relaxed">{entry.line}</span>
              </li>
            ))}
          </ol>
        </div>

        {reaction.missingBeats.length ? (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            The script left these beats empty — fill them before filming:{" "}
            {reaction.missingBeats.map((beat) => BEAT_LABEL[beat]).join(", ")}.
          </p>
        ) : null}

        {reaction.verifyItems.length ? (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Facts to confirm before filming
            </p>
            <ul className="list-disc space-y-1 rounded-lg border bg-muted/30 p-3 pl-7 text-xs">
              {reaction.verifyItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p
              className={cn(
                "flex items-center gap-1.5 text-xs",
                reaction.verifiedAt
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-amber-700 dark:text-amber-400",
              )}
            >
              {reaction.verifiedAt ? (
                <CheckCircle2 className="size-3.5" aria-hidden />
              ) : (
                <AlertTriangle className="size-3.5" aria-hidden />
              )}
              {reaction.verifiedAt
                ? "The client has confirmed these."
                : "Not confirmed yet — this script cannot go into production until they are."}
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// E.9 — what the loop has learned
// ---------------------------------------------------------------------------

function GroupRows({ title, groups }: { title: string; groups: ReactionGroup[] }) {
  if (!groups.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {groups.map((group) => (
        <div key={group.key} className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <span className="min-w-40">{group.label}</span>
          <span className="font-semibold tabular-nums">{group.medianVsMedian}×</span>
          <span className="text-xs text-muted-foreground">
            {group.reels} reel{group.reels === 1 ? "" : "s"}
            {group.directional ? " · directional" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function LearningCard({
  learning,
}: {
  learning: NonNullable<
    Awaited<ReturnType<ReturnType<typeof reactionsQueryOptions>["queryFn"]>>["learning"]
  >;
}) {
  return (
    <>
      <SectionHeading
        title="Does the format work here?"
        note="Measured against this account's own median — 1.0× is a typical post"
      />
      <Card>
        <CardContent className="space-y-4 p-5">
          {learning.overall ? (
            <>
              <p className="text-sm">
                {learning.measured} reaction reel{learning.measured === 1 ? "" : "s"} measured, at a
                median of <span className="font-semibold">{learning.overall.medianVsMedian}×</span>{" "}
                the account&rsquo;s typical post.
                {learning.measured < REACTION_MIN_SAMPLE
                  ? ` Directional until there are ${REACTION_MIN_SAMPLE}.`
                  : ""}
              </p>
              <GroupRows title="By pivot" groups={learning.byPivot} />
              <GroupRows title="By clip type" groups={learning.bySourceType} />
              <GroupRows title="By borrowed-clip length" groups={learning.byBorrowedLength} />
              {learning.winningExpertSeconds ? (
                <p className="text-xs text-muted-foreground">
                  Winning reaction reels run an expert segment of about{" "}
                  {learning.winningExpertSeconds}s — new scripts aim for that.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {learning.suggested
                ? `${learning.suggested} reaction script${learning.suggested === 1 ? "" : "s"} written, none measured yet. Results appear about a week after a reaction reel is published and linked in the workspace.`
                : "Nothing to measure yet. Results appear once reaction reels are published and linked in the workspace."}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
