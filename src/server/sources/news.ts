// Live news search — the real-world source of every topic.
//
// Google News' public RSS search. Chosen over every alternative for three
// reasons that matter here more than breadth:
//
//   • It returns real, dated articles with the outlet named — exactly the
//     "article, website or video" provenance the team asked for, where a
//     trends feed returns bare search terms with nothing to read.
//   • It is free and needs no key, so fetching fresh topics never spends
//     money and can run on every sync without a budget decision.
//   • Its output was inspected before this parser was written. The previous
//     feed was built against a payload nobody had seen, failed twice, and was
//     billed both times.
//
// Links are Google News redirect URLs. They resolve to the outlet's article in
// a browser; the outlet's own domain is stored separately so the team can see
// where it will land before clicking.
import type { SourceDraft } from "@/lib/sources";

/** Region for the search. Defaults to India, where this account's audience is. */
function region(): { gl: string; hl: string; ceid: string } {
  const gl = (process.env["NEWS_GEO"] || process.env["FEED_GEO"] || "IN").trim().toUpperCase();
  const lang = (process.env["NEWS_LANG"] || "en").trim().toLowerCase();
  return { gl, hl: `${lang}-${gl}`, ceid: `${gl}:${lang}` };
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity] ?? entity)
    .trim();
}

function tag(item: string, name: string): { attrs: string; text: string } | null {
  const match = new RegExp(`<${name}([^>]*)>([\\s\\S]*?)</${name}>`).exec(item);
  return match ? { attrs: match[1] ?? "", text: decode(match[2] ?? "") } : null;
}

/**
 * Parses one RSS response. Exported for testing against a saved payload.
 *
 * Google appends " - Publisher" to every headline; that suffix is stripped when
 * it matches the <source> element, so the stored title is the outlet's own.
 */
export function parseNewsRss(xml: string, query: string, lane: string | null): SourceDraft[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const out: SourceDraft[] = [];

  for (const item of items) {
    const title = tag(item, "title")?.text ?? "";
    const url = tag(item, "link")?.text ?? "";
    if (!title || !/^https?:\/\//.test(url)) continue;

    const source = tag(item, "source");
    const publisher = source?.text || null;
    const publisherUrl = /url="([^"]+)"/.exec(source?.attrs ?? "")?.[1] ?? null;

    const suffix = publisher ? ` - ${publisher}` : "";
    const cleanTitle = suffix && title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;

    const pub = tag(item, "pubDate")?.text;
    const publishedAt =
      pub && Number.isFinite(Date.parse(pub)) ? new Date(pub).toISOString() : null;

    out.push({
      url,
      title: cleanTitle.trim(),
      publisher,
      publisherUrl,
      publishedAt,
      query,
      lane,
      kind: "article",
    });
  }
  return out;
}

/**
 * One search. Throws on a transport failure so the caller can report which
 * query failed; an empty result is a normal answer, not an error.
 */
export async function searchNews(
  query: string,
  lane: string | null,
  options: { days?: number; timeoutMs?: number } = {},
): Promise<SourceDraft[]> {
  const days = options.days ?? 7;
  const { gl, hl, ceid } = region();
  const q = encodeURIComponent(`${query} when:${days}d`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${ceid}`;

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SocialPulsePro/1.0)" },
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
  });
  if (!response.ok) throw new Error(`news search "${query}" returned HTTP ${response.status}`);
  return parseNewsRss(await response.text(), query, lane);
}
