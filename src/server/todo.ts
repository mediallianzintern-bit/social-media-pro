// The To do board and its three moves (19 Nov 2026; lib/todo-types.ts has the
// flow). Free: stored rows only, no model call. Every move is checked against
// the signed-in person's roles here, whatever the screen shows.
import type { ContentIdea } from "@/lib/ai-types";
import { PLATFORM_IDS, type PlatformId } from "@/lib/analytics-types";
import { normalizeSourceUrl } from "@/lib/reaction";
import type { IdeaStatus, Role } from "@/lib/roles";
import type { TodoBoard, TodoLens, TodoPiece, TodoStage, TodoTopic } from "@/lib/todo-types";
// Scoped: client-owned tables are read and written as the request's client.
import { supabaseAdmin } from "@/server/tenant/db";

import { readAllReelLearning } from "./reel-learning/store";
import {
  assignIdea,
  hasDurableStore,
  readReactionSources,
  readSavedTopics,
  readTopicVotes,
  readUsers,
  transitionIdea,
} from "./store";
import { accessFor, syncTeamFromLogins } from "./workspace";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

const DAY_MS = 86_400_000;
const PUBLISHED_DAYS = 30;
/** A ticked topic stays in To write this long; a saved one until it is written. */
const TICK_DAYS = 3;
/** A written script waits to be sent this long, then leaves To do (the news moves on). */
const WRITTEN_DAYS = 14;
const IN_CHUNK = 100;

interface IdeaRow {
  id: string;
  status: IdeaStatus;
  payload: ContentIdea | null;
  chosen_hook: string | null;
  published_shortcode: string | null;
  assigned_to: string | null;
  updated_at: string | null;
  created_at: string;
  reaction_source_id: string | null;
}

const IDEA_COLUMNS =
  "id,status,payload,chosen_hook,published_shortcode,assigned_to,updated_at,created_at,reaction_source_id";

async function ideasWhere(
  platform: PlatformId,
  column: string,
  values: string[],
): Promise<IdeaRow[]> {
  const rows: IdeaRow[] = [];
  for (let at = 0; at < values.length; at += IN_CHUNK) {
    const { data, error } = await db()
      .from("suggested_ideas")
      .select(IDEA_COLUMNS)
      .eq("platform", platform)
      .in(column, values.slice(at, at + IN_CHUNK));
    if (error) throw new Error(`To do ideas read failed: ${error.message}`);
    rows.push(...((data ?? []) as IdeaRow[]));
  }
  return rows;
}

const ideaOf = (row: IdeaRow): ContentIdea =>
  ({
    ...row.payload,
    id: row.id,
    status: row.status === "measured" ? "used" : row.status,
    publishedShortcode: row.published_shortcode ?? undefined,
    chosenHook: row.chosen_hook ?? undefined,
  }) as ContentIdea;

const kindOf = (idea: ContentIdea, platform: PlatformId): TodoPiece["kind"] =>
  platform === "instagram" ? "reel" : idea.format === "article" ? "article" : "post";

/** One account's part of the board. */
async function platformBoard(platform: PlatformId) {
  const [votes, saved, filmedRows, sources] = await Promise.all([
    readTopicVotes(platform).catch(() => []),
    readSavedTopics(platform).catch(() => []),
    readAllReelLearning(platform).catch(() => []),
    readReactionSources(platform).catch(() => []),
  ]);

  // The latest vote on each item counts (votes come newest first).
  const latest = new Map<string, "like" | "dislike">();
  const voteOf = new Map<string, (typeof votes)[number]>();
  for (const vote of votes) {
    const key = `${vote.kind}:${vote.itemId}`;
    if (!latest.has(key)) {
      latest.set(key, vote.verdict as "like" | "dislike");
      voteOf.set(key, vote);
    }
  }

  // Ticked or saved news stories and rising posts. A crossed topic is left
  // out unless someone also saved it.
  const topics = new Map<string, TodoTopic>();
  for (const item of saved) {
    if (item.kind !== "source" && item.kind !== "trend") continue;
    const key = `${item.kind}:${item.itemId}`;
    topics.set(key, { ...item, ticked: latest.get(key) === "like", saved: true });
  }
  // The team ticks a lot (184 topics in three days, 19 Nov 2026), so only
  // recent ticks reach To write; every tick still teaches the writer.
  const tickedSince = Date.now() - TICK_DAYS * DAY_MS;
  for (const [key, verdict] of latest) {
    if (verdict !== "like" || topics.has(key)) continue;
    const vote = voteOf.get(key)!;
    if (vote.kind !== "source" && vote.kind !== "trend") continue;
    if (Date.parse(vote.createdAt) < tickedSince) continue;
    topics.set(key, {
      kind: vote.kind,
      itemId: vote.itemId,
      platform,
      title: vote.text,
      url: vote.kind === "trend" ? vote.itemId : null,
      sourceLabel: null,
      lane: vote.lane ?? null,
      actor: vote.actor ?? null,
      createdAt: vote.createdAt,
      ticked: true,
      saved: false,
    });
  }

  // A rising post is answered through its reaction clip, found by its link.
  const clipOf = new Map(sources.map((source) => [source.sourceUrl, source.id]));
  const clipForTopic = (topic: TodoTopic) => {
    const link = topic.url ? normalizeSourceUrl(topic.url) : null;
    return link?.ok ? (clipOf.get(link.url) ?? null) : null;
  };

  const sourceIds = [...topics.values()].filter((t) => t.kind === "source").map((t) => t.itemId);
  const clipIds = [...topics.values()]
    .filter((t) => t.kind === "trend")
    .map(clipForTopic)
    .filter((id): id is string => Boolean(id));
  const likedIdeas = [...latest]
    .filter(([key, verdict]) => verdict === "like" && key.startsWith("idea:"))
    .map(([key]) => key.slice("idea:".length));

  // Every script from those topics, every ticked script, and everything
  // already moving through To do or marked filmed.
  const filmed = new Set(filmedRows.map((row) => row.ideaId));
  const [fromSources, fromClips, ticked, moving, filmedIdeas] = await Promise.all([
    ideasWhere(platform, "payload->source->>sourceId", sourceIds),
    ideasWhere(platform, "reaction_source_id", clipIds),
    ideasWhere(platform, "id", likedIdeas),
    ideasWhere(platform, "status", ["approved", "in_production"]),
    ideasWhere(platform, "id", [...filmed]),
  ]);
  const rows = new Map<string, IdeaRow>();
  for (const row of [...fromSources, ...fromClips, ...ticked, ...moving, ...filmedIdeas]) {
    if (row.payload) rows.set(row.id, row);
  }

  const pieces: TodoPiece[] = [];
  const writtenSources = new Set<string>();
  const writtenClips = new Set<string>();
  const since = Date.now() - PUBLISHED_DAYS * DAY_MS;
  for (const row of rows.values()) {
    if (row.status === "dismissed") continue;
    const idea = ideaOf(row);
    if (idea.source?.sourceId) writtenSources.add(idea.source.sourceId);
    if (row.reaction_source_id) writtenClips.add(row.reaction_source_id);
    const isFilmed = filmed.has(row.id);
    const stage: TodoStage =
      isFilmed || ["used", "published", "measured"].includes(row.status)
        ? "published"
        : row.status === "approved"
          ? "with_editor"
          : row.status === "in_production"
            ? "ready"
            : "written";
    const updatedAt = row.updated_at ?? row.created_at;
    if (stage === "published" && Date.parse(updatedAt) < since) continue;
    if (stage === "written" && Date.parse(updatedAt) < Date.now() - WRITTEN_DAYS * DAY_MS) {
      continue;
    }
    pieces.push({
      platform,
      idea,
      stage,
      kind: kindOf(idea, platform),
      assignedTo: row.assigned_to,
      updatedAt,
      filmed: isFilmed,
    });
  }

  const toWrite = [...topics.values()].filter((topic) =>
    topic.kind === "source"
      ? !writtenSources.has(topic.itemId)
      : !(clipForTopic(topic) && writtenClips.has(clipForTopic(topic)!)),
  );
  return { toWrite, pieces };
}

/** Which lens this person may have; an unheld one falls back to one they hold. */
function lensFor(wanted: TodoLens, roles: Role[]): TodoLens {
  if (roles.includes(wanted)) return wanted;
  if (roles.includes("growth_manager")) return "growth_manager";
  return "editor";
}

export async function loadTodo(staffEmail: string, wanted: TodoLens): Promise<TodoBoard> {
  const access = await accessFor(staffEmail);
  await syncTeamFromLogins();
  const lens = lensFor(wanted, access.roles);
  const users = await readUsers().catch(() => []);
  const team = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isYou: user.id === access.userId,
  }));
  const editors = users
    .filter((user) => user.role === "editor" || user.role === "team_manager")
    .map((user) => ({ id: user.id, name: user.name, role: user.role }));

  const empty: TodoBoard = {
    lens,
    access,
    team,
    editors,
    toWrite: [],
    written: [],
    withEditor: [],
    ready: [],
    published: [],
  };
  if (!hasDurableStore()) return empty;

  const parts = await Promise.all(PLATFORM_IDS.map((platform) => platformBoard(platform)));
  const newest = <T extends { updatedAt?: string; createdAt?: string }>(a: T, b: T) =>
    (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? "");
  const pieces = parts.flatMap((part) => part.pieces).sort(newest);
  const stage = (name: TodoStage) => pieces.filter((piece) => piece.stage === name);

  // An editor sees only what was sent to them; an admin sees every editor's.
  const mine = (piece: TodoPiece) =>
    access.roles.includes("team_manager") || piece.assignedTo === access.userId;

  if (lens === "editor") {
    return {
      ...empty,
      withEditor: stage("with_editor").filter(mine),
      ready: stage("ready").filter(mine),
    };
  }
  return {
    ...empty,
    toWrite: parts.flatMap((part) => part.toWrite).sort(newest),
    written: stage("written"),
    withEditor: stage("with_editor"),
    ready: stage("ready"),
    published: stage("published"),
  };
}

type MoveResult = { ok: boolean; reason?: string };

async function statusOf(
  ideaId: string,
): Promise<{ status: IdeaStatus; assignedTo: string | null } | null> {
  const { data } = await db()
    .from("suggested_ideas")
    .select("status,assigned_to")
    .eq("id", ideaId)
    .maybeSingle();
  return data ? { status: data.status as IdeaStatus, assignedTo: data.assigned_to ?? null } : null;
}

/** Growth manager: send a written script to one editor (or move it to another). */
export async function sendToEditor(input: {
  staffEmail: string;
  ideaId: string;
  editorId: string;
}): Promise<MoveResult> {
  const access = await accessFor(input.staffEmail);
  if (!access.roles.includes("growth_manager")) {
    return { ok: false, reason: "Only a growth manager or an admin sends scripts to an editor." };
  }
  const editor = (await readUsers().catch(() => [])).find((user) => user.id === input.editorId);
  if (!editor || (editor.role !== "editor" && editor.role !== "team_manager")) {
    return { ok: false, reason: "Pick a content editor to send it to." };
  }
  const current = await statusOf(input.ideaId);
  if (!current) return { ok: false, reason: "That script is no longer stored." };
  if (current.status === "suggested") {
    const moved = await transitionIdea(input.ideaId, "suggested", "approved", access.userId);
    if (!moved) return { ok: false, reason: "Someone moved this script first. Refresh." };
  } else if (current.status !== "approved") {
    return { ok: false, reason: "This script is past the editor already." };
  }
  await assignIdea(input.ideaId, input.editorId);
  return { ok: true };
}

/** Editor: the script is done; it goes back to the growth manager to post. */
export async function markEditorDone(input: {
  staffEmail: string;
  ideaId: string;
}): Promise<MoveResult> {
  const access = await accessFor(input.staffEmail);
  if (!access.roles.includes("editor")) {
    return { ok: false, reason: "Only a content editor or an admin marks a script done." };
  }
  const current = await statusOf(input.ideaId);
  if (!current) return { ok: false, reason: "That script is no longer stored." };
  if (current.status !== "approved") {
    return { ok: false, reason: "This script is not waiting on an editor any more. Refresh." };
  }
  if (current.assignedTo !== access.userId && !access.roles.includes("team_manager")) {
    return { ok: false, reason: "This script was sent to another editor." };
  }
  // Keeps the editor as the person it is with (store transitionIdea).
  const moved = await transitionIdea(input.ideaId, "approved", "in_production", access.userId);
  return moved ? { ok: true } : { ok: false, reason: "Someone moved this script first. Refresh." };
}
