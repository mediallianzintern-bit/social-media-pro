// Addendum B — what a role IS in this system.
//
// Read B.8 first, because it is easy to misread: defining human roles does NOT
// mean giving the agents personas. There is nothing here that reaches a prompt
// as "you are a seasoned growth strategist". A role is three factual things —
// what you can see, which transitions you own, and which view you land on —
// plus an output_audience flag that reformats an already-computed result.
//
// Client-safe: the views and the server both import this, so the rules a screen
// enforces and the rules the server enforces are the same object rather than
// two drifting copies.

export type Role = "growth_manager" | "creator" | "editor" | "team_manager";

/**
 * The suggestion lifecycle (B.3).
 *
 * "used" is the legacy spelling of "published" and remains what the code
 * writes: it is what readUsedSuggestions and the outcome capture both match on,
 * and renaming it would be a data migration through the one path that feeds the
 * entire learning loop. Treat the two as the same state everywhere.
 */
export type IdeaStatus =
  "suggested" | "approved" | "in_production" | "used" | "published" | "measured" | "dismissed";

/** Published under either spelling. */
export const PUBLISHED: IdeaStatus[] = ["used", "published"];

export const ROLE_LABEL: Record<Role, string> = {
  growth_manager: "Growth manager",
  creator: "Content creator",
  editor: "Content editor",
  team_manager: "Team manager",
};

export const STATUS_LABEL: Record<IdeaStatus, string> = {
  suggested: "New idea",
  approved: "Approved",
  in_production: "In production",
  used: "Published",
  published: "Published",
  measured: "Measured",
  dismissed: "Dismissed",
};

/** One allowed move through the lifecycle, and who owns it. */
export interface Transition {
  from: IdeaStatus[];
  to: IdeaStatus;
  owner: Role;
  /** Button text for the role that owns it. */
  action: string;
  /** Requires a permalink from the creator. */
  needsPermalink?: boolean;
}

/**
 * The spine (B.3), with ownership from B.8.1.
 *
 * Deliberately data rather than scattered `if` statements: the queue views, the
 * server handler and the permission check all read this one table, so a role
 * cannot be allowed to do something on screen that the server then refuses, or
 * the reverse.
 */
export const TRANSITIONS: Transition[] = [
  {
    from: ["suggested"],
    to: "approved",
    owner: "growth_manager",
    action: "Approve",
  },
  {
    from: ["suggested", "approved"],
    to: "dismissed",
    owner: "growth_manager",
    action: "Dismiss",
  },
  {
    from: ["approved"],
    to: "in_production",
    owner: "creator",
    action: "Start production",
  },
  {
    from: ["in_production", "approved"],
    to: "used",
    owner: "creator",
    action: "Filmed this one",
    needsPermalink: true,
  },
];

/** Every transition this role is allowed to make from this status. */
export function transitionsFor(role: Role, status: IdeaStatus): Transition[] {
  return TRANSITIONS.filter((t) => t.owner === role && t.from.includes(status));
}

/** Whether a role may make a specific move. The server asks this before writing. */
export function canTransition(role: Role, from: IdeaStatus, to: IdeaStatus): boolean {
  return TRANSITIONS.some((t) => t.owner === role && t.from.includes(from) && t.to === to);
}

/**
 * Whether ANY of the roles a person holds permits this move.
 *
 * One person can legitimately hold several roles on one client — an admin, or a
 * small team where the same person approves and films. Rather than inventing a
 * super-role that bypasses the table, they are simply assigned each role they
 * actually perform, and this asks whether any of them owns the transition. The
 * rules stay in one place and nobody gets an exemption from them.
 */
export function canTransitionAny(roles: Role[], from: IdeaStatus, to: IdeaStatus): boolean {
  return roles.some((role) => canTransition(role, from, to));
}

/** Every action any of these roles could take on this item. */
export function transitionsForAny(roles: Role[], status: IdeaStatus): Transition[] {
  const seen = new Set<string>();
  return roles
    .flatMap((role) => transitionsFor(role, status))
    .filter((t) => {
      const key = `${t.to}:${t.action}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * B.8.3 — who will act on this output.
 *
 * Selects which fields a suggestion surfaces and how its rationale is phrased.
 * It never changes the analysis, the numbers, or the recommendation — only the
 * framing of an already-computed result.
 */
export type OutputAudience = Role;

export interface AudienceView {
  /** What this reader needs, in priority order. */
  shows: string[];
  /** One line describing what the view is for. */
  purpose: string;
}

export const OUTPUT_AUDIENCE: Record<OutputAudience, AudienceView> = {
  creator: {
    shows: ["hook", "angle", "shots", "production", "caption", "hashtags"],
    purpose: "Everything needed to make it.",
  },
  growth_manager: {
    shows: ["title", "whyNow", "contentLane", "prediction"],
    purpose: "Enough to approve or reject: the rationale, the lane, the expected impact.",
  },
  editor: {
    shows: ["shots", "production", "caption"],
    purpose: "The shot list and production brief as a clean handover.",
  },
  team_manager: {
    shows: ["title", "contentLane", "status", "sourceSignal"],
    purpose: "The roll-up line: which client, which goal, adopted or not.",
  },
};

/** The landing route each role opens on (B.2). */
export const HOME_ROUTE: Record<Role, string> = {
  growth_manager: "/triage",
  creator: "/queue",
  editor: "/production",
  team_manager: "/rollup",
};

/** Statuses each role's own queue is built from (B.4). */
export const QUEUE_STATUS: Record<Role, IdeaStatus[]> = {
  growth_manager: ["suggested"],
  creator: ["approved", "in_production"],
  editor: ["in_production"],
  team_manager: ["suggested", "approved", "in_production", "used", "published", "measured"],
};
