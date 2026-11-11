// The two script shapes in the reel SOP, chosen per content lane.
//
// The SOP is written around two lanes, AI and Marketing, and gives each its
// own structure and — the part that matters most — its own ENDING. An AI reel
// closes on a useful implication; a marketing reel closes on a transferable
// lesson. §28 is explicit that "the lesson is simple" belongs to case studies
// and not to a tool explainer.
//
// But this account's lanes are not AI and Marketing. They are derived from its
// own posts and currently number four — "Marketing stunts", "Brand strategy
// lessons", "AI tool workflows", "Frontier AI developments" — and they change
// whenever the taxonomy is rebuilt. Hardcoding two lanes would mean a new lane
// silently falls back to a generic shape on the day it is created.
//
// So the FAMILY is inferred from what a lane is about, by rule, from the lane's
// own name and the one-line definition the taxonomy stores for it. Two lanes
// can share a family: "AI tool workflows" and "Frontier AI developments" are
// both AI reels, and §27 covers the second as the news variant of the first.
//
// Where a lane matches neither, no structure is forced. The prompt is told to
// pick the ending from the subject instead, which is better than confidently
// applying the wrong one.
//
// Client-safe. No model call. See docs/pritesh-reel-sop.md §25, §27, §28,
// §35, §44.

import {
  isAiToolWorkflowLane,
  isWorkflowCta,
  workflowCta,
  workflowKeyword,
} from "./tool-workflow.ts";
import type { ContentLane } from "@/lib/analytics-types";

export type ScriptFamily = "ai" | "marketing";

/** Words that place a lane in a family. Checked against name + definition. */
const AI_WORDS =
  /\b(ai|a\.i\.|artificial intelligence|llm|model|models|tool|tools|app|apps|agent|agents|software|tech|technology|automation|automate|workflow|workflows|prompt|prompts|chatgpt|openai|gemini|claude|midjourney|machine learning)\b/i;

const MARKETING_WORDS =
  /\b(marketing|campaign|campaigns|advert|advertis\w*|brand|brands|branding|commercial|billboard|packaging|rebrand|consumer|ugc|guerrilla|stunt|stunts|case stud\w*|agency|copywriting|positioning)\b/i;

export interface FamilyShape {
  family: ScriptFamily;
  /** What the viewer should think at the end — the point of the whole reel. */
  payoff: string;
  /** The beats, as planning logic. Never spoken, never labelled on screen. */
  structure: string[];
  /** How the last line must land. The one rule the two families disagree on. */
  ending: string;
}

export const FAMILY: Record<ScriptFamily, FamilyShape> = {
  // The team's Script Comparison sheet (11 Nov 2026): AI NEWS and BRAND STORY.
  ai: {
    family: "ai",
    payoff:
      "“Okay, now I understand what it does” and “I know how to choose or use AI more wisely.”",
    structure: [
      "hook: a plain question about the real-world problem the tech is trying to solve, or a bold, concrete line people can feel",
      "the fixed intro, right after the hook",
      "context: the tool and the company in one line, an unfamiliar company placed through something people know",
      "story: what it does, in words a shop owner would understand, every claim attributed (“The company says…”); one example only if the story gives it",
      "pause (optional): “Here's why that matters.” and one honest insight",
      "turn: “And there's a lesson here for businesses.”",
      "ending: one practical, balanced takeaway on choosing or using AI wisely",
    ],
    ending:
      "END ON ONE PRACTICAL TAKEAWAY THAT HELPS SOMEONE CHOOSE OR USE AI WISELY, after the turn line, as a contrast or “Sometimes, …”. " +
      "Never recommend or sell the tool, and never a generic line that fits any tool (“this could be the tool to boost your productivity”).",
  },
  marketing: {
    family: "marketing",
    payoff: "“I did not know this brand did that” and “now I understand the lesson behind it.”",
    structure: [
      "hook: a curiosity question about what the brand did, or a familiar brand fact and a line that promises more",
      "the fixed intro, right after the hook",
      "context: answer the hook right away (“That's what Jaguar did in 2024.”) or name the campaign in one line",
      "story: what the brand wanted, what it did and the surprising detail, in order, in lines people can picture",
      "pause (optional): “Think about that.” and at most one real question that names the business problem",
      "turn: “And there's a lesson here for businesses.” or “And there's a marketing lesson here.”",
      "ending: one balanced human insight that connects back to the hook",
    ],
    ending:
      "END ON ONE BALANCED HUMAN INSIGHT, after the turn line, in the shape “Sometimes, … But/It's about …”, said once. " +
      "Fair to the brand: what made sense before what went wrong. Never a generic ending that fits any brand (“emphasize your brand's emotional connection”).",
  },
};

/**
 * Which script shape a lane calls for, or null when it is genuinely neither.
 *
 * The NAME decides it, and the definition is only consulted when the name
 * settles nothing. That order was found the hard way: "AI tool workflows" is
 * defined as "how AI tools can streamline or transform MARKETING tasks", so
 * reading name and definition together classified a tool lane as a campaign
 * case study — and it would have ended every AI reel with "the lesson is…".
 * A lane's name is what the lane is; its definition describes who it is for.
 *
 * Marketing wins a tie WITHIN the name. "AI marketing campaigns" names both,
 * and there the reel is a campaign story that happens to involve AI — it still
 * needs the brand reveal and the transferable lesson.
 */
export function scriptFamily(lane: { name: string; definition?: string }): ScriptFamily | null {
  const byName = familyOf(lane.name);
  if (byName) return byName;
  return familyOf(lane.definition ?? "");
}

function familyOf(text: string): ScriptFamily | null {
  if (MARKETING_WORDS.test(text)) return "marketing";
  if (AI_WORDS.test(text)) return "ai";
  return null;
}

/** The shape for a lane, or null where none is forced. */
export function shapeFor(lane: { name: string; definition?: string }): FamilyShape | null {
  const family = scriptFamily(lane);
  return family ? FAMILY[family] : null;
}

/**
 * The call to action, per lane, as the team set it.
 *
 * Pritesh's brief says a script must stand on its own without a CTA, and that
 * when one IS requested it is one relevant action. The team has requested one
 * for every lane: the daily line, word for word, for three of them, and for
 * AI tool workflows "Comment KEYWORD and I'll send you the full step-by-step
 * guide.", with a keyword chosen for each reel's topic.
 */
export const DAILY_CTA = "Follow for daily AI and marketing updates. See you tomorrow.";

const LANE_CTA: Record<string, string> = {
  "frontier ai developments": DAILY_CTA,
  "brand strategy lessons": DAILY_CTA,
  "marketing stunts": DAILY_CTA,
};

/** The fixed closing line for a lane, or null where the writer composes it. */
export function ctaFor(lane: string | null | undefined): string | null {
  return LANE_CTA[(lane ?? "").trim().toLowerCase()] ?? null;
}

/**
 * The closing line a lane's reel ends on, ready to say: the fixed line, or
 * for AI tool workflows the comment CTA with a keyword from the title. Null
 * for a lane without an agreed CTA.
 */
export function closingLineFor(lane: string | null | undefined, title: string): string | null {
  if (isAiToolWorkflowLane(lane)) return workflowCta(workflowKeyword(title));
  return ctaFor(lane);
}

/**
 * The extra rule for one lane, or "" where the lane has none.
 *
 * Frontier AI developments once had to name a brand using the development,
 * real or a hypothetical "mid-size travel agency". The team's sheet (11 Nov
 * 2026) marks exactly that as wrong: the story's own example, or none.
 */
const LANE_BRAND_RULE: Record<string, string> = {
  "frontier ai developments":
    'AI NEWS: explain what it does in words a shop owner would understand; attribute every claim ("The company says…", "in its own tests"); place an unfamiliar company through something people know. ' +
    'Use only an example the story itself gives; never a hypothetical business ("Imagine you run a mid-size travel agency").',
};

export function brandRule(lane: string | null | undefined): string {
  return LANE_BRAND_RULE[(lane ?? "").trim().toLowerCase()] ?? "";
}

/** The prompt's wording of the CTA rule for one lane. */
export function ctaRule(lane: string | null | undefined): string {
  const fixed = ctaFor(lane);
  if (fixed) {
    return `CTA: the reel ENDS on exactly this line, word for word, as its own final shot, after the closing insight: "${fixed}" It is the one CTA, and it is not counted in the script's words.`;
  }
  if (isAiToolWorkflowLane(lane)) {
    return `CTA: the reel ENDS on the comment CTA, as its own final shot, in exactly this shape: "${workflowCta("KEYWORD")}" Replace KEYWORD with ONE short word in capitals taken from this reel's tool or task (ADS for an ad builder, GEMINI for a Gemini workflow), so each reel's comments can be told apart. The team sends the guide to everyone who comments, so this promise is confirmed. Never a stock sign-off such as "Follow for more" or "See you next time". It is not counted in the script's words.`;
  }
  return 'CTA: end on ONE call to action written for THIS reel: it names the tool or the task the reel just showed, so it could not close any other reel. Shapes, not wording: "Try it on your next promotion and see what it gives you." / "Save this for the next time an ad is due tomorrow." / "Follow if you want more ways to get ads out faster." Never a stock sign-off such as "Follow for more AI and marketing tips", "See you next time" or "See you tomorrow", and never the daily line the other lanes use. It is not counted in the script\'s words. Never promise a guide, template, link or resource, and never "comment X and I\'ll send you".';
}

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Makes sure a reel's voiceover ends on its lane's fixed CTA.
 *
 * The prompt asks for it; this guarantees it, because a CTA that is "nearly"
 * the agreed line is a CTA the team has to retype. When the line is already
 * there it is left alone. When it is missing, it is added as the closing shot
 * rather than spliced into the last sentence, so nothing the writer said is
 * cut and the editor gets a clean final beat.
 */
export function withLaneCta<T extends { voiceover: string; onScreenText: string }>(
  shots: T[],
  lane: string | null | undefined,
  closingShot: (cta: string) => T,
  title = "",
): T[] {
  if (!shots.length) return shots;
  // AI tool workflows: the comment CTA, in whatever keyword the writer chose.
  // When the closing line is not one, the CTA is added after it with a
  // keyword from the title, so the reel never ends without it.
  if (isAiToolWorkflowLane(lane)) {
    if (isWorkflowCta(shots[shots.length - 1]!.voiceover ?? "")) return shots;
    return [...shots, closingShot(workflowCta(workflowKeyword(title)))];
  }
  const cta = ctaFor(lane);
  if (!cta) return shots;
  const target = normalise(cta);
  const spoken = normalise(shots.map((shot) => shot.voiceover ?? "").join(" "));
  if (spoken.endsWith(target)) return shots;
  // Already said earlier and then followed by more: move nothing, add nothing.
  if (spoken.includes(target)) return shots;

  // A near-miss in the closing shot — "follow for daily AI & marketing
  // updates, see you tomorrow!" — is corrected IN PLACE. Appending the exact
  // line after it would have him say the same sign-off twice.
  const words = target.split(" ");
  const last = shots.length - 1;
  const lastWords = new Set(normalise(shots[last]!.voiceover ?? "").split(" "));
  const overlap = words.filter((word) => lastWords.has(word)).length / words.length;
  if (overlap >= 0.7) {
    return shots.map((shot, index) => (index === last ? { ...shot, voiceover: cta } : shot));
  }
  return [...shots, closingShot(cta)];
}

/**
 * The per-lane structure block for the prompt./**
 * The per-lane structure block for the prompt.
 *
 * Written as a list of lanes rather than one chosen shape, because a normal
 * generation writes three ideas across DIFFERENT lanes and each needs its own
 * ending. Lanes matching neither family are named as such so the model picks
 * from the subject rather than guessing silently.
 */
export function laneShapesBlock(lanes: ContentLane[]): string {
  if (!lanes.length) return "";

  const lines = lanes.map((lane) => {
    const shape = shapeFor({ name: lane.name, definition: lane.definition });
    if (!shape) {
      return `- ${reelLaneNote(lane.name)} The ending follows the brief: one balanced takeaway after the turn line.`;
    }
    return [
      `- "${lane.name}" is ${shape.family === "ai" ? "an AI NEWS" : "a BRAND STORY"} reel.`,
      `  ${reelLaneNote(lane.name)}`,
      `  Viewer finishes thinking: ${shape.payoff}`,
      `  Beats, as planning logic only — never spoken, never labelled on screen:`,
      ...shape.structure.map((beat, index) => `    ${index + 1}. ${beat}`),
      `  ${shape.ending}`,
      `  ${ctaRule(lane.name)}`,
      ...(brandRule(lane.name) ? [`  ${brandRule(lane.name)}`] : []),
    ].join("\n");
  });

  return `SCRIPT SHAPE BY LANE, from the team's reel brief (the fixed intro goes right after the hook in every lane):\n${lines.join("\n")}`;
}

/**
 * The reel type and flow each lane asked for in the team's Script Comparison
 * sheet (11 Nov 2026), from its per-lane and per-story prompts.
 */
const LANE_NOTES: Record<string, string> = {
  "brand strategy lessons": `"Brand strategy lessons": reel type BRAND STORY. Hook a) or b). Tell what the brand wanted, what it did and the surprising detail, in order. Optional pause: "Think about that." and at most one real question that names the business problem ("How do you stand out when your biggest competitor shares your story?"). Then what the brand did, in plain words people can picture, not numbers. Turn: "And there's a lesson here for businesses." End on a balanced human insight: "Sometimes, ... But/It's about ...". Fair to the brand: what made sense before what went wrong.`,
  "marketing stunts": `"Marketing stunts": reel type BRAND STORY. Hook from what people know the brand for, or a "What if..." / "What happens when..." question about what it did. Name the campaign in one line. Describe the ad scene by scene in short lines, so the viewer can picture it. "But here's the surprising part." for the one surprising detail, attributed ("Levi's says..."). Turn: "And there's a marketing lesson here." End on ONE line starting "Sometimes, ..." that connects back to the hook.`,
  "frontier ai developments": `"Frontier AI developments": reel type AI NEWS. Hook c) or d). Name the tool and the company in one line, placing an unfamiliar company through something people know. Explain it in one short contrast ("Most AI tools are built to talk. This one is built to decide."), then how it works in plain words, every claim attributed ("The company says...", "in its own tests"). "Here's why that matters." or one example the story itself gives, started with "Imagine..." only when it pictures that example (a customer message being routed), never a hypothetical business. Turn: "And there's a lesson here for businesses." End on how to choose or use AI wisely ("When you pick an AI tool, don't just ask what it can do. Ask what it was built not to do."). Never sell the tool.`,
  "ai tool workflows": `"AI tool workflows": reel type AI NEWS, with the workflow shown as steps (the AI TOOL WORKFLOW block below). The voice rules, NUMBERS, NEVER and the fixed intro apply as to every reel.`,
};

/** The sheet's flow for one lane, or a pointer to pick by subject for a lane it does not cover. */
export function reelLaneNote(lane: string): string {
  return (
    LANE_NOTES[lane.trim().toLowerCase()] ??
    `"${lane}": pick the reel type from the subject: BRAND STORY for a brand, campaign or stunt; AI NEWS for a tool, model or AI development.`
  );
}
