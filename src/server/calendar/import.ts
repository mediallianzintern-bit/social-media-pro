// Reading the team's calendar spreadsheet into the database.
//
// Deliberately tolerant about shape. This file is a living Google Sheet the
// team edits daily: columns get reordered, sheets get added ("AI Tool" has no
// header row at all), and the same topic appears in several exports. So the
// importer finds its columns by looking at the data rather than trusting a
// fixed position, and identifies a row by its content rather than its place.
//
// No model is involved at any point.
import { createHash } from "node:crypto";

import { excelDate, readXlsx, type Sheet } from "./xlsx";
import { classifyLane, classifyTopicType, extractSubjects } from "@/lib/calendar-classify";
import type { CalendarEntry } from "@/lib/calendar-types";

/** The script column: the one holding long prose. Everything else keys off it. */
function findContentColumn(rows: string[][]): number {
  const width = Math.max(0, ...rows.map((r) => r.length));
  let best = { index: -1, score: 0 };
  for (let col = 0; col < width; col += 1) {
    // Score by how many cells in this column read like a written script.
    const score = rows.reduce((total, row) => {
      const cell = row[col] ?? "";
      return total + (cell.length > 120 ? 1 : 0);
    }, 0);
    if (score > best.score) best = { index: col, score };
  }
  return best.index;
}

/** The first column whose cells parse as Excel date serials. */
function findDateColumn(rows: string[][]): number {
  const width = Math.max(0, ...rows.map((r) => r.length));
  let best = { index: -1, score: 0 };
  for (let col = 0; col < width; col += 1) {
    const score = rows.reduce((total, row) => total + (excelDate(row[col]) ? 1 : 0), 0);
    if (score > best.score) best = { index: col, score };
  }
  return best.score >= 3 ? best.index : -1;
}

/**
 * A short cell that names a brand or tool, sitting left of the script.
 *
 * The team uses this column inconsistently — sometimes a brand, sometimes a
 * tool URL, often blank — so it is a hint, not a requirement.
 */
const WEEKDAYS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "mon",
  "tue",
  "tues",
  "wed",
  "thu",
  "thur",
  "thurs",
  "fri",
  "sat",
  "sun",
]);

function findBrandColumn(rows: string[][], contentCol: number): number {
  let best = { index: -1, score: 0 };
  for (let col = 0; col < contentCol; col += 1) {
    let score = 0;
    let weekdays = 0;
    for (const row of rows) {
      const cell = (row[col] ?? "").trim();
      if (!cell || cell.length > 80 || excelDate(cell)) continue;
      if (WEEKDAYS.has(cell.toLowerCase())) {
        weekdays += 1;
        continue;
      }
      // A URL or a capitalised name is what a brand column actually holds.
      // Plain lowercase words ("week 3") are structure, not subjects.
      if (/^https?:\/\//i.test(cell)) score += 3;
      else if (/^[A-Z]/.test(cell)) score += 2;
      else if (cell.length > 2) score += 1;
    }
    // A column that is mostly weekday names is the day column, however many
    // other short strings it holds. Without this the "AI Tool" sheet — whose
    // first column is Tuesday/Thursday — hides the column that actually
    // carries the tool URLs, and every tool post loses its clearest signal.
    if (weekdays > rows.length / 4) continue;
    if (score > best.score) best = { index: col, score };
  }
  return best.index;
}

/** A second long-prose column after the script — the team's caption. */
function findCaptionColumn(rows: string[][], contentCol: number): number {
  const width = Math.max(0, ...rows.map((r) => r.length));
  let best = { index: -1, score: 0 };
  for (let col = contentCol + 1; col < width; col += 1) {
    const score = rows.reduce((total, row) => total + ((row[col] ?? "").length > 120 ? 1 : 0), 0);
    if (score > best.score) best = { index: col, score };
  }
  return best.score >= 2 ? best.index : -1;
}

/** The team's workflow state, wherever they put it. */
function findStatusColumn(rows: string[][]): number {
  const KNOWN = ["posted", "scheduled", "edited", "not started", "draft", "in progress"];
  const width = Math.max(0, ...rows.map((r) => r.length));
  let best = { index: -1, score: 0 };
  for (let col = 0; col < width; col += 1) {
    const score = rows.reduce(
      (total, row) => total + (KNOWN.includes((row[col] ?? "").trim().toLowerCase()) ? 1 : 0),
      0,
    );
    if (score > best.score) best = { index: col, score };
  }
  return best.score >= 3 ? best.index : -1;
}

/**
 * Identity for a topic.
 *
 * Normalised hard — case, punctuation and whitespace removed, then the first
 * 300 characters — because the same topic is re-exported with small edits
 * (a fixed typo, a changed emoji) and must still be recognised as the same row.
 */
export function contentHash(content: string): string {
  const normalised = content
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return createHash("sha256").update(normalised).digest("hex").slice(0, 32);
}

/** Which platform a sheet's rows belong to, from its name. */
function platformOf(sheetName: string): "instagram" | "linkedin" {
  return /linkedin/i.test(sheetName) ? "linkedin" : "instagram";
}

export interface ParseResult {
  entries: CalendarEntry[];
  /** Per sheet: what was found, so a silent mis-parse is visible. */
  sheets: Array<{ name: string; rows: number; parsed: number; columns: string }>;
}

/**
 * Parses one workbook into entries. Pure — no database, no network.
 *
 * `lanes` is the account's own taxonomy, so entries are labelled with the
 * exact lane names the rest of the system ranks by.
 */
export function parseCalendar(buffer: Buffer, fileName: string, lanes: string[]): ParseResult {
  const sheets: Sheet[] = readXlsx(buffer);
  const entries: CalendarEntry[] = [];
  const report: ParseResult["sheets"] = [];

  for (const sheet of sheets) {
    const rows = sheet.rows.filter((r) => r.join("").trim().length > 0);
    const contentCol = findContentColumn(rows);
    if (contentCol < 0) {
      report.push({ name: sheet.name, rows: rows.length, parsed: 0, columns: "no script column" });
      continue;
    }
    const dateCol = findDateColumn(rows);
    const brandCol = findBrandColumn(rows, contentCol);
    const captionCol = findCaptionColumn(rows, contentCol);
    const statusCol = findStatusColumn(rows);
    const platform = platformOf(sheet.name);

    let parsed = 0;
    for (const row of rows) {
      const content = (row[contentCol] ?? "").trim();
      // Short cells are headers, day names and stray notes, not scripts.
      if (content.length < 60) continue;

      const brand = brandCol >= 0 ? (row[brandCol] ?? "").trim() : "";
      const text = `${brand} ${content}`;

      entries.push({
        contentHash: contentHash(content),
        platform,
        sourceFile: fileName,
        sheet: sheet.name,
        plannedDate: dateCol >= 0 ? excelDate(row[dateCol]) : null,
        brand: brand && !/^https?:/i.test(brand) ? brand : null,
        content,
        caption: captionCol >= 0 ? (row[captionCol] ?? "").trim() || null : null,
        status: statusCol >= 0 ? (row[statusCol] ?? "").trim() || null : null,
        publishedPostId: null,
        lane: classifyLane(text, lanes, sheet.name),
        topicType: classifyTopicType(text, sheet.name),
        subjects: extractSubjects(content, brand),
      });
      parsed += 1;
    }

    report.push({
      name: sheet.name,
      rows: rows.length,
      parsed,
      columns: `script=${contentCol} date=${dateCol} brand=${brandCol} caption=${captionCol} status=${statusCol}`,
    });
  }

  return { entries, sheets: report };
}

/**
 * Merges entries from several files, keeping the richest version of each topic.
 *
 * The same topic appears in more than one export, and the copies are not
 * identical: one may carry the brand, another the caption or a later status.
 * Taking the last-seen row wholesale would discard whichever fields the other
 * copy happened to have, so fields are merged individually.
 */
export function mergeEntries(all: CalendarEntry[]): CalendarEntry[] {
  const byHash = new Map<string, CalendarEntry>();
  for (const entry of all) {
    const existing = byHash.get(entry.contentHash);
    if (!existing) {
      byHash.set(entry.contentHash, entry);
      continue;
    }
    byHash.set(entry.contentHash, {
      ...existing,
      brand: existing.brand ?? entry.brand,
      caption: existing.caption ?? entry.caption,
      // A later status is the truer one: Not Started -> Scheduled -> Posted.
      status: rank(entry.status) > rank(existing.status) ? entry.status : existing.status,
      plannedDate: existing.plannedDate ?? entry.plannedDate,
      lane: existing.lane ?? entry.lane,
      subjects: existing.subjects.length ? existing.subjects : entry.subjects,
      sourceFile: existing.sourceFile,
    });
  }
  return [...byHash.values()];
}

function rank(status: string | null): number {
  const order = ["not started", "draft", "in progress", "edited", "scheduled", "posted"];
  const index = order.indexOf((status ?? "").toLowerCase());
  return index < 0 ? -1 : index;
}
