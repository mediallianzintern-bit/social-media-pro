// LinkedIn's own API for Pritesh Sir's PERSONAL profile: the owner-only
// figures scraping cannot reach (impressions, members reached, followers
// gained from a post). Community Management API, Member Post Analytics,
// scope r_member_postAnalytics, endpoint /rest/memberCreatorPostAnalytics.
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/post-statistics
//
// Step 1 of the LinkedIn API work: the connection. Pritesh Sir signs in to
// LinkedIn once and presses Allow; the token is stored server-side
// (platform_tokens, 0024) and read by the server only. Nothing here costs
// money: LinkedIn's API is free, and no AI is called.
//
// The flow is LinkedIn's standard three-legged OAuth:
//   1. connectUrl() sends the browser to LinkedIn's consent screen, carrying a
//      signed `state` tied to the staff member who started it,
//   2. LinkedIn sends the browser back to /connect/linkedin with a one-time code,
//   3. finishConnect() checks the state and swaps the code for a token.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { hasDurableStore } from "./store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

/**
 * The permissions asked for, both read-only and both about him alone: his own
 * posts' analytics, and his profile analytics (true follower count). Asked for
 * together so he signs in once, not again for each figure.
 */
export const LINKEDIN_SCOPES = ["r_member_postAnalytics", "r_member_profileAnalytics"];
/** LinkedIn's versioned API, YYYYMM. Versions are supported for about a year. */
export const LINKEDIN_VERSION = "202610";
/** Where LinkedIn sends the browser back. Registered in the app's Auth tab. */
export const CALLBACK_PATH = "/connect/linkedin";
/** A connect link is good for this long. */
const STATE_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * The origins LinkedIn may send the browser back to. Each must also be
 * registered as a redirect URL in the LinkedIn app's Auth tab, or LinkedIn
 * refuses the sign-in. Checked here so a forged origin cannot be used.
 */
const ALLOWED_ORIGINS = ["https://social.mediallianz.com", "http://localhost:8080"];

function credentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env["LINKEDIN_CLIENT_ID"]?.trim();
  const clientSecret = process.env["LINKEDIN_CLIENT_SECRET"]?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function linkedInApiConfigured(): boolean {
  return credentials() !== null;
}

export function redirectUri(origin: string): string {
  const clean = origin.replace(/\/+$/, "");
  if (!ALLOWED_ORIGINS.includes(clean)) {
    throw new Error(`LinkedIn sign-in is not set up for ${clean}.`);
  }
  return `${clean}${CALLBACK_PATH}`;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** A state only this server can mint: who started it, when, and a nonce. */
export function makeState(email: string, secret: string, now = Date.now()): string {
  const payload = `${randomBytes(12).toString("base64url")}.${now}`;
  return `${payload}.${sign(`${payload}.${email}`, secret)}`;
}

/** True when the state was minted here, for this staff member, recently. */
export function checkState(state: string, email: string, secret: string, now = Date.now()) {
  const [nonce, at, mac] = state.split(".");
  if (!nonce || !at || !mac) return false;
  const expected = Buffer.from(sign(`${nonce}.${at}.${email}`, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  const age = now - Number(at);
  return Number.isFinite(age) && age >= 0 && age <= STATE_MAX_AGE_MS;
}

/** LinkedIn's consent screen for this app, for the staff member `email`. */
export function connectUrl(origin: string, email: string): string {
  const keys = credentials();
  if (!keys) throw new Error("LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are not set.");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: keys.clientId,
    redirect_uri: redirectUri(origin),
    state: makeState(email, keys.clientSecret),
    scope: LINKEDIN_SCOPES.join(" "),
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

export interface LinkedInConnection {
  connected: boolean;
  expiresAt: string | null;
  scopes: string[];
  connectedBy: string | null;
  connectedAt: string | null;
}

/** Whether a token is stored, and when it expires. Never the token itself. */
export async function readConnection(): Promise<LinkedInConnection> {
  const none = {
    connected: false,
    expiresAt: null,
    scopes: [],
    connectedBy: null,
    connectedAt: null,
  };
  if (!hasDurableStore()) return none;
  const { data, error } = await db()
    .from("platform_tokens")
    .select("expires_at,scopes,connected_by,connected_at")
    .eq("platform", "linkedin")
    .maybeSingle();
  if (error || !data) return none;
  return {
    connected: Date.parse(data.expires_at) > Date.now(),
    expiresAt: data.expires_at,
    scopes: data.scopes ?? [],
    connectedBy: data.connected_by ?? null,
    connectedAt: data.connected_at ?? null,
  };
}

async function readToken(): Promise<string | null> {
  if (!hasDurableStore()) return null;
  const { data } = await db()
    .from("platform_tokens")
    .select("access_token,expires_at")
    .eq("platform", "linkedin")
    .maybeSingle();
  if (!data || Date.parse(data.expires_at) <= Date.now()) return null;
  return data.access_token as string;
}

/** Swaps LinkedIn's one-time code for a token and stores it. */
export async function finishConnect(input: {
  code: string;
  state: string;
  origin: string;
  email: string;
}): Promise<LinkedInConnection> {
  const keys = credentials();
  if (!keys) throw new Error("LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are not set.");
  if (!hasDurableStore())
    throw new Error("The database is not configured, so nothing can be stored.");
  if (!checkState(input.state, input.email, keys.clientSecret)) {
    throw new Error(
      "This sign-in link has expired or was started by someone else. Press Connect LinkedIn again.",
    );
  }

  const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: redirectUri(input.origin),
      client_id: keys.clientId,
      client_secret: keys.clientSecret,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof body["access_token"] !== "string") {
    throw new Error(
      `LinkedIn refused the sign-in: ${String(body["error_description"] ?? body["error"] ?? response.status)}`,
    );
  }

  const now = Date.now();
  const seconds = (key: string) => (typeof body[key] === "number" ? (body[key] as number) : null);
  const expiresIn = seconds("expires_in") ?? 60 * 86_400;
  const refreshIn = seconds("refresh_token_expires_in");
  const { error } = await db()
    .from("platform_tokens")
    .upsert(
      {
        platform: "linkedin",
        access_token: body["access_token"],
        expires_at: new Date(now + expiresIn * 1000).toISOString(),
        refresh_token: typeof body["refresh_token"] === "string" ? body["refresh_token"] : null,
        refresh_expires_at: refreshIn ? new Date(now + refreshIn * 1000).toISOString() : null,
        scopes: String(body["scope"] ?? LINKEDIN_SCOPES.join(" "))
          .split(/[\s,]+/)
          .filter(Boolean),
        connected_by: input.email,
        connected_at: new Date(now).toISOString(),
      },
      { onConflict: "platform" },
    );
  if (error) {
    throw new Error(
      /platform_tokens/.test(error.message)
        ? "The platform_tokens table is missing: apply migration 0024 in Supabase first."
        : `Could not store the LinkedIn token: ${error.message}`,
    );
  }
  return readConnection();
}

/** Forgets the token. LinkedIn access can also be removed from his LinkedIn settings. */
export async function disconnect(): Promise<void> {
  if (!hasDurableStore()) return;
  await db().from("platform_tokens").delete().eq("platform", "linkedin");
}

/** The figures the member-wide (`q=me`) query returns a single total for. */
export const MEMBER_METRICS = [
  "IMPRESSION",
  "MEMBERS_REACHED",
  "REACTION",
  "COMMENT",
  "RESHARE",
  "FOLLOWER_GAINED_FROM_CONTENT",
  "PROFILE_VIEW_FROM_CONTENT",
] as const;
export type MemberMetric = (typeof MEMBER_METRICS)[number];

const restliDate = (date: Date) =>
  `(day:${date.getUTCDate()},month:${date.getUTCMonth() + 1},year:${date.getUTCFullYear()})`;

/**
 * Totals across all of his posts over the last `days` days, one call per
 * figure. Free. A figure LinkedIn refuses is returned as null with the reason,
 * so one unsupported metric does not hide the rest.
 */
export async function memberTotals(days = 30): Promise<{
  from: string;
  to: string;
  totals: Record<MemberMetric, number | null>;
  /** His lifetime follower count, from LinkedIn itself (r_member_profileAnalytics). */
  followers: number | null;
  errors: string[];
}> {
  const token = await readToken();
  if (!token) throw new Error("LinkedIn is not connected, or the connection has expired.");
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const totals = {} as Record<MemberMetric, number | null>;
  const errors: string[] = [];
  await Promise.all(
    MEMBER_METRICS.map(async (metric) => {
      // Rest.li syntax: the parentheses and commas must reach LinkedIn as-is.
      const url =
        "https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=me" +
        `&queryType=${metric}&aggregation=TOTAL` +
        `&dateRange=(start:${restliDate(start)},end:${restliDate(end)})`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "LinkedIn-Version": LINKEDIN_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      });
      const body = (await response.json().catch(() => ({}))) as {
        elements?: Array<{ count?: number }>;
        message?: string;
      };
      if (!response.ok) {
        totals[metric] = null;
        errors.push(`${metric}: ${body.message ?? response.status}`);
        return;
      }
      totals[metric] = (body.elements ?? []).reduce((sum, row) => sum + (row.count ?? 0), 0);
    }),
  );
  const followers = await linkedInGet<{ elements?: Array<{ memberFollowersCount?: number }> }>(
    "memberFollowersCount?q=me",
    token,
  )
    .then((body) => body.elements?.[0]?.memberFollowersCount ?? null)
    .catch((error: unknown) => {
      errors.push(`FOLLOWERS: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
  return { from: start.toISOString(), to: end.toISOString(), totals, followers, errors };
}

async function linkedInGet<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.linkedin.com/rest/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? String(response.status));
  return body;
}
