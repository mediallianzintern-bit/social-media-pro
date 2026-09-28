// A minimal .xlsx reader — just enough to read the team's content calendar.
//
// An .xlsx is a ZIP of XML files, and Node can already inflate the one
// compression method they use, so this needs no dependency. That matters more
// than it looks: this code ships inside the deployed server, and a spreadsheet
// parser is a large attack surface to add for the sake of reading six columns
// of text a month.
//
// It reads cell VALUES only — no formulas, styles, dates-as-numbers handling
// beyond the serial conversion below, and no writing. Anything more and a real
// library would be the right answer.
import { inflateRawSync } from "node:zlib";

/** One worksheet: a name and its rows, each row an array of cell strings. */
export interface Sheet {
  name: string;
  rows: string[][];
}

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

/**
 * Every file in the archive, by name.
 *
 * Read from the central directory at the end of the archive rather than by
 * walking local headers: a local header may declare sizes of zero and defer
 * them to a trailing descriptor, which cannot be parsed without decompressing
 * first. The central directory always carries the real sizes.
 */
function unzip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();

  // The end-of-central-directory record: signature PK\5\6, within the last
  // 64KB (its comment field is at most that long).
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66_000); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file (no ZIP end-of-directory record).");

  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let entry = 0; entry < count; entry += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    // The local header repeats the name and extra fields, and its extra length
    // often differs from the central one — so read it rather than assuming.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) files.set(name, Buffer.from(raw));
    else if (method === 8) files.set(name, inflateRawSync(raw));
    // Any other method (bzip2, lzma) is not produced by Sheets or Excel.

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&[a-z]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
}

/** "BC12" -> 54. Column letters are base-26 with A=1. */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * The shared-string table.
 *
 * Most cell text lives here rather than in the sheet, and one entry can be
 * split across several <t> runs when part of it is styled differently — so the
 * runs are concatenated, not taken one at a time.
 */
function sharedStrings(files: Map<string, Buffer>): string[] {
  const xml = files.get("xl/sharedStrings.xml")?.toString("utf8");
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    decode(
      [...(match[1] ?? "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1] ?? "").join(""),
    ),
  );
}

// ---------------------------------------------------------------------------

/** Every sheet in the workbook, in the order the workbook lists them. */
export function readXlsx(buffer: Buffer): Sheet[] {
  const files = unzip(buffer);
  const strings = sharedStrings(files);

  const workbook = files.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const relsXml = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const rels = new Map(
    [...relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [
      m[1] ?? "",
      m[2] ?? "",
    ]),
  );

  const sheets: Sheet[] = [];
  for (const match of workbook.matchAll(
    /<sheet [^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"[^>]*\/?>/g,
  )) {
    const name = decode(match[1] ?? "");
    const target = (rels.get(match[2] ?? "") ?? "").replace(/^\/?(xl\/)?/, "");
    const xml = files.get(`xl/${target}`)?.toString("utf8");
    if (!xml) continue;

    const rows: string[][] = [];
    for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = new Map<number, string>();
      for (const cell of (rowMatch[1] ?? "").matchAll(
        /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
      )) {
        const [, ref = "", attrs = "", inner = ""] = cell;
        const type = /t="(\w+)"/.exec(attrs)?.[1];
        const value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];

        let text: string | undefined;
        if (type === "s" && value !== undefined) text = strings[Number(value)];
        else if (type === "inlineStr")
          text = decode(
            [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1] ?? "").join(""),
          );
        else if (value !== undefined) text = decode(value);
        if (text !== undefined && text !== "") cells.set(columnIndex(ref), text);
      }
      if (!cells.size) {
        rows.push([]);
        continue;
      }
      const width = Math.max(...cells.keys()) + 1;
      rows.push(Array.from({ length: width }, (_, i) => cells.get(i) ?? ""));
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

/**
 * An Excel date serial as an ISO date, or null.
 *
 * The epoch is 1899-12-30, not 1900-01-01, because Excel keeps Lotus 1-2-3's
 * belief that 1900 was a leap year. Anything outside a sane window is treated
 * as "not a date" — these cells also hold text, and a stray number should not
 * silently become 1913.
 */
export function excelDate(value: string | undefined): string | null {
  const serial = Number((value ?? "").trim());
  if (!Number.isFinite(serial) || serial < 36_500 || serial > 55_000) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
