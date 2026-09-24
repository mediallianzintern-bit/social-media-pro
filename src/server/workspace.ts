// Addendum B — the role workspace: queues, the daily hook, and the transitions
// that move work along.
//
// The lifecycle is what turns this from a report into a place where work
// happens, and B.3 notes the side benefit: the transitions ARE the learning
// loop's signal. Marking something published is not an extra step bolted on for
// the analytics — it is the creator's normal action, and the link between
// suggestion and outcome falls out of it for free.
import { readQueue, readUsers, transitionIdea } from "./store";
import { canTransitionAny, QUEUE_STATUS, type IdeaStatus, type Role } from "@/lib/roles";
import { readAssignments, readClient } from "./store";
import type { DailyHook, WorkItem, Workspace } from "@/lib/workspace-types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days since the item last moved — created, approved, or put into production. */
function ageOf(item: {
  createdAt: string;
  approvedAt: string | null;
  productionAt: string | null;
}): number {
  const stamps = [item.productionAt, item.approvedAt, item.createdAt]
    .filter((iso): iso is string => Boolean(iso))
    .map((iso) => new Date(iso).getTime())
    .filter((t) => Number.isFinite(t));
  if (!stamps.length) return 0;
  return Math.max(0, Math.floor((Date.now() - Math.max(...stamps)) / DAY_MS));
}

/**
 * B.4 — what is waiting on this person today.
 *
 * Says "nothing waiting" when nothing is waiting. A daily hook that manufactures
 * a reason to log in trains people to ignore it, which costs more than the
 * empty state does.
 */
function dailyHook(role: Role, items: WorkItem[]): DailyHook {
  const waiting = items.length;
  const newSinceYesterday = items.filter((item) => item.ageDays <= 1).length;
  const oldestDays = waiting ? Math.max(...items.map((item) => item.ageDays)) : null;

  // Singular and plural are stored as a pair rather than built by appending
  // "s": "item in flight" pluralises in the middle, and "item in flights" is
  // the kind of thing a reader notices every single day.
  const NOUN: Record<Role, [string, string]> = {
    growth_manager: ["idea to review", "ideas to review"],
    creator: ["idea to make", "ideas to make"],
    editor: ["script to cut", "scripts to cut"],
    team_manager: ["item in flight", "items in flight"],
  };

  let headline: string;
  if (!waiting) {
    headline =
      role === "growth_manager"
        ? "Nothing to review. New ideas appear here after a generation."
        : role === "creator"
          ? "Nothing approved for you yet."
          : role === "editor"
            ? "Nothing ready to edit."
            : "Nothing in flight.";
  } else {
    headline = `${waiting} ${waiting === 1 ? NOUN[role][0] : NOUN[role][1]}`;
    if (newSinceYesterday) headline += `, ${newSinceYesterday} since yesterday`;
    // Naming the oldest is what stops a queue quietly rotting.
    if (oldestDays != null && oldestDays >= 3) headline += `. Oldest has waited ${oldestDays} days`;
    headline += ".";
  }

  return { waiting, newSinceYesterday, oldestDays, headline };
}

export async function loadWorkspace(role: Role): Promise<Workspace> {
  const [rows, users] = await Promise.all([
    readQueue(QUEUE_STATUS[role]).catch(() => []),
    readUsers().catch(() => []),
  ]);

  const items: WorkItem[] = rows.map((row) => ({
    id: row.id,
    platform: row.platform,
    hook: row.hook,
    whyNow: row.whyNow,
    winningTrait: row.winningTrait,
    contentLane: row.contentLane,
    sourceSignal: row.sourceSignal,
    status: row.status,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    productionAt: row.productionAt,
    publishedShortcode: row.publishedShortcode,
    ageDays: ageOf(row),
  }));

  const workspace: Workspace = {
    role,
    items,
    today: dailyHook(role, items),
    noUsers: users.length === 0,
  };

  if (role === "team_manager") {
    const counts = new Map<IdeaStatus, number>();
    for (const item of items) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);

    const published = items.filter(
      (item) => item.status === "used" || item.status === "published" || item.status === "measured",
    ).length;

    workspace.rollup = {
      byStatus: [...counts.entries()].map(([status, count]) => ({ status, count })),
      // Adoption is what the manager is actually watching: of everything we
      // suggested, how much got made. A system whose ideas are never filmed is
      // failing regardless of how good the analysis looks.
      adoptionPct: items.length ? Math.round((published / items.length) * 100) : 0,
      suggested: items.length,
      published,
    };
  }

  return workspace;
}

/**
 * Advances one item, enforcing role ownership server-side (B.7/B.8.1).
 *
 * Two refusals are possible and they mean different things, so they are
 * reported separately: the role is not allowed to make this move, or the item
 * was not in the state the caller thought. The second is a race, not a
 * permission problem, and telling a person "not allowed" when someone else
 * simply got there first would send them looking for the wrong fix.
 */
export async function advance(input: {
  id: string;
  from: string;
  to: string;
  role: Role;
  // `| undefined` explicitly: exactOptionalPropertyTypes is on, and a validated
  // payload with an absent optional field carries undefined, not nothing.
  actorId?: string | undefined;
  shortcode?: string | undefined;
}): Promise<{ ok: boolean; reason?: string }> {
  const from = input.from as IdeaStatus;
  const to = input.to as IdeaStatus;

  // Which roles this person ACTUALLY holds, rather than the one they claimed.
  //
  // Without this the role is just a parameter the caller sets, and the whole
  // permission model is advisory. An actor with no assignments falls back to
  // the claimed role, which keeps the single-user setup working before anyone
  // has been added to the team.
  let roles: Role[] = [input.role];
  if (input.actorId) {
    const assigned = await readAssignments(input.actorId).catch(() => []);
    if (assigned.length) {
      roles = assigned.map((entry) => entry.role);
      if (!roles.includes(input.role)) {
        return {
          ok: false,
          reason: `You are not assigned to this client as a ${input.role.replace(/_/g, " ")}.`,
        };
      }
    }
  }

  if (!canTransitionAny(roles, from, to)) {
    return {
      ok: false,
      reason: `A ${input.role.replace(/_/g, " ")} cannot move an idea from ${from} to ${to}.`,
    };
  }

  try {
    const moved = await transitionIdea(input.id, from, to, input.actorId ?? null, {
      ...(input.shortcode ? { shortcode: input.shortcode } : {}),
    });
    return moved
      ? { ok: true }
      : { ok: false, reason: "Someone else moved this first — reload to see where it is now." };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
