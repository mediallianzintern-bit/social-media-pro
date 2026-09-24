// Meta Graph API client — the owner-only half of the Instagram picture.
//
// Apify sees what any visitor sees. This sees what only Pritesh sees: reach,
// saves, watch time and audience demographics. It is strictly additive — every
// caller must degrade cleanly when the token is absent, because the dashboard
// worked before this existed and has to keep working if the token is revoked.
const VERSION = "v21.0";

export function graphToken(): string | undefined {
  return process.env["INSTAGRAM_ACCESS_TOKEN"]?.trim() || undefined;
}

export function igAccountId(): string | undefined {
  return process.env["INSTAGRAM_BUSINESS_ACCOUNT_ID"]?.trim() || undefined;
}

export function hasInstagramGraph(): boolean {
  return Boolean(graphToken() && igAccountId());
}

/** Env vars still needed before Graph metrics can appear. */
export function missingGraphEnv(): string[] {
  const missing: string[] = [];
  if (!graphToken()) missing.push("INSTAGRAM_ACCESS_TOKEN");
  if (!igAccountId()) missing.push("INSTAGRAM_BUSINESS_ACCOUNT_ID");
  return missing;
}

export class GraphError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

export async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = graphToken();
  if (!token) throw new GraphError("INSTAGRAM_ACCESS_TOKEN is not set");

  const url = new URL(`https://graph.facebook.com/${VERSION}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);

  const response = await fetch(url);
  const body = (await response.json()) as { error?: { message: string; code?: number } };
  if (body.error) throw new GraphError(body.error.message, body.error.code);
  if (!response.ok) throw new GraphError(`${response.status} ${response.statusText}`);
  return body as T;
}

/**
 * Graph rejects an ENTIRE request when any one metric is unsupported for the
 * media type in it — a reel has no `follows`, a carousel has no watch time.
 * Asking for each metric separately trades request count for the guarantee that
 * one unsupported metric never costs us the supported ones alongside it.
 */
export async function graphOptional<T>(
  path: string,
  params: Record<string, string>,
): Promise<T | null> {
  try {
    return await graph<T>(path, params);
  } catch (error) {
    if (error instanceof GraphError) return null;
    throw error;
  }
}
