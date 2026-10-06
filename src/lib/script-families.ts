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
  ai: {
    family: "ai",
    payoff: "“I did not know AI could do that” and “I can actually use this.”",
    structure: [
      "the problem or the curiosity — a real friction the viewer recognises",
      "the tool, model or development revealed naturally",
      "what it actually does, in plain words",
      "only the most interesting capability — not a feature list",
      "one specific, ordinary use case",
      "why the viewer should care",
    ],
    ending:
      "END ON A USEFUL IMPLICATION — a workflow benefit, a limitation worth knowing, or where this is heading. " +
      "NEVER end an AI reel with “the lesson is…”: that belongs to a campaign case study and reads as borrowed there.",
  },
  marketing: {
    family: "marketing",
    payoff:
      "“I did not know this brand did that” and “now I understand why that marketing worked.”",
    structure: [
      "a curiosity hook that does NOT give the story away",
      "the brand and campaign revealed right after it, as the answer to that curiosity",
      "specifically what the brand did — the concrete action, not an abstract description",
      "the result, ONLY where it is verified — never invent a metric to round the story off",
      "why it worked, or why it failed: the strategic insight, the mechanism, the psychology",
      "the transferable lesson",
    ],
    ending:
      "END ON A TRANSFERABLE MARKETING LESSON — one another marketer could apply to a different brand. " +
      "Restating the campaign is not a lesson: “a brand can turn a weakness into proof of a product benefit” is; " +
      "“the lesson is that Burger King showed a moldy burger” is not.",
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
      return `- "${lane.name}": neither a tool/capability lane nor a campaign lane. Choose the ending from the SUBJECT — a useful implication for a tool or development, a transferable lesson for a brand's action.`;
    }
    return [
      `- "${lane.name}" is a ${shape.family === "ai" ? "TOOL / CAPABILITY" : "CAMPAIGN CASE STUDY"} reel.`,
      `  Viewer finishes thinking: ${shape.payoff}`,
      `  Beats, as planning logic only — never spoken, never labelled on screen:`,
      ...shape.structure.map((beat, index) => `    ${index + 1}. ${beat}`),
      `  ${shape.ending}`,
    ].join("\n");
  });

  return `SCRIPT SHAPE BY LANE — the ending differs by lane and is the part most often got wrong:\n${lines.join("\n")}`;
}
