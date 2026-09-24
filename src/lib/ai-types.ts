// Shapes returned by the AI analyst. Client-safe — no server imports.
//
// Note what these types do NOT contain: any metric. Every number on screen is
// computed in TypeScript from scraped data. The model contributes judgement and
// copy, and is constrained to reference figures it was given rather than
// producing its own.
import type { PlatformId } from "@/lib/analytics-types";
import type { Prediction } from "@/lib/prediction";

export type GapTone = "good" | "bad" | "warn" | "neutral";

export interface CompetitorVerdict {
  /** Matches a handle from the benchmark table. */
  handle: string;
  /** The content lane this account occupies, in a few words. */
  lane: string;
  /** One-line verdict for the table's gap column. */
  gap: string;
  tone: GapTone;
  /** Why that verdict, referencing the supplied figures. */
  reasoning: string;
}

/**
 * The Competitor agent's read. PUBLIC signal only.
 *
 * Note what is absent: any statement about the owner's own reach, saves or
 * watch time. That is not a matter of prompt discipline — the agent is handed a
 * brief with those fields stripped out, so it has no such figure to state.
 */
/** One crisp finding for the team, and the action it implies. */
export interface TeamTakeaway {
  /** At most 12 words. The finding, in plain language. */
  takeaway: string;
  /** What to actually do about it, this week. */
  soWhat: string;
}

export interface CompetitorAnalysis {
  /** The strategic read, two or three sentences. */
  headline: string;
  /**
   * Exactly 4, most important first — the part of this panel a busy team reads.
   *
   * Kept as its own field rather than left for the reader to distil from the
   * headline and tables: a takeaway nobody extracts is a takeaway nobody acts
   * on, and "what do we do with this?" was the gap the rest of the panel left.
   */
  teamTakeaways: TeamTakeaway[];
  /** Lanes rivals already win, with the evidence. */
  contestedLanes: string[];
  /** Lanes nobody in the set is winning — the openings. */
  openLanes: string[];
  verdicts: CompetitorVerdict[];
}

/** One lane as the Analyst reads it for the owner's own account. */
export interface LaneVerdict {
  lane: string;
  /** Short call for a list: "carrying the account", "absorbing effort". */
  verdict: string;
  tone: GapTone;
  reasoning: string;
}

/**
 * The Analyst agent's read — the client's OWN measured performance.
 *
 * Kept apart from the competitor read because they rest on different evidence:
 * this one may cite saves, shares and watch time, which exist for the client and
 * for nobody else.
 */
export interface AnalystRead {
  headline: string;
  /** Exactly 4, most important first — the part a busy team actually reads. */
  teamTakeaways: TeamTakeaway[];
  /** What is working, each citing a figure it was given. */
  strengths: string[];
  /** What is not, stated plainly rather than softened. */
  weaknesses: string[];
  laneNotes: LaneVerdict[];
}

/** One lesson drawn from suggestions that were actually published. */
export interface ReflectionLesson {
  lane: string;
  lesson: string;
  /** The measured figures the lesson rests on. */
  evidence: string;
  /** False when too few outcomes exist to treat it as settled. */
  confirmed: boolean;
}

/**
 * The Reflection agent's read: what the system learned from its own advice.
 *
 * Qualitative only. It is explicitly forbidden from producing a confidence
 * number — that belongs to the prediction layer, fitted on measured outcomes,
 * never to a model asked how sure it feels.
 */
export interface ReflectionRead {
  overall: string;
  lessons: ReflectionLesson[];
}

/**
 * One item the agent picked out of a real external feed.
 *
 * `term` is copied verbatim from data that came back from a live source. Both
 * the Trend scout and the Audience-question agent are given a list and asked to
 * select from it — never to recall one. A trend named from memory would be
 * indistinguishable from a real one on screen, and wrong exactly when it
 * matters.
 */
export interface FeedPick {
  /** Copied exactly from the feed. */
  term: string;
  /** Why it is worth this specific account's attention. */
  whyRelevant: string;
  /** Which of the account's own lanes it fits, or "" when none does. */
  lane: string;
}

export interface FeedRead {
  headline: string;
  picks: FeedPick[];
  /** Said plainly when the feed returned nothing worth using. */
  note: string;
  /** How many raw items the feed returned before selection. */
  candidatesFound: number;
  /** The queries actually sent to the feed, so the result is reproducible. */
  queries: string[];
}

/**
 * Instagram is filmed or designed: a reel or a carousel. LinkedIn is WRITTEN:
 * a text post, a long-form article, or a document carousel (a PDF of pages).
 * Each platform's strategist call is only ever offered its own formats.
 */
export type IdeaFormat = "reel" | "carousel" | "text_post" | "article" | "document";

export const PLATFORM_FORMATS = {
  instagram: ["reel", "carousel"],
  linkedin: ["text_post", "article", "document"],
} as const satisfies Record<"instagram" | "linkedin", readonly IdeaFormat[]>;

export const FORMAT_LABEL: Record<IdeaFormat, string> = {
  reel: "Reel",
  carousel: "Carousel",
  text_post: "Text post",
  article: "Article",
  document: "Document carousel",
};

/** A written deliverable — LinkedIn's equivalent of a shot list. */
export interface WrittenPost {
  /**
   * Text post: the complete post, ready to paste. Article: the intro.
   * Document: the post that sits above the PDF.
   */
  body: string;
  /** Article sections, or document pages. Empty for a plain text post. */
  sections: Array<{ heading: string; text: string }>;
}

/**
 * Where an idea's subject comes from.
 *
 * `verified` is the line that matters. True means the idea was built on an
 * article this system FETCHED — the model chose it by id from a live list, and
 * url/title/publisher/publishedAt were attached server-side from the stored
 * row. None of those four fields ever passes through the model, so none can be
 * invented.
 *
 * False means no live source was available when the idea was written, and the
 * subject comes from the model's own knowledge; the UI says so and offers a
 * search instead of a link.
 */
export interface IdeaSource {
  verified: boolean;
  /** The source_items row, when verified. */
  sourceId?: string | undefined;
  url?: string | undefined;
  /** The headline exactly as published. */
  headline?: string | undefined;
  publisher?: string | undefined;
  publishedAt?: string | undefined;
  /** How many outlets carried the story when it was fetched. */
  coverage?: number | undefined;
  /** The brand, campaign or event the idea is about, as the model named it. */
  subject: string;
  /** Where it happened — kept for unverified ideas, where it is all there is. */
  origin: string;
  /** A search phrase for finding video coverage or background. */
  searchQuery: string;
}

/**
 * Where an idea stands in the feedback loop.
 *
 * "suggested" the moment it's generated. A creator moves it to "used" by
 * linking the real post they made from it, or to "dismissed" if they chose not
 * to film it — both are terminal, set once, by a person, never inferred.
 */
export type IdeaStatus = "suggested" | "used" | "dismissed";

/**
 * One shot in an editor handover. Deliberately closer to a shot list than to a
 * beat sheet: an editor needs to know what is on screen, what is heard, what is
 * overlaid and how it cuts — a paragraph of "direction" leaves all four to
 * guesswork.
 */
export interface Shot {
  /** Range, e.g. "0:00–0:04". Slide number for a carousel. */
  mark: string;
  /** "Talking head — medium", "Screen recording", "B-roll", "Slide". */
  shotType: string;
  /** What the viewer sees. Concrete enough to shoot or source. */
  visual: string;
  /** Spoken line. Empty string for silent shots. */
  voiceover: string;
  /** Text burned on screen. Empty string when none. */
  onScreenText: string;
  /** How it leaves this shot: "Hard cut", "Whip pan", "Hold". */
  transition: string;
}

/** Everything an editor needs that is not a shot. */
export interface ProductionNotes {
  durationSeconds: number;
  aspectRatio: string;
  /** Text for the cover frame / thumbnail. */
  coverText: string;
  musicDirection: string;
  subtitleStyle: string;
  /** B-roll or assets to source before the edit. */
  assetsNeeded: string[];
  /** Anything else the editor must know. */
  editorNotes: string[];
}

export interface ContentIdea {
  /**
   * The suggested_ideas row id once persisted, replacing the model's own
   * kebab-case slug. This is what "I filmed this one" sends back, so it has to
   * be the durable database key rather than a value the model invented and
   * that no later request can look up.
   */
  id: string;
  format: IdeaFormat;
  title: string;
  /** The angle in one sentence. */
  angle: string;
  /** Must reference the supplied performance figures. */
  whyNow: string;
  /**
   * The separator named in whyNow, restated as a short reusable label — e.g.
   * "concrete business-problem opener". Stored so a future rollup can group
   * suggestions by trait rather than re-parsing whyNow's prose.
   */
  winningTrait: string;
  /** The lane this idea targets, from the account's own taxonomy. */
  contentLane: string;
  /**
   * Which signal drove it: the account's own measured performance, or what is
   * working across the tracked niche. Kept distinct because they are different
   * kinds of evidence and the scorecard reports them separately.
   */
  sourceSignal: "owner" | "niche" | "niche_trend";
  /**
   * Where the SUBJECT comes from in the real world. Verified ideas link to the
   * fetched article; see IdeaSource. Absent on ideas generated before sources
   * existed.
   */
  source?: IdeaSource | undefined;
  hook: string;
  /** Reel shots or carousel slides. Empty for LinkedIn's written formats. */
  shots: Shot[];
  /** Filmed/designed formats only. Absent on a LinkedIn written format. */
  production?: ProductionNotes | undefined;
  /** LinkedIn's written formats only: the post itself. */
  post?: WrittenPost | undefined;
  caption: string;
  hashtags: string[];
  /**
   * What this idea is expected to do, from the prediction layer — NOT from the
   * model that wrote the idea.
   *
   * There used to be a 1–5 confidence here, emitted by the strategist itself and
   * drawn on screen as pips. That number was fabricated: a model asked how sure
   * it feels produces something that looks like measurement and is not. It is
   * replaced by this, which in cold-start is a relative statement about the
   * lane's own measured performance and carries no absolute figure at all.
   *
   * Absent on ideas generated before the prediction layer existed.
   */
  prediction?: Prediction;
  /** Present once the idea has been persisted — absent only mid-generation. */
  status?: IdeaStatus;
  /** Set once a creator links this idea to the post they made from it. */
  publishedShortcode?: string;
}

export interface IdeaSet {
  ideas: ContentIdea[];
}

export interface DiscoveredAccount {
  handle: string;
  displayName: string;
  followers: number;
  lane: string;
  whyComparable: string;
  /** "peer" is directly comparable; "benchmark" is a large account to study. */
  tier: "peer" | "benchmark";
}

/** How the competitor set was found, when discovery ran. */
export interface DiscoverySummary {
  niche: string;
  searchQueries: string[];
  candidatesFound: number;
  selected: DiscoveredAccount[];
  note: string;
}

export interface AiAnalysis {
  platform: PlatformId;
  generatedAt: string;
  model: string;
  /** The client's own measured read. Absent when that agent failed. */
  analyst?: AnalystRead | null;
  competitors: CompetitorAnalysis | null;
  /** Only present once suggestions have been published and measured. */
  reflection?: ReflectionRead | null;
  /** Rising topics selected from a live trend feed. Absent when no feed is configured. */
  trends?: FeedRead | null;
  /** Real questions people ask in the niche. Absent when no feed is configured. */
  audienceQuestions?: FeedRead | null;
  ideas: ContentIdea[];
  /** Ideas the strategist wrote but the loop discarded because they used a blocked pattern. */
  dropped?: string[];
  /** Present when this run discovered the competitor set. */
  discovery?: DiscoverySummary;
  /** Populated when generation failed; the UI shows it instead of stale output. */
  error?: string;
}
