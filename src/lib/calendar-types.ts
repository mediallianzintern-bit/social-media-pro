// The team's own content calendar, as training knowledge for topic selection.
//
// This is the only place in the system that holds HUMAN editorial judgement at
// scale: every row is a topic a person chose, wrote and in many cases shipped.
// The lane rankings say which lane wins; this says what a topic in that lane
// actually looks like to this team — which is what the topic engine needs in
// order to pick new ones that fit.
//
// Client-safe: the importer writes these, the topic inbox reads them, and the
// classifier below is shared so a row is labelled the same way in both.

/**
 * What KIND of topic an entry is.
 *
 * Kept separate from the content lane because the two answer different
 * questions. The lane is the subject area ("AI tool workflows"); the type is
 * where the topic has to be FOUND — an evergreen classic cannot be discovered
 * from this week's news, and a model launch cannot be found in an encyclopedia.
 * The topic engine runs a different feed per type.
 */
export type TopicType =
  /** A classic campaign, often years old. The team's staple — 82% of the calendar. */
  | "evergreen"
  /** A campaign in the news now: an award winner, or a launch this season. */
  | "fresh"
  /** An AI model, product or policy announcement. */
  | "ai_news"
  /** A named AI tool with a workflow someone can copy. */
  | "ai_tool";

export const TOPIC_TYPE_LABEL: Record<TopicType, string> = {
  evergreen: "Classic case study",
  fresh: "Fresh campaign / award",
  ai_news: "AI launch or announcement",
  ai_tool: "AI tool workflow",
};

/** One row of the calendar, after parsing and classification. */
export interface CalendarEntry {
  /** Stable identity: a hash of the normalised script. Re-importing updates, never duplicates. */
  contentHash: string;
  platform: "instagram" | "linkedin";
  /** Which workbook and sheet it came from, so a wrong label can be traced back. */
  sourceFile: string;
  sheet: string;
  plannedDate: string | null;
  /** The brand or tool the entry is about, where the team filled it in. */
  brand: string | null;
  /** The script as written by the team. The most valuable column. */
  content: string;
  caption: string | null;
  /** The team's own workflow state: Posted, Scheduled, Edited, Not Started. */
  status: string | null;
  /** True once this entry has been matched to a real published post. */
  publishedPostId: string | null;
  lane: string | null;
  topicType: TopicType;
  /** The named subjects found in the script — brands, tools, people. */
  subjects: string[];
}
