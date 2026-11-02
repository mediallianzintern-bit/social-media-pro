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
  "ai x marketing bridge": {
    is: "how AI is changing advertising, search and shopping (an ad platform's move, AI search, how customers find products), and what it changes for marketers",
    opening:
      "A future-shift hook in two or three short lines (“Your next customer may never visit your website. / They will ask AI to find the product for them. / And AI will decide if your product even deserves to be seen.”), or the platform and its move (“Meta is moving beyond AI that creates ads.”).",
    middle: [
      "the development, from a named source with its figure (“According to The Wall Street Journal… AI-driven orders and traffic to Shopify stores tripled year over year.”)",
      "the turn on its own line: “Here's why this matters.” or “But there's a catch.”",
      "the shift against the old way: “For years, businesses have focused on… But what happens when customers start relying on AI to…”",
      "what marketers should do, as three numbered points (“I see three important changes. 1. … 2. … 3. …”)",
    ],
    ending:
      "End on a question about the reader's own business (“If an AI assistant were helping your ideal customer choose a product today, would your product even make the shortlist?”), then “Repost to help …”.",
    best: "Your next customer may never visit your website, 250 words; McDonald’s advertising business, 148 words, 503 impressions",
  },
  "ai launches explained": {
    is: "a new AI model, tool or feature, and what it means for businesses; usually a short teaser for his LinkedIn article",
    opening:
      "Flip the obvious question (“A new AI model launches and the first question is usually: / Is it more powerful? / But Claude Haiku 5.5 made me think about a different question:”), or name the development and ask the business question (“OpenAI Just Made AI 50% Cheaper. Should Businesses Pay Attention?”).",
    middle: [
      "why it matters beyond the headline, in two or three short lines (“Not because AI is getting cheaper. But because tasks that were once too expensive to automate could now become affordable.”)",
      "the everyday business work it touches (invoices, records, documents, repetitive workflows)",
      "the open question it leaves (“But does this mean businesses need to rethink how their teams work?”)",
    ],
    ending:
      "As a teaser for his article (75 to 125 words): “I've explored this in my latest article.” / “Would love to hear your views.” and three to five hashtags. As a full post: a question to readers, then “Repost to help …”.",
    best: "a Claude Haiku 5.5 article teaser, 93 words, 462 impressions; Meta Muse, 256 words, 424",
  },
  "ai risks and security": {
    is: "a real AI security incident or risk, translated into what a business should check",
    opening:
      "The incident and its scale, factually, in two short lines (“AI just uncovered a security flaw that could put 70% of the world's websites at risk. / And some websites had to go offline because of it.”). Never fear for its own sake.",
    middle: [
      "what happened, with the organisations and countries named and the source given",
      "“Think about the impact.” on its own line, then what it means for a website, customer data or an AI agent connected to a CRM",
      "the turn: “But here's what makes this story even more interesting.”",
      "“There is a bigger lesson here for businesses.” and the safeguards a business can apply",
    ],
    ending:
      "End on the responsibility it puts on businesses (“Having a secure website is no longer just an IT responsibility. / It is a business responsibility.”) or the real question (“The question is not whether AI will change cybersecurity. It already is. The question is whether businesses can keep up.”), then “Repost to help …”.",
    best: "AI found PHP flaws that put 70% of websites at risk, 263 words; AI agents escaping a sandbox, 243 impressions",
  },
  "content and creator craft": {
    is: "how to make content that works: on camera, YouTube, creators, and the quality of AI-generated content",
    opening:
      "A real moment from his own work in one or two lines (“I almost approved an AI-generated campaign. Then one sentence stopped me.”), or a concrete contrast (“AI can help you create 100 pieces of content instead of 10. But what if those 100 pieces are just average?”).",
    middle: [
      "the situation, with the exact line or example quoted (“Take your business to the next level with intelligent solutions designed for your success.”)",
      "the turn: “That's when I went back to the customer conversations.”",
      "the questions he asks, as a short run (“What problems were customers actually facing? / What words were they using?”), and where he teaches it (“This is something I emphasise in my AI and digital marketing sessions.”)",
    ],
    ending:
      "End on a closing contrast (“The goal isn't to make AI-generated content sound human. It's to make your marketing relevant to humans.”), then “Repost to help …”.",
    best: "I almost approved an AI-generated campaign, 219 words, 393 impressions",
  },
  "marketing fundamentals": {
    is: "a marketing principle, measurement or a brand's business move, where AI is not the main subject",
    opening:
      "A sharp contrast in two short lines (“Millions of impressions. / Zero brand recall.”) or the mistake named (“The biggest mistake in marketing? Assuming customers move from awareness to purchase in that order.”), or the brand and its move with its figure (“McDonald’s wants to make $1 billion from advertising.”).",
    middle: [
      "the evidence, from named studies with their figures (“A recent Indian marketing report found that 81% of marketers prioritise reach. Only 17%…”)",
      "“Think about that for a moment.” on its own line, then the disconnect in one or two lines",
      "“So, what should marketers do differently?” as three numbered points, each a short heading line and one line of explanation",
    ],
    ending:
      "End on a closing contrast (“Stop planning how customers should buy. Start understanding how they actually buy.”), then “Repost to help …”.",
    best: "McDonald’s advertising business, 148 words, 503 impressions; Millions of impressions, zero brand recall, 215 words",
  },
  reflections: {
    is: "a personal lesson on work, learning, decisions or purpose, told from his own experience",
    opening:
      "Someone's real question in quotes, or an honest observation (“Professor, with AI changing so quickly, what should I actually learn?” / “A student asked me this recently.”). Only experiences that really happened; never invent one.",
    middle: [
      "his first instinct and the turn (“My first instinct was to recommend a few AI tools. / Then I realised that was probably the wrong advice.”)",
      "the better question, then a run of short questions (“Can you research faster? / Can you analyse data more effectively?”)",
      "the advice as a contrast (“Don't try to learn every AI tool. / Learn how to identify a problem, choose the right tool…”)",
    ],
    ending:
      "End on a two-line contrast (“Because knowing how to use AI is useful. / Knowing what to do with it is what creates value.”), a question to readers, then “Repost to help …”.",
    best: "“Professor, what should I actually learn?”, 165 words",
  },
};

/** Subject words that place a renamed lane on one of the shapes above. */
const FALLBACK: Array<[RegExp, string]> = [
  [/\b(security|cyber|risks?|breach|vulnerab\w*|safety)\b/i, "ai risks and security"],
  [/\b(reflections?|lessons?|purpose|career|personal)\b/i, "reflections"],
  [/\b(advertis\w*|ads?|search|shopping|ad tech|bridge)\b/i, "ai x marketing bridge"],
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
business, not "Agree?" or "Thoughts?"), then ONE closing line: "♻️ Repost to help [a specific kind of
person] [a specific benefit]." ("♻️ Repost to help a business prepare for AI-driven shopping."). The
word "help" is always in it. Never a stack of asks.`;

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
- Two kinds of post. A full text post, 150 to 300 words, aiming for 150 to 250 (his median is
  237): the whole argument in the post. Or, when the idea is an article he publishes, a teaser of 75 to 125 words that
  names the development, asks the business question in two to four short lines and points to
  the article ("I've written an article explaining what happened and what businesses should pay
  attention to.").
- THE FIRST LINE MAKES THE READER CURIOUS AND NAMES THE SUBJECT: a question, an unexpected
  possibility or a surprising fact, with the brand, tool, platform, figure or risk in it. Naming
  the subject is what separates his best posts from his weakest: "McDonald's wants to make $1
  billion from advertising." had 503 impressions; "If everyone has access to AI, what will
  actually make a marketer stand out?", a question with no subject, had 115. Never a news-report
  opening ("X has announced…", "In a recent development…").
- One to three short lines per paragraph, a blank line between them. Use only the three to five
  facts that serve the post's one idea, and name the source of each ("According to The Wall
  Street Journal…", "A Gartner survey found…"). Use a turn
  ("Here's why this matters.", "But there's a catch.") and short arrow (→) or numbered lists for
  capabilities and steps. Close with a contrast pair when the idea has one.
- He mentions his own experience only where it is real and adds something ("After 21 years in
  digital marketing…", "A student asked me this recently."). Never invent one.
- ${LINKEDIN_CLOSE.replace(/\n/g, "\n  ")}

POST SHAPE BY LANE:
${lines.join("\n")}`;
}
