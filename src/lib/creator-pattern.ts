// What a reel in a creator-fed lane looks like, learned from the creators.
//
// AI tool workflows, phase 2 (approved 23 Oct 2026). Phase 1 decided "is this
// reel about an AI tool?" with a hand-written word list, and a security
// checklist got through because its caption mentioned AI further down. Here
// the system learns the lane's vocabulary from the watched creators' own posts
// instead: no topic word is written in this file.
//
// The method, all counting:
//   1. Every word, two-word phrase and hashtag in the creators' posts is
//      counted, and so is the same term in a BACKGROUND of ordinary news
//      headlines and the account's posts in its other lanes.
//   2. A term enters the pattern when it is several times more common in the
//      creators' posts than in the background, AND appears in posts by at
//      least MIN_CREATORS different creators: one creator's giveaway word
//      ("Comment PYNK") is that creator, not the subject.
//   3. A caption's score is the sum of the weights of the pattern terms in it,
//      and the pass mark is set so most of the creators' own posts clear it.
//
// Rebuilt from fresh posts (monthly, or from the button), so the vocabulary
// moves when the subject does. Pure and client-safe.
import { significantWords } from "@/lib/lane-fit";

/** A term must appear in at least this many of the creators' posts. */
export const MIN_REELS = 5;
/** ...posted by at least this many different creators. */
export const MIN_CREATORS = 3;
/** ...and be at least this many times as common there as in the background. */
export const MIN_LIFT = 3;
/** Terms kept in a pattern, strongest first. */
export const MAX_TERMS = 80;
/**
 * The pass mark lets this share of the creators' own posts through. Strict,
 * as the proposal recommends. Measured on 23 Oct 2026 (250 creator posts,
 * 1,288 background items): at 65% the pass mark let 0.8% of the background
 * through and kept 14 of the 19 standout reels, dropping an account-security
 * checklist and four captions that describe no workflow; at 75% the checklist
 * and 6% of the background got through.
 */
export const PASS_SHARE = 0.65;
/** The pass mark never drops below this: about two strong terms. */
export const MIN_PASS_SCORE = 3;
/** A pattern older than this is rebuilt on the next read. */
export const PATTERN_MAX_AGE_DAYS = 30;

export type PatternTermKind = "word" | "phrase" | "hashtag";

export interface PatternTerm {
  term: string;
  kind: PatternTermKind;
  /** log2 of how many times more common it is in the creators' posts. */
  weight: number;
  /** Creators' posts it appears in. */
  reels: number;
  /** Different creators who used it. */
  creators: number;
  /** Background items it appears in. */
  background: number;
}

export interface CreatorPattern {
  lane: string;
  builtAt: string;
  terms: PatternTerm[];
  /** The score a caption needs to count as this lane's content. */
  passScore: number;
  /** The median score of the creators' own posts: a caption at it is a 100% fit. */
  typicalScore: number;
  stats: {
    creatorPosts: number;
    creators: number;
    background: number;
    /** Share of the creators' posts that pass. */
    creatorPass: number;
    /** Share of the background that passes: how often ordinary news would slip in. */
    backgroundPass: number;
  };
  /** Hashtags and phrases to search Instagram with when finding new creators (phase 3). */
  searchTerms: string[];
}

/** The words, phrases and hashtags of a text, each once. */
export function patternTokens(text: string): Set<string> {
  const lower = text.toLowerCase().replace(/https?:\/\/\S+/g, " ");
  const hashtags = lower.match(/#[a-z0-9_]{2,}/g) ?? [];
  const plain = lower.replace(/#[a-z0-9_]+/g, " ").replace(/@[\w.]+/g, " ");
  const words = significantWords(plain);
  const phrases = words.slice(1).map((word, index) => `${words[index]} ${word}`);
  return new Set([...hashtags, ...words, ...phrases]);
}

function kindOf(term: string): PatternTermKind {
  return term.startsWith("#") ? "hashtag" : term.includes(" ") ? "phrase" : "word";
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[index]!;
}

/** A caption's score against a set of terms, and the terms it matched, strongest first. */
function scoreTokens(tokens: Set<string>, terms: PatternTerm[]) {
  const matched = terms.filter((term) => tokens.has(term.term));
  return { score: matched.reduce((sum, term) => sum + term.weight, 0), matched };
}

export function buildPattern(
  lane: string,
  creatorPosts: Array<{ creator: string; text: string }>,
  background: string[],
  now = new Date(),
): CreatorPattern {
  const positive = creatorPosts.map((post) => ({
    creator: post.creator,
    tokens: patternTokens(post.text),
  }));
  const negative = background.map((text) => patternTokens(text));

  const reels = new Map<string, number>();
  const creators = new Map<string, Set<string>>();
  for (const post of positive) {
    for (const token of post.tokens) {
      reels.set(token, (reels.get(token) ?? 0) + 1);
      const who = creators.get(token) ?? new Set<string>();
      who.add(post.creator);
      creators.set(token, who);
    }
  }
  const inBackground = new Map<string, number>();
  for (const tokens of negative) {
    for (const token of tokens) inBackground.set(token, (inBackground.get(token) ?? 0) + 1);
  }

  const nP = positive.length || 1;
  const nB = negative.length || 1;
  const terms: PatternTerm[] = [];
  for (const [term, count] of reels) {
    const who = creators.get(term)?.size ?? 0;
    if (count < MIN_REELS || who < MIN_CREATORS) continue;
    const background = inBackground.get(term) ?? 0;
    // Smoothed rates, so a term never seen in the background is not infinitely
    // distinctive, only very.
    const lift = (count + 1) / (nP + 2) / ((background + 1) / (nB + 2));
    if (lift < MIN_LIFT) continue;
    terms.push({
      term,
      kind: kindOf(term),
      weight: Number(Math.log2(lift).toFixed(3)),
      reels: count,
      creators: who,
      background,
    });
  }
  terms.sort((a, b) => b.weight * Math.log2(1 + b.reels) - a.weight * Math.log2(1 + a.reels));
  const kept = terms.slice(0, MAX_TERMS);

  const positiveScores = positive.map((post) => scoreTokens(post.tokens, kept).score);
  const passScore = Math.max(MIN_PASS_SCORE, quantile(positiveScores, 1 - PASS_SHARE));
  const typicalScore = Math.max(passScore, quantile(positiveScores, 0.5));
  const share = (scores: number[]) =>
    scores.length
      ? Number((scores.filter((score) => score >= passScore).length / scores.length).toFixed(3))
      : 0;

  const byReach = (kind: PatternTermKind, limit: number) =>
    kept
      .filter((term) => term.kind === kind)
      .sort((a, b) => b.reels - a.reels || b.weight - a.weight)
      .slice(0, limit)
      .map((term) => term.term);

  return {
    lane,
    builtAt: now.toISOString(),
    terms: kept,
    // Not rounded: a caption scoring exactly at the mark must pass.
    passScore,
    typicalScore,
    stats: {
      creatorPosts: positive.length,
      creators: new Set(creatorPosts.map((post) => post.creator)).size,
      background: negative.length,
      creatorPass: share(positiveScores),
      backgroundPass: share(negative.map((tokens) => scoreTokens(tokens, kept).score)),
    },
    searchTerms: [...byReach("hashtag", 8), ...byReach("phrase", 5)],
  };
}

export interface PatternFit {
  /** 0-100: the caption's score against a typical creator post. */
  fit: number;
  passes: boolean;
  /** The pattern terms it matched, strongest first, to explain the decision. */
  matched: string[];
}

export function fitOf(pattern: CreatorPattern, text: string): PatternFit {
  const { score, matched } = scoreTokens(patternTokens(text), pattern.terms);
  return {
    fit: Math.round(Math.min(1, score / (pattern.typicalScore || 1)) * 100),
    passes: score >= pattern.passScore,
    matched: matched
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)
      .map((term) => term.term),
  };
}

/** Whether a stored pattern is due to be rebuilt. */
export function isStale(pattern: { builtAt: string } | null, now = Date.now()): boolean {
  if (!pattern) return true;
  return now - Date.parse(pattern.builtAt) > PATTERN_MAX_AGE_DAYS * 86_400_000;
}
