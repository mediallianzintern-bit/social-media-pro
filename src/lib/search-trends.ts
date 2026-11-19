// SEO, AEO and GEO on Trends (19 Nov 2026): which headlines the three search
// chips keep. The news feed ignores case, so "SEO" also found Korean names
// (Park Seo Ham, Lee Seo-jin), and these words also find agencies selling
// their own services, crypto "search rankings" and cybercrime. Kept here, not
// in the fetch, so each rule is tested (tests/search-trends.test.ts).

export const SEARCH_CATEGORIES = ["aeo", "geo", "seo"] as const;
export type SearchCategory = (typeof SEARCH_CATEGORIES)[number];

export const isSearchCategory = (category: string): category is SearchCategory =>
  (SEARCH_CATEGORIES as readonly string[]).includes(category);

/**
 * The search trade press. Everything it runs is about search, so a headline
 * there only needs to mention search at all; anywhere else it has to name SEO
 * itself or one of its real subjects, since "Google" and "ranking" also find
 * a trot singer's chart ranking and a Google reviews survey (19 Nov 2026).
 */
const TRADE_PRESS =
  /search engine land|search engine journal|search engine roundtable|ppc land|digiday|semrush|ahrefs|\bmoz\b|backlinko|marketing brew|martech|the drum|adweek|wersm|exchangewire/i;

const SEO_SUBJECT =
  /search engine optimi[sz]ation|\bserps?\b|backlinks?|organic (traffic|search)|semrush|ahrefs|yoast|rank math|screaming frog|search console|core update|spam update|algorithm update|ai overviews?|ai mode/i;

/** What a headline must be about. "SEO", "AEO" and "GEO" count only in capitals. */
const ABOUT: Record<SearchCategory, (title: string, trade: boolean) => boolean> = {
  seo: (t, trade) =>
    /\bSEO\b/.test(t) ||
    SEO_SUBJECT.test(t) ||
    (trade && /google|\bbing\b|\brankings?\b|\bcrawl|\bsearch\b|index/i.test(t)),
  aeo: (t) =>
    /answer engines?|ai overviews?|ai mode|zero[- ]click|featured snippets?|ai answers?|ai features|ai search|citations?|search traffic|\bclicks\b/i.test(
      t,
    ) ||
    (/\bAEO\b/.test(t) && /search|seo|chatgpt|answer|\bai\b/i.test(t)),
  geo: (t) =>
    /generative engine|\bllms?\b|ai visibility|ai search|citations?|\bcited\b|llms\.txt|ai seo/i.test(
      t,
    ) ||
    (/\bGEO\b/.test(t) && /search|seo|chatgpt|\bai\b/i.test(t)),
};

/** Never news or strategy for Sir, whichever of the three found it. */
const NOT_NEWS = [
  // An agency or consultant announcing its own services.
  /\b(expands?|launch(es)?|offers?|unveils?|introduces?|refocuses|rolls out|debuts?)\b.*\b(services?|agency|programs?|programmes?|packages?|plans?|consulting|practice)\b/i,
  /\bagency\b|\bagencies\b|\bconsultants?\b|\bconsulting\b/i,
  // Paid "best tools / top 10 agencies" lists.
  /\b(best|top \d+|top ten|leading|\d+ best|ranked #?1)\b.*\b(agenc(y|ies)|tools?|companies|firms|services|software|platforms?|experts?)\b/i,
  /\b(crypto\w*|bitcoin|tokens?|coin|memecoin)\b/i,
  /\bpoisoning\b|malware|ransomware|phishing/i,
  /black friday|cyber monday|\bdeals?\b|% off|discount/i,
  // An agency at a trade show, or a paid comparison of providers.
  /\b(expo|participates?|speaker lineup|exhibits?)\b|service providers|ranked comparison/i,
  /\bcourse\b|certification|bootcamp|\bjobs?\b|salary/i,
];

/** Paid search, in the SEO chip's trade press; the Ad platforms chip has it. */
const PAID_SEARCH =
  /google ads|microsoft advertising|smart bidding|\bppc\b|performance max|local services ads|\bai max\b|advertisers?\b/i;

/** Press-release wires: there, almost always an agency's own announcement. */
const PRESS_WIRE =
  /presswire|issuewire|pr urgent|openpr|prweb|newswire|einnews|globenewswire|business wire|accesswire|prlog|digital journal/i;

/** Whether one of the three search chips keeps this headline. */
export function keepSearchStory(
  category: SearchCategory,
  title: string,
  publisher: string | null,
): boolean {
  // A row that is only the outlet's name ("- Search Engine Land").
  const withoutOutlet = publisher ? title.split(publisher).join(" ") : title;
  if (
    withoutOutlet
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(" ").length < 4
  )
    return false;
  if (PRESS_WIRE.test(publisher ?? "")) return false;
  if (NOT_NEWS.some((rule) => rule.test(title))) return false;
  if (category === "seo" && PAID_SEARCH.test(title)) return false;
  return ABOUT[category](title, TRADE_PRESS.test(publisher ?? ""));
}
