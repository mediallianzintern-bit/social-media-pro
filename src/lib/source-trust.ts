// Which news outlets the team trusts, learned from what the team does with
// their stories.
//
// Every story in "Topics in the news" comes from an outlet, and the team's
// behaviour towards those stories says which outlets they rely on:
//   tick     ✓ on a story                      for the outlet
//   cross    ✗ on a story                      against it
//   script   a script written from its story   for (they chose it to build on)
//   saved    its story saved                    for
//   filmed   a reel filmed from its story       for (the strongest choice there is)
//
// A cross is weaker evidence about the OUTLET than a tick: most crosses are
// about the subject ("not this story"), not the publisher. So an outlet is
// only avoided after several crosses that clearly outweigh everything else,
// and it is only trusted once the team has backed it more than once.
//
// Learned in code from counts, like lib/preferences.ts: every standing can be
// read back as the numbers that produced it. Older behaviour counts for less
// (the same half-life as votes), so an outlet can earn or lose trust.
//
// Worked out on every topic load and returned with each story, but NOT used to
// order or filter anything yet (23 Oct 2026): ordering by it made the topics
// worse while it rested on a handful of votes per outlet. It keeps learning
// from the team's behaviour until there is enough data to switch it on.
//
// Client-safe.
import { HALF_LIFE_DAYS } from "@/lib/preferences";

export type OutletSignalKind = "tick" | "cross" | "script" | "saved" | "filmed";

export interface OutletSignal {
  publisher: string;
  kind: OutletSignalKind;
  /** When it happened: older behaviour counts for less. */
  at: string;
}

export type OutletStanding = "trusted" | "avoided" | "untested";

export interface OutletRecord {
  /** The outlet's name as it was last seen. */
  name: string;
  ticks: number;
  crosses: number;
  scripts: number;
  saved: number;
  filmed: number;
  /** -1 to 1, smoothed: (for - against) / (for + against + OUTLET_PRIOR). */
  score: number;
  standing: OutletStanding;
}

export type OutletModel = Map<string, OutletRecord>;

/**
 * Pseudo-signals added to every outlet, so the first tick or cross is not
 * total. With 4, a 3 ✓ 0 ✗ outlet scores 0.43 and a 0 ✓ 5 ✗ one -0.56.
 */
export const OUTLET_PRIOR = 4;

/** Trusted at this score or above, with at least TRUSTED_MIN_BACKING positive signals. */
export const TRUSTED_SCORE = 0.25;
export const TRUSTED_MIN_BACKING = 3;

/** Avoided at this score or below, with at least AVOIDED_MIN_CROSSES crosses. */
export const AVOIDED_SCORE = -0.4;
export const AVOIDED_MIN_CROSSES = 4;

/** One outlet, however its name was spelled: case, "www." and spacing ignored. */
export function outletKey(publisher: string | null | undefined): string | null {
  const key = (publisher ?? "")
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\s+/g, " ")
    .trim();
  return key || null;
}

function decay(at: string, now: number): number {
  const time = new Date(at).getTime();
  if (!Number.isFinite(time)) return 1;
  return 0.5 ** (Math.max(0, (now - time) / 86_400_000) / HALF_LIFE_DAYS);
}

export function buildOutletModel(signals: OutletSignal[], now = Date.now()): OutletModel {
  const tallies = new Map<string, OutletRecord & { pro: number; con: number }>();
  for (const signal of signals) {
    const key = outletKey(signal.publisher);
    if (!key) continue;
    const tally = tallies.get(key) ?? {
      name: signal.publisher.trim(),
      ticks: 0,
      crosses: 0,
      scripts: 0,
      saved: 0,
      filmed: 0,
      score: 0,
      standing: "untested" as OutletStanding,
      pro: 0,
      con: 0,
    };
    const weight = decay(signal.at, now);
    if (signal.kind === "cross") tally.con += weight;
    else tally.pro += weight;
    if (signal.kind === "tick") tally.ticks += 1;
    else if (signal.kind === "cross") tally.crosses += 1;
    else if (signal.kind === "script") tally.scripts += 1;
    else if (signal.kind === "saved") tally.saved += 1;
    else tally.filmed += 1;
    tallies.set(key, tally);
  }

  const model: OutletModel = new Map();
  for (const [key, { pro, con, ...record }] of tallies) {
    const score = (pro - con) / (pro + con + OUTLET_PRIOR);
    const backing = record.ticks + record.scripts + record.saved + record.filmed;
    const standing: OutletStanding =
      score >= TRUSTED_SCORE && backing >= TRUSTED_MIN_BACKING
        ? "trusted"
        : score <= AVOIDED_SCORE && record.crosses >= AVOIDED_MIN_CROSSES
          ? "avoided"
          : "untested";
    model.set(key, { ...record, score: Number(score.toFixed(3)), standing });
  }
  return model;
}

/** What the model knows about one outlet, or null when the team has never acted on it. */
export function outletFor(model: OutletModel, publisher: string | null): OutletRecord | null {
  const key = outletKey(publisher);
  return key ? (model.get(key) ?? null) : null;
}

/** The counts behind a standing, in words: "7 ✓ · 1 ✗ · 2 scripts". */
export function outletEvidence(record: OutletRecord): string {
  const parts = [
    record.ticks ? `${record.ticks} ✓` : "",
    record.crosses ? `${record.crosses} ✗` : "",
    record.scripts ? `${record.scripts} script${record.scripts === 1 ? "" : "s"}` : "",
    record.saved ? `${record.saved} saved` : "",
    record.filmed ? `${record.filmed} filmed` : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

/** Every outlet with a standing, strongest first, for display. */
export function outletSummary(model: OutletModel) {
  const all = [...model.values()];
  return {
    trusted: all
      .filter((record) => record.standing === "trusted")
      .sort((a, b) => b.score - a.score),
    avoided: all
      .filter((record) => record.standing === "avoided")
      .sort((a, b) => a.score - b.score),
    judged: all.length,
  };
}
