// The search box used on Trends, an account's Ideas tab and Saved (19 Nov
// 2026): every word typed must appear somewhere in the given fields, in any
// order and any case. Nothing is fetched: it only narrows what is on screen.
export function matchesSearch(query: string, ...fields: Array<string | null | undefined>): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = fields.filter(Boolean).join(" ").toLowerCase();
  return words.every((word) => text.includes(word));
}
