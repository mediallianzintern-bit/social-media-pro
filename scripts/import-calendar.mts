// Imports the team's content-calendar spreadsheet(s) into the database.
//
//   npx tsx scripts/import-calendar.mts <file.xlsx> [more.xlsx ...]
//   npx tsx scripts/import-calendar.mts --dry-run <file.xlsx>
//
// Re-runnable: entries are keyed by a hash of the script, so importing an
// updated export refreshes rows instead of duplicating topics. Reads the
// account's own lane names so entries are labelled with the same taxonomy the
// rest of the system ranks by.
//
// No model is called and nothing is scraped.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { mergeEntries, parseCalendar } from "../src/server/calendar/import";
import { OWNER_ACCOUNTS } from "../src/server/apify/accounts";
import {
  linkCalendarEntry,
  readPosts,
  readTaxonomy,
  saveCalendarEntries,
} from "../src/server/store";
import { lanePerformance } from "../src/lib/analytics-types";
import type { CalendarEntry } from "../src/lib/calendar-types";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const files = args.filter((a) => !a.startsWith("--"));

if (!files.length) {
  console.error("Usage: npx tsx scripts/import-calendar.mts [--dry-run] <file.xlsx> ...");
  process.exit(1);
}

// The account's own lane vocabulary, so labels match the taxonomy exactly.
const handle = OWNER_ACCOUNTS.instagram.handle;
const taxonomy = await readTaxonomy("instagram", handle).catch(() => null);
// The whole back catalogue: a year of calendar topics needs more than the
// dashboard’s 60-post window to match against.
const posts = await readPosts("instagram", handle, 1000).catch(() => []);
const lanes = taxonomy?.length
  ? taxonomy.map((lane) => lane.name)
  : lanePerformance(posts).map((lane) => lane.lane);

if (!lanes.length) {
  console.error("No content lanes found for this account — run an analysis first.");
  process.exit(1);
}
console.log(`lanes: ${lanes.join(" · ")}\n`);

const all: CalendarEntry[] = [];
for (const file of files) {
  const result = parseCalendar(readFileSync(file), basename(file), lanes);
  console.log(basename(file));
  for (const sheet of result.sheets) {
    console.log(`   '${sheet.name}': ${sheet.parsed} topics of ${sheet.rows} rows   [${sheet.columns}]`);
  }
  all.push(...result.entries);
}

const merged = mergeEntries(all);
const tally = (pick: (entry: CalendarEntry) => string) =>
  merged.reduce<Record<string, number>>((acc, entry) => {
    const key = pick(entry);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

console.log(`\n${all.length} rows -> ${merged.length} unique topics`);
console.log("  by type:", tally((e) => e.topicType));
console.log("  by lane:", tally((e) => e.lane ?? "(unclassified)"));

// ---------------------------------------------------------------------------
// Link each entry to the post it became.
//
// Matched on the opening of the script against the opening of the caption:
// the team edits wording between the sheet and the post, so an exact match
// finds almost nothing, while the first line survives largely intact.
// ---------------------------------------------------------------------------

const STOP = new Set(
  ("the a an and or but of to in on for with at by from as is are was were be been it its this " +
    "that these those how why what when who your you our their they them we i not no so if then")
    .split(" "),
);
const words = (text: string) =>
  new Set(
    (text.match(/[a-z0-9']{3,}/gi) ?? [])
      .map((w) => w.toLowerCase())
      .filter((w) => !STOP.has(w)),
  );
const overlap = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
};

const postWords = posts.map((post) => ({
  post,
  words: words((post.caption ?? "").split(/\s+/).slice(0, 60).join(" ")),
}));

let linked = 0;
const links: Array<[string, string]> = [];
for (const entry of merged) {
  const entryWords = words(entry.content.split(/\s+/).slice(0, 60).join(" "));
  let best: { id: string; score: number } | null = null;
  for (const candidate of postWords) {
    const score = overlap(entryWords, candidate.words);
    if (!best || score > best.score) best = { id: candidate.post.postId, score };
  }
  // 0.45 shared vocabulary in the opening: high enough that the two are the
  // same story, low enough to survive the team's rewrites. Checked by hand on
  // the lowest-scoring accepted matches before this threshold was fixed.
  if (best && best.score >= 0.45) {
    entry.publishedPostId = best.id;
    links.push([entry.contentHash, best.id]);
    linked += 1;
  }
}
console.log(`  linked to a published post: ${linked} of ${merged.length}`);

if (dryRun) {
  console.log("\n--dry-run: nothing written.");
  process.exit(0);
}

const written = await saveCalendarEntries(merged);
if (!written) {
  console.error(
    "\nNothing was written. Has migration 0012_content_calendar.sql been applied in Supabase?",
  );
  process.exit(1);
}
for (const [hash, postId] of links) await linkCalendarEntry(hash, postId).catch(() => undefined);
console.log(`\nstored ${written} topics.`);
