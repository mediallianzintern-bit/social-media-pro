// Content recommendations, generated from measured signals.
//
// Every play below declares the condition that makes it worth recommending and
// cites the number that fired it. A play whose signal is absent is not shown —
// the list gets shorter rather than padded, because a recommendation with no
// evidence behind it is just an opinion with a rank badge on it.
import { compactNumber, percent } from "@/lib/format";
import { engagementsOf, type PlatformId, type PostRecord, viewsOf } from "@/lib/analytics-types";
import { confidenceFor, MIN_SAMPLE, type Confidence, type InsightSet } from "@/lib/insights";
import {
  findHit,
  HOOK_DIRECTION,
  HOOK_PAST,
  HOOK_PRESENT,
  hookScores,
  isWritten,
  newAngle,
} from "@/lib/double-down";
import type { HookType } from "@/lib/script-features";

export interface ScriptBeat {
  /** Timecode on Instagram ("0:00"), section name on LinkedIn ("Open"). */
  mark: string;
  line: string;
  direction?: string;
}

export interface Recommendation {
  id: string;
  platform: PlatformId;
  rank: number;
  /** The measured signal that triggered this, in the user's own numbers. */
  evidence: string;
  confidence: Confidence;
  title: string;
  pitch: string;
  /** 1–5, driven by effect size and sample size. */
  score: number;
  kicker: string;
  hook: string;
  beats: ScriptBeat[];
  /** Caption on Instagram, production note on LinkedIn. */
  caption: string;
  tags: string[];
}

interface Play {
  id: string;
  platform: PlatformId;
  /** Null when the signal is absent — the play is then skipped. */
  build: (insights: InsightSet, posts: PostRecord[]) => Omit<Recommendation, "rank"> | null;
}

const UTC_HOUR = (hour: number) => `${String(hour).padStart(2, "0")}:00 UTC`;

function bestHour(insights: InsightSet): { hourUtc: number; count: number } | null {
  const candidate = insights.hours.find((entry) => entry.count >= MIN_SAMPLE);
  return candidate ? { hourUtc: candidate.hourUtc, count: candidate.count } : null;
}

// ---------------------------------------------------------------------------
// Instagram plays
// ---------------------------------------------------------------------------

const IG_CTA: Play = {
  id: "ig-cta",
  platform: "instagram",
  build: (insights) => {
    if (!insights.cta || insights.cta.multiple < 2) return null;
    const multiple = insights.cta.multiple;
    return {
      id: "ig-cta",
      platform: "instagram",
      evidence: `Posts asking for a comment pull ${multiple.toFixed(1)}× the comments of those that don't (${insights.cta.withCta.count} vs ${insights.cta.withoutCta.count} posts)`,
      confidence: confidenceFor(insights.cta.withCta.count),
      score: multiple >= 5 ? 5 : 4,
      title: "Comment-gated AI tool drop",
      pitch:
        "Your comment-gated posts are the clearest lever in the account. Comments weigh more than likes in ranking, and each one opens a DM you can follow up in.",
      kicker: "Reel script · 30s",
      hook: "I stopped paying for three tools this month. This one replaced all of them.",
      beats: [
        {
          mark: "0:00",
          line: "“I stopped paying for three tools this month. This one replaced all of them.”",
          direction: "Screen recording already running — no talking-head intro",
        },
        {
          mark: "0:04",
          line: "“Watch. I type one line…” — show the prompt going in, uncut.",
          direction: "Real-time, no jump cut. The uncut take is the proof.",
        },
        {
          mark: "0:10",
          line: "“Ten seconds. That's the whole thing.”",
          direction: "On-screen text: 10 SECONDS",
        },
        {
          mark: "0:15",
          line: "“In Premiere this is twenty minutes and three plugins. Here it's a sentence.”",
          direction: "Split screen: old workflow vs new",
        },
        {
          mark: "0:22",
          line: "“It's not perfect. It gets you 80% there — and 80% in ten seconds beats 100% in an hour.”",
          direction: "Face to camera — the credibility beat",
        },
        {
          mark: "0:27",
          line: "“Comment TOOL and I'll send you the link.”",
          direction: "Text: COMMENT “TOOL”",
        },
      ],
      caption:
        "I stopped paying for three tools this month.\n\nOne replaced all of them.\n\nThe workflow used to be: script it, open the editor, build the motion, render, fix, render again. Twenty minutes minimum, and that's if nothing broke.\n\nNow it's one prompt and about ten seconds.\n\nIs the output perfect? No. It gets you 80% of the way there. But 80% in ten seconds beats 100% in an hour — especially when you're posting daily.\n\nThat's the real shift with AI right now. It isn't replacing the skill. It's collapsing the distance between the idea and the first draft.\n\nComment TOOL and I'll send you the link.",
      tags: [
        "#AITools",
        "#DigitalMarketing",
        "#ContentCreation",
        "#MarketingTips",
        "#AIForBusiness",
        "#SmallBusinessMarketing",
      ],
    };
  },
};

const IG_CASE_STUDY: Play = {
  id: "ig-case-study",
  platform: "instagram",
  build: (insights, posts) => {
    // Brand teardowns are a distinct lane in this account — detect them by the
    // brands actually named in captions rather than assuming the lane exists.
    const brandPattern =
      /\b(old spice|chipotle|burger king|wendy'?s|nestl[ée]|nike|apple|coca[- ]cola|mcdonald)/i;
    const teardowns = posts.filter((post) => brandPattern.test(post.caption));
    if (teardowns.length < MIN_SAMPLE) return null;

    const useViews = insights.useViews;
    const value = (post: PostRecord) => (useViews ? viewsOf(post) : engagementsOf(post));
    const teardownMedian =
      [...teardowns.map(value)].sort((a, b) => a - b)[Math.floor(teardowns.length / 2)] ?? 0;
    const ratio = insights.overallMedian > 0 ? teardownMedian / insights.overallMedian : 0;
    if (ratio < 1.1) return null;

    return {
      id: "ig-case-study",
      platform: "instagram",
      evidence: `Your brand-teardown posts run ${ratio.toFixed(1)}× your median (${teardowns.length} posts, median ${compactNumber(teardownMedian)} vs ${compactNumber(insights.overallMedian)})`,
      confidence: confidenceFor(teardowns.length),
      score: ratio >= 2 ? 5 : 4,
      title: "One more brand teardown — pick the failure, not the win",
      pitch:
        "Teardowns are your strongest recurring lane. Every one so far is a success story; the failure version is the same format with more tension and almost no competition on it.",
      kicker: "Reel script · 35s",
      hook: "This campaign won every award in its category. It also nearly killed the brand.",
      beats: [
        {
          mark: "0:00",
          line: "“This campaign won every award in its category. It also nearly killed the brand.”",
          direction: "Text: AWARD-WINNING ≠ EFFECTIVE",
        },
        {
          mark: "0:05",
          line: "Name the brand and the campaign. One sentence on what they made.",
          direction: "Cut to the creative itself",
        },
        {
          mark: "0:11",
          line: "“Here's what the agency was solving for: attention. Here's what the business needed: purchase intent. Those are not the same brief.”",
          direction: "The turn — slow down here",
        },
        {
          mark: "0:19",
          line: "Give the number that shows the gap. Recall up, sales flat. Specifics beat adjectives.",
          direction: "On-screen: the two figures side by side",
        },
        {
          mark: "0:26",
          line: "“Creative that gets talked about and creative that gets bought are different jobs. Most brands brief for the first and measure the second.”",
          direction: "Direct to camera",
        },
        {
          mark: "0:32",
          line: "“Which campaign do you think this was? Guess below.”",
          direction: "Text: GUESS BELOW",
        },
      ],
      caption:
        "Award-winning and effective are not the same thing.\n\nEvery marketer knows this. Almost nobody briefs like they know it.\n\nThe agency is solving for attention — that's what gets recognised, awarded, and put in the showreel. The business needs purchase intent. Those are two different briefs, and when they diverge you get a campaign everybody remembers and nobody buys from.\n\nThe test I'd apply before signing off on anything:\n\nIf this works exactly as intended, what changes on the P&L?\n\nIf you can't answer that in one sentence, the brief isn't finished.\n\nWhich campaign am I describing? Guess below.",
      tags: [
        "#MarketingStrategy",
        "#BrandStrategy",
        "#Advertising",
        "#MarketingLessons",
        "#DigitalMarketing",
      ],
    };
  },
};

const IG_TIMING: Play = {
  id: "ig-timing",
  platform: "instagram",
  build: (insights) => {
    const best = bestHour(insights);
    if (!best) return null;
    const others = insights.hours.filter((entry) => entry.hourUtc !== best.hourUtc);
    if (!others.length) return null;
    const bestMedian = insights.hours[0]?.medianPrimary ?? 0;
    const restMedian = others.reduce((sum, entry) => sum + entry.medianPrimary, 0) / others.length;
    const ratio = restMedian > 0 ? bestMedian / restMedian : 0;
    if (ratio < 1.3) return null;

    return {
      id: "ig-timing",
      platform: "instagram",
      evidence: `Posts published around ${UTC_HOUR(best.hourUtc)} run ${ratio.toFixed(1)}× the median of every other slot (${best.count} posts)`,
      confidence: confidenceFor(best.count),
      score: 3,
      title: `Move the whole week to ${UTC_HOUR(best.hourUtc)}`,
      pitch:
        "This is the cheapest win available: same content, same effort, different slot. Test it for two weeks before changing anything else.",
      kicker: "Scheduling change · no new content",
      hook: "Same reel, different hour, measurably different reach.",
      beats: [
        {
          mark: "Week 1",
          line: `Publish every post at ${UTC_HOUR(best.hourUtc)}. Change nothing else — not the format, not the hook, not the length.`,
          direction: "Isolate the variable or the test tells you nothing",
        },
        {
          mark: "Week 2",
          line: "Hold the slot. One week is noise; two weeks is a signal.",
        },
        {
          mark: "Review",
          line: "Compare median views for those two weeks against the two before. The dashboard's date range does this directly.",
          direction: "Custom range → the two weeks either side",
        },
      ],
      caption:
        "Production note: this is a scheduling experiment, not a content brief. Its whole value is that nothing else changes, so any difference in reach is attributable to the slot. Run it for a full two weeks before drawing a conclusion.",
      tags: ["#ContentStrategy", "#SocialMediaTips"],
    };
  },
};

const IG_FORMAT: Play = {
  id: "ig-format",
  platform: "instagram",
  build: (insights) => {
    const ranked = insights.formats.filter((bucket) => bucket.count >= MIN_SAMPLE);
    if (ranked.length < 2) return null;
    const top = ranked[0];
    const bottom = ranked[ranked.length - 1];
    if (!top || !bottom || bottom.medianPrimary <= 0) return null;
    const ratio = top.medianPrimary / bottom.medianPrimary;
    if (ratio < 1.5) return null;

    return {
      id: "ig-format",
      platform: "instagram",
      evidence: `${top.label} posts run ${ratio.toFixed(1)}× ${bottom.label} posts (${top.count} vs ${bottom.count} posts)`,
      confidence: confidenceFor(Math.min(top.count, bottom.count)),
      score: 4,
      title: `Convert your ${bottom.label} ideas into ${top.label}s`,
      pitch: `The gap between your formats is larger than the gap between your topics. Don't retire the ${bottom.label} subjects — re-shoot them in the format that actually travels.`,
      kicker: "Format change · same subject",
      hook: `Take the last ${bottom.label} that underperformed and rebuild it as a ${top.label}.`,
      beats: [
        {
          mark: "Pick",
          line: `Choose the ${bottom.label} with the strongest idea and the weakest numbers. Good subject, wrong container.`,
        },
        {
          mark: "Cut",
          line: "Reduce it to a single claim. A carousel can carry seven points; a reel carries one.",
          direction: "This is where most conversions fail",
        },
        {
          mark: "Open",
          line: "Lead with the most contested point, not the setup.",
        },
        {
          mark: "Close",
          line: "Send people to the original for the full breakdown — the reel earns attention, the carousel keeps it.",
        },
      ],
      caption:
        "Production note: a format conversion is not a repost. Reduce to one claim, lead with the most contested point, and use the reel to send people to the longer piece.",
      tags: ["#ContentStrategy", "#Reels", "#DigitalMarketing"],
    };
  },
};

// ---------------------------------------------------------------------------
// LinkedIn plays
// ---------------------------------------------------------------------------

const LI_CEILING: Play = {
  id: "li-ceiling",
  platform: "linkedin",
  build: (insights, posts) => {
    if (posts.length < MIN_SAMPLE) return null;
    const outlierShare = insights.outliers.length / posts.length;
    // A low outlier share means volume without breakouts: the ceiling problem.
    if (outlierShare > 0.2) return null;

    return {
      id: "li-ceiling",
      platform: "linkedin",
      evidence: `Only ${insights.outliers.length} of ${posts.length} posts cleared 2× your median of ${compactNumber(insights.overallMedian)} interactions — volume is not producing breakouts`,
      confidence: confidenceFor(posts.length),
      score: 5,
      title: "Trade three posts for one argument",
      pitch:
        "Your cadence is healthy and your ceiling is not. On LinkedIn the constraint is rarely frequency — it's whether a post makes a claim someone would disagree with.",
      kicker: "LinkedIn post · POV",
      hook: "Most marketing teams are measuring AI adoption. Almost none are measuring what it displaced.",
      beats: [
        {
          mark: "Open",
          line: "Most marketing teams can tell you how many people are using AI tools. Almost none can tell you what those tools displaced.",
        },
        {
          mark: "Tension",
          line: "Adoption is an easy metric because it only requires counting. Displacement requires admitting something used to take four hours and now takes twenty minutes — and then deciding what happens to the other three hours and forty minutes.",
        },
        {
          mark: "Insight",
          line: "In most teams the answer is: nothing. The time gets absorbed. Output stays flat, headcount stays flat, and the tool gets called a productivity win on the strength of a login count.",
        },
        {
          mark: "Argument",
          line: "The teams actually compounding are the ones that redeployed the saved hours into something they previously couldn't afford — more testing, more research, more iterations. The tool didn't create the advantage. The redeployment decision did.",
        },
        {
          mark: "Close",
          line: "If you've rolled out AI tooling this year: what did your team stop doing?\n\nIf the answer is nothing, you bought a licence, not a capability.",
        },
      ],
      caption:
        "Production note: no image. Post it and answer every comment in the first hour — LinkedIn weighs early comment velocity heavily, and a POV post lives or dies on whether the author shows up in the replies.",
      tags: ["#DigitalMarketing", "#AI", "#MarketingStrategy", "#Leadership"],
    };
  },
};

const LI_QUESTION: Play = {
  id: "li-question",
  platform: "linkedin",
  build: (insights, posts) => {
    const withQuestion = posts.filter((post) => post.caption.trim().endsWith("?"));
    const without = posts.filter((post) => !post.caption.trim().endsWith("?"));
    if (withQuestion.length < MIN_SAMPLE || without.length < MIN_SAMPLE) return null;

    const medianComments = (group: PostRecord[]) => {
      const sorted = group.map((post) => post.comments).sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? 0;
    };
    const withMedian = medianComments(withQuestion);
    const withoutMedian = medianComments(without);
    if (withoutMedian <= 0 || withMedian / withoutMedian < 1.3) return null;

    return {
      id: "li-question",
      platform: "linkedin",
      evidence: `Posts ending on a question take ${(withMedian / withoutMedian).toFixed(1)}× the comments (${withQuestion.length} vs ${without.length} posts)`,
      confidence: confidenceFor(withQuestion.length),
      score: 4,
      title: "Close every post on a question you actually want answered",
      pitch:
        "Your question-closed posts already out-comment the rest. The trick is asking something a practitioner can answer from experience, not something rhetorical.",
      kicker: "LinkedIn post · structure",
      hook: "End on a question only a practitioner could answer.",
      beats: [
        {
          mark: "Open",
          line: "Lead with the observation, not the question. The question is the exit, never the entrance.",
        },
        {
          mark: "Body",
          line: "Make one claim and support it with something only you have seen — a client pattern, a number from your own work, a mistake you made.",
        },
        {
          mark: "Close",
          line: "Ask something specific and answerable from experience. “What's stopping this in your team — budget, skills, or buy-in?” beats “What do you think?” every time.",
          direction: "Give the reader options; a blank prompt gets a blank response",
        },
        {
          mark: "First hour",
          line: "Reply to every comment with a follow-up question. Two-way threads count more than one-way replies.",
        },
      ],
      caption:
        "Production note: a rhetorical question is not a question. If you already know the answer you want, you've written a statement with a question mark on it, and readers can tell.",
      tags: ["#LinkedInTips", "#ContentStrategy", "#DigitalMarketing"],
    };
  },
};

const LI_CROSS_POST: Play = {
  id: "li-cross-post",
  platform: "linkedin",
  build: (insights, posts) => {
    if (posts.length < MIN_SAMPLE) return null;
    return {
      id: "li-cross-post",
      platform: "linkedin",
      evidence: `Your LinkedIn median sits at ${compactNumber(insights.overallMedian)} interactions across ${posts.length} posts in this window`,
      confidence: confidenceFor(posts.length),
      score: 3,
      title: "Port your best Instagram teardown to LinkedIn as text",
      pitch:
        "The brand-teardown format that works on Instagram is under-supplied on LinkedIn, where the audience is the people who commission those campaigns. Same analysis, no video, different buyer.",
      kicker: "LinkedIn post · case narrative",
      hook: "The campaign everyone cites as a masterclass had a budget most of you will never have. Here's the version that scales down.",
      beats: [
        {
          mark: "Open",
          line: "Name the campaign everyone already admires, then name the constraint nobody mentions: the budget, the media weight, or the brand equity it borrowed.",
        },
        {
          mark: "Turn",
          line: "Separate the mechanism from the money. Which part of it worked because of spend, and which part worked because of the idea?",
        },
        {
          mark: "Translate",
          line: "Rebuild the mechanism at 1% of the budget. Be concrete — what would a business with ₹50,000 and no agency actually do?",
          direction: "This is the part nobody else writes",
        },
        {
          mark: "Close",
          line: "Ask which constraint their team hits first: budget, approval, or the idea itself.",
        },
      ],
      caption:
        "Production note: the analysis already exists in your Instagram teardowns — this is a rewrite for a different reader, not new research. LinkedIn's audience buys these campaigns; Instagram's audience watches them.",
      tags: ["#MarketingStrategy", "#BrandStrategy", "#DigitalMarketing", "#B2BMarketing"],
    };
  },
};

// ---------------------------------------------------------------------------
// T62 — double down on a winner
// ---------------------------------------------------------------------------
//
// Replaces the old "rebuild your best post" play, which printed the same
// sentence about the winner's structure over every post whatever it actually
// did. The opening type is now read from the post itself, and the alternative
// opening is the one this account's posts measurably reward. See double-down.ts.

function beatsFor(platform: PlatformId, opening: HookType, middle: string): ScriptBeat[] {
  if (isWritten(platform)) {
    return [
      { mark: "Open", line: HOOK_DIRECTION[opening], direction: "Measured from your own posts" },
      { mark: "Turn", line: middle },
      { mark: "Proof", line: "One specific number or named example. Not three." },
      { mark: "Close", line: "One question worth answering in the comments." },
    ];
  }
  return [
    { mark: "0:00", line: HOOK_DIRECTION[opening], direction: "Measured from your own posts" },
    { mark: "0:04", line: middle },
    {
      mark: "0:10",
      line: "One mechanism, explained once.",
      direction: "Template — not taken from the hit",
    },
    { mark: "0:20", line: "The proof: a specific number or example, on screen." },
    { mark: "0:28", line: "One ask — save, share or comment. Pick one." },
  ];
}

function doubleDownPlays(platform: PlatformId): Play[] {
  const unit = platform === "linkedin" ? "post" : "reel";
  return [
    {
      // A — same subject, a new opening. Only for a FRESH hit: riding a
      // subject is about the people who just found it, and they move on.
      id: `${platform}-double-angle`,
      platform,
      build: (insights, posts) => {
        const hit = findHit(posts, insights.useViews, insights.overallMedian);
        if (!hit || !hit.fresh) return null;
        const angle = newAngle(hit, hookScores(posts, insights.useViews, insights.overallMedian));
        const lane =
          hit.post.contentLane && hit.post.contentLane !== "other" ? hit.post.contentLane : null;
        return {
          id: `${platform}-double-angle`,
          platform,
          evidence: `“${hit.opening.slice(0, 70)}${hit.opening.length > 70 ? "…" : ""}” did ${hit.multiple}× your median ${hit.ageDays === 0 ? "today" : `${hit.ageDays} day${hit.ageDays === 1 ? "" : "s"} ago`}.${angle.evidence ? ` ${angle.evidence}` : ""}`,
          confidence: insights.sampleSize >= MIN_SAMPLE ? "solid" : "tentative",
          score: 5,
          title: `Double down: same subject, ${angle.title}`,
          pitch: `If the subject was the draw, a fresh angle on it lands again with the people who just discovered it. Your hit ${HOOK_PAST[hit.hook]}; the angle to take now is to ${angle.title} — ${angle.direction.charAt(0).toLowerCase()}${angle.direction.slice(1)}`,
          kicker: `Variation A · ${unit} · ${angle.title}`,
          hook: HOOK_DIRECTION[angle.hook],
          beats: beatsFor(
            platform,
            angle.hook,
            `${angle.direction} Keep it unmistakably the same subject as the hit${lane ? ` — still ${lane}` : ""}.`,
          ),
          caption: `Production note: make this within the next few days, while the hit is still being seen. The angle is suggested from the opening your own posts reward, not picked at random. Variation B keeps the opening and changes the subject — making both is how you find out which half of the hit worked.`,
          tags: ["#ContentStrategy", "#DigitalMarketing"],
        };
      },
    },
    {
      // B — same opening, the next subject. Offered for an older winner too,
      // as a structure to reuse; only the framing changes.
      id: `${platform}-double-shape`,
      platform,
      build: (insights, posts) => {
        const hit = findHit(posts, insights.useViews, insights.overallMedian);
        if (!hit) return null;
        const lane =
          hit.post.contentLane && hit.post.contentLane !== "other" ? hit.post.contentLane : null;
        return {
          id: `${platform}-double-shape`,
          platform,
          evidence: `Your best ${unit} here did ${hit.multiple}× your median. It ${HOOK_PAST[hit.hook]} — read from its own first line, not assumed.`,
          confidence: insights.sampleSize >= MIN_SAMPLE ? "solid" : "tentative",
          score: hit.fresh ? 5 : 4,
          title: hit.fresh
            ? "Double down: same opening, the next subject"
            : "Reuse your best post's opening on a new subject",
          pitch: hit.fresh
            ? `If the structure was the draw, it carries over. ${HOOK_PRESENT[hit.hook][0]!.toUpperCase()}${HOOK_PRESENT[hit.hook].slice(1)} again, and point it at the next subject${lane ? ` in ${lane}` : ""}.`
            : `It is ${hit.ageDays} days old, so this is a structure to reuse rather than a moment to ride. ${HOOK_PRESENT[hit.hook][0]!.toUpperCase()}${HOOK_PRESENT[hit.hook].slice(1)} again, on a new subject${lane ? ` in ${lane}` : ""}.`,
          kicker: hit.fresh
            ? `Variation B · ${unit} · same opening`
            : `${unit} · structural template`,
          hook: HOOK_DIRECTION[hit.hook],
          beats: beatsFor(
            platform,
            hit.hook,
            `Bring in the new subject${lane ? ` — still within ${lane}` : ""} — inside exactly the same shape.`,
          ),
          caption: `Production note: the opening is the part taken from the hit — classified from its first line. Everything after it is a template; the subject is yours to choose.`,
          tags: ["#ContentStrategy", "#DigitalMarketing"],
        };
      },
    },
  ];
}

const PLAYS: Play[] = [
  ...doubleDownPlays("instagram"),
  ...doubleDownPlays("linkedin"),
  IG_CTA,
  IG_CASE_STUDY,
  IG_FORMAT,
  IG_TIMING,
  LI_CEILING,
  LI_QUESTION,
  LI_CROSS_POST,
];

/** Ranked recommendations for one platform. Empty when no signal fires. */
export function buildRecommendations(
  platform: PlatformId,
  insights: InsightSet,
  posts: PostRecord[],
): Recommendation[] {
  return PLAYS.filter((play) => play.platform === platform)
    .map((play) => play.build(insights, posts))
    .filter((result): result is Omit<Recommendation, "rank"> => result !== null)
    .sort((a, b) => b.score - a.score)
    .map((result, index) => ({ ...result, rank: index + 1 }));
}

/** Human-readable confidence note for the card footer. */
export function confidenceNote(confidence: Confidence, sample: number): string {
  if (confidence === "solid") return `Based on ${sample} posts`;
  if (confidence === "tentative") return `Only ${sample} posts — treat as a lead, not a finding`;
  return "Not enough posts to be confident";
}

export { percent };
