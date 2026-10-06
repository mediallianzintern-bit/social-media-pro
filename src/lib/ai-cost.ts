// What a generation actually cost.
//
// Every OpenAI reply states how many tokens the call used. The client has
// always received that and thrown it away, so "how much does a reel cost?"
// could only be answered by opening the OpenAI dashboard. It is now carried
// back with the ideas and shown next to them.
//
// THE CALCULATION, so the number can be checked rather than believed:
//
//   cost = (prompt tokens / 1,000,000) x input rate
//        + (completion tokens / 1,000,000) x output rate
//
// Input is everything sent — the voice block, the SOP shapes, the brief of
// measured data, the stories, the JSON schema. Output is what came back. They
// are priced differently, output several times higher, which is why a request
// that is mostly input is cheaper than its token count suggests.
//
// Rates are per MILLION tokens, in USD, and are a snapshot: OpenAI changes
// them, and nothing here can detect that. A model with no entry reports tokens
// and no cost rather than guessing — a made-up price is worse than none.
// Checked against openai.com/api/pricing on 6 October 2026.
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

interface Rate {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

const RATES: Record<string, Rate> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
};

/** The rate for a model id, matching the family so dated snapshots still price. */
function rateFor(model: string): Rate | null {
  const id = model.trim().toLowerCase();
  if (!id) return null;
  // "gpt-4o-mini-2024-07-18" must match gpt-4o-mini, and must NOT match
  // gpt-4o — so the longest matching key wins.
  const key = Object.keys(RATES)
    .filter((candidate) => id.startsWith(candidate))
    .sort((a, b) => b.length - a.length)[0];
  return key ? RATES[key]! : null;
}

export interface GenerationCost {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** USD, or null when this model has no published rate here. */
  usd: number | null;
  model: string;
}

export function costOf(usage: TokenUsage, model: string): GenerationCost {
  const rate = rateFor(model);
  const usd = rate
    ? (usage.promptTokens / 1_000_000) * rate.input +
      (usage.completionTokens / 1_000_000) * rate.output
    : null;
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.promptTokens + usage.completionTokens,
    usd,
    model,
  };
}

/**
 * The cost as a short string.
 *
 * Fractions of a cent are the normal case on a cheap model, and "$0.00" would
 * read as free. Below a cent it is shown in cents to two decimals instead.
 */
export function formatCost(cost: GenerationCost): string {
  const tokens = `${cost.totalTokens.toLocaleString("en-US")} tokens`;
  if (cost.usd == null) return tokens;
  if (cost.usd < 0.01) return `${tokens} · ${(cost.usd * 100).toFixed(2)}¢`;
  return `${tokens} · $${cost.usd.toFixed(2)}`;
}

/** The full sum, for a tooltip — the arithmetic, not just the answer. */
export function explainCost(cost: GenerationCost): string {
  const rate = rateFor(cost.model);
  if (!rate) {
    return `${cost.promptTokens.toLocaleString("en-US")} in + ${cost.completionTokens.toLocaleString("en-US")} out. No published rate stored for ${cost.model}, so no cost is shown.`;
  }
  const inUsd = (cost.promptTokens / 1_000_000) * rate.input;
  const outUsd = (cost.completionTokens / 1_000_000) * rate.output;
  const cents = (value: number) => `${(value * 100).toFixed(3)}¢`;
  return (
    `${cost.promptTokens.toLocaleString("en-US")} input × $${rate.input}/M = ${cents(inUsd)}; ` +
    `${cost.completionTokens.toLocaleString("en-US")} output × $${rate.output}/M = ${cents(outUsd)}. ` +
    `Rates for ${cost.model} as of 6 Oct 2026.`
  );
}
