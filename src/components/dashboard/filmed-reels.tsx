// The Filmed reels page: every script the team marked filmed, where each one
// has got to, and what the system has learned from them so far.
//
// LinkedIn is back here (19 Nov 2026), in its own list: posts and articles
// drafted on this dashboard that went live, found by their own words after
// each Sync (or marked I posted this), compared and reviewed by themselves
// (reel-learning/auto.ts). It was taken off on 16 Nov while LinkedIn posts
// waited for buttons. Viral reels and the reel rules stay Instagram's.
//
// Each row opens the same drawer as everywhere else, where Analyse and Review
// live. This page spends nothing: it reads stored rows and synced posts, and
// gives any reel still waiting one more free look.
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Search,
  Timer,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AiIdeaCards } from "@/components/dashboard/ai-idea-cards";
import { Patterns } from "@/components/dashboard/filmed-panel";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ContentIdea } from "@/lib/ai-types";
import type { PlatformId } from "@/lib/analytics-types";
import { dateTime, shortDate } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform-meta";
import {
  FOUND_LIVE,
  isFinalReview,
  laneChange,
  LEARNING_WORDS,
  POST_REVIEW_DAYS,
  REEL_REVIEW_DAYS,
  REEL_USAGE_LABEL,
  VIRAL_RATIO,
  type ReelLearning,
} from "@/lib/reel-learning-types";
import {
  filmedReelsQueryOptions,
  learnedRulesQueryOptions,
  reelPatternsQueryOptions,
} from "@/lib/reel-learning.functions";
import { CTA_TYPE_LABEL, HOOK_TYPE_LABEL } from "@/lib/reel-parts";

const PLATFORMS: PlatformId[] = ["instagram", "linkedin"];

type Stage = "waiting" | "found" | "analysed" | "review_ready" | "reviewed";

/** What happens next at each stage; on both platforms it runs after each Sync (auto.ts). */
function stageLabel(stage: Stage, platform: PlatformId): string {
  if (platform !== "linkedin") return STAGE_LABEL[stage];
  return {
    waiting: "Waiting for the post",
    found: "Post found · compared on the next Sync",
    analysed: `Compared · reviewed automatically after ${POST_REVIEW_DAYS} days`,
    review_ready: "Reviewed on the next Sync",
    reviewed: "Reviewed",
  }[stage];
}

function stageOf(learning: ReelLearning): Stage {
  if (isFinalReview(learning)) return "reviewed";
  if (!learning.shortcode) return "waiting";
  if (!learning.comparison) return "found";
  const ready = learning.reviewableAt ? Date.now() >= Date.parse(learning.reviewableAt) : false;
  return ready ? "review_ready" : "analysed";
}

const STAGE_LABEL: Record<Stage, string> = {
  waiting: "Waiting for the reel",
  // Analysis and the 14-day review run by themselves after each sync
  // (reel-learning/auto.ts); the buttons in the drawer still run them sooner.
  found: "Reel found · analysed on the next sync",
  analysed: `Analysed · reviewed automatically after ${REEL_REVIEW_DAYS} days`,
  review_ready: "Reviewed on the next sync",
  reviewed: "Reviewed",
};

const STAGE_TONE: Record<Stage, string> = {
  waiting: "text-muted-foreground",
  found: "border-sky-300 text-sky-800 dark:border-sky-800 dark:text-sky-300",
  analysed: "text-muted-foreground",
  review_ready: "border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-300",
  reviewed: "border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-300",
};

function Result({ learning }: { learning: ReelLearning }) {
  if (!learning.review) return null;
  const ratio = learning.review.primaryRatio;
  if (learning.review.early) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-300 font-normal text-amber-800 dark:border-amber-800 dark:text-amber-300"
      >
        <Timer className="size-3" aria-hidden /> Early check (day {learning.review.early.days}) ·{" "}
        {ratio.toFixed(2)}× so far
      </Badge>
    );
  }
  if (ratio >= VIRAL_RATIO) {
    return (
      <Badge className="gap-1 bg-violet-600 hover:bg-violet-600">
        <TrendingUp className="size-3" aria-hidden /> Viral · {ratio.toFixed(2)}×
      </Badge>
    );
  }
  return learning.worked ? (
    <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
      <CheckCircle2 className="size-3" aria-hidden /> Worked · {ratio.toFixed(2)}×
    </Badge>
  ) : (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="size-3" aria-hidden /> Did not work · {ratio.toFixed(2)}×
    </Badge>
  );
}

export function FilmedReels() {
  const results = useQueries({
    queries: PLATFORMS.map((platform) => filmedReelsQueryOptions(platform)),
  });
  const isLoading = results.some((result) => result.isLoading);
  const items = useMemo(
    () =>
      results
        .flatMap((result) => result.data ?? [])
        .sort((a, b) => b.learning.filmedAt.localeCompare(a.learning.filmedAt)),
    [results],
  );
  const reels = items.filter((item) => item.learning.platform === "instagram");
  const posts = items.filter((item) => item.learning.platform === "linkedin");
  const { data: patterns } = useQuery(reelPatternsQueryOptions("instagram"));
  const [viewing, setViewing] = useState<{ idea: ContentIdea; platform: PlatformId } | null>(null);
  const open = (idea: ContentIdea, platform: PlatformId) => setViewing({ idea, platform });

  const viralItems = reels
    .filter(
      (item) => isFinalReview(item.learning) && item.learning.review!.primaryRatio >= VIRAL_RATIO,
    )
    .sort((a, b) => b.learning.review!.primaryRatio - a.learning.review!.primaryRatio);

  const count = (stage: Stage) => items.filter((item) => stageOf(item.learning) === stage).length;
  const worked = items.filter((item) => item.learning.worked).length;
  const viral = viralItems.length;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Every reel the team filmed and every LinkedIn post or article that went live from this
        dashboard. The live reel or post is found on each Sync, compared with what was written, and
        reviewed {REEL_REVIEW_DAYS} days after it went up, all by itself. What the reviews teach
        goes into every new script and post.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Filmed or posted", value: items.length },
          { label: "Waiting to go live", value: count("waiting") },
          { label: "To compare", value: count("found") },
          { label: "Due for review", value: count("review_ready") },
          { label: "Reviewed", value: count("reviewed") },
          { label: "Worked / viral", value: `${worked} / ${viral}` },
        ].map((tile) => (
          <div key={tile.label} className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="text-xl font-bold tabular-nums">{isLoading ? "…" : tile.value}</p>
          </div>
        ))}
      </div>

      <SectionHeading title="What the system has learned" />
      {patterns?.length ? (
        <Card>
          <CardContent className="space-y-4 p-5">
            <Patterns platform="instagram" />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing yet. Patterns appear once filmed reels have been reviewed, {REEL_REVIEW_DAYS} days
          after they go live. Each review adds to them.
        </p>
      )}

      <RulesLearned />

      {viralItems.length ? (
        <>
          <SectionHeading
            title="Viral reels"
            note={`${VIRAL_RATIO}x the typical reel's views or more`}
          />
          <Card>
            <CardContent className="space-y-4 p-5">
              {viralItems.map(({ learning, idea }) => (
                <ViralReel key={learning.ideaId} learning={learning} title={idea?.title ?? ""} />
              ))}
              <p className="text-xs text-muted-foreground">
                Every new script is shown these reels, part by part, as the clearest proof of what
                this audience wants.
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}

      <SectionHeading
        title="Filmed reels"
        note={isLoading ? "Loading…" : `${reels.length} in all`}
      />
      <FilmedList
        items={reels}
        isLoading={isLoading}
        empty="Nothing yet. Press I filmed this on a reel script once it is shot."
        onOpen={open}
      />

      <SectionHeading
        title="Posted on LinkedIn"
        note={isLoading ? "Loading…" : `${posts.length} in all · posts and articles`}
      />
      <FilmedList
        items={posts}
        isLoading={isLoading}
        empty="Nothing yet. A post or article written here shows up once it goes live: it is found by its own words on the next Sync, or press I posted this in its drawer."
        onOpen={open}
      />

      {viewing ? (
        <AiIdeaCards
          key={viewing.idea.id}
          ideas={[viewing.idea]}
          platform={viewing.platform}
          initialOpenId={viewing.idea.id}
          panelOnly
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}

type FilmedEntry = {
  learning: ReelLearning;
  idea: ContentIdea | null;
  postedLane: string | null;
};

/** One platform's list: each reel or post, where it has got to, and how it did. */
function FilmedList({
  items,
  isLoading,
  empty,
  onOpen,
}: {
  items: FilmedEntry[];
  isLoading: boolean;
  empty: string;
  onOpen: (idea: ContentIdea, platform: PlatformId) => void;
}) {
  return (
    <Card>
      <CardContent className="divide-y p-0">
        {isLoading ? (
          <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
          </p>
        ) : !items.length ? (
          <p className="p-5 text-sm text-muted-foreground">{empty}</p>
        ) : (
          items.map((item) => <FilmedRow key={item.learning.ideaId} {...item} onOpen={onOpen} />)
        )}
      </CardContent>
    </Card>
  );
}

function FilmedRow({
  learning,
  idea,
  postedLane,
  onOpen,
}: FilmedEntry & { onOpen: (idea: ContentIdea, platform: PlatformId) => void }) {
  const stage = stageOf(learning);
  const w = LEARNING_WORDS[learning.platform];
  const article = idea?.format === "article";
  const thing = learning.platform === "linkedin" ? (article ? "article" : "post") : "reel";
  // Only once the reel is confirmed: a timing guess may be the wrong one.
  const moved = learning.match?.confirmed ? laneChange(idea?.contentLane, postedLane) : null;
  return (
    <div className="flex flex-wrap items-start gap-3 p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-medium leading-snug">{idea?.title ?? "A script no longer stored"}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span style={{ color: PLATFORM_META[learning.platform].color }}>
            {PLATFORM_META[learning.platform].label}
            {learning.platform === "linkedin" ? (article ? " article" : " post") : ""}
          </span>
          {moved ? (
            <span>
              · {moved.from} → {moved.to}
            </span>
          ) : idea?.contentLane ? (
            <span>· {idea.contentLane}</span>
          ) : null}
          <span>
            {learning.filmedBy === FOUND_LIVE ? (
              <>· found live {dateTime(learning.filmedAt)} by its own words</>
            ) : (
              <>
                · {w.did} {dateTime(learning.filmedAt)}
                {learning.filmedBy ? ` by ${learning.filmedBy}` : ""}
              </>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={`font-normal ${STAGE_TONE[stage]}`}>
            {stage === "waiting" ? <Search className="mr-1 size-3" aria-hidden /> : null}
            {learning.match?.by === "timing" && !learning.match.confirmed
              ? `Probably this ${thing} (by timing) · checked when compared`
              : stageLabel(stage, learning.platform)}
            {stage === "analysed" && learning.reviewableAt
              ? ` (${shortDate(learning.reviewableAt)})`
              : ""}
          </Badge>
          {learning.usage ? (
            <Badge variant="secondary" className="font-normal">
              {REEL_USAGE_LABEL[learning.usage]}
            </Badge>
          ) : null}
          {moved ? (
            <Badge
              variant="outline"
              className="border-violet-300 font-normal text-violet-800 dark:border-violet-800 dark:text-violet-300"
              title={`Written for ${moved.from}, went live as ${moved.to}. Its ✓ and ✗ and its results now teach ${moved.to}, so ${moved.from} does not drift toward this topic.`}
            >
              <ArrowRightLeft className="mr-1 size-3" aria-hidden />
              Topic changed · now teaches {moved.to}
            </Badge>
          ) : null}
          <Result learning={learning} />
          {learning.reelUrl ? (
            <a
              href={learning.reelUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
            >
              {thing[0]!.toUpperCase() + thing.slice(1)}
              {learning.publishedAt ? `, posted ${shortDate(learning.publishedAt)}` : ""}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </div>
        {learning.review ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{learning.review.summary}</p>
        ) : null}
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={!idea}
        onClick={() => idea && onOpen(idea, learning.platform)}
      >
        Open
      </Button>
    </div>
  );
}

/** The rules strong patterns have produced, and what each one does. */
function RulesLearned() {
  const { data: rules } = useQuery(learnedRulesQueryOptions("instagram"));
  const items = [
    ...(rules?.blockedHookTypes ?? []).map(
      (rule) =>
        `Never open with a ${HOOK_TYPE_LABEL[rule.type].toLowerCase()} hook: lost on ${rule.reels} reels (median ${rule.medianRatio.toFixed(2)}×). New hooks of this kind are rewritten and never offered.`,
    ),
    ...(rules?.allowHypotheticalHooks
      ? [
          `Hypothetical hooks ("Imagine…") are allowed again: they worked on ${rules.allowHypotheticalHooks.reels} reels (median ${rules.allowHypotheticalHooks.medianRatio.toFixed(2)}×), as long as the same line names the subject.`,
        ]
      : []),
    ...(rules?.blockedHashtags ?? []).map(
      (rule) =>
        `${rule.tag} is no longer suggested: it was on ${rule.reels} reels that lost (median ${rule.medianRatio.toFixed(2)}×).`,
    ),
  ];
  return (
    <>
      <SectionHeading title="Rules learned from results" note="enforced in code" />
      {items.length ? (
        <Card>
          <CardContent className="p-5">
            <ul className="list-disc space-y-1.5 pl-4 text-sm">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          None yet. A rule needs 3 or more reviewed reels that agree: a kind of hook or a hashtag
          that keeps losing is blocked, and a rule that keeps being beaten is lifted. One reel,
          however good or bad, never makes a rule.
        </p>
      )}
    </>
  );
}

/** One viral reel, part by part. */
function ViralReel({ learning, title }: { learning: ReelLearning; title: string }) {
  const c = learning.comparison;
  return (
    <div className="space-y-1 border-b pb-3 last:border-0 last:pb-0">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <Badge className="gap-1 bg-violet-600 hover:bg-violet-600">
          <TrendingUp className="size-3" aria-hidden /> {learning.review!.primaryRatio.toFixed(2)}×
        </Badge>
        {title}
      </p>
      {c ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Hook</span>
            {c.hookType ? ` (${HOOK_TYPE_LABEL[c.hookType]})` : ""}: &ldquo;{c.hook.spoken}&rdquo;
          </li>
          {c.body ? (
            <li>
              <span className="font-medium text-foreground">Body</span>: {c.body.shape}; example:{" "}
              {c.body.exampleType}
            </li>
          ) : null}
          {c.cta ? (
            <li>
              <span className="font-medium text-foreground">CTA</span> ({CTA_TYPE_LABEL[c.cta.type]}
              ): {c.cta.spoken ? `“${c.cta.spoken}”` : "none"}
            </li>
          ) : null}
          {c.reel?.seconds ? (
            <li>
              <span className="font-medium text-foreground">Length</span>: about {c.reel.seconds} s
            </li>
          ) : null}
          <li>
            <span className="font-medium text-foreground">Script</span>:{" "}
            {learning.usage ? REEL_USAGE_LABEL[learning.usage].toLowerCase() : "unknown"}
          </li>
        </ul>
      ) : null}
      <p className="text-xs">{learning.review!.summary}</p>
    </div>
  );
}
