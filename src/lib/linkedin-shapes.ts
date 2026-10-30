// How Pritesh Sir's LinkedIn posts are shaped, lane by lane.
//
// Read from his own posts, not from the reel SOP: the 34 posts he published
// between 10 Sep and 28 Oct 2026, in full (the scraper's own output, before the
// dashboard trims captions to 300 characters), ranked by the impressions
// LinkedIn's API measured for each. The Instagram lane shapes
// (script-families.ts) are spoken reels with a shot list and a fixed sign-off;
// none of that carries over. What his LinkedIn posts actually do:
//
//   Two kinds of post. A FULL POST, 150-300 words (median 237), the whole
//   argument in the post. An ARTICLE TEASER, 75-125 words, that names a
//   development, asks the business question and points to his LinkedIn article.
//
//   What separates his best from his weakest: the best name a brand, tool or
//   figure in the first line ("McDonald's wants to make $1 billion from
//   advertising.", 503 impressions; "Meta just launched Muse…", 424; a Claude
//   Haiku 5.5 teaser, 462). The weakest open on a general principle ("If
//   everyone has access to AI, what will actually make a marketer stand out?",
//   115; "AI showing its 'thinking' might be…", 131).
//
//   Rhythm: one to three short lines per paragraph, a named source ("According
//   to The Wall Street Journal…", "A Gartner survey found…"), a turn ("Here's
//   why this matters.", "But there's a catch."), short arrow or numbered lists
//   for capabilities and steps, a contrast pair near the end ("SEO asks: Can I
//   rank? / AI search asks: Can I become the source?"), then a question to
//   readers and one "♻️ Repost to help …" line, or "Follow for more digital
//   marketing and AI insights."
//
// Keyed by the six LinkedIn lanes the team approved on 30 Oct 2026, built from
// his posts read in full (server/ai/linkedin-content.ts), with the lane's
// subject words as a fallback so a rename does not drop a lane to no shape.
//
// Client-safe. No model call.
import type { ContentLane } from "@/lib/analytics-types";

export interface LinkedInShape {
  /** What a post in this lane is, in his own posts. */
  is: string;
  /** How the first one or two lines land: all LinkedIn shows above "see more". */
  opening: string;
  /** The middle, as planning logic. Never written as labels in the post. */
  middle: string[];
  /** How it closes, before the closing question and the repost line. */
  ending: string;
  /** His best post in this lane, as LinkedIn measured it, for the model to aim at. */
  best: string;
}

const SHAPES: Record<string, LinkedInShape> = {
  "ai changing ads and search": {
    is: "how AI is changing advertising, search and shopping (an ad platform's move, AI search, how customers find products), and what it changes for marketers",
    opening:
      "Name the brand or platform and the move in the first line, with its figure where there is one (“McDonald’s wants to make $1 billion from advertising.”). A personal moment works too when it is real (“I almost approved an AI-generated campaign. Then one sentence stopped me.”).",
    middle: [
      "the move, concretely: what the brand or platform is doing, from a named source",
      "the turn: why the obvious reading misses the point (“But the real opportunity isn’t the screens. It is the customer journey.”)",
      "the shift for marketing as a whole, in one or two short lines (“Brands are becoming media platforms.”)",
      "what a marketer should look at or ask in their own business",
    ],
    ending:
      "End on the question it leaves a marketer with, specific to their own brand (“What customer touchpoint does your brand own that you are currently treating as ‘just marketing’?”).",
    best: "McDonald’s advertising business, 148 words, 503 impressions",
  },
  "ai launches explained": {
    is: "a new AI model, tool or platform feature, and what it means for how businesses and marketers work",
    opening:
      "Name the tool or model in the first line (“Meta just launched Muse, and this could change how we work with AI.”), or set up the obvious question and then the better one (“A new AI model launches and the first question is usually: Is it more powerful?”).",
    middle: [
      "what it does differently, in plain words, with an everyday example of using it (“You ask: ‘Find me the best flights to London.’”)",
      "the shift it represents, as a short progression (“AI that answers. To AI that creates. And now: AI that acts.”)",
      "how it would look at work, for a business owner and for a marketer (“Imagine using this at work.”)",
      "the trade-off or limitation worth knowing (“But there is an important trade-off. An AI that can actually do things needs access.”)",
    ],
    ending:
      "End by reframing the question the reader should be asking (“The interesting question isn’t only ‘How powerful is it?’ It is ‘How much work are we comfortable handing over to AI?’”).",
    best: "a Claude Haiku 5.5 article teaser, 93 words, 462 impressions; Meta Muse, 256 words, 424",
  },
  "ai risks and security": {
    is: "a real AI security incident or risk, translated into what a business should check",
    opening:
      "Name the incident and its scale in the first line, factually (“AI just uncovered a security flaw that could put 70% of the world’s websites at risk.”). Alarming only as far as the facts go: never fear for its own sake.",
    middle: [
      "what happened, with the organisations named and the source given",
      "“Think about the impact”: what it means for a website, customer data or an AI agent with access to a CRM",
      "the one or two safeguards a business can actually apply (give an agent the minimum access, keep spending and publishing behind human approval, test the failure paths)",
    ],
    ending:
      "End on the responsibility it puts on businesses, not only on IT (“Having a secure website is no longer just an IT responsibility. It is a business responsibility.”).",
    best: "AI agents escaping a sandbox, 183 words, 243 impressions",
  },
  "content and creator craft": {
    is: "how to make content that works: on camera, YouTube, creators, and the quality of AI-generated content",
    opening:
      "Open on a concrete, surprising contrast, never a general principle: “AI can help you create 100 pieces of content instead of 10. But what if those 100 pieces are just average?” or “Your website can rank #1 on Google and still be invisible when your customer asks AI.” Openings like “If everyone has access to AI, what will make a marketer stand out?” are his weakest posts here.",
    middle: [
      "the problem marketers are missing, from a named study, article or finding",
      "one concrete example from a recognisable business (a fashion post, a consultant, a chef)",
      "a simple process or checklist they could follow (“Human strategy → AI expansion → Human editing → Brand check → Performance measurement”), as an arrow or numbered list",
    ],
    ending:
      "End on a memorable contrast pair (“AI can scale production. Your judgment has to scale quality.” / “SEO asks: Can I rank? AI search asks: Can I become the source?”).",
    best: "AI content volume vs quality, 201 words, 258 impressions; this is his weakest lane by impressions, so the opening rule above matters most here",
  },
  "marketing fundamentals": {
    is: "a marketing principle, measurement or a brand's business move, where AI is not the main subject",
    opening:
      "Name the brand and its move, with its figure, in the first line (“McDonald’s wants to make $1 billion from advertising.”), or open on a sharp contrast in two short lines (“Millions of Impressions. Zero brand recall.”).",
    middle: [
      "what happened or what the evidence shows, from a named source (“A Gartner survey found that 81% of US consumers try to ignore or tune out ads.”)",
      "the turn: why the obvious reading misses the point (“But the real opportunity isn't the screens. It is the customer journey.”)",
      "the principle a marketer can take from it, with a short list of what to look at (“1. Attention 2. Brand recall 3. Business impact”)",
    ],
    ending:
      "End on the question it leaves a marketer with about their own brand (“What customer touchpoint does your brand own that you are currently treating as ‘just marketing’?”).",
    best: "McDonald’s advertising business, 148 words, 503 impressions",
  },
  reflections: {
    is: "a personal lesson on work, learning, decisions or purpose, told from his own experience",
    opening:
      "Open on a plain, honest observation or a real moment, in one or two short lines (“Sometimes we make the wrong decision. And sometimes things simply go wrong.” / “A student asked me this recently.”). Only experiences that really happened; never invent one.",
    middle: [
      "the situation, in a few short lines",
      "where it shows up in business or marketing (“A campaign isn't working, but instead of changing the strategy, we put more money into it.”)",
      "the turn: what he does differently, or the question that helps",
    ],
    ending:
      "End on one short line worth remembering (“Your last decision doesn't have to decide your next one.”).",
    best: "“I don't think we are born with one fixed purpose”, 155 words, 137 impressions",
  },
};

/** Subject words that place a renamed lane on one of the shapes above. */
const FALLBACK: Array<[RegExp, string]> = [
  [/\b(security|cyber|risks?|breach|vulnerab\w*|safety)\b/i, "ai risks and security"],
  [/\b(reflections?|lessons?|purpose|career|personal)\b/i, "reflections"],
  [/\b(advertis\w*|ads?|search|shopping|ad tech)\b/i, "ai changing ads and search"],
  [/\b(creators?|content|youtube|video)\b/i, "content and creator craft"],
  [
    /\b(tool|tools|model|models|launch\w*|feature\w*|platform|developments?)\b/i,
    "ai launches explained",
  ],
  [/\b(marketing|brand|brands|campaign\w*|measurement|marketer\w*)\b/i, "marketing fundamentals"],
];

/** The shape for a LinkedIn lane, by name and then by subject; null for "other". */
export function linkedInShapeFor(
  lane: Pick<ContentLane, "name" | "definition">,
): LinkedInShape | null {
  const key = lane.name.trim().toLowerCase();
  if (SHAPES[key]) return SHAPES[key]!;
  if (!key || key === "other") return null;
  const text = `${lane.name} ${lane.definition ?? ""}`;
  const match = FALLBACK.find(([words]) => words.test(text));
  return match ? SHAPES[match[1]]! : null;
}

/** His closing line, from his own posts: the one CTA every post ends on. */
export const LINKEDIN_CLOSE = `End every post the way his do: a question to readers that the post has earned (about their own
business, not "Agree?" or "Thoughts?"), then ONE closing line, either "♻️ Repost to help [a specific
kind of person] [a specific benefit]." ("♻️ Repost to help a business prepare for AI-driven shopping.")
or "Follow for more digital marketing and AI insights." Never both, never a stack of asks.`;

/** The post shape every LinkedIn idea follows, then the shape for each lane. */
export function linkedInShapesBlock(
  lanes: Array<Pick<ContentLane, "name" | "definition">>,
): string {
  const lines = lanes.map((lane) => {
    const shape = linkedInShapeFor(lane);
    if (!shape) {
      return `- "${lane.name}": no fixed shape. Follow the post shape above and let the subject decide the ending.`;
    }
    return [
      `- "${lane.name}": ${shape.is}.`,
      `  Opening: ${shape.opening}`,
      `  Middle, as planning logic only, never written as labels:`,
      ...shape.middle.map((beat, index) => `    ${index + 1}. ${beat}`),
      `  ${shape.ending}`,
      `  His best here: ${shape.best}.`,
    ].join("\n");
  });

  return `LINKEDIN POST SHAPE, read from his own 34 most recent posts and the impressions LinkedIn measured
for each. This is how his LinkedIn posts are built; it is not a reel:
- Two kinds of post. A full text post, 150 to 300 words (his median is 237): the whole argument
  in the post. Or, when the idea is an article he publishes, a teaser of 75 to 125 words that
  names the development, asks the business question in two to four short lines and points to
  the article ("I've written an article explaining what happened and what businesses should pay
  attention to.").
- THE FIRST LINE NAMES A BRAND, TOOL, PLATFORM OR FIGURE. That is what separates his best posts
  from his weakest: "McDonald's wants to make $1 billion from advertising." had 503 impressions;
  "If everyone has access to AI, what will actually make a marketer stand out?" had 115.
- One to three short lines per paragraph, a blank line between them. Name the source of every
  fact ("According to The Wall Street Journal…", "A Gartner survey found…"). Use a turn
  ("Here's why this matters.", "But there's a catch.") and short arrow (→) or numbered lists for
  capabilities and steps. Close with a contrast pair when the idea has one.
- He mentions his own experience only where it is real and adds something ("After 21 years in
  digital marketing…", "A student asked me this recently."). Never invent one.
- ${LINKEDIN_CLOSE.replace(/\n/g, "\n  ")}

POST SHAPE BY LANE:
${lines.join("\n")}`;
}
