// OpenAI client — plain fetch, no SDK.
//
// Kept dependency-free on purpose: the project's bunfig enforces a 24-hour
// release-age guard on new packages, and this needs exactly one endpoint.
//
// The model is env-configurable because model names churn faster than this
// codebase will. Set OPENAI_MODEL to whatever the account has access to.

const API = "https://api.openai.com/v1/chat/completions";
// gpt-5.4-mini across the board, chosen for cost. It is the same family as
// gpt-5.5, so the reasoning-model handling below still applies unchanged; what
// changes is depth of judgement, not the API contract. The heavier model is one
// env var away — set OPENAI_MODEL=gpt-5.5 to go back — and the place to watch
// if quality drops is the competitive read and the shot lists, which are the
// two calls that reason hardest over the numbers.
const DEFAULT_MODEL = "gpt-5.4-mini";

/**
 * The GPT-5 family reasons before answering, which is what this workload wants:
 * the competitive read and the shot list are judgement calls over a table of
 * numbers, not text completion. Two API differences come with it, both verified
 * against the live endpoint rather than assumed:
 *
 *   • `temperature` is rejected outright — only the default is accepted.
 *   • `reasoning_effort` is accepted, and is the useful dial in its place.
 */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o[1-9])/.test(model);
}

export class OpenAiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "OpenAiError";
  }
}

/**
 * A real OpenAI key is `sk-` followed by a long opaque string. Anything shorter
 * is a placeholder someone pasted from documentation — treating it as configured
 * turns a clear setup message into an opaque 401 from OpenAI.
 */
const MIN_KEY_LENGTH = 20;

export function openAiKey(): string | undefined {
  const key = process.env["OPENAI_API_KEY"]?.trim();
  if (!key) return undefined;
  if (!key.startsWith("sk-") || key.length < MIN_KEY_LENGTH) return undefined;
  return key;
}

/** True when the variable is present but obviously not a real key. */
export function openAiKeyIsPlaceholder(): boolean {
  const raw = process.env["OPENAI_API_KEY"]?.trim();
  return Boolean(raw) && openAiKey() === undefined;
}

export function openAiModel(): string {
  return process.env["OPENAI_MODEL"]?.trim() || DEFAULT_MODEL;
}

export function hasOpenAi(): boolean {
  return Boolean(openAiKey());
}

interface ChatChoice {
  message?: { content?: string };
  finish_reason?: string;
}

interface ChatResponse {
  choices?: ChatChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface CompletionResult<T> {
  data: T;
  usage: { promptTokens: number; completionTokens: number } | null;
  model: string;
}

/**
 * One structured-output call. `schema` must be a JSON Schema object accepted by
 * OpenAI's strict mode: every property required, `additionalProperties: false`,
 * no optionals. That strictness is the point — it's what stops the model from
 * inventing fields or returning prose where a number belongs.
 */
export async function completeJson<T>(options: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  /** Low for analysis, higher for copywriting. Ignored by reasoning models. */
  temperature?: number;
  /** How hard a reasoning model should think. Ignored by older models. */
  effort?: "low" | "medium" | "high";
  /**
   * Overrides OPENAI_MODEL for this call. Used by the lane classifier, which is
   * a labelling job run over every post of every tracked account — volume, not
   * judgement — and so belongs on a cheaper model than the analysis calls.
   */
  model?: string;
  timeoutMs?: number;
}): Promise<CompletionResult<T>> {
  const key = openAiKey();
  if (!key) throw new OpenAiError("OPENAI_API_KEY is not set");

  const model = options.model ?? openAiModel();
  const reasoning = isReasoningModel(model);
  const controller = new AbortController();
  // Reasoning models think before they answer, so they need a longer leash than
  // the 2 minutes that was ample for gpt-4o.
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? (reasoning ? 300_000 : 120_000),
  );

  try {
    const response = await fetch(API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        ...(reasoning
          ? { reasoning_effort: options.effort ?? "high" }
          : { temperature: options.temperature ?? 0.3 }),
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: options.schemaName,
            strict: true,
            schema: options.schema,
          },
        },
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new OpenAiError(
        `${response.status} ${response.statusText}: ${body.slice(0, 400)}`,
        response.status,
      );
    }

    const parsed = JSON.parse(body) as ChatResponse;
    const choice = parsed.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new OpenAiError("Model response was truncated — reduce the input or raise max tokens");
    }

    const content = choice?.message?.content;
    if (!content) throw new OpenAiError("Model returned an empty response");

    return {
      data: JSON.parse(content) as T,
      usage: parsed.usage
        ? {
            promptTokens: parsed.usage.prompt_tokens,
            completionTokens: parsed.usage.completion_tokens,
          }
        : null,
      model,
    };
  } catch (error) {
    if (error instanceof OpenAiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenAiError("OpenAI request timed out");
    }
    if (error instanceof SyntaxError) {
      throw new OpenAiError(`Model returned invalid JSON: ${error.message}`);
    }
    throw new OpenAiError(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}
