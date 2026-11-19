import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clapperboard,
  ExternalLink,
  FileText,
  Flame,
  Loader2,
  Newspaper,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AiIdeaCards } from "@/components/dashboard/ai-idea-cards";
import { SaveTopicButton } from "@/components/dashboard/save-topic-button";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  analysisQueryOptions,
  generateOneIdea,
  getScriptForSource,
  reactionsQueryOptions,
  savedTopicsQueryOptions,
  saveReactionClip,
  topicInboxQueryOptions,
  writeReactionScript,
} from "@/lib/analytics.functions";
import { dateTime } from "@/lib/format";
import { writeLinkedIn } from "@/lib/linkedin-write.functions";
import { PLATFORM_META } from "@/lib/platform-meta";
import { matchesSearch } from "@/lib/search";
import { normalizeSourceUrl } from "@/lib/reaction";
import { cn } from "@/lib/utils";
import type { ContentIdea } from "@/lib/ai-types";
import type { PlatformId } from "@/lib/analytics-types";
import type { SavedTopic } from "@/lib/saved-topics";

const PLATFORMS: PlatformId[] = ["instagram", "linkedin"];

/**
 * The Saved screen — the team's shared shortlist.
 *
 * Everything the team bookmarked from "Topics in the news" and "Rising on
 * <platform>", newest first, across both platforms. The lane separator is the
 * same tab row as the news inbox, deliberately: a team that learned to filter
 * by lane there should find the same control here. Every row keeps its own
 * save button, so a topic can be taken off the shortlist from the one place
 * built to hold it.
 *
 * A platform menu at the top right (5 Nov 2026): All shows both platforms'
 * saved topics and every lane, Instagram or LinkedIn only that platform's
 * topics and its own lanes.
 *
 * Given `only` (18 Nov 2026), it is one account's saved items at the top of
 * that account's Ideas tab: Instagram's there, LinkedIn's on LinkedIn, with no
 * platform menu and no introduction.
 */
export function SavedTopics({ only }: { only?: PlatformId } = {}) {
  const results = useQueries({
    queries: (only ? [only] : PLATFORMS).map((platform) => savedTopicsQueryOptions(platform)),
  });
  const isLoading = results.some((result) => result.isLoading);

  const items = useMemo(() => {
    const all = results.flatMap((result) => result.data?.saved ?? []);
    return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [results]);

  const [chosen, setPlatform] = useState<PlatformId | "all">("all");
  const platform = only ?? chosen;
  const [lane, setLane] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const onPlatform = useMemo(
    () => (platform === "all" ? items : items.filter((item) => item.platform === platform)),
    [items, platform],
  );
  const lanes = useMemo(
    () => [
      ...new Set(
        onPlatform.map((item) => item.lane).filter((value): value is string => Boolean(value)),
      ),
    ],
    [onPlatform],
  );
  // A lane the chosen platform does not have is no filter at all.
  const activeLane = lane && lanes.includes(lane) ? lane : null;
  const filtered = onPlatform.filter(
    (item) =>
      (!activeLane || item.lane === activeLane) &&
      matchesSearch(search, item.title, item.sourceLabel, item.lane, item.actor),
  );
  const where =
    platform === "all" ? "across Instagram and LinkedIn" : `on ${PLATFORM_META[platform].label}`;

  return (
    <div className="space-y-6">
      {only ? null : (
        <p className="max-w-3xl text-sm text-muted-foreground">
          Topics the team saved from the news inbox and the rising-posts lists. A shared shortlist —
          anyone can add to it, and it stays here until someone takes it off. Nothing here is
          generated and saving spends nothing.
        </p>
      )}

      <SectionHeading
        title={only ? "Saved" : "Saved topics"}
        note={
          isLoading
            ? "Loading…"
            : onPlatform.length
              ? `${onPlatform.length} saved ${where}`
              : items.length
                ? `Nothing saved ${where}`
                : "Nothing saved yet"
        }
      />

      <Card>
        <CardContent className="space-y-4 p-5">
          {items.length ? (
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search saved topics, e.g. Andromeda"
              aria-label="Search saved topics"
              className="h-9 sm:max-w-xs"
            />
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between">
            {lanes.length > 1 ? (
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by topic">
                {[null, ...lanes].map((value) => (
                  <button
                    key={value ?? "all"}
                    type="button"
                    role="tab"
                    aria-selected={activeLane === value}
                    onClick={() => setLane(value)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                      activeLane === value
                        ? "border-foreground/30 bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {value ?? "All topics"}
                  </button>
                ))}
              </div>
            ) : (
              <span />
            )}
            {only ? null : (
              <Select
                value={platform}
                onValueChange={(value) => {
                  setPlatform(value as PlatformId | "all");
                  setLane(null);
                }}
              >
                <SelectTrigger className="h-9 w-full shrink-0 sm:w-44" aria-label="Platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platforms</SelectItem>
                  {PLATFORMS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {PLATFORM_META[value].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {filtered.length ? (
            <ul className="divide-y">
              {filtered.map((item) => (
                <SavedRow key={`${item.platform}:${item.kind}:${item.itemId}`} item={item} />
              ))}
            </ul>
          ) : !isLoading ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {onPlatform.length
                ? search.trim()
                  ? `Nothing saved matches "${search.trim()}"${activeLane ? ` in ${activeLane}` : ""}.`
                  : "Nothing saved in this topic."
                : items.length
                  ? `Nothing saved ${where} yet.`
                  : only
                    ? `Nothing saved for ${PLATFORM_META[only].label} yet. Press Save on a story, a rising post or a script and it will appear here.`
                    : "Press Save on a story in Topics in the news, or on a post in Rising on Instagram, and it will appear here."}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SavedRow({ item }: { item: SavedTopic }) {
  const meta = PLATFORM_META[item.platform];
  const reaction = item.kind === "trend";
  const Icon = reaction ? Flame : Newspaper;
  // LinkedIn: what was written from this story, a post, an article or both.
  const linkedin = item.platform === "linkedin" && !reaction;
  const pieces = useLinkedInPieces(item.itemId, linkedin);
  const written = linkedin
    ? pieces.post.data && pieces.article.data
      ? "LinkedIn post and article"
      : pieces.article.data
        ? "LinkedIn article"
        : pieces.post.data
          ? "LinkedIn post"
          : null
    : null;

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="group inline-flex items-start gap-1.5 text-sm font-medium leading-snug hover:underline"
          >
            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>{item.title}</span>
            <ExternalLink
              className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </a>
        ) : (
          <span className="inline-flex items-start gap-1.5 text-sm font-medium leading-snug">
            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>{item.title}</span>
          </span>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 text-xs text-muted-foreground">
          {/* What this will BECOME, said plainly. The two kinds are made in
              completely different ways — one answers a borrowed clip, the
              other explains a news story — so the row leads with that. */}
          <Badge variant="secondary" className="gap-1 font-medium">
            {reaction ? (
              <Clapperboard className="size-3" aria-hidden />
            ) : (
              <Sparkles className="size-3" aria-hidden />
            )}
            {reaction
              ? "Reaction hook reel"
              : item.platform === "linkedin"
                ? (written ?? "Not written yet")
                : "Reel topic"}
          </Badge>
          <span
            className="inline-flex items-center gap-1 font-medium"
            style={{ color: meta.color }}
          >
            <meta.icon className="size-3" aria-hidden />
            {meta.label}
          </span>
          <span>
            ·{" "}
            {reaction
              ? "answers a rising post"
              : /instagram\.com\/(reel|p)\//.test(item.url ?? "")
                ? "built on a creator reel"
                : "built on a news story"}
          </span>
          {item.sourceLabel ? <span>· {item.sourceLabel}</span> : null}
          {item.lane ? <span>· {item.lane}</span> : null}
          <span>· saved {dateTime(item.createdAt)}</span>
          {item.actor ? <span>by {item.actor}</span> : null}
        </p>
      </div>
      {/* Capped, so a long message under the buttons wraps instead of widening
          this column and squeezing the topic into a sliver. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-5 sm:max-w-[28rem] sm:justify-end sm:pl-0">
        {reaction ? (
          <ReactionScriptActions item={item} />
        ) : linkedin ? (
          <LinkedInPieceActions item={item} />
        ) : (
          <NewsScriptActions item={item} />
        )}
        <Badge variant="outline" className="font-normal capitalize">
          {item.lane ?? "no lane"}
        </Badge>
        <SaveTopicButton
          platform={item.platform}
          kind={item.kind}
          itemId={item.itemId}
          title={item.title}
          url={item.url}
          sourceLabel={item.sourceLabel}
          lane={item.lane}
        />
      </div>
    </li>
  );
}

type PieceKind = "post" | "article";
const pieceKey = (sourceId: string, kind: PieceKind) =>
  ["script-for-source", "linkedin", sourceId, kind] as const;

/** The newest LinkedIn post and the newest article written from one story. */
function useLinkedInPieces(sourceId: string, enabled: boolean) {
  const query = (kind: PieceKind) => ({
    queryKey: pieceKey(sourceId, kind),
    queryFn: () => getScriptForSource({ data: { platform: "linkedin", sourceId, kind } }),
    staleTime: 60 * 1000,
    enabled,
  });
  return { post: useQuery(query("post")), article: useQuery(query("article")) };
}

/** Optional extras for the To do board (19 Nov 2026); every other page omits
 * them and keeps the buttons as they were. `compact` folds Write post and
 * Write article into one Write button with a choice; `onClosed` runs when the
 * script drawer closes, so To do can move the topic on. */
export interface WriteActionOptions {
  compact?: boolean;
  onClosed?: () => void;
}

/**
 * A saved LinkedIn story's post and article (19 Nov 2026): each one written
 * reads View post / View article, with a regenerate beside it; the one not
 * written yet reads Write post / Write article. The same AI call as those
 * buttons in the news inbox, only on a press.
 */
export function LinkedInPieceActions({
  item,
  compact = false,
  onClosed,
}: { item: SavedTopic } & WriteActionOptions) {
  const queryClient = useQueryClient();
  const sourceId = item.itemId;
  const pieces = useLinkedInPieces(sourceId, true);
  const [viewing, setViewing] = useState<ContentIdea | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const write = useMutation({
    mutationFn: (input: { kind: PieceKind; regenerate: boolean }) =>
      writeLinkedIn({
        data: {
          sourceId,
          format: input.kind === "article" ? "article" : "text_post",
          ...(input.regenerate ? { regenerate: true } : {}),
        },
      }),
    onMutate: () => setMessage(null),
    onSuccess: (result, input) => {
      if (result.analysis) {
        queryClient.setQueryData(analysisQueryOptions("linkedin").queryKey, result.analysis);
      }
      if (result.idea) {
        queryClient.setQueryData(pieceKey(sourceId, input.kind), result.idea);
        setViewing(result.idea);
      } else {
        setMessage(result.reason ?? `No ${input.kind} was written for this story.`);
      }
      void queryClient.invalidateQueries({ queryKey: topicInboxQueryOptions("linkedin").queryKey });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : "Could not write it for this story."),
  });

  const drawer = viewing ? (
    <AiIdeaCards
      key={viewing.id}
      ideas={[viewing]}
      platform="linkedin"
      initialOpenId={viewing.id}
      panelOnly
      onClose={() => {
        setViewing(null);
        onClosed?.();
      }}
    />
  ) : null;
  const failure = message ? (
    <span className="basis-full whitespace-normal break-words text-xs text-destructive">
      {message}
    </span>
  ) : null;

  // One Write button, then post or article. Only while neither is written:
  // once one is, the full View / Write pair below shows instead.
  const nothingYet =
    !pieces.post.isLoading &&
    !pieces.article.isLoading &&
    !pieces.post.data &&
    !pieces.article.data;
  if (compact && nothingYet) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={write.isPending}>
              {write.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-3.5" aria-hidden />
              )}
              {write.isPending ? `Writing the ${write.variables?.kind ?? "post"}…` : "Write"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => write.mutate({ kind: "post", regenerate: false })}>
              LinkedIn post
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => write.mutate({ kind: "article", regenerate: false })}>
              LinkedIn article
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {failure}
        {drawer}
      </>
    );
  }

  return (
    <>
      {(["post", "article"] as const).map((kind) => {
        const { data: existing, isLoading } = pieces[kind];
        const busy = write.isPending && write.variables?.kind === kind;
        if (isLoading) {
          return (
            <Button key={kind} size="sm" variant="outline" className="gap-1.5" disabled>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Checking…
            </Button>
          );
        }
        return existing ? (
          <span key={kind} className="inline-flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={write.isPending}
              onClick={() => setViewing(existing)}
            >
              <FileText className="size-3.5" aria-hidden />
              View {kind}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="px-2"
              disabled={write.isPending}
              onClick={() => write.mutate({ kind, regenerate: true })}
              title={`Uses AI to write a new version of the ${kind} with the current rules. The earlier one stays in history.`}
              aria-label={`Regenerate the ${kind}`}
            >
              <RefreshCw className={cn("size-3.5", busy && "animate-spin")} aria-hidden />
            </Button>
          </span>
        ) : (
          <Button
            key={kind}
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={write.isPending}
            onClick={() => write.mutate({ kind, regenerate: false })}
            title={`Uses AI: writes a LinkedIn ${kind} on this story in his voice`}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-3.5" aria-hidden />
            )}
            {busy ? `Writing the ${kind}…` : `Write ${kind}`}
          </Button>
        );
      })}
      {failure}
      {drawer}
    </>
  );
}

/**
 * "Write script" for a saved NEWS STORY — the same action, and the same AI
 * call, as the button in Topics in the news, so a story the team saved can be
 * scripted from the shortlist without hunting for it in the inbox.
 *
 * It first asks whether this story already has a script. If it does, the
 * button reads "View script" and opens it in the same drawer the inbox uses,
 * rather than offering to spend a second call on a story already written.
 * Every story with a script also gets "Regenerate script", as in the inbox.
 *
 * News stories only. A saved rising post is a competitor's post, not a story
 * in source_items, and the script writer builds on stories; rising posts are
 * answered through "React to this" instead.
 */
export function NewsScriptActions({ item, onClosed }: { item: SavedTopic } & WriteActionOptions) {
  const queryClient = useQueryClient();
  const { platform, itemId: sourceId } = item;
  const scriptKey = ["script-for-source", platform, sourceId] as const;
  const [viewing, setViewing] = useState<ContentIdea | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: existing, isLoading } = useQuery({
    queryKey: scriptKey,
    queryFn: () => getScriptForSource({ data: { platform, sourceId } }),
    staleTime: 60 * 1000,
  });

  const write = useMutation({
    mutationFn: (regenerate: boolean) =>
      generateOneIdea({ data: { platform, sourceId, ...(regenerate ? { regenerate } : {}) } }),
    onMutate: () => setMessage(null),
    onSuccess: (result) => {
      if (result.analysis) {
        queryClient.setQueryData(analysisQueryOptions(platform).queryKey, result.analysis);
      }
      if (result.idea) {
        queryClient.setQueryData(scriptKey, result.idea);
        setViewing(result.idea);
      } else {
        setMessage(result.reason ?? "No script was written for this story.");
      }
      void queryClient.invalidateQueries({ queryKey: topicInboxQueryOptions(platform).queryKey });
    },
    onError: (error) =>
      setMessage(
        error instanceof Error ? error.message : "Could not write a script for this story.",
      ),
  });

  const regenerating = write.isPending && write.variables === true;

  return (
    <>
      {isLoading ? (
        <Button size="sm" variant="outline" className="gap-1.5" disabled>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Checking…
        </Button>
      ) : existing ? (
        <>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={write.isPending}
            onClick={() => setViewing(existing)}
          >
            <FileText className="size-3.5" aria-hidden />
            View script
          </Button>
          {
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={write.isPending}
              onClick={() => write.mutate(true)}
              title="Uses AI calls to write a new version with the current rules. The earlier version stays in history."
            >
              <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} aria-hidden />
              {regenerating ? "Regenerating…" : "Regenerate script"}
            </Button>
          }
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={write.isPending}
          onClick={() => write.mutate(false)}
          title="Uses AI calls: writes a script on this story in the account's proven structure"
        >
          {write.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-3.5" aria-hidden />
          )}
          {write.isPending ? "Writing…" : "Write script"}
        </Button>
      )}
      {message ? (
        <span className="basis-full whitespace-normal break-words text-xs text-destructive">
          {message}
        </span>
      ) : null}

      {viewing ? (
        <AiIdeaCards
          key={viewing.id}
          ideas={[viewing]}
          platform={platform}
          initialOpenId={viewing.id}
          panelOnly
          onClose={() => {
            setViewing(null);
            onClosed?.();
          }}
        />
      ) : null}
    </>
  );
}

/**
 * "Write script" for a saved RISING POST, which becomes a reaction-hook reel.
 *
 * A rising post is a competitor's reel, not a story in the news inbox, so it
 * goes through the reaction pipeline instead of the news one: the post is
 * stored as a source clip (the same row "React to this" creates, keyed on the
 * link so pressing either never makes a second copy), and the expert's answer
 * is written against the claim that post makes. One press does both, so the
 * shortlist does not send anyone to another screen to finish the job.
 *
 * The script is written in Pritesh's voice, from his own brief — the reaction
 * format keeps its own beats, measured expert timing and standard CTA, which
 * is what makes it a reaction rather than an explainer.
 */
export function ReactionScriptActions({
  item,
  onClosed,
}: { item: SavedTopic } & WriteActionOptions) {
  const queryClient = useQueryClient();
  const { platform } = item;
  const [viewing, setViewing] = useState<ContentIdea | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: reactions, isLoading } = useQuery(reactionsQueryOptions(platform));
  const { data: analysis } = useQuery(analysisQueryOptions(platform));

  // The clip, matched on the normalised link — the same key the store upserts
  // on, so a post saved here and a post added through "React to this" are one
  // clip, never two.
  const link = item.url ? normalizeSourceUrl(item.url) : null;
  const clipUrl = link?.ok ? link.url : item.url;
  const clip = clipUrl ? (reactions?.sources.find((s) => s.sourceUrl === clipUrl) ?? null) : null;
  // Whether a script exists at all, from the stored list; and the full script
  // to show, from the cached analysis. The first survives a cache refresh.
  const written = clip
    ? Boolean(reactions?.scripts?.some((entry) => entry.reaction.sourceId === clip.id))
    : false;
  const idea = clip
    ? (analysis?.ideas ?? []).find((entry) => entry.reaction?.sourceId === clip.id)
    : undefined;

  const write = useMutation({
    mutationFn: async () => {
      let clipId = clip?.id;
      if (!clipId) {
        if (!item.url) throw new Error("This saved post has no link to react to.");
        const created = await saveReactionClip({
          data: {
            platform,
            sourceUrl: item.url,
            sourceCreatorHandle: item.sourceLabel?.replace(/^@/, "") ?? null,
            // The team sets the real clip type on the card in Reaction hooks;
            // "other" is the honest default rather than a guess.
            sourceType: "other",
            // The post's opening line IS the claim being answered, exactly as
            // "React to this" stores it.
            ...(item.title.trim() ? { extractedClaim: item.title.trim().slice(0, 1000) } : {}),
            foundBy: "trend_listener",
          },
        });
        if ("reason" in created) throw new Error(created.reason);
        clipId = created.source.id;
      }
      return writeReactionScript({ data: clipId });
    },
    onMutate: () => setMessage(null),
    onSuccess: (result) => {
      if (result.idea) setViewing(result.idea);
      else setMessage(result.reason ?? "No reaction script was written for this post.");
      void queryClient.invalidateQueries({ queryKey: ["reactions", platform] });
      void queryClient.invalidateQueries({ queryKey: analysisQueryOptions(platform).queryKey });
    },
    onError: (error) =>
      setMessage(
        error instanceof Error ? error.message : "Could not write a reaction script for this post.",
      ),
  });

  return (
    <>
      {isLoading ? (
        <Button size="sm" variant="outline" className="gap-1.5" disabled>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Checking…
        </Button>
      ) : (
        <>
          {idea ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={write.isPending}
              onClick={() => setViewing(idea)}
            >
              <FileText className="size-3.5" aria-hidden />
              View script
            </Button>
          ) : written ? (
            // Written earlier, but no longer in the cached idea list. The clip
            // card on Reaction hooks always has it.
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <Link to="/reactions">
                <FileText className="size-3.5" aria-hidden />
                Open in Reaction hooks
              </Link>
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={write.isPending || !item.url}
            onClick={() => write.mutate()}
            title={
              item.url
                ? "Uses one AI call to write the expert's answer to this post, in Pritesh's voice"
                : "This saved post has no link to react to"
            }
          >
            {write.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : written || idea ? (
              <RefreshCw className="size-3.5" aria-hidden />
            ) : (
              <Sparkles className="size-3.5" aria-hidden />
            )}
            {write.isPending
              ? written || idea
                ? "Regenerating…"
                : "Writing…"
              : written || idea
                ? "Regenerate script"
                : "Write script"}
          </Button>
        </>
      )}
      {message ? (
        <span className="basis-full whitespace-normal break-words text-xs text-destructive">
          {message}
        </span>
      ) : null}

      {viewing ? (
        <AiIdeaCards
          key={viewing.id}
          ideas={[viewing]}
          platform={platform}
          initialOpenId={viewing.id}
          panelOnly
          onClose={() => {
            setViewing(null);
            onClosed?.();
          }}
        />
      ) : null}
    </>
  );
}
