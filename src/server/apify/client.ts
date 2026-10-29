// Minimal Apify REST client. Server-only: the token never enters the browser
// bundle, so nothing under src/server may be imported from a route at top level.
//
// Docs: https://docs.apify.com/api/v2

const API = "https://api.apify.com/v2";

export class ApifyError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ApifyError";
  }
}

// ---------------------------------------------------------------------------
// Two Apify accounts (Oct 2026). APIFY_TOKEN is used first; when its account
// has used its monthly allowance, runs move to APIFY_TOKEN_2 by themselves,
// and back again once the first account's month resets. A run's dataset can
// only be read with the key of the account that ran it, so each run and
// dataset remembers its key.
// ---------------------------------------------------------------------------

const TOKEN_VARS = ["APIFY_TOKEN", "APIFY_TOKEN_2"] as const;

/** Every configured key, in the order they are used. */
function apifyTokens(): string[] {
  return TOKEN_VARS.map((name) => process.env[name]?.trim()).filter((token): token is string =>
    Boolean(token),
  );
}

/** The first configured key: whether Apify is set up at all. */
export function apifyToken(): string | undefined {
  return apifyTokens()[0];
}

/** Keys whose account is out of allowance, and until when (epoch ms). */
const spentUntil = new Map<string, number>();
/** When each key's allowance was last read from Apify (epoch ms). */
const checkedAt = new Map<string, number>();
/** Which key started a run or holds a dataset. */
const keyFor = new Map<string, string>();

/** How often a key's allowance is read again. The read is free. */
const CHECK_EVERY_MS = 60 * 60_000;
/** How long a spent key is left alone when Apify does not say when its month resets. */
const SPENT_FALLBACK_MS = 6 * 60 * 60_000;

/** "Account 1" / "account 2", for logs, never the key itself. */
function label(token: string): string {
  return `account ${apifyTokens().indexOf(token) + 1}`;
}

/**
 * Whether a key's account has used its monthly allowance. Read from Apify's
 * own limits (free), at most once an hour per key; a key that cannot be read
 * is treated as usable, so a hiccup here never stops a sync.
 */
async function isSpent(token: string): Promise<boolean> {
  const until = spentUntil.get(token);
  if (until && until > Date.now()) return true;
  if (Date.now() - (checkedAt.get(token) ?? 0) < CHECK_EVERY_MS) return false;
  checkedAt.set(token, Date.now());
  try {
    const response = await fetch(`${API}/users/me/limits`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return false;
    const body = (await response.json()) as {
      data?: {
        monthlyUsageCycle?: { endAt?: string };
        limits?: { maxMonthlyUsageUsd?: number };
        current?: { monthlyUsageUsd?: number };
      };
    };
    const max = body.data?.limits?.maxMonthlyUsageUsd;
    const used = body.data?.current?.monthlyUsageUsd;
    if (max == null || used == null || used < max) return false;
    markSpent(token, body.data?.monthlyUsageCycle?.endAt);
    return true;
  } catch {
    return false;
  }
}

function markSpent(token: string, resetsAt?: string): void {
  const reset = resetsAt ? Date.parse(resetsAt) : NaN;
  spentUntil.set(token, Number.isFinite(reset) ? reset : Date.now() + SPENT_FALLBACK_MS);
  console.warn(
    `[apify] ${label(token)} has used its monthly allowance; using the next account` +
      (resetsAt ? ` until ${resetsAt.slice(0, 10)}` : ""),
  );
}

/** Apify refusing a run because the account is out of allowance. */
function isAllowanceError(error: unknown): boolean {
  return (
    error instanceof ApifyError &&
    (error.status === 402 || error.status === 403 || error.status === 429) &&
    /usage|limit|exceed|payment|credit|platform-feature-disabled/i.test(error.message)
  );
}

/** Each configured account and whether it is out of allowance, for logs and checks. */
export async function apifyAccounts(): Promise<Array<{ account: number; spent: boolean }>> {
  return Promise.all(
    apifyTokens().map(async (token, index) => ({
      account: index + 1,
      spent: await isSpent(token),
    })),
  );
}

/** The keys to try for a new run, spent ones last (in case Apify's figure was stale). */
async function usableTokens(): Promise<string[]> {
  const tokens = apifyTokens();
  const spent = await Promise.all(tokens.map(isSpent));
  return [
    ...tokens.filter((_, index) => !spent[index]),
    ...tokens.filter((_, index) => spent[index]),
  ];
}

/** Actor ids use "~" in REST paths where the Store shows "/". */
function actorPath(actor: string): string {
  return actor.replace("/", "~");
}

async function request<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 180_000,
  token: string | undefined = apifyToken(),
): Promise<T> {
  if (!token) throw new ApifyError("APIFY_TOKEN is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const body = await response.text();
    if (!response.ok) {
      throw new ApifyError(
        `${response.status} ${response.statusText}: ${body.slice(0, 300)}`,
        response.status,
      );
    }
    return (body ? JSON.parse(body) : null) as T;
  } catch (error) {
    if (error instanceof ApifyError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApifyError(`Apify request timed out after ${timeoutMs}ms`);
    }
    throw new ApifyError(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}

interface RunInfo {
  data: {
    id: string;
    status: string;
    defaultDatasetId: string;
    startedAt: string;
    finishedAt?: string;
  };
}

/**
 * Statuses that mean the run has not settled yet.
 *
 * READY is the one that matters: it means Apify has accepted the run but not yet
 * allocated compute to it. It reads like a terminal state and is not one.
 */
const PENDING_STATUSES = new Set(["READY", "RUNNING"]);

/** Apify's own cap on ?waitForFinish. Larger values are silently clamped to it. */
const MAX_WAIT_SECS = 60;

/**
 * Runs an actor and blocks until it finishes. `run-sync-get-dataset-items` would
 * be one call, but it hides the run id — and the run id is what lets us record
 * exactly which Apify run produced a stored snapshot.
 *
 * The single `?waitForFinish=` call this used to make looked like it waited as
 * long as we asked, but Apify clamps that parameter to 60 seconds. Anything
 * slower came back still READY and was reported as "finished with status READY"
 * — a failure message for a run that was merely queued, and which typically
 * went on to SUCCEED minutes later. The LinkedIn profile scraper takes around
 * four minutes, so it failed every single time while Instagram, which finishes
 * inside the minute, never did. Hence: wait the maximum the API allows, then
 * poll until the run actually settles.
 */
export async function runActor(
  actor: string,
  input: unknown,
  deadlineMs = 10 * 60_000,
  /**
   * For pay-per-event actors: the most this one run may be charged, enforced
   * by Apify itself. Used by the per-clip reaction steps so a misbehaving or
   * repriced actor can never turn one click into a large bill.
   */
  options: { maxTotalChargeUsd?: number } = {},
): Promise<{ runId: string; datasetId: string; status: string }> {
  const tokens = await usableTokens();
  if (!tokens.length) throw new ApifyError("APIFY_TOKEN is not set");
  for (const [index, token] of tokens.entries()) {
    const last = index === tokens.length - 1;
    try {
      const result = await runActorWith(token, actor, input, deadlineMs, options);
      keyFor.set(result.runId, token);
      keyFor.set(result.datasetId, token);
      return result;
    } catch (error) {
      // Out of allowance: refused at the start, or stopped part-way because
      // the account ran out. Either way the next account runs it from scratch.
      const spent =
        isAllowanceError(error) ||
        (error instanceof ApifyError &&
          /finished with status/.test(error.message) &&
          (checkedAt.delete(token), await isSpent(token)));
      if (!spent || last) throw error;
      if (!spentUntil.has(token)) markSpent(token);
    }
  }
  throw new ApifyError("No Apify account could run this");
}

async function runActorWith(
  token: string,
  actor: string,
  input: unknown,
  deadlineMs: number,
  options: { maxTotalChargeUsd?: number },
): Promise<{ runId: string; datasetId: string; status: string }> {
  const cap =
    options.maxTotalChargeUsd != null ? `&maxTotalChargeUsd=${options.maxTotalChargeUsd}` : "";
  let run = await request<RunInfo>(
    `${API}/acts/${actorPath(actor)}/runs?waitForFinish=${MAX_WAIT_SECS}${cap}`,
    { method: "POST", body: JSON.stringify(input) },
    undefined,
    token,
  );

  const runId = run.data.id;
  const giveUpAt = Date.now() + deadlineMs;

  while (PENDING_STATUSES.has(run.data.status)) {
    if (Date.now() > giveUpAt) {
      throw new ApifyError(
        `Actor ${actor} was still ${run.data.status} after ${Math.round(deadlineMs / 60_000)} ` +
          `minutes. The run may still finish — check it at https://console.apify.com/actors/runs/${runId}`,
      );
    }
    // Long-poll rather than sleep-and-check: the API returns as soon as the run
    // settles, so a fast run is not held up by a fixed interval.
    run = await request<RunInfo>(
      `${API}/actor-runs/${runId}?waitForFinish=${MAX_WAIT_SECS}`,
      {},
      undefined,
      token,
    );
  }

  if (run.data.status !== "SUCCEEDED") {
    throw new ApifyError(`Actor ${actor} finished with status ${run.data.status}`);
  }
  return { runId: run.data.id, datasetId: run.data.defaultDatasetId, status: run.data.status };
}

/** Most recent successful run of an actor — used to ingest scheduled runs. */
export async function lastSuccessfulRun(
  actor: string,
): Promise<{ runId: string; datasetId: string; finishedAt: string } | null> {
  const run = await request<RunInfo | null>(
    `${API}/acts/${actorPath(actor)}/runs/last?status=SUCCEEDED`,
  );
  if (!run?.data) return null;
  return {
    runId: run.data.id,
    datasetId: run.data.defaultDatasetId,
    finishedAt: run.data.finishedAt ?? run.data.startedAt,
  };
}

/**
 * An item that is only an actor's error message, not data.
 *
 * Some store actors refuse to work — a free-plan run cap, a blocked input —
 * by writing `{ "error": "..." }` into their dataset and exiting successfully.
 * The run reports SUCCEEDED, so nothing upstream notices.
 */
function isErrorItem(item: unknown): item is { error: string } {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as { error?: unknown }).error === "string" &&
    Object.keys(item).length <= 3
  );
}

export async function datasetItems<T>(datasetId: string, limit = 200): Promise<T[]> {
  const items = await request<T[]>(
    `${API}/datasets/${datasetId}/items?clean=true&limit=${limit}`,
    {},
    undefined,
    keyFor.get(datasetId) ?? apifyToken(),
  );
  // A dataset of nothing but error messages is a failed run wearing a success
  // status. Read as data, it is an empty result: the sync then reported "ok"
  // while saving nothing, and LinkedIn quietly stopped updating (24 Sep 2026,
  // "Free users are limited to 50 runs"). Surfacing it as an error is what puts
  // the actor's own explanation in front of the person pressing Sync.
  if (items.length && items.every(isErrorItem)) {
    throw new Error((items[0] as { error: string }).error);
  }
  return items;
}
