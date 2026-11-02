// The team's verdict on a script's writing (0033_script_feedback).
//
// Ticks and crosses on topics (preferences.ts) teach which SUBJECTS the team
// wants. By 2 Nov 2026 not one script had been voted on, and a cross could not
// have said what was wrong anyway. Here a script is approved, or rejected with
// one-tap reasons, and both reach the writer:
//   - an APPROVED script becomes an example of how he sounds on that
//     platform, voice and shape only, never its facts (the team's LinkedIn
//     brief: "An approved post should become a stronger reference for future
//     generations");
//   - REJECTIONS are counted by reason, so the writer is told what the team
//     keeps sending back ("reads like news, 4 scripts").
// A human preference, like the topic votes: never folded into how published
// posts performed (reel-learning), which answers a different question.
//
// Client-safe and pure.
import type { ContentIdea } from "@/lib/ai-types";
import type { PlatformId } from "@/lib/analytics-types";
import { withChosenHook } from "@/lib/hook-variants";

/** Why a script was sent back, as the drawer offers it. */
export const REJECT_REASONS = {
  topic: "Wrong topic for him",
  opening: "Weak opening",
  news: "Reads like news, not his view",
  facts: "Too many facts or figures",
  voice: "Doesn't sound like him",
  length: "Wrong length",
  accuracy: "Facts look wrong",
} as const;
export type RejectReason = keyof typeof REJECT_REASONS;
export const REJECT_REASON_KEYS = Object.keys(REJECT_REASONS) as RejectReason[];

/** What the writer is told to do about each reason. */
const REASON_FIX: Record<RejectReason, string> = {
  topic: "choose subjects closer to his lanes",
  opening: "make the first line earn the next one",
  news: "explain what it means for businesses instead of retelling what happened",
  facts: "keep the few facts that serve the one idea",
  voice: "sound like Pritesh explaining something, not a writer",
  length: "keep to the platform's length",
  accuracy: "state only what the sources say, and keep claims as claims",
};

export interface ScriptVerdict {
  platform: PlatformId;
  ideaId: string;
  verdict: "approve" | "reject";
  reasons: RejectReason[];
  note: string | null;
  script: string;
  hook: string | null;
  title: string | null;
  lane: string | null;
  actor: string | null;
  createdAt: string;
}

/**
 * The script as the team judged it, opening with the hook they chose: a
 * post's body and sections, or a reel's spoken lines in order.
 */
export function scriptText(idea: ContentIdea): string {
  const shown = withChosenHook(idea);
  if (shown.post) {
    return [
      shown.post.body.trim(),
      ...shown.post.sections.map((section) => `${section.heading}\n${section.text.trim()}`),
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  return shown.shots
    .map((shot) => shot.voiceover?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
}

/** Approved scripts quoted to the writer: enough for a voice, few enough to stay cheap. */
export const APPROVED_SHOWN = 2;
/** Rejections older than this no longer steer the writer. */
export const REJECTION_DAYS = 60;

/**
 * What the team decided about earlier scripts, as a block for the writer, or
 * "" when nothing has been judged on this platform.
 */
export function scriptFeedbackBlock(verdicts: ScriptVerdict[], now = Date.now()): string {
  const newest = [...verdicts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const approved = newest
    .filter((verdict) => verdict.verdict === "approve" && verdict.script.trim())
    .slice(0, APPROVED_SHOWN);
  const since = now - REJECTION_DAYS * 86_400_000;
  const rejected = newest.filter(
    (verdict) => verdict.verdict === "reject" && Date.parse(verdict.createdAt) >= since,
  );
  if (!approved.length && !rejected.length) return "";

  const parts = [
    "WHAT THE TEAM DECIDED ABOUT EARLIER SCRIPTS (their approvals and rejections in the dashboard: what they want, not how posts performed):",
  ];
  if (approved.length) {
    parts.push(
      `SCRIPTS THE TEAM APPROVED, for HOW HE SOUNDS AND HOW THE SCRIPT IS BUILT ONLY. Their facts belong to their own stories: never use a fact, name or figure from them, and never copy or lightly reword a sentence.`,
      ...approved.map(
        (verdict, index) =>
          `APPROVED ${index + 1}${verdict.lane ? ` (${verdict.lane})` : ""}:\n"""\n${verdict.script.trim()}\n"""`,
      ),
    );
  }
  if (rejected.length) {
    const counts = new Map<RejectReason, number>();
    for (const verdict of rejected) {
      for (const reason of verdict.reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    const ranked = [...counts].sort((a, b) => b[1] - a[1]);
    parts.push(
      `SCRIPTS THE TEAM REJECTED in the last ${REJECTION_DAYS} days: ${rejected.length}.${
        ranked.length
          ? ` What they sent back, most often first; avoid each:\n${ranked
              .map(
                ([reason, count]) =>
                  `- ${REJECT_REASONS[reason]} (${count} script${count === 1 ? "" : "s"}): ${REASON_FIX[reason]}.`,
              )
              .join("\n")}`
          : ""
      }`,
    );
    const notes = rejected
      .filter((verdict) => verdict.note?.trim())
      .slice(0, 3)
      .map(
        (verdict) =>
          `- On "${verdict.title ?? verdict.hook ?? "a script"}": ${verdict.note!.trim()}`,
      );
    if (notes.length) parts.push(`In the team's words:\n${notes.join("\n")}`);
    const openings = rejected
      .filter(
        (verdict) => verdict.hook && verdict.reasons.some((r) => r === "opening" || r === "news"),
      )
      .slice(0, 3)
      .map((verdict) => `- "${verdict.hook}"`);
    if (openings.length)
      parts.push(`Openings they rejected; never open like these:\n${openings.join("\n")}`);
  }
  return parts.join("\n\n");
}
