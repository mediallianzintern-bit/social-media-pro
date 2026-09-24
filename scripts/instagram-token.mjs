#!/usr/bin/env node
/**
 * Produces the two values this project needs:
 *
 *   INSTAGRAM_ACCESS_TOKEN        — a token that can read Instagram Insights
 *   INSTAGRAM_BUSINESS_ACCOUNT_ID — the Instagram account behind the Page
 *
 * Two ways in, depending on how the assets are held:
 *
 * A) System User token (preferred — the Page and IG account live in a Business
 *    portfolio you administer). These tokens never expire, so there is nothing
 *    to exchange and nothing to renew.
 *
 *      FB_SYSTEM_TOKEN=... node scripts/instagram-token.mjs --write
 *
 * B) Short-lived User token from the Graph API Explorer. This gets exchanged for
 *    a long-lived user token first, because a Page token derived from a
 *    long-lived user token is itself non-expiring — the order matters.
 *
 *      FB_APP_ID=... FB_APP_SECRET=... FB_SHORT_TOKEN=... node scripts/instagram-token.mjs --write
 *
 * If /me/accounts comes back empty (common with portfolio-held Pages), set
 * FB_PAGE_ID and the Page is looked up directly instead.
 *
 * Secrets are read from the environment rather than argv so they never land in
 * shell history. Add --write to append the results into .env.
 */
import { appendFileSync, readFileSync } from "node:fs";

const GRAPH = "https://graph.facebook.com/v21.0";

const appId = process.env.FB_APP_ID?.trim();
const appSecret = process.env.FB_APP_SECRET?.trim();
const shortToken = process.env.FB_SHORT_TOKEN?.trim();
const systemToken = process.env.FB_SYSTEM_TOKEN?.trim();
const pageIdOverride = process.env.FB_PAGE_ID?.trim();
const shouldWrite = process.argv.includes("--write");

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!systemToken && !(appId && appSecret && shortToken)) {
  fail(
    `Missing input. Pick one of the two routes:\n\n` +
      `  A) System User token (never expires):\n` +
      `       FB_SYSTEM_TOKEN=<from Business settings → System users → Generate token> \\\n` +
      `       node scripts/instagram-token.mjs --write\n\n` +
      `  B) Short-lived token from the Graph API Explorer:\n` +
      `       FB_APP_ID=1044603485072489 \\\n` +
      `       FB_APP_SECRET=<App settings → Basic> \\\n` +
      `       FB_SHORT_TOKEN=<Explorer token> \\\n` +
      `       node scripts/instagram-token.mjs --write\n\n` +
      `  Optionally add FB_PAGE_ID=<page id> if /me/accounts comes back empty.`,
  );
}

async function graph(path, params, { soft = false } = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok || body.error) {
    const message = body.error?.message ?? `${response.status} ${response.statusText}`;
    if (soft) return { __error: message };
    fail(`Graph API said: ${message}`);
  }
  return body;
}

/** A System User token is already permanent; only Explorer tokens need exchanging. */
let userToken;
if (systemToken) {
  console.log("\n1/3  Using the System User token as-is (these do not expire).");
  userToken = systemToken;
} else {
  console.log("\n1/3  Exchanging the short-lived token for a long-lived one…");
  const longLived = await graph("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });
  if (!longLived.access_token) fail("No long-lived token came back.");
  const days = longLived.expires_in ? Math.round(longLived.expires_in / 86400) : null;
  console.log(`     done${days ? ` — valid ${days} days` : ""}`);
  userToken = longLived.access_token;
}

const PAGE_FIELDS = "name,access_token,instagram_business_account{id,username,followers_count}";

console.log("2/3  Locating the Page and its linked Instagram account…");
let page;
if (pageIdOverride) {
  page = await graph(pageIdOverride, { fields: PAGE_FIELDS, access_token: userToken });
} else {
  const pages = await graph("me/accounts", { fields: PAGE_FIELDS, access_token: userToken });
  const all = pages.data ?? [];
  const linked = all.filter((candidate) => candidate.instagram_business_account);

  if (!linked.length) {
    fail(
      `No Page with a linked Instagram account.\n` +
        `  Pages visible: ${all.map((p) => p.name).join(", ") || "(none)"}\n\n` +
        (all.length
          ? `  The Page is visible but has no Instagram account attached to it.\n` +
            `  Link @priteshpatel.co to the Page under Page settings → Linked accounts.`
          : `  Zero Pages means this token holds no Page access. If the Page belongs to a\n` +
            `  Business portfolio, use a System User token (route A) and assign the Page\n` +
            `  and the Instagram account to that system user — or set FB_PAGE_ID to look\n` +
            `  the Page up directly.`),
    );
  }
  if (linked.length > 1) console.log(`     ${linked.length} linked Pages found — using the first one.`);
  page = linked[0];
}

const ig = page.instagram_business_account;
if (!ig) {
  fail(
    `Page "${page.name ?? pageIdOverride}" has no linked Instagram account.\n` +
      `  Link @priteshpatel.co to it under Page settings → Linked accounts.`,
  );
}
console.log(`     Page "${page.name}" → @${ig.username ?? "?"} (${ig.followers_count ?? "?"} followers)`);

/**
 * A Page token is preferred when one is available; a System User token can read
 * Insights on its own, so fall back to it rather than failing.
 */
const insightsToken = page.access_token ?? userToken;
const tokenKind = page.access_token ? "Page token" : "System User token";

console.log(`3/3  Verifying the ${tokenKind} can read Insights…`);
const probe = await graph(`${ig.id}/insights`, {
  metric: "reach",
  period: "day",
  access_token: insightsToken,
});
console.log(`     insights reachable — ${probe.data?.length ?? 0} metric series returned`);

const lines = [
  ``,
  `# Instagram Graph API — ${tokenKind} (does not expire) generated ${new Date().toISOString().slice(0, 10)}`,
  `INSTAGRAM_ACCESS_TOKEN=${insightsToken}`,
  `INSTAGRAM_BUSINESS_ACCOUNT_ID=${ig.id}`,
];

if (shouldWrite) {
  const current = readFileSync(".env", "utf8");
  if (current.includes("INSTAGRAM_ACCESS_TOKEN=")) {
    console.log(
      `\n⚠ .env already has INSTAGRAM_ACCESS_TOKEN — not overwriting.\n` +
        `  Replace those two lines by hand with:\n${lines.slice(2).join("\n")}\n`,
    );
  } else {
    appendFileSync(".env", `${lines.join("\n")}\n`);
    console.log(`\n✓ Appended both values to .env. Restart the dev server.\n`);
  }
} else {
  console.log(`\n✓ Add these to .env (or re-run with --write):\n${lines.join("\n")}\n`);
}
