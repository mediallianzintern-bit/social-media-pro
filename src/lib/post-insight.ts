// T68a — what one post actually did, and what that says.
//
// The ledger shows a row of numbers. "17.4K views, 16.1K reach, 118 saves" is
// data, not a reading: whether that is good depends entirely on what this
// account normally does, and nobody holds sixty medians in their head.
//
// So every figure here is expressed against this account's own median, and the
// reads at the bottom are rules over those comparisons — not sentences from a
// model. That matters for the same reason the script features are rule-based:
// a rule says the same thing about the same numbers every time, so two posts
// can be compared. It also means opening this costs nothing and works offline
// from any stored post.
//
// Client-safe. No model call.
import { engagementsOf, organicPosts, viewsOf, type PostRecord } from "@/lib/analytics-types";
import { classifyHook, HOOK_LABEL } from "@/lib/script-features";

/** Below this many comparable posts, a median is an anecdote. */
const MIN_SAMPLE = 4;

/** How far from 1.0 counts as a real difference rather than noise. */
const STRONG = 1.25;
const WEAK = 0.8;

export type Verdict = "strong" | "typical" | "weak";

export interface InsightRow {
  label: string;
  /** This post's figure, already formatted. */
  value: string;
  /** Multiple of the comparison median. Null when there is nothing to compare to. */
  multiple: number | null;
  verdict: Verdict | null;
  /** What it is being compared against, in words. */
  note: string;
}

export interface PostInsight {
  headline: string;
  rows: InsightRow[];
  /** Plain-language readings, strongest first. Empty when nothing stands out. */
  reads: string[];
  /** Posts the medians were taken from. */
  sample: number;
  /** True when the sample is too thin for any of this to be trusted. */
  thin: boolean;
}

const median = (values: number[]): number => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const verdictFor = (multiple: number | null): Verdict | null => {
  if (multiple == null) return null;
  if (multiple >= STRONG) return "strong";
  if (multiple <= WEAK) return "weak";
  return "typical";
};

const round = (value: number): number => Number(value.toFixed(2));

/** A multiple, or null when the baseline is zero or the sample too thin. */
function ratio(value: number, baseline: number, sample: number): number | null {
  if (sample < MIN_SAMPLE || baseline <= 0 || !Number.isFinite(value)) return null;
  return round(value / baseline);
}

const compact = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}K` : String(Math.round(value));

/**
 * A multiple, rounded to what it can actually support. "258.92×" claims a
 * precision no median of sixty posts has; past 10× the decimals are noise.
 */
export function formatMultiple(multiple: number): string {
  if (multiple >= 10) return `${Math.round(multiple)}×`;
  return `${Number(multiple.toFixed(multiple >= 1 ? 1 : 2))}×`;
}

const times = formatMultiple;

/**
 * One post, read against the account's own history.
 *
 * `allPosts` should be the unfiltered set — the comparison is to how this
 * account normally performs, which must not change because someone picked a
 * 7-day window on the dashboard.
 */
export function postInsight(post: PostRecord, allPosts: PostRecord[]): PostInsight {
  // Pinned posts sit at the top of a profile for months and accumulate views,
  // so they are excluded from every median here for the same reason they are
  // excluded everywhere else.
  const peers = organicPosts(allPosts).filter((entry) => entry.postId !== post.postId);
  const sample = peers.length;
  const thin = sample < MIN_SAMPLE;

  // Instagram publishes no view count for some formats, so a photo post reads
  // as 0 views next to reels that have them. Measured on views, that came out
  // as "Below par: 0× your median" — which is not a weak post, it is a post
  // with no view count at all. Where this post has none and its peers do, the
  // whole comparison drops to interactions, which every format has.
  const postHasViews = viewsOf(post) > 0;
  const peersHaveViews = peers.some((entry) => viewsOf(entry) > 0);
  const noViewCount = !postHasViews && peersHaveViews && engagementsOf(post) > 0;
  const useViews = postHasViews && peersHaveViews;
  const primary = (entry: PostRecord) => (useViews ? viewsOf(entry) : engagementsOf(entry));
  const primaryLabel = useViews ? "Views" : "Interactions";

  const rows: InsightRow[] = [];
  const reads: string[] = [];

  // ---- the headline figure ------------------------------------------------
  const primaryMedian = median(peers.map(primary));
  const primaryMultiple = ratio(primary(post), primaryMedian, sample);
  rows.push({
    label: primaryLabel,
    value: compact(primary(post)),
    multiple: primaryMultiple,
    verdict: verdictFor(primaryMultiple),
    note:
      primaryMultiple != null
        ? `${times(primaryMultiple)} your median of ${compact(primaryMedian)}`
        : "not enough comparable posts",
  });

  // ---- reach, saves and watch time, where Instagram measured them ---------
  const measured = peers.filter((entry) => entry.insight);
  const insight = post.insight;

  if (insight) {
    const reachMedian = median(measured.map((entry) => entry.insight?.reach ?? 0));
    const reachMultiple = ratio(insight.reach, reachMedian, measured.length);
    rows.push({
      label: "Reach",
      value: compact(insight.reach),
      multiple: reachMultiple,
      verdict: verdictFor(reachMultiple),
      note:
        reachMultiple != null
          ? `${times(reachMultiple)} your median of ${compact(reachMedian)} accounts reached`
          : "no measured posts to compare against",
    });

    // Save RATE, not saves. A post seen by ten times as many people collects
    // more saves without being any more worth keeping; the rate is the part
    // that says something, and for an account growing its following it is the
    // closest public proxy for the goal.
    const saveRate = insight.reach > 0 ? insight.saved / insight.reach : 0;
    const saveRateMedian = median(
      measured
        .filter((entry) => (entry.insight?.reach ?? 0) > 0)
        .map((entry) => (entry.insight?.saved ?? 0) / (entry.insight?.reach ?? 1)),
    );
    const saveMultiple = ratio(saveRate, saveRateMedian, measured.length);
    rows.push({
      label: "Save rate",
      value: `${(saveRate * 100).toFixed(2)}%`,
      multiple: saveMultiple,
      verdict: verdictFor(saveMultiple),
      note:
        saveMultiple != null
          ? `${times(saveMultiple)} your median save rate of ${(saveRateMedian * 100).toFixed(2)}%`
          : "of the accounts it reached",
    });

    if (insight.avgWatchMs) {
      const watchMedian = median(
        measured.map((entry) => entry.insight?.avgWatchMs ?? 0).filter((value) => value > 0),
      );
      const watchMultiple = ratio(insight.avgWatchMs, watchMedian, measured.length);
      rows.push({
        label: "Average watch",
        value: `${(insight.avgWatchMs / 1000).toFixed(1)}s`,
        multiple: watchMultiple,
        verdict: verdictFor(watchMultiple),
        note:
          watchMultiple != null
            ? `${times(watchMultiple)} your median of ${(watchMedian / 1000).toFixed(1)}s`
            : "no comparable reels",
      });
    }
  }

  // ---- how it did against its own lane ------------------------------------
  if (post.contentLane && post.contentLane !== "other") {
    const lanePeers = peers.filter((entry) => entry.contentLane === post.contentLane);
    const laneMedian = median(lanePeers.map(primary));
    const laneMultiple = ratio(primary(post), laneMedian, lanePeers.length);
    rows.push({
      label: `Against ${post.contentLane}`,
      value: compact(primary(post)),
      multiple: laneMultiple,
      verdict: verdictFor(laneMultiple),
      note:
        laneMultiple != null
          ? `${times(laneMultiple)} the median of your ${lanePeers.length} other posts in this lane`
          : `only ${lanePeers.length} other post${lanePeers.length === 1 ? "" : "s"} in this lane — too few to compare`,
    });
  }

  // ---- the opening it used ------------------------------------------------
  const opening = post.caption.split(/(?<=[.!?])\s/)[0] ?? "";
  const hook = classifyHook(opening);
  const hookPeers = peers.filter(
    (entry) => classifyHook(entry.caption.split(/(?<=[.!?])\s/)[0] ?? "") === hook,
  );
  const hookMedian = median(hookPeers.map(primary));
  const hookMultiple = ratio(primary(post), hookMedian, hookPeers.length);
  rows.push({
    label: HOOK_LABEL[hook],
    value: compact(primary(post)),
    multiple: hookMultiple,
    verdict: verdictFor(hookMultiple),
    note:
      hookMultiple != null
        ? `${times(hookMultiple)} the median of your ${hookPeers.length} other posts that open this way`
        : "too few posts open this way to compare",
  });

  // ---- the reads ----------------------------------------------------------
  //
  // Rules over the comparisons above, ordered by how much they should change
  // what gets made next. The reach-versus-engagement split is first because it
  // is the one that separates "nobody saw it" from "they saw it and scrolled",
  // which call for opposite fixes.
  const reachRow = rows.find((row) => row.label === "Reach");
  const saveRow = rows.find((row) => row.label === "Save rate");
  const watchRow = rows.find((row) => row.label === "Average watch");

  if (reachRow?.verdict === "weak" && saveRow?.verdict === "strong") {
    reads.push(
      "Few people saw it, but the ones who did kept it. The idea worked and the distribution did not — this is worth making again with a stronger opening.",
    );
  } else if (reachRow?.verdict === "strong" && saveRow?.verdict === "weak") {
    reads.push(
      "It travelled further than usual but almost nobody saved it. It got attention without being worth keeping, so reach here is not a sign to repeat the subject.",
    );
  }

  if (watchRow?.verdict === "strong" && reachRow?.verdict !== "strong") {
    reads.push(
      `People stayed for ${watchRow.value} against a usual ${watchRow.note.split("of ").pop()}. The middle is holding; it is the first frame that is limiting this.`,
    );
  } else if (watchRow?.verdict === "weak") {
    reads.push(
      `Watch time is ${watchRow.value}, below your usual. People arrived and left early — the opening promised something the next few seconds did not pay off.`,
    );
  }

  const laneRow = rows.find((row) => row.label.startsWith("Against "));
  if (laneRow?.verdict === "strong" && laneRow.multiple != null) {
    reads.push(
      `Within ${post.contentLane}, this is ${times(laneRow.multiple)} the lane's median — one of the stronger posts in a lane you already publish in.`,
    );
  } else if (laneRow?.verdict === "weak" && laneRow.multiple != null) {
    reads.push(
      `It underperformed its own lane at ${times(laneRow.multiple)} the median there, so the subject is not the explanation — other posts in ${post.contentLane} did better.`,
    );
  }

  const hookRow = rows.at(-1);
  if (hookRow?.verdict === "strong" && hookRow.multiple != null) {
    reads.push(
      `It beat the posts that open the same way — ${HOOK_LABEL[hook].toLowerCase()} — by ${times(hookRow.multiple)}, so the opening is not what held it back.`,
    );
  }

  if (noViewCount) {
    reads.push(
      "Instagram publishes no view count for this format, so everything above is measured on interactions rather than views.",
    );
  }

  // ---- the headline -------------------------------------------------------
  let headline: string;
  if (thin) {
    headline = `Only ${sample} other post${sample === 1 ? "" : "s"} stored — too few to say whether this did well.`;
  } else if (primaryMultiple == null) {
    headline = "Not enough comparable posts to read this one.";
  } else if (primaryMultiple >= 2) {
    headline = `A breakout: ${times(primaryMultiple)} your median ${primaryLabel.toLowerCase()}.`;
  } else if (primaryMultiple >= STRONG) {
    headline = `Above par: ${times(primaryMultiple)} your median ${primaryLabel.toLowerCase()}.`;
  } else if (primaryMultiple <= WEAK) {
    headline = `Below par: ${times(primaryMultiple)} your median ${primaryLabel.toLowerCase()}.`;
  } else {
    headline = `A typical post for this account: ${times(primaryMultiple)} your median ${primaryLabel.toLowerCase()}.`;
  }

  return { headline, rows, reads, sample, thin };
}
