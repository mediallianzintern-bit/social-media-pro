import type { PlatformId } from "@/lib/analytics-types";
import type { ContentIdea } from "@/lib/ai-types";
import { isAiToolWorkflowLane } from "../../lib/tool-workflow.ts";
export { isAiToolWorkflowLane } from "../../lib/tool-workflow.ts";

/** Explicit regeneration is the only exception to the writer's no-repeat rule. */
export function workflowRegenerationPrompt(
  platform: PlatformId,
  lane: string | undefined,
  sourceId: string | undefined,
): string {
  if (platform !== "instagram" || !isAiToolWorkflowLane(lane) || !sourceId) return "";
  return `EXPLICIT SCRIPT REGENERATION: the user selected this existing topic again.
Write exactly one new AI tool workflow reel for sourceId=${JSON.stringify(sourceId)} using the
current workflow instructions. This is an intentional revision, not a new topic suggestion.
For this source only, the ALREADY SUGGESTED, ALREADY PUBLISHED, calendar and covered-subject
no-repeat instructions do not prohibit the rewrite. Do not switch to another story.
All factual-source limits, voice rules, workflow requirements and measured feedback blocks still
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

/** Structural checks only: passing these does NOT verify a tool's capabilities. */
export function toolWorkflowIssues(platform: PlatformId, idea: ContentIdea): string[] {
  if (platform !== "instagram" || !isAiToolWorkflowLane(idea.contentLane)) return [];
  const issues: string[] = [];
  if (idea.format !== "reel") issues.push("AI tool workflows need a reel script");
  const spoken = idea.shots.map((shot) => shot.voiceover).join(" ");
  const wordCount = spoken.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 110 || wordCount > 135) {
    issues.push(`the voiceover has ${wordCount} words; it needs 110–135`);
  }
  const duration = idea.production?.durationSeconds;
  if (duration == null || duration < 45 || duration > 60) {
    issues.push("the production plan needs a 45–60 second duration");
  }
  // Count demonstrated instructions, not mentions of actions in an abstract
  // benefits paragraph. Bracketed actions remain drafts for the team to verify.
  const steps = idea.shots.filter(
    (shot) =>
      /\bscreen[ -]?(?:recording|capture|share)\b/i.test(shot.shotType) &&
      /(?:^|[.!?:]\s*|\[VERIFY:\s*)(?:(?:first|next|then|now|finally)[,:]?\s+)*(?:open|go to|select|choose|click|tap|upload|enter|type|ask|copy|paste|add|set|pick|generate|download|export|save|review|edit|check|drag)\b/i.test(
        shot.voiceover,
      ) &&
      Boolean(shot.visual.trim()) &&
      Boolean(shot.onScreenText.trim()),
  );
  if (steps.length < 4) {
    issues.push(
      "show at least four ordered actions, each in a screen-recording shot with a spoken instruction and step label",
    );
  }
  const ending = idea.shots.at(-1)?.voiceover ?? "";
  if (!/\bcomment\s+\S+/i.test(ending) || !/\b(?:process|guide)\b/i.test(ending)) {
    issues.push("end with a comment keyword and an offer to send the process or guide");
  }
  return issues;
}

/** User-supplied past reels establish delivery style, not current product capabilities. */
export function toolWorkflowPrompt(platform: PlatformId, lanes: string[]): string {
  const workflows = lanes.filter(isAiToolWorkflowLane);
  if (platform !== "instagram" || !workflows.length) return "";
  return `AI TOOL WORKFLOW REELS — applies ONLY when contentLane is one of: ${JSON.stringify(workflows)}.
This lane has its own demonstration structure, overriding the generic AI explainer beats, the
curiosity rule that conceals the result, and the optional-CTA rule. Other lanes keep their existing
instructions. Use format="reel" even when the OUTPUT being demonstrated is a carousel or image.

Write like Pritesh's practical tool demos: result first, then "Here's how" and a reproducible
sequence. The viewer should finish thinking "I can follow these steps myself."
1. Open on the finished output or a concrete task the tool makes easier. Show the output in the
   first shot. Say "I created this" only when the supplied evidence confirms his own demo; otherwise
   use "Here's how to create...". No generic AI-news opening or company-history introduction.
2. Bridge immediately: "Here's exactly how you can do it" or "Here's how."
3. Walk through 4–6 short actions in the order the viewer performs them: "Open...", "Select...",
   "Now click...", "Upload...", "Copy...", "Paste...", "Then generate...". Name the tool, the input,
   the action and its output. If two tools are used, explicitly show what moves from one to the other.
   Tell the viewer what a prompt should ask for; don't vaguely say "use AI" or "paste this prompt"
   without providing the actual task/prompt in the shot or production notes.
4. Reveal the result again: what is now ready, and one supported practical benefit such as editing
   the text or branding. Do not replace the walkthrough with an abstract business implication.
5. End with one specific CTA: "Comment [one relevant keyword] and I'll send you the process/guide."
   Put the actual keyword in the spoken line. Add an editor/production note to prepare and verify
   the matching guide before posting. Do not claim delivery automation exists. A follow request may
   accompany the keyword when natural; do not append unrelated engagement requests.

PAST REEL STYLE REFERENCES supplied by the user, not facts to copy into a new tool's instructions:
- Canva + ChatGPT carousel: finished carousel first; "Here's exactly how you can do it"; open Canva,
  choose placement/app/theme; ask ChatGPT for niche content; copy into Canva; generate; reveal the
  editable result; "Comment Canva and I'll send you the full process."
- Motion graphics demo: show the finished video; "Here's how"; obtain a reference, analyse it into
  a detailed prompt, move that prompt into a video tool, generate and show the result; comment Guide.
Borrow their short, direct, conversational delivery and step order. Do NOT automatically reuse
Canva, Carousel Studio, Pinterest, Google Flow or the example model name. The new topic determines
the tools. Do not repeat the claim that AI will eat an editor's business or assert unverified speed.

Keep the existing 45–60 second / 110–135 spoken-word target, three hook choices, caption, five
hashtags and full production handover. All hook options must lead into this same workflow.
Map each instruction to a screen-recording shot: visible action, matching voiceover and short
on-screen step label. Include the input/prompt, output reveal and CTA in the shot list.
Use shotType="Screen recording" for at least four instruction shots, one action per shot.
Start each instruction's voiceover with an action (optionally First/Next/Then/Now), such as
"Open..." or "Next, paste...". Before returning, check the actual spoken word count across the
shots is 110–135 and production.durationSeconds is 45–60. Do not pad with generic benefits.
An ad-creation headline does NOT mean an entire campaign runs itself. Never turn "builds ads"
into "runs your campaign", "without lifting a finger", or claims about savings, cost or quality
unless the source actually supports those claims. "X just launched a tool", generic marketer
B-roll and "imagine saving time" are a news summary, not a workflow demonstration.
Only name UI controls, models, integrations, prices, timings and results supported by supplied
source material or a verified demo. A headline alone is not evidence for a click-by-click tutorial.
Where details are absent, mark the exact missing action as [VERIFY: ...] for the recording team;
never invent menus or pretend the tutorial was tested. Use a rights-cleared reference asset.
`.trim();
}
