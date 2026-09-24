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

export function apifyToken(): string | undefined {
  const token = process.env["APIFY_TOKEN"];
  return token && token.trim() ? token.trim() : undefined;
}

/** Actor ids use "~" in REST paths where the Store shows "/". */
function actorPath(actor: string): string {
  return actor.replace("/", "~");
}

async function request<T>(url: string, init: RequestInit = {}, timeoutMs = 180_000): Promise<T> {
  const token = apifyToken();
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
): Promise<{ runId: string; datasetId: string; status: string }> {
  let run = await request<RunInfo>(
    `${API}/acts/${actorPath(actor)}/runs?waitForFinish=${MAX_WAIT_SECS}`,
    { method: "POST", body: JSON.stringify(input) },
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
    run = await request<RunInfo>(`${API}/actor-runs/${runId}?waitForFinish=${MAX_WAIT_SECS}`);
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
  const items = await request<T[]>(`${API}/datasets/${datasetId}/items?clean=true&limit=${limit}`);
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
