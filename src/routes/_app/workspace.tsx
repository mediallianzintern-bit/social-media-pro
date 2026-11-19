// To do (19 Nov 2026): the team's board, as lib/todo-types.ts describes it.
//
// Growth manager: the ticked and saved topics still to write, scripts written
// but not sent, what each editor has, what is ready to post, and what was
// published. Content editor: only the scripts sent to them. Admin: who has
// what, and the team. Nothing here changes how the rest of the dashboard
// works: it reads the same topics, ticks, saves and scripts, and "Mark
// completed" and "I filmed this" are the same call as on the account pages.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bookmark,
  Check,
  CheckCircle2,
  Clapperboard,
  FileText,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { useState } from "react";

import { AiIdeaCards } from "@/components/dashboard/ai-idea-cards";
import {
  LinkedInPieceActions,
  NewsScriptActions,
  ReactionScriptActions,
} from "@/components/dashboard/saved-topics";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dismissIdea, setTeamRole, teamQueryOptions } from "@/lib/analytics.functions";
import { dayMonth } from "@/lib/date-range";
import { PLATFORM_META } from "@/lib/platform-meta";
import { markFilmed } from "@/lib/reel-learning.functions";
import { ASSIGNABLE_ROLES, ROLE_LABEL, type Role } from "@/lib/roles";
import {
  TODO_LENSES,
  type TodoBoard,
  type TodoLens,
  type TodoPiece,
  type TodoTopic,
} from "@/lib/todo-types";
import { markScriptDone, sendScriptToEditor, todoQueryOptions } from "@/lib/todo.functions";
import { cn } from "@/lib/utils";
import type { Access, TeamMember } from "@/lib/workspace-types";

export const Route = createFileRoute("/_app/workspace")({ component: TodoPage });

const PAGE = 20;

const KIND_LABEL: Record<TodoPiece["kind"], string> = {
  reel: "Reel script",
  post: "LinkedIn post",
  article: "LinkedIn article",
};

function TodoPage() {
  // Asks for the last view chosen; the server answers with one this person holds.
  const [wanted, setWanted] = useState<TodoLens>("growth_manager");
  const { data, isLoading } = useQuery(todoQueryOptions(wanted));
  const lens = data?.lens ?? wanted;
  const held = TODO_LENSES.filter((option) => data?.access.roles.includes(option));

  return (
    <div className="space-y-4">
      {held.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="View as">
          {held.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={option === lens ? "default" : "outline"}
              aria-pressed={option === lens}
              onClick={() => setWanted(option)}
            >
              {ROLE_LABEL[option]}
            </Button>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isLoading || !data ? "Loading…" : headline(data)}
          </CardTitle>
          <CardDescription>{explainer(lens)}</CardDescription>
        </CardHeader>
      </Card>

      {isLoading || !data ? (
        <Card>
          <CardContent className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </CardContent>
        </Card>
      ) : lens === "editor" ? (
        <EditorBoard board={data} />
      ) : lens === "team_manager" ? (
        <AdminBoard board={data} />
      ) : (
        <GrowthBoard board={data} />
      )}
    </div>
  );
}

function headline(board: TodoBoard): string {
  if (board.lens === "editor") {
    const n = board.withEditor.length;
    return n ? `${n} script${n === 1 ? "" : "s"} sent to you.` : "Nothing sent to you right now.";
  }
  const parts = [
    `${board.toWrite.length} topic${board.toWrite.length === 1 ? "" : "s"} to write`,
    `${board.written.length} script${board.written.length === 1 ? "" : "s"} to send`,
    `${board.withEditor.length} with an editor`,
    `${board.ready.length} ready to post`,
  ];
  return `${parts.join(" · ")}.`;
}

function explainer(lens: TodoLens): string {
  if (lens === "editor") {
    return "The scripts the growth manager sent you. Open one, work on it, and mark it done: it goes back to the growth manager to post.";
  }
  if (lens === "team_manager") {
    return "Who has what, across the whole flow, and the team.";
  }
  return "Topics anyone ticked or saved come here. Write the script, send it to an editor, and mark it completed once it is posted. I filmed this, here or on any page, moves it straight to Published.";
}

// ---------------------------------------------------------------------------
// Growth manager
// ---------------------------------------------------------------------------

type GrowthTab = "toWrite" | "written" | "withEditor" | "ready" | "published";
type PlatformFilter = "all" | TodoPiece["platform"];

const GROWTH_TABS: Array<{ id: GrowthTab; label: string }> = [
  { id: "toWrite", label: "To write" },
  { id: "written", label: "To send" },
  { id: "withEditor", label: "With editors" },
  { id: "ready", label: "Ready to post" },
  { id: "published", label: "Published" },
];

/** Opens on the step that needs the growth manager first: posting what the
 * editor finished, then sending what is written, then writing. */
function firstTab(board: TodoBoard): GrowthTab {
  if (board.ready.length) return "ready";
  if (board.written.length) return "written";
  return "toWrite";
}

function GrowthBoard({ board }: { board: TodoBoard }) {
  const [chosen, setChosen] = useState<GrowthTab | null>(null);
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const tab = chosen ?? firstTab(board);

  const onPlatform = <T extends { platform: TodoPiece["platform"] }>(list: T[]) =>
    platform === "all" ? list : list.filter((entry) => entry.platform === platform);
  // Saved first: those were picked on purpose. Newest first within each.
  const topics = onPlatform(board.toWrite)
    .filter((topic) => !savedOnly || topic.saved)
    .sort((a, b) => Number(b.saved) - Number(a.saved));
  const lists: Record<Exclude<GrowthTab, "toWrite">, TodoPiece[]> = {
    written: onPlatform(board.written),
    withEditor: onPlatform(board.withEditor),
    ready: onPlatform(board.ready),
    published: onPlatform(board.published),
  };
  const count = (id: GrowthTab) => (id === "toWrite" ? topics.length : lists[id].length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Stage">
        {GROWTH_TABS.map(({ id, label }) => {
          const active = id === tab;
          const n = count(id);
          return (
            <Button
              key={id}
              role="tab"
              aria-selected={active}
              size="sm"
              variant={active ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => setChosen(id)}
            >
              {label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                  !active && n > 0 && id === "ready" && "bg-primary text-primary-foreground",
                )}
              >
                {n}
              </span>
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter">
        {(["all", "instagram", "linkedin"] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={platform === value ? "secondary" : "ghost"}
            className="h-8 gap-1.5"
            aria-pressed={platform === value}
            onClick={() => setPlatform(value)}
          >
            {value === "all" ? null : <PlatformIcon platform={value} className="size-3.5" />}
            {value === "all" ? "Both accounts" : PLATFORM_META[value].label}
          </Button>
        ))}
        {tab === "toWrite" ? (
          <Button
            size="sm"
            variant={savedOnly ? "secondary" : "ghost"}
            className="h-8 gap-1.5"
            aria-pressed={savedOnly}
            onClick={() => setSavedOnly((on) => !on)}
          >
            <Bookmark className="size-3.5" aria-hidden />
            Saved only
          </Button>
        ) : null}
      </div>

      {tab === "toWrite" ? (
        <Section
          key={`toWrite:${platform}:${savedOnly}`}
          note="Saved topics first, then ticks from the last 3 days. Write one and it moves to To send."
          empty={
            savedOnly
              ? "No saved topic left to write."
              : "Nothing to write. Tick or save a topic on Trends or an account page and it appears here."
          }
          list
        >
          {topics.map((topic) => (
            <TopicRow key={`${topic.platform}:${topic.kind}:${topic.itemId}`} topic={topic} />
          ))}
        </Section>
      ) : (
        <Section key={`${tab}:${platform}`} note={TAB_NOTE[tab]} empty={TAB_EMPTY[tab]}>
          {lists[tab].map((piece) => (
            <PieceCard key={piece.idea.id} piece={piece} board={board} />
          ))}
        </Section>
      )}
    </div>
  );
}

const TAB_NOTE: Record<Exclude<GrowthTab, "toWrite">, string> = {
  written: "Written in the last 14 days. Pick an editor and send it.",
  withEditor: "Sent to an editor, not marked done yet.",
  ready: "Done by the editor. Post it, then mark it completed.",
  published: "The last 30 days.",
};

const TAB_EMPTY: Record<Exclude<GrowthTab, "toWrite">, string> = {
  written: "No script waiting to be sent.",
  withEditor: "Nothing with an editor.",
  ready: "Nothing ready to post.",
  published: "Nothing published in the last 30 days.",
};

// ---------------------------------------------------------------------------
// Content editor
// ---------------------------------------------------------------------------

function EditorBoard({ board }: { board: TodoBoard }) {
  return (
    <>
      <Section
        title="Sent to you"
        note={`${board.withEditor.length} script${board.withEditor.length === 1 ? "" : "s"}`}
        empty="Nothing sent to you. Scripts appear here when the growth manager sends them."
      >
        {board.withEditor.map((piece) => (
          <PieceCard key={piece.idea.id} piece={piece} board={board} />
        ))}
      </Section>
      <Section
        title="Done, waiting to be posted"
        note="Back with the growth manager"
        empty="Nothing waiting to be posted."
      >
        {board.ready.map((piece) => (
          <PieceCard key={piece.idea.id} piece={piece} board={board} />
        ))}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

function AdminBoard({ board }: { board: TodoBoard }) {
  const nameOf = (id: string | null) =>
    board.team.find((member) => member.id === id)?.name ?? "Not sent to anyone";
  const byEditor = new Map<string, number>();
  for (const piece of board.withEditor) {
    const name = nameOf(piece.assignedTo);
    byEditor.set(name, (byEditor.get(name) ?? 0) + 1);
  }
  const counts: Array<[string, number]> = [
    ["To write", board.toWrite.length],
    ["Written, not sent", board.written.length],
    ["With an editor", board.withEditor.length],
    ["Ready to post", board.ready.length],
    ["Published, 30 days", board.published.length],
  ];
  return (
    <>
      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-5">
          {counts.map(([label, value]) => (
            <div key={label}>
              <p className="text-2xl font-semibold tabular-nums">{value}</p>
              <p className="text-[13px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      {byEditor.size ? (
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-sm font-semibold">With each editor</p>
            <ul className="space-y-1 text-sm">
              {[...byEditor].map(([name, count]) => (
                <li key={name} className="flex justify-between gap-3">
                  <span>{name}</span>
                  <span className="tabular-nums text-muted-foreground">{count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <TeamPanel access={board.access} team={board.team} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function Section({
  title,
  note,
  empty,
  list = false,
  children,
}: {
  title?: string;
  note: string;
  empty: string;
  /** Compact rows in one bordered list, rather than a stack of cards. */
  list?: boolean;
  children: React.ReactNode[];
}) {
  // Twenty at a time: To write can hold a few hundred.
  const [shown, setShown] = useState(PAGE);
  const more =
    children.length > shown ? (
      <Button variant="outline" className="h-11" onClick={() => setShown((n) => n + PAGE)}>
        Show {Math.min(PAGE, children.length - shown)} more of {children.length - shown}
      </Button>
    ) : null;
  return (
    <section className="space-y-3">
      {title ? (
        <SectionHeading title={title} note={note} />
      ) : (
        <p className="text-[13px] text-muted-foreground">{note}</p>
      )}
      {!children.length ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{empty}</p>
      ) : list ? (
        <div className="space-y-3">
          <ul className="divide-y rounded-lg border bg-card">{children.slice(0, shown)}</ul>
          {more}
        </div>
      ) : (
        <div className="space-y-3">
          {children.slice(0, shown)}
          {more}
        </div>
      )}
    </section>
  );
}

function PlatformIcon({
  platform,
  className,
}: {
  platform: TodoPiece["platform"];
  className?: string;
}) {
  const meta = PLATFORM_META[platform];
  return <meta.icon className={className} style={{ color: meta.color }} aria-hidden />;
}

function PlatformBadge({ platform }: { platform: TodoPiece["platform"] }) {
  const meta = PLATFORM_META[platform];
  return (
    <Badge variant="outline" className="gap-1 font-medium" style={{ color: meta.color }}>
      <meta.icon className="size-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}

/** A ticked or saved topic, one line: the same write call as the Saved page,
 * behind a single Write button. Once written it moves to To send. */
function TopicRow({ topic }: { topic: TodoTopic }) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["todo"] });
  const meta = PLATFORM_META[topic.platform];
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <PlatformIcon platform={topic.platform} className="mt-0.5 size-4 shrink-0" />
        <span className="sr-only">{meta.label}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {topic.saved ? (
              <Badge
                variant="outline"
                className="shrink-0 gap-1 px-1.5 py-0 text-[11px] font-medium"
              >
                <Bookmark className="size-3" aria-hidden />
                Saved
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="shrink-0 gap-1 px-1.5 py-0 text-[11px] font-normal text-emerald-700 dark:text-emerald-400"
              >
                <Check className="size-3" aria-hidden />
                Ticked
              </Badge>
            )}
            {topic.kind === "trend" ? (
              <Badge
                variant="outline"
                className="shrink-0 gap-1 px-1.5 py-0 text-[11px] font-normal"
              >
                <Clapperboard className="size-3" aria-hidden />
                Rising post
              </Badge>
            ) : null}
            {topic.url ? (
              <a
                href={topic.url}
                target="_blank"
                rel="noreferrer noopener"
                className="truncate text-sm font-medium hover:underline"
                title={topic.title}
              >
                {topic.title}
              </a>
            ) : (
              <p className="truncate text-sm font-medium" title={topic.title}>
                {topic.title}
              </p>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {topic.sourceLabel ? `${topic.sourceLabel} · ` : ""}
            {topic.saved ? "saved" : "ticked"} {dayMonth(new Date(topic.createdAt))}
            {topic.actor ? ` by ${topic.actor}` : ""}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-6 sm:pl-0">
        {topic.kind === "trend" ? (
          <ReactionScriptActions item={topic} onClosed={refresh} />
        ) : topic.platform === "linkedin" ? (
          <LinkedInPieceActions item={topic} compact onClosed={refresh} />
        ) : (
          <NewsScriptActions item={topic} onClosed={refresh} />
        )}
      </div>
    </li>
  );
}

function PieceCard({ piece, board }: { piece: TodoPiece; board: TodoBoard }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editorId, setEditorId] = useState(piece.assignedTo ?? board.editors[0]?.id ?? "");
  const [failure, setFailure] = useState<string | null>(null);
  const { idea, stage, platform } = piece;
  const growth = board.lens !== "editor";
  const editorName = board.team.find((member) => member.id === piece.assignedTo)?.name ?? null;

  const settle = async (result?: { ok: boolean; reason?: string }) => {
    if (result && !result.ok) {
      setFailure(result.reason ?? "That was refused.");
      return;
    }
    setFailure(null);
    await queryClient.invalidateQueries({ queryKey: ["todo"] });
  };
  const onError = (error: unknown) =>
    setFailure(error instanceof Error ? error.message : String(error));

  const send = useMutation({
    mutationFn: () => sendScriptToEditor({ data: { ideaId: idea.id, editorId } }),
    onSuccess: settle,
    onError,
  });
  const done = useMutation({
    mutationFn: () => markScriptDone({ data: { ideaId: idea.id } }),
    onSuccess: settle,
    onError,
  });
  // The same call as "I filmed this" on the account pages.
  const filmed = useMutation({
    mutationFn: () => markFilmed({ data: { ideaId: idea.id, platform } }),
    onSuccess: () => settle(),
    onError,
  });
  const dismiss = useMutation({
    mutationFn: () => dismissIdea({ data: { ideaId: idea.id } }),
    onSuccess: () => settle(),
    onError,
  });
  const busy = send.isPending || done.isPending || filmed.isPending || dismiss.isPending;
  const opening = (idea.post?.body ?? idea.hook ?? "").split("\n").find((line) => line.trim());

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <PlatformBadge platform={platform} />
          <Badge
            variant="outline"
            className={cn(
              "font-semibold",
              piece.kind === "article" &&
                "border-orange-300 text-orange-800 dark:border-orange-900 dark:text-orange-300",
            )}
          >
            {KIND_LABEL[piece.kind]}
          </Badge>
          {idea.contentLane ? (
            <span className="text-xs text-muted-foreground">{idea.contentLane}</span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            · {dayMonth(new Date(piece.updatedAt))}
          </span>
          {stage === "with_editor" || stage === "ready" ? (
            <span className="text-xs text-muted-foreground">
              · {editorName ? `with ${editorName}` : "not sent to anyone"}
            </span>
          ) : null}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-semibold leading-snug">{idea.title}</p>
          {opening && opening !== idea.title ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{opening}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
            <FileText className="size-3.5" aria-hidden />
            Open the script
          </Button>

          {growth && (stage === "written" || stage === "with_editor") ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={editorId}
                disabled={busy || !board.editors.length}
                onChange={(event) => setEditorId(event.target.value)}
                aria-label="Editor to send it to"
              >
                {board.editors.length ? null : <option value="">No content editors yet</option>}
                {board.editors.map((editor) => (
                  <option key={editor.id} value={editor.id}>
                    {editor.name} · {ROLE_LABEL[editor.role].toLowerCase()}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={
                  busy || !editorId || (stage === "with_editor" && editorId === piece.assignedTo)
                }
                onClick={() => send.mutate()}
              >
                {send.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Send className="size-3.5" aria-hidden />
                )}
                {stage === "with_editor" ? "Send to this editor instead" : "Send to editor"}
              </Button>
            </span>
          ) : null}

          {!growth && stage === "with_editor" ? (
            <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => done.mutate()}>
              {done.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="size-3.5" aria-hidden />
              )}
              Mark done
            </Button>
          ) : null}

          {growth && stage === "ready" ? (
            <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => filmed.mutate()}>
              {filmed.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="size-3.5" aria-hidden />
              )}
              Mark completed
            </Button>
          ) : null}

          {growth && (stage === "written" || stage === "with_editor") ? (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              disabled={busy}
              onClick={() => filmed.mutate()}
              title="Already posted? It moves straight to Published, as I filmed this does on any page."
            >
              <Clapperboard className="size-3.5" aria-hidden />
              {platform === "instagram" ? "I filmed this" : "I posted this"}
            </Button>
          ) : null}

          {growth && stage === "written" ? (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              disabled={busy}
              onClick={() => dismiss.mutate()}
            >
              <X className="size-3.5" aria-hidden />
              Dismiss
            </Button>
          ) : null}

          {stage === "published" ? (
            <span className="text-xs text-muted-foreground">
              {idea.publishedShortcode
                ? "Published, and linked to its post"
                : piece.filmed
                  ? `Marked ${platform === "instagram" ? "filmed" : "posted"}; the live post is found after the next refresh`
                  : "Published"}
            </span>
          ) : null}
        </div>

        {failure ? <p className="text-xs text-destructive">{failure}</p> : null}
      </CardContent>

      {open ? (
        <AiIdeaCards
          key={idea.id}
          ideas={[idea]}
          platform={platform}
          initialOpenId={idea.id}
          panelOnly
          onClose={() => {
            setOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["todo"] });
          }}
        />
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// T46 — the team, in the admin view
// ---------------------------------------------------------------------------

function TeamPanel({ access, team }: { access: Access; team: TeamMember[] }) {
  return (
    <>
      <SectionHeading
        title="Team and permissions"
        note={access.canManageTeam ? "You can change what someone is allowed to do" : ""}
      />
      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">
            A growth manager writes scripts from the ticked and saved topics and sends each to a
            content editor; the editor marks it done; the growth manager posts it. An admin can do
            all of it and sets roles. Everyone who can sign in is listed.
          </p>
          <ul className="divide-y rounded-md border">
            {team.map((member) => (
              <TeamRow key={member.id} member={member} canManage={access.canManageTeam} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

function TeamRow({ member, canManage }: { member: TeamMember; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: (role: Role) => setTeamRole({ data: { userId: member.id, role } }),
    onSuccess: async (result) => {
      setReason(result.ok ? null : (result.reason ?? "That change was refused."));
      if (result.ok) {
        await queryClient.invalidateQueries({ queryKey: ["todo"] });
        await queryClient.invalidateQueries({ queryKey: teamQueryOptions.queryKey });
      }
    },
    onError: (error) => setReason(error instanceof Error ? error.message : String(error)),
  });
  const options = ASSIGNABLE_ROLES.includes(member.role)
    ? ASSIGNABLE_ROLES
    : [...ASSIGNABLE_ROLES, member.role];

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {member.name}
          {member.isYou ? <span className="ml-2 text-xs text-muted-foreground">you</span> : null}
        </p>
        {member.email ? (
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        ) : null}
        {reason ? <p className="mt-1 text-xs text-destructive">{reason}</p> : null}
      </div>
      {canManage ? (
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={member.role}
          disabled={change.isPending}
          onChange={(event) => change.mutate(event.target.value as Role)}
          aria-label={`Role for ${member.name}`}
        >
          {options.map((role) => (
            <option key={role} value={role} disabled={!ASSIGNABLE_ROLES.includes(role)}>
              {ROLE_LABEL[role]}
              {ASSIGNABLE_ROLES.includes(role) ? "" : " (no longer offered)"}
            </option>
          ))}
        </select>
      ) : (
        <Badge variant="outline" className="font-normal">
          {ROLE_LABEL[member.role]}
        </Badge>
      )}
    </li>
  );
}
