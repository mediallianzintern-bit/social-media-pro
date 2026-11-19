// Shapes for the role workspace (Addendum B). Client-safe — no server imports.
import type { PlatformId } from "@/lib/analytics-types";
import type { IdeaStatus, Role } from "@/lib/roles";

/** One row in a role's queue. Enough to act on, not the whole script. */
export interface WorkItem {
  id: string;
  platform: PlatformId;
  hook: string;
  whyNow: string;
  winningTrait: string;
  contentLane: string | null;
  sourceSignal: string | null;
  status: IdeaStatus;
  createdAt: string;
  approvedAt: string | null;
  productionAt: string | null;
  publishedShortcode: string | null;
  /** The users row this idea has been handed to, or who started producing it. */
  assignedTo: string | null;
  /** Days since this item last moved — what makes a queue feel stale. */
  ageDays: number;
}

/**
 * B.4 — the "for you today" strip.
 *
 * Deliberately a count and a sentence rather than a feed. B.5 is explicit that
 * the daily-ness must come from the workflow, not from forcing a daily AI
 * regeneration to manufacture novelty; so this counts what is genuinely waiting
 * on this person and says plainly when that is nothing.
 */
export interface DailyHook {
  /** How many items are waiting on this role right now. */
  waiting: number;
  /** Items that arrived since yesterday. */
  newSinceYesterday: number;
  /** The oldest item's age, in days. Null when the queue is empty. */
  oldestDays: number | null;
  /** One sentence. Says "nothing waiting" rather than inventing urgency. */
  headline: string;
}

/** One member of the team, as the roles screen lists them. */
export interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  /** True for the person reading the screen. */
  isYou: boolean;
}

/**
 * T46 — who the signed-in person is, and what they are actually allowed to do.
 *
 * `roles` is read from the team table, never from anything the browser sent,
 * and is what every permission decision is made against. The workspace's role
 * switcher is a lens over these — it can only offer a role already in here.
 */
export interface Access {
  /** The users row, once they have one. Null only in the ephemeral store. */
  userId: string | null;
  name: string;
  email: string;
  roles: Role[];
  /** Whether this person may change anyone's role. */
  canManageTeam: boolean;
  /** True when they were the first member and so were made team manager. */
  isFounder: boolean;
}

export interface Workspace {
  role: Role;
  /** Who is reading this, and what they may do. */
  access: Access;
  /** The whole team, for the roles panel. */
  team: TeamMember[];
  /** The newest items, as cards. */
  items: WorkItem[];
  /** Every item in this queue; `items` can be fewer. */
  total: number;
  today: DailyHook;
  /** Present for the team manager's roll-up (B.1). */
  rollup?: {
    byStatus: Array<{ status: IdeaStatus; count: number }>;
    /** Share of suggestions that reached published, 0-100. */
    adoptionPct: number;
    suggested: number;
    published: number;
  };
  /** True when the workspace tables exist but hold no people yet. */
  noUsers: boolean;
}
