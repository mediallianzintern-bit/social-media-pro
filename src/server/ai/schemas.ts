// JSON Schemas for OpenAI strict structured output, plus Zod validators for the
// parsed result.
//
// Strict mode requires every property to be required and additionalProperties to
// be false. Anything the model might legitimately omit is therefore typed as an
// empty string or empty array rather than as optional — a missing key would fail
// the call outright.
import { z } from "zod";

export const COMPETITOR_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "teamTakeaways", "contestedLanes", "openLanes", "verdicts"],
  properties: {
    headline: {
      type: "string",
      description: "Two or three sentences reading the competitive position.",
    },
    teamTakeaways: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["takeaway", "soWhat"],
        properties: {
          takeaway: {
            type: "string",
            description:
              "ONE short sentence, at most 12 words, plain language, no jargon. State the " +
              "finding, not the method. Quote a figure only when it fits naturally, and write " +
              "any multiple as '2.4x', never as a bare decimal.",
          },
          soWhat: {
            type: "string",
            description:
              "ONE sentence naming the concrete next action for the team — something a person " +
              "could start this week with the people and budget they already have. Not " +
              "'increase engagement' or 'post more consistently'; rather the shape of 'open the " +
              "next three teardowns with the customer problem, not the brand name'. If the " +
              "honest answer is that nothing needs to change, say that instead of inventing work.",
          },
        },
      },
      description:
        "EXACTLY 4 takeaways, most important first. This is the part the team actually reads, " +
        "so it must stand alone without the tables above it.",
    },
    contestedLanes: {
      type: "array",
      items: { type: "string" },
      description:
        "Lanes a rival is measurably winning, each naming who and citing their figure. 2-4 items.",
    },
    openLanes: {
      type: "array",
      items: { type: "string" },
      description:
        "Lanes nobody in the set is winning — the openings. A lane counts as open when it is " +
        "published into but nothing clears its own median, not merely when it is unpopular. 2-4 items.",
    },
    verdicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["handle", "lane", "gap", "tone", "reasoning"],
        properties: {
          handle: { type: "string" },
          lane: { type: "string", description: "Content lane in a few words." },
          gap: { type: "string", description: "Short verdict, max 4 words." },
          tone: { type: "string", enum: ["good", "bad", "warn", "neutral"] },
          reasoning: { type: "string" },
        },
      },
    },
  },
};

/** The Analyst agent — the client's OWN measured performance. */
export const ANALYST_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "teamTakeaways", "strengths", "weaknesses", "laneNotes"],
  properties: {
    headline: {
      type: "string",
      description:
        "Two or three sentences on how this account is actually performing, on its own terms. " +
        "No comparison to any other account — that is a different agent's job.",
    },
    teamTakeaways: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["takeaway", "soWhat"],
        properties: {
          takeaway: {
            type: "string",
            description:
              "ONE short sentence, at most 12 words, plain language, no jargon and no field " +
              "names. State the finding. Write any multiple as '2.4x', never as a bare decimal.",
          },
          soWhat: {
            type: "string",
            description:
              "ONE sentence naming the concrete next action — something the team could start " +
              "this week with the people and budget they already have. Not 'post more " +
              "consistently' or 'increase engagement', which restate wanting to do better; " +
              "rather the shape of 'open the next three teardowns with the customer problem'. " +
              "If the honest answer is that nothing needs to change, say so rather than " +
              "inventing work.",
          },
        },
      },
      description:
        "EXACTLY 4 takeaways, most important first. This is what a busy team reads instead of " +
        "the lists above, so it has to stand alone.",
    },
    strengths: {
      type: "array",
      items: { type: "string" },
      description: "What is working, each citing a figure from the data. 2-4 items.",
    },
    weaknesses: {
      type: "array",
      items: { type: "string" },
      description:
        "What is not working, stated plainly rather than softened into an opportunity. " +
        "2-4 items. If the data does not support a weakness, return fewer rather than padding.",
    },
    laneNotes: {
      type: "array",
      description: "One entry per lane in the supplied lanes array, in the order given.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lane", "verdict", "tone", "reasoning"],
        properties: {
          lane: { type: "string", description: "Copied verbatim from the lanes data." },
          verdict: {
            type: "string",
            description:
              'Four words at most, for a list: "carrying the account", "absorbing effort", ' +
              '"too few posts to tell".',
          },
          tone: { type: "string", enum: ["good", "bad", "warn", "neutral"] },
          reasoning: {
            type: "string",
            description:
              "One sentence citing this lane's own figures — medianVsMedian, and the gap " +
              "between shareOfOutputPct and shareOfPerformancePct where it is wide.",
          },
        },
      },
    },
  },
};

/** The Reflection agent — lessons from suggestions that were actually published. */
export const REFLECTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["overall", "lessons"],
  properties: {
    overall: {
      type: "string",
      description:
        "Two or three sentences on whether this system's own suggestions have been working, " +
        "citing the measured figures. State plainly when the sample is too small to tell — " +
        "that is the honest answer early on, not a failure to have an opinion.",
    },
    lessons: {
      type: "array",
      description:
        "One lesson per lane that has measured outcomes. Omit lanes with none rather than " +
        "speculating about them.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lane", "lesson", "evidence", "confirmed"],
        properties: {
          lane: { type: "string", description: "Copied verbatim from the outcome data." },
          lesson: {
            type: "string",
            description:
              "What to do differently next time in this lane, in one actionable sentence. " +
              "Not a restatement of the numbers — a change of approach.",
          },
          evidence: {
            type: "string",
            description: "The measured figures this rests on, quoted from the data.",
          },
          confirmed: {
            type: "boolean",
            description:
              "True only when at least three measured outcomes back this lane. One or two " +
              "outcomes is an anecdote and must be marked false.",
          },
        },
      },
    },
  },
};

/**
 * The ideas schema, built per call.
 *
 * Built rather than constant because three things about it are facts about
 * THIS generation, and strict structured outputs let us make each one a hard
 * constraint instead of a request:
 *
 *   • sourceId is an enum of the articles actually fetched. The model cannot
 *     return a source that is not in the list — not "should not": cannot.
 *   • contentLane is an enum of the lanes the loop still allows. A lane the
 *     loop has blocked is simply absent, so no idea can target it.
 *   • The deliverable follows the platform: a shot list for Instagram, a
 *     written post for LinkedIn, and each platform only sees its own formats.
 */
export function ideasSchemaFor(options: {
  platform: "instagram" | "linkedin";
  /** Fetched source ids. Empty means no live source was available. */
  sourceIds: string[];
  /** Allowed lanes. Empty means the account has no lane list yet. */
  lanes: string[];
}): Record<string, unknown> {
  const written = options.platform === "linkedin";
  const sourceIds = options.sourceIds.length ? options.sourceIds : ["none"];

  const item = {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "format",
      "title",
      "angle",
      "whyNow",
      "winningTrait",
      "contentLane",
      "source",
      "sourceSignal",
      "hook",
      ...(written ? ["post"] : ["shots", "production", "caption"]),
      "hashtags",
    ],
    properties: {
      id: { type: "string", description: "kebab-case slug" },
      format: {
        type: "string",
        enum: written ? ["text_post", "article", "document"] : ["reel", "carousel"],
      },
      title: {
        type: "string",
        description:
          "The SUBJECT of the reel, named concretely — a specific brand, campaign, product, " +
          "tool, person or event the viewer could look up. Six to ten words. " +
          "'Patagonia's anti-shopping campaign' and 'LEGO almost went bankrupt' are titles; " +
          "'Make the box the ad', 'The new AI scam' and 'Turn client calls into content' " +
          "are NOT — they name a format or a theme and leave the reader with no idea what " +
          "the reel is about. If you cannot name the specific thing it covers, you have not " +
          "chosen a subject yet.",
      },
      angle: {
        type: "string",
        description:
          "One sentence: what this reel ARGUES about that subject, and the turn it takes. " +
          "Name the same concrete subject again — it must read as a claim someone could " +
          "disagree with, not a description of a format. 'A packaging stunt where the thing " +
          "people touch carries the message' describes a format; 'Patagonia told people not " +
          "to buy the jacket, and sold more of them' is an angle.",
      },
      whyNow: {
        type: "string",
        description:
          "At most three sentences. Sentence one states the trait that separates this " +
          "account's top posts from its weakest ones. The rest cite the specific figures " +
          "proving it — vsMedian, saveRatePct, reach. Start with the insight itself: do " +
          "NOT begin with 'Trace:', 'This traces to', or any similar preamble, and do not " +
          "explain the choice of format unless the account publishes more than one format.",
      },
      winningTrait: {
        type: "string",
        description:
          "The same separator named in whyNow, restated as a short standalone label a " +
          "person can scan in a list — e.g. 'concrete business-problem opener' or 'save-worthy " +
          "how-to structure'. Five to eight words. This is stored and compared across every " +
          "idea ever suggested for this account, so it must name the TRAIT being reproduced, " +
          "not this specific idea's topic — 'privacy hook' is a topic; 'names the stakes in " +
          "the first line' is a trait.",
      },
      contentLane: {
        type: "string",
        ...(options.lanes.length ? { enum: options.lanes } : {}),
        description:
          "The lane this idea targets, copied verbatim from the account's supplied lane " +
          "list. Never invent a lane name. Use the empty string only when no lane list " +
          "was supplied at all.",
      },
      sourceSignal: {
        type: "string",
        enum: ["owner", "niche", "niche_trend"],
        description:
          "'owner' when this idea comes from the account's own measured performance — " +
          "its top posts, its past suggestions, its save and share behaviour. 'niche' " +
          "when it comes from what is working across the tracked accounts. These are " +
          "different kinds of evidence and are tracked separately, so answer honestly " +
          "about which actually drove the idea rather than defaulting to one.",
      },
      source: {
        type: "object",
        additionalProperties: false,
        required: ["sourceId", "subject", "origin", "searchQuery"],
        properties: {
          sourceId: {
            type: "string",
            enum: sourceIds,
            description: options.sourceIds.length
              ? "The id of the story in the SOURCES block this idea is built on, copied exactly. " +
                "Every idea must be built on one of them, and no two ideas on the same one."
              : 'Always "none": no live source was available for this generation.',
          },
          subject: {
            type: "string",
            description:
              "The brand, company, product, person or event the idea is about, named " +
              "precisely. When built on a source, it must be what that headline reports.",
          },
          origin: {
            type: "string",
            description:
              "Where it happened or was announced. When built on a source, the publisher " +
              'named in the SOURCES block. Otherwise say "widely covered, original outlet ' +
              'uncertain" rather than guess a publication.',
          },
          searchQuery: {
            type: "string",
            description:
              "Six to twelve words to paste into YouTube or Google to find video coverage " +
              "and background on the same story. No quotes or operators.",
          },
        },
      },
      hook: {
        type: "string",
        description: written
          ? 'The first line of the post — what shows above LinkedIn\'s "see more" fold.'
          : "The literal first line, spoken or on screen.",
      },
      ...(written
        ? {}
        : {
            shots: {
              type: "array",
              description:
                "A shot list an editor can cut from without asking questions. 6-10 shots covering the whole piece.",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["mark", "shotType", "visual", "voiceover", "onScreenText", "transition"],
                properties: {
                  mark: {
                    type: "string",
                    description: 'Time range like "0:00–0:04", or "Slide 2".',
                  },
                  shotType: {
                    type: "string",
                    description:
                      'e.g. "Talking head — medium", "Screen recording", "B-roll", "Text card", "Slide".',
                  },
                  visual: {
                    type: "string",
                    description: "What is on screen. Concrete enough to shoot or source.",
                  },
                  voiceover: {
                    type: "string",
                    description: "Spoken line. Empty string if silent.",
                  },
                  onScreenText: { type: "string", description: "Burned-in text. Empty if none." },
                  transition: {
                    type: "string",
                    description: '"Hard cut", "Whip pan", "Hold", "Cross dissolve".',
                  },
                },
              },
            },
            production: {
              type: "object",
              additionalProperties: false,
              required: [
                "durationSeconds",
                "aspectRatio",
                "coverText",
                "musicDirection",
                "subtitleStyle",
                "assetsNeeded",
                "editorNotes",
              ],
              properties: {
                durationSeconds: { type: "integer", minimum: 5, maximum: 180 },
                aspectRatio: { type: "string", description: 'Usually "9:16".' },
                coverText: { type: "string", description: "Text for the cover frame." },
                musicDirection: { type: "string" },
                subtitleStyle: { type: "string" },
                assetsNeeded: {
                  type: "array",
                  items: { type: "string" },
                  description: "B-roll, screen recordings or graphics to source before the edit.",
                },
                editorNotes: { type: "array", items: { type: "string" } },
              },
            },
          }),
      ...(written
        ? {
            post: {
              type: "object",
              additionalProperties: false,
              required: ["body", "sections"],
              description:
                "The written deliverable, complete and ready to publish — not an outline of one.",
              properties: {
                body: {
                  type: "string",
                  description:
                    "text_post: the ENTIRE post, hook first, with line breaks as they should " +
                    "appear, 120-250 words. article: the introduction, 60-120 words. document: " +
                    "the post that sits above the PDF, 40-90 words.",
                },
                sections: {
                  type: "array",
                  description:
                    "text_post: empty. article: 4-7 sections, each a heading and its full " +
                    "paragraphs. document: 6-10 pages, each a short heading and the few lines " +
                    "that go on that page.",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["heading", "text"],
                    properties: {
                      heading: { type: "string" },
                      text: { type: "string" },
                    },
                  },
                },
              },
            },
          }
        : {
            caption: { type: "string" },
          }),
      hashtags: { type: "array", items: { type: "string" } },
    },
  };

  return {
    type: "object",
    additionalProperties: false,
    required: ["ideas"],
    properties: { ideas: { type: "array", items: item } },
  };
}

const shotSchema = z.object({
  mark: z.string(),
  shotType: z.string(),
  visual: z.string(),
  voiceover: z.string(),
  onScreenText: z.string(),
  transition: z.string(),
});

const productionSchema = z.object({
  durationSeconds: z.number().int(),
  aspectRatio: z.string(),
  coverText: z.string(),
  musicDirection: z.string(),
  subtitleStyle: z.string(),
  assetsNeeded: z.array(z.string()),
  editorNotes: z.array(z.string()),
});

export const competitorAnalysisSchema = z.object({
  headline: z.string(),
  teamTakeaways: z.array(z.object({ takeaway: z.string(), soWhat: z.string() })).default([]),
  contestedLanes: z.array(z.string()),
  openLanes: z.array(z.string()),
  verdicts: z.array(
    z.object({
      handle: z.string(),
      lane: z.string(),
      gap: z.string(),
      tone: z.enum(["good", "bad", "warn", "neutral"]),
      reasoning: z.string(),
    }),
  ),
});

export const ideaSetSchema = z.object({
  ideas: z.array(
    z.object({
      id: z.string(),
      format: z.enum(["reel", "carousel", "text_post", "article", "document"]),
      title: z.string(),
      angle: z.string(),
      whyNow: z.string(),
      winningTrait: z.string(),
      source: z.object({
        sourceId: z.string(),
        subject: z.string(),
        origin: z.string(),
        searchQuery: z.string(),
      }),
      contentLane: z.string(),
      sourceSignal: z.enum(["owner", "niche", "niche_trend"]),
      hook: z.string(),
      shots: z.array(shotSchema).default([]),
      production: productionSchema.optional(),
      post: z
        .object({
          body: z.string(),
          sections: z.array(z.object({ heading: z.string(), text: z.string() })),
        })
        .optional(),
      caption: z.string().default(""),
      hashtags: z.array(z.string()),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Competitor discovery
// ---------------------------------------------------------------------------

/**
 * Step one of discovery. The model returns SEARCH TERMS, never handles — asking
 * a model for Instagram usernames produces confident, non-existent accounts.
 */
export const NICHE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["niche", "audience", "contentLanes", "searchQueries"],
  properties: {
    niche: { type: "string", description: "The account's niche in one sentence." },
    audience: { type: "string", description: "Who follows this account and why." },
    contentLanes: {
      type: "array",
      items: { type: "string" },
      description: "The recurring content formats or topics, 2-5 items.",
    },
    searchQueries: {
      type: "array",
      items: { type: "string" },
      description:
        "4-6 short phrases to type into Instagram's search box to surface similar creators. Plain keywords, not hashtags, not usernames.",
    },
  },
};

/** Step three: pick real accounts from real search results. */
export const SCREEN_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["selected", "rejectedReason"],
  properties: {
    selected: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["handle", "lane", "whyComparable", "tier"],
        properties: {
          handle: {
            type: "string",
            description: "Must be copied exactly from the CANDIDATES list.",
          },
          lane: { type: "string" },
          whyComparable: { type: "string" },
          tier: {
            type: "string",
            enum: ["peer", "benchmark"],
            description:
              "peer = within ~12x the owner's followers; benchmark = a much larger account in the same domain.",
          },
        },
      },
    },
    rejectedReason: {
      type: "string",
      description: "One sentence on what was filtered out and why. Empty string if nothing was.",
    },
  },
};

export const nicheSchema = z.object({
  niche: z.string(),
  audience: z.string(),
  contentLanes: z.array(z.string()),
  searchQueries: z.array(z.string()),
});

export const screenSchema = z.object({
  selected: z.array(
    z.object({
      handle: z.string(),
      lane: z.string(),
      whyComparable: z.string(),
      tier: z.enum(["peer", "benchmark"]),
    }),
  ),
  rejectedReason: z.string(),
});

// ---------------------------------------------------------------------------
// Content lanes
// ---------------------------------------------------------------------------

/**
 * Derived ONCE per account, then persisted and reused.
 *
 * Re-deriving on every run would let "Brand teardowns" drift into "Brand case
 * studies" and silently break every comparison made against the older label, so
 * this runs only when an account has no taxonomy yet or one is explicitly
 * rebuilt.
 */
export const TAXONOMY_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["lanes"],
  properties: {
    lanes: {
      type: "array",
      description:
        "4-7 lanes covering what this account actually publishes. Lanes must be " +
        "distinguishable by reading a caption alone, and must partition the account's " +
        "output rather than overlapping — a post should obviously belong to one.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "definition"],
        properties: {
          name: {
            type: "string",
            description:
              "Two to four words, in the account's own terms — e.g. 'Brand teardowns', " +
              "'AI tool news', 'Hiring advice'. A topic or a format, not a judgement.",
          },
          definition: {
            type: "string",
            description:
              "One line stating what belongs in this lane and what does not, precise " +
              "enough that a later run classifying a new post applies the same boundary.",
          },
        },
      },
    },
  },
};

export const taxonomySchema = z.object({
  lanes: z.array(z.object({ name: z.string(), definition: z.string() })),
});

/** Assigns already-known lanes to posts. Never invents a new lane. */
export const CLASSIFY_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["assignments"],
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["postId", "lane"],
        properties: {
          postId: { type: "string", description: "Copied exactly from the input." },
          lane: {
            type: "string",
            description:
              "Exactly one lane name from the supplied taxonomy, copied verbatim, or " +
              "the literal string 'other' when the post genuinely fits none of them. " +
              "Never invent a lane name — a new name here corrupts every comparison " +
              "made against the existing vocabulary. 'other' is the correct answer for " +
              "a genuine outlier, and a growing pile of them is a useful signal that " +
              "the account's content has moved on.",
          },
        },
      },
    },
  },
};

export const classifySchema = z.object({
  assignments: z.array(z.object({ postId: z.string(), lane: z.string() })),
});

const toneSchema = z.enum(["good", "bad", "warn", "neutral"]);

export const analystSchema = z.object({
  headline: z.string(),
  teamTakeaways: z.array(z.object({ takeaway: z.string(), soWhat: z.string() })).default([]),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  laneNotes: z.array(
    z.object({
      lane: z.string(),
      verdict: z.string(),
      tone: toneSchema,
      reasoning: z.string(),
    }),
  ),
});

export const reflectionSchema = z.object({
  overall: z.string(),
  lessons: z.array(
    z.object({
      lane: z.string(),
      lesson: z.string(),
      evidence: z.string(),
      confirmed: z.boolean(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Feed-backed agents — Trend scout and Audience questions
// ---------------------------------------------------------------------------

/**
 * Shared by both feed agents. They differ only in what the candidate list is.
 *
 * The entire schema exists to constrain ONE thing: `term` must be copied from
 * the supplied list. Both agents are otherwise capable of producing a perfectly
 * plausible trend that does not exist, which would be indistinguishable from a
 * real one on screen and wrong exactly when someone acted on it.
 */
export const FEED_SELECTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "picks", "note"],
  properties: {
    headline: {
      type: "string",
      description:
        "One or two sentences on what the candidate list suggests for this account. " +
        "If nothing in it is relevant, say that plainly here.",
    },
    picks: {
      type: "array",
      description:
        "Up to five selections, best first. Return an empty array when nothing in the " +
        "candidates genuinely fits this account — a short honest list beats a padded one.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "whyRelevant", "lane"],
        properties: {
          term: {
            type: "string",
            description:
              "Copied CHARACTER FOR CHARACTER from the CANDIDATES list. Never reword it, " +
              "never tidy it, and never introduce one that is not in the list. Anything not " +
              "matching a candidate exactly will be discarded.",
          },
          whyRelevant: {
            type: "string",
            description:
              "One sentence on why this specific account should care, tied to its lanes or " +
              "its audience. Not a general statement about the topic being popular.",
          },
          lane: {
            type: "string",
            description:
              "Which of the account's own lanes this fits, copied verbatim from the lanes " +
              "given, or an empty string when none of them fit.",
          },
        },
      },
    },
    note: {
      type: "string",
      description:
        "What you rejected and why, in one sentence. Empty string if everything relevant " +
        "was selected.",
    },
  },
};

export const feedSelectionSchema = z.object({
  headline: z.string(),
  picks: z.array(z.object({ term: z.string(), whyRelevant: z.string(), lane: z.string() })),
  note: z.string(),
});
