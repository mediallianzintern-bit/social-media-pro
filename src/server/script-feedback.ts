// Storage for the team's verdict on a script's writing (0033_script_feedback).
//
// Its own module, like reel-learning/store.ts: the table is read and written
// only by this feature. Supabase only; without a durable store every read is
// empty and every write says what is missing.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { PlatformId } from "@/lib/analytics-types";
import {
  REJECT_REASON_KEYS,
  scriptFeedbackBlock,
  type RejectReason,
  type ScriptVerdict,
} from "@/lib/script-feedback";

import { hasDurableStore } from "./store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

/** Table missing (migration 0033 not applied yet) or a column missing. */
function schemaNotReady(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? "";
  return ["42703", "42P01", "PGRST204", "PGRST205"].includes(code);
}

export class ScriptFeedbackNotReady extends Error {
  constructor() {
    super(
      "Approving and rejecting scripts needs migration 0033_script_feedback.sql applied in Supabase.",
    );
  }
}

interface Row {
  platform: PlatformId;
  idea_id: string;
  verdict: "approve" | "reject";
  reasons: string[] | null;
  note: string | null;
  script: string | null;
  hook: string | null;
  title: string | null;
  lane: string | null;
  actor: string | null;
  created_at: string;
}

const known = new Set<string>(REJECT_REASON_KEYS);

function fromRow(row: Row): ScriptVerdict {
  return {
    platform: row.platform,
    ideaId: row.idea_id,
    verdict: row.verdict,
    reasons: (row.reasons ?? []).filter((reason): reason is RejectReason => known.has(reason)),
    note: row.note,
    script: row.script ?? "",
    hook: row.hook,
    title: row.title,
    lane: row.lane,
    actor: row.actor,
    createdAt: row.created_at,
  };
}

/** Every verdict for a platform, newest first. [] until the migration is applied. */
export async function readScriptVerdicts(platform: PlatformId): Promise<ScriptVerdict[]> {
  if (!hasDurableStore()) return [];
  const { data, error } = await db()
    .from("script_feedback")
    .select("*")
    .eq("platform", platform)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error && schemaNotReady(error)) return [];
  if (error) throw new Error(`script_feedback read failed: ${error.message}`);
  return ((data ?? []) as Row[]).map(fromRow);
}

/** Records a verdict, replacing any earlier one, or clears it when `verdict` is null. */
export async function saveScriptVerdict(
  verdict: Omit<ScriptVerdict, "createdAt" | "verdict"> & {
    verdict: ScriptVerdict["verdict"] | null;
  },
): Promise<void> {
  if (!hasDurableStore()) throw new ScriptFeedbackNotReady();
  if (verdict.verdict === null) {
    const { error } = await db()
      .from("script_feedback")
      .delete()
      .eq("platform", verdict.platform)
      .eq("idea_id", verdict.ideaId);
    if (error && schemaNotReady(error)) throw new ScriptFeedbackNotReady();
    if (error) throw new Error(`script_feedback delete failed: ${error.message}`);
    return;
  }
  const { error } = await db()
    .from("script_feedback")
    .upsert(
      {
        platform: verdict.platform,
        idea_id: verdict.ideaId,
        verdict: verdict.verdict,
        reasons: verdict.verdict === "reject" ? verdict.reasons : [],
        note: verdict.note?.trim() ? verdict.note.trim().slice(0, 500) : null,
        script: verdict.script.slice(0, 6000),
        hook: verdict.hook,
        title: verdict.title,
        lane: verdict.lane,
        actor: verdict.actor,
        created_at: new Date().toISOString(),
      },
      { onConflict: "platform,idea_id" },
    );
  if (error && schemaNotReady(error)) throw new ScriptFeedbackNotReady();
  if (error) throw new Error(`script_feedback upsert failed: ${error.message}`);
}

/** The writer's block for a platform, or "" when nothing has been judged. Never fatal. */
export async function scriptFeedbackFor(platform: PlatformId): Promise<string> {
  const verdicts = await readScriptVerdicts(platform).catch(() => []);
  return scriptFeedbackBlock(verdicts);
}
