import type { PlatformId } from "@/lib/analytics-types";
import type { ContentIdea } from "@/lib/ai-types";
import { isAiToolWorkflowLane } from "../../lib/tool-workflow.ts";
export { isAiToolWorkflowLane } from "../../lib/tool-workflow.ts";

/**
 * Explicit regeneration is the only exception to the writer's no-repeat rule.
 *
 * Any lane, either platform: the user pressed "Regenerate script" on a story
 * that already has one. Without this, the ALREADY SUGGESTED block (which now
 * holds that story's earlier script) would steer the writer onto a different
 * story. AI tool workflow stories keep their own wording, naming the workflow
 * rules the rewrite must follow.
 */
export function regenerationPrompt(
  platform: PlatformId,
  lane: string | null | undefined,
  sourceId: string | undefined,
): string {
  if (!sourceId) return "";
  const workflow = platform === "instagram" && isAiToolWorkflowLane(lane);
  const what = workflow ? "AI tool workflow reel" : platform === "instagram" ? "script" : "post";
  return `EXPLICIT SCRIPT REGENERATION: the user selected this existing topic again.
Write exactly one new ${what} for sourceId=${JSON.stringify(sourceId)} using the current
${workflow ? "workflow " : ""}instructions. This is an intentional revision, not a new topic suggestion.
For this source only, the ALREADY SUGGESTED, ALREADY PUBLISHED, calendar and covered-subject
no-repeat instructions do not prohibit the rewrite. Do not switch to another story.
All factual-source limits, voice rules${workflow ? ", workflow requirements" : ""} and measured feedback blocks still
apply. Do not reuse unsupported claims from an earlier script. Do not say the revised script was
filmed, published, tested or approved just because the topic appeared before.`;
}

/** A clicked workflow topic must not drift into the generic AI news lane. */
export function workflowLaneForSource(
  platform: PlatformId,
  sourceLane: string | null | undefined,
  accountLanes: string[],
): string | undefined {
  if (platform !== "instagram" || !isAiToolWorkflowLane(sourceLane)) return undefined;
  return accountLanes.find(isAiToolWorkflowLane) ?? sourceLane!.trim();
}

/**
 * Structural checks only: passing these does NOT verify a tool's capabilities.
 *
 * A failure here DROPS the idea, which wastes the model call that wrote it, so
 * only what makes a script unusable as a workflow reel belongs here: the wrong
 * format, no demonstrated steps, or a cut over a minute. Word count and the
 * ending are flagged on the idea by voice-check instead, the same as every
 * other lane, because a script that is a few words over is a thirty-second edit.
 */
export function toolWorkflowIssues(platform: PlatformId, idea: ContentIdea): string[] {
  if (platform !== "instagram" || !isAiToolWorkflowLane(idea.contentLane)) return [];
  const issues: string[] = [];
  if (idea.format !== "reel") issues.push("AI tool workflows need a reel script");
  const duration = idea.production?.durationSeconds;
  if (duration == null || duration > 60) {
    issues.push("the reel must run under one minute");
  }
  // Count demonstrated instructions, not mentions of actions in an abstract
  // benefits paragraph. Bracketed actions remain drafts for the team to verify.
  const steps = idea.shots.filter(
    (shot) =>
      /\bscreen[ -]?(?:recording|capture|share)\b/i.test(shot.shotType) &&
      /(?:^|[.!?:]\s*|\[VERIFY:\s*)(?:(?:first|next|then|now|finally)[,:]?\s+)*(?:open|go to|select|choose|click|tap|upload|enter|type|ask|copy|paste|add|set|pick|generate|download|export|save|review|edit|check|drag)\b/i.test(
        shot.voiceover,
      ) &&
      Boolean(shot.visual.trim()),
  );
  if (steps.length < 2) {
    issues.push(
      "show at least two actions of the workflow, each in a screen-recording shot with a spoken instruction",
    );
  }
  return issues;
}

/**
 * The AI tool workflows lane, in Pritesh's October 2026 reel brief.
 *
 * The lane still SHOWS the tool working, because that is what the lane is.
 * But it is a reel, not a tutorial: one workflow, a few steps, the same
 * length and ending rules as every other lane. It no longer ends on "Comment
 * X and I'll send you the guide": the brief forbids promising a resource that
 * has not been confirmed to exist. See docs/pritesh-reel-voice-2026-10.md.
 */
export function toolWorkflowPrompt(platform: PlatformId, lanes: string[]): string {
  const workflows = lanes.filter(isAiToolWorkflowLane);
  if (platform !== "instagram" || !workflows.length) return "";
  return `AI TOOL WORKFLOW REELS — applies ONLY when contentLane is one of: ${JSON.stringify(workflows)}.
Every voice, length, one-idea and ending rule of the INSTAGRAM REEL format applies unchanged. What
this lane adds is that the example is the tool SHOWN working, on screen. Use format="reel" even when
the output being demonstrated is a carousel or image.
The viewer should finish thinking "Okay, now I understand it, and I can try this."
1. Opening: start directly with the task the tool makes easier or the finished output, shown in the
   first shot. A recognisable problem or an honest question works. Say "I created this" only when
   the supplied evidence confirms his own demo; otherwise "Here's how you can…". No AI-news opening
   and no company history.
2. Explanation: in simple words, what the tool does for that task. One capability, not a feature list.
3. Example: the ONE workflow, shown in 2-4 short actions in the order the viewer does them ("Open…",
   "Upload…", "Now click…", "Then generate…"). Name the tool, the input and what comes out. Never a
   whole tutorial: if the workflow has more steps, show the few that make it click and say so simply.
4. Closing: a clear takeaway (what it is good for, or a limitation worth knowing), then the CTA as
   the last line: ONE action tied to this tool or task, naming it, e.g. "Try it on your next
   promotion and see what it gives you." Never a stock sign-off ("Follow for more AI and marketing
   tips", "See you next time", "See you tomorrow"): this lane's CTA is written for its topic.
NEVER promise a guide, process, template, link or resource ("comment X and I'll send you…"): none has
been confirmed to exist. At most one relevant action, only if genuinely useful.
Stay within 100-115 spoken words, never more than 115: a 50 to 60 second reel. Count before returning.
Map each shown action to its own shotType="Screen recording" shot whose voiceover starts with the
action (optionally First/Next/Then/Now). On-screen text stays within the reel's three-line limit,
so label only the steps that need it.
Only name UI controls, models, integrations, prices, timings and results supported by the supplied
source material. A headline alone is not evidence for a click-by-click demo: where a detail is
absent, mark the exact action as [VERIFY: ...] for the recording team, never invent menus or pretend
the demo was tested. "Builds ads" never becomes "runs your campaign", and no claims about savings,
cost or speed that the source does not support. Use a rights-cleared reference asset.`.trim();
}
