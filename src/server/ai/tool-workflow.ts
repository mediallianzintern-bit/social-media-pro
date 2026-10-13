import type { PlatformId } from "@/lib/analytics-types";

/** Deliberately narrow: frontier AI news and marketing lanes keep their own style. */
export function isAiToolWorkflowLane(lane: string | null | undefined): boolean {
  return /^ai tools? workflows?$/.test(
    (lane ?? "").trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " "),
  );
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
Only name UI controls, models, integrations, prices, timings and results supported by supplied
source material or a verified demo. A headline alone is not evidence for a click-by-click tutorial.
Where details are absent, mark the exact missing action as [VERIFY: ...] for the recording team;
never invent menus or pretend the tutorial was tested. Use a rights-cleared reference asset.
`.trim();
}
