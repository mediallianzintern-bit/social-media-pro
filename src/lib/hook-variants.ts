// T63 — the hook A/B.
//
// An idea arrives with three ways in. Which one to film is not a matter of
// taste here: each opening is classified by the same rules the scorecard uses,
// and each CLASS has a measured record on this account — posts that open with
// a number do 1.4x the median, posts that open with a question do 0.8x. The
// recommendation is simply the variant whose class this account rewards most.
//
// The model writes the words; nothing here asks it which is best, and no model
// call happens in this file at all. That split matters: a model asked to rank
// its own hooks will rank them by how good they sound, which is uncorrelated
// with how this particular audience behaves.
//
// Client-safe.
import { classifyHook, HOOK_LABEL, type HookType } from "@/lib/script-features";
import { HOOK_PRESENT, type HookScore } from "@/lib/double-down";
import type { ContentIdea } from "@/lib/ai-types";

/** A/B/C — how the variants are referred to on screen and in a decision. */
export const VARIANT_LABELS = ["A", "B", "C"] as const;

export interface HookVariant {
  /** "A", "B", "C". A is always the idea's own first hook. */
  label: string;
  hook: string;
  type: HookType;
  typeLabel: string;
  /**
   * How this opening type does on this account, as a multiple of its median.
   * Null when the account has too few posts of that type to say anything.
   */
  multiple: number | null;
  /** Posts behind that multiple. */
  posts: number;
  /** The one to film, unless the team disagrees. Exactly one variant has it. */
  recommended: boolean;
  /** What the team actually picked, once they have. */
  chosen: boolean;
}

export interface HookTest {
  variants: HookVariant[];
  /**
   * Why the recommended one is recommended, in the account's own figures, or
   * null when nothing is measured yet and the pick is just the idea's own hook.
   */
  reason: string | null;
  /**
   * Set when the variants do not actually differ — all three opening the same
   * way is a choice of wording, not a test, and saying so is more useful than
   * printing a confident ranking over it.
   */
  warning: string | null;
}

/**
 * The idea's hooks, ranked by what this account's audience has rewarded.
 *
 * Deduplicates first: a generation that repeats the hook, or returns an empty
 * alternative, should show two options rather than three identical ones.
 */
export function hookTest(idea: ContentIdea, scores: HookScore[]): HookTest {
  const seen = new Set<string>();
  const hooks = [idea.hook, ...(idea.altHooks ?? [])]
    .map((hook) => hook?.trim() ?? "")
    .filter((hook) => {
      const key = hook.toLowerCase();
      if (!hook || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, VARIANT_LABELS.length);

  if (!hooks.length) return { variants: [], reason: null, warning: null };

  const scoreFor = new Map(scores.map((score) => [score.hook, score]));
  const chosen = idea.chosenHook?.trim().toLowerCase();

  const variants: HookVariant[] = hooks.map((hook, index) => {
    // The idea's title names the subject, which is what lets "names the brand
    // first" be told apart from any other sentence starting with a capital.
    const type = classifyHook(hook, idea.title);
    const score = scoreFor.get(type);
    return {
      label: VARIANT_LABELS[index] ?? String(index + 1),
      hook,
      type,
      typeLabel: HOOK_LABEL[type],
      multiple: score?.median ?? null,
      posts: score?.posts ?? 0,
      recommended: false,
      chosen: chosen ? hook.toLowerCase() === chosen : false,
    };
  });

  // The strongest MEASURED variant, and only if it is actually strong.
  //
  // Recommending the best of three bad options is worse than recommending
  // nothing: on a real idea all three openings were questions and near-
  // questions, the best ran 0.32x this account's median, and the panel said
  // "B opens the way this account does best" — advice to film the weakest
  // kind of opening this account has. Below 1.0x nothing is recommended, and
  // the warning says which openings DO work here instead.
  const measured = variants.filter((variant) => variant.multiple != null);
  const best = measured.reduce<HookVariant | null>(
    (winner, variant) => (!winner || variant.multiple! > winner.multiple! ? variant : winner),
    null,
  );
  const strongest = best && best.multiple! >= 1 ? best : null;
  if (strongest) strongest.recommended = true;

  const shapes = new Set(variants.map((variant) => variant.type));
  const sameShape = variants.length > 1 && shapes.size === 1;
  const partlySame = variants.length > 2 && shapes.size < variants.length;

  // HOOK_PRESENT, not HOOK_LABEL: the labels are chips and mix noun phrases
  // with verb phrases, so lower-casing one into a sentence gives "posts that
  // plain statement run 0.98x". These read correctly after "posts that".
  const reason =
    strongest && !sameShape
      ? `${strongest.label} opens the way this account does best: posts that ${HOOK_PRESENT[strongest.type]} run ${strongest.multiple}× your median across ${strongest.posts} posts.`
      : null;

  // What this account actually rewards, for when none of the three do. Only
  // openings it has not already tried here, strongest first, and only ones
  // above the median — naming a second losing option would not help.
  const alternatives = scores
    .filter((score) => score.median >= 1 && !shapes.has(score.hook))
    .slice(0, 3)
    .map((score) => `${HOOK_PRESENT[score.hook]} (${score.median}×)`);

  const warnings: string[] = [];
  if (sameShape) {
    warnings.push(
      "All of these open the same way, so this is a choice of wording rather than a test of approach.",
    );
  } else if (partlySame) {
    warnings.push(
      "Two of these open the same way, so there are really only two approaches being tested here.",
    );
  }
  if (variants.length < 2) {
    warnings.push(
      "Only one hook was written for this idea — generate again to get alternatives to test.",
    );
  } else if (best && !strongest) {
    warnings.push(
      `None of these openings does well on this account — the best of them runs ${best.multiple}× your median. ` +
        (alternatives.length
          ? `What works here: ${alternatives.join(", ")}. Rewrite one of these to open that way.`
          : "Consider rewriting one to open differently."),
    );
  }

  return { variants, reason, warning: warnings.length ? warnings.join(" ") : null };
}
