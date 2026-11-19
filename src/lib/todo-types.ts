// The To do board (19 Nov 2026). Client-safe shapes; server/todo.ts fills them.
//
// The flow, for To do only (nothing else in the dashboard changes):
//   1. Anyone ticks or saves a topic, anywhere in the tool, as today.
//   2. The growth manager sees every ticked or saved topic not yet written,
//      writes its script, and sends it to one content editor.
//   3. The editor sees only the scripts sent to them, and marks each done.
//   4. The growth manager posts it and marks it completed: Published.
//   "I filmed this", here or anywhere else, sends a piece straight to
//   Published. To do keeps no copy of anything: it reads the same topics,
//   ticks, saves, scripts and filmed marks as every other page.
//
// Each step is a stage the database already has (roles.ts), used only here:
//   suggested = written, not sent · approved = with the editor ·
//   in_production = done by the editor, ready to post ·
//   used / published / measured, or marked filmed = Published.
import type { ContentIdea } from "@/lib/ai-types";
import type { PlatformId } from "@/lib/analytics-types";
import type { Role } from "@/lib/roles";
import type { SavedTopic } from "@/lib/saved-topics";
import type { Access, TeamMember } from "@/lib/workspace-types";

export type TodoLens = "growth_manager" | "editor" | "team_manager";

export type TodoStage = "written" | "with_editor" | "ready" | "published";

/** A ticked or saved topic with no script yet. Shaped as a saved topic, so the
 * same Write buttons the Saved page uses work on it. */
export interface TodoTopic extends SavedTopic {
  ticked: boolean;
  saved: boolean;
}

export interface TodoPiece {
  platform: PlatformId;
  idea: ContentIdea;
  stage: TodoStage;
  /** Reel script, LinkedIn post or LinkedIn article. */
  kind: "reel" | "post" | "article";
  /** The editor it was sent to. */
  assignedTo: string | null;
  /** When it last moved. */
  updatedAt: string;
  /** "I filmed this" was pressed for it. */
  filmed: boolean;
}

export interface TodoBoard {
  lens: TodoLens;
  access: Access;
  team: TeamMember[];
  /** Who a script can be sent to: content editors and admins. */
  editors: Array<{ id: string; name: string; role: Role }>;
  toWrite: TodoTopic[];
  written: TodoPiece[];
  withEditor: TodoPiece[];
  ready: TodoPiece[];
  /** The last 30 days. */
  published: TodoPiece[];
}

export const TODO_LENSES: TodoLens[] = ["growth_manager", "editor", "team_manager"];
