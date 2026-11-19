// Addendum B — the role workspace: queues, the daily hook, and the transitions
// that move work along.
//
// The lifecycle is what turns this from a report into a place where work
// happens, and B.3 notes the side benefit: the transitions ARE the learning
// loop's signal. Marking something published is not an extra step bolted on for
// the analytics — it is the creator's normal action, and the link between
// suggestion and outcome falls out of it for free.
import {
  countUsersWithRole,
  readIdeaFormat,
  readQueue,
  readReactionSource,
  readUserByEmail,
  hasDurableStore,
  readUsers,
  resolveStaffUser,
  setUserRole,
  transitionIdea,
} from "./store";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isAllowedEmail } from "@/lib/auth";
import { approvalBlockers, productionBlockers } from "@/lib/reaction";
import {
  canTransitionAny,
  QUEUE_STATUS,
  ROLE_LABEL,
  ASSIGNABLE_ROLES,
  type IdeaStatus,
  type Role,
  ROLE_ORDER,
} from "@/lib/roles";
import { readAssignments, readClient } from "./store";
import type { Access, DailyHook, TeamMember, WorkItem, Workspace } from "@/lib/workspace-types";

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

/**
 * T46 — who this request is from, and what they actually hold.
 *
 * Built from the verified session email alone. Nothing the browser sends is
 * consulted, which is the whole point: before this, the role was a parameter
 * the caller set, so the permission model only described what the screens
 * chose to hide.
 *
 * A person's roles come from their client assignments where they have any —
 * someone can be a creator on one account and an editor on another — and
 * otherwise from their one row in the team table. The row is created on first
 * sight, so a new colleague is a creator from their first click rather than
 * whatever the role switcher happened to be set to.
 */
export async function accessFor(staffEmail: string): Promise<Access> {
  const email = staffEmail.trim().toLowerCase();
  const fallback: Access = {
    userId: null,
    name: email.split("@")[0] ?? "You",
    email,
    roles: ["creator"],
    canManageTeam: false,
    isFounder: false,
  };
  if (!email) return fallback;

  const existing = await readUserByEmail(email).catch(() => null);
  const userId = existing?.id ?? (await resolveStaffUser(email).catch(() => null));
  if (!userId) return fallback;

  const user = existing ?? (await readUserByEmail(email).catch(() => null));
  const assigned = await readAssignments(userId).catch(() => []);
  const given = assigned.length
    ? [...new Set(assigned.map((entry) => entry.role))]
    : [user?.role ?? "creator"];
  // An admin can do everything (Settings says so, 18 Nov 2026): every role,
  // admin first. Before this an admin with no account roles could see the
  // whole queue but not approve, dismiss or publish anything in it.
  const roles: Role[] = given.includes("team_manager") ? [...ROLE_ORDER] : given;

  return {
    userId,
    name: user?.name || (email.split("@")[0] ?? "You"),
    email,
    roles,
    canManageTeam: roles.includes("team_manager"),
    // Said once, on the screen, so the first person understands why they hold
    // the keys: there was nobody to grant them.
    isFounder: roles.includes("team_manager") && (await countUsersWithRole("team_manager")) === 1,
  };
}

/**
 * Changes what one person may do. Team managers only.
 *
 * Refuses to demote the last team manager. A team with none cannot grant a
 * role to anybody ever again, and recovering from that means someone editing
 * the database by hand — so the one move that creates it is blocked here.
 */
export async function changeRole(input: {
  staffEmail: string;
  userId: string;
  role: Role;
}): Promise<{ ok: boolean; reason?: string }> {
  const access = await accessFor(input.staffEmail);
  if (!access.canManageTeam) {
    return { ok: false, reason: "Only an admin can change what someone is allowed to do." };
  }

  const people = await readUsers().catch(() => []);
  const target = people.find((person) => person.id === input.userId);
  if (!target) return { ok: false, reason: "That person is no longer on the team." };
  if (target.role === input.role) return { ok: true };
  if (!ASSIGNABLE_ROLES.includes(input.role)) {
    return { ok: false, reason: "Choose Admin, Growth manager or Content editor." };
  }

  if (target.role === "team_manager" && input.role !== "team_manager") {
    const managers = people.filter((person) => person.role === "team_manager").length;
    if (managers <= 1) {
      return {
        ok: false,
        reason:
          "This is the only admin. Make someone else an admin first, or nobody will be able to change roles again.",
      };
    }
  }

  const changed = await setUserRole(input.userId, input.role);
  return changed
    ? { ok: true }
    : { ok: false, reason: "That change did not save — reload and try again." };
}

/** Cards shown on the To do page; the counts cover every item. */
const QUEUE_SHOWN = 60;
// Supabase returns at most 1,000 rows a request.
const QUEUE_READ_LIMIT = 1000;

/**
 * The queue for one role, plus who the reader is and what they may do.
 *
 * The role asked for is a LENS, and an unheld one is refused rather than
 * quietly swapped: a creator asking for the team manager's roll-up should be
 * told no, not shown a different screen and left wondering.
 */
/**
 * Everyone who can sign in is on the team (19 Nov 2026). A person used to get
 * a row only when they opened To do or Settings themselves, so colleagues who
 * signed in elsewhere (sahil@, kamalp@, tprakash@) never appeared and could
 * not be given a role. Each @mediallianz.com login without a row gets one, as
 * a content creator (store roleForNewUser), and keeps whatever role is set
 * after. Never fatal: the team shows as stored when the login list is not
 * readable.
 */
export async function syncTeamFromLogins(): Promise<void> {
  if (!hasDurableStore()) return;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const known = new Set(
      (await readUsers().catch(() => [])).map((user) => user.email?.toLowerCase()),
    );
    const missing = (data?.users ?? [])
      .map((user) => user.email?.trim().toLowerCase() ?? "")
      .filter((email) => email && isAllowedEmail(email) && !known.has(email));
    await Promise.all(missing.map((email) => resolveStaffUser(email).catch(() => null)));
  } catch (error) {
    console.warn("[team] logins not read; the team shows as stored:", error);
  }
}

export async function loadWorkspace(role: Role, staffEmail: string): Promise<Workspace> {
  const access = await accessFor(staffEmail);
  await syncTeamFromLogins();
  const lens = access.roles.includes(role) ? role : (access.roles[0] ?? "creator");

  const [rows, users] = await Promise.all([
    // Every item, for honest counts: the headline and the roll-up were worked
    // out from the newest 60 alone, so 212 in flight read as "60" (18 Nov 2026).
    readQueue(QUEUE_STATUS[lens], QUEUE_READ_LIMIT).catch(() => []),
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
    assignedTo: row.assignedTo,
    ageDays: ageOf(row),
  }));

  const team: TeamMember[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isYou: user.id === access.userId,
  }));

  const workspace: Workspace = {
    role: lens,
    access,
    team,
    // The cards: the newest, so the page stays short.
    items: items.slice(0, QUEUE_SHOWN),
    total: items.length,
    today: dailyHook(lens, items),
    noUsers: users.length === 0,
  };

  if (lens === "team_manager") {
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
export async function advance(inputArg: {
  id: string;
  from: string;
  to: string;
  role: Role;
  // `| undefined` explicitly: exactOptionalPropertyTypes is on, and a validated
  // payload with an absent optional field carries undefined, not nothing.
  actorId?: string | undefined;
  shortcode?: string | undefined;
  /** Verified by requireStaff. Turned into actorId above. */
  staffEmail?: string | undefined;
}): Promise<{ ok: boolean; reason?: string }> {
  let input = inputArg;
  const from = input.from as IdeaStatus;
  const to = input.to as IdeaStatus;

  // Who this actually is, and what they actually hold — from the verified
  // session email alone (T46). The role on the request is a claim about which
  // lens the person was looking through; it is checked against this, never
  // believed. The users row is created on first sight, so the audit columns —
  // approved_by, assigned_to, produced_by — record a real person from the
  // first action onward.
  const access = input.staffEmail ? await accessFor(input.staffEmail).catch(() => null) : null;
  if (access?.userId && !input.actorId) input = { ...input, actorId: access.userId };

  const roles: Role[] = access?.roles ?? [];
  if (!roles.length) {
    return { ok: false, reason: "Sign in again — we could not confirm who you are." };
  }
  if (!roles.includes(input.role)) {
    return {
      ok: false,
      reason: `You are not a ${ROLE_LABEL[input.role].toLowerCase()} here. You are ${roles
        .map((role) => ROLE_LABEL[role].toLowerCase())
        .join(" and ")}. Ask an admin if that is wrong.`,
    };
  }

  if (!canTransitionAny(roles, from, to)) {
    return {
      ok: false,
      reason: `A ${ROLE_LABEL[input.role].toLowerCase()} cannot move an idea from ${from} to ${to}.`,
    };
  }

  // Addendum E.7 — a reaction idea passes two extra gates.
  //
  // Before approval, the borrowed clip must carry an on-screen credit and a
  // resolved rights status. Before production, the client must have confirmed
  // every fact marked [VERIFY]. Both are checked here, on the server, so no
  // screen can skip them. The source is read LIVE rather than from the idea's
  // copy: setting a clip's rights or credit is what unblocks the ideas waiting
  // on it.
  if (to === "approved" || to === "in_production") {
    const format = await readIdeaFormat(input.id).catch(() => null);
    if (format?.formatTemplate === "reaction_hook") {
      if (to === "approved") {
        const source = format.reactionSourceId
          ? await readReactionSource(format.reactionSourceId).catch(() => null)
          : null;
        const blockers = source
          ? approvalBlockers(source)
          : ["This reaction idea has lost its source clip. Re-add the clip before approving."];
        if (blockers.length) return { ok: false, reason: blockers.join(" ") };
      }
      if (to === "in_production" && format.reaction) {
        const blockers = productionBlockers(format.reaction);
        if (blockers.length) return { ok: false, reason: blockers.join(" ") };
      }
    }
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
