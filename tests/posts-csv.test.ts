// The Posts tab's CSV download and each Reel's length (27 Nov 2026).
import { describe, expect, it } from "vitest";

import type { PostRecord } from "@/lib/analytics-types";
import { mp4Duration } from "@/lib/mp4-duration";
import { csvFileName, postUrl, publishedParts, toCsv } from "@/lib/posts-csv";
import { toPostRecords } from "@/server/apify/instagram";

const post = (over: Partial<PostRecord>): PostRecord => ({
  platform: "instagram",
  postId: "1",
  url: "https://www.instagram.com/p/DgKoelYvcdJ/",
  caption: "",
  format: "reel",
  publishedAt: "2026-11-25T12:00:00Z",
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  pinned: false,
  ...over,
});

/** A minimal MP4: an ftyp box, then moov holding a version-0 mvhd. */
function mp4(timescale: number, duration: number): Uint8Array {
  const bytes = new Uint8Array(16 + 8 + 108);
  const view = new DataView(bytes.buffer);
  const box = (at: number, size: number, type: string) => {
    view.setUint32(at, size);
    for (let i = 0; i < 4; i++) bytes[at + 4 + i] = type.charCodeAt(i);
  };
  box(0, 16, "ftyp");
  box(16, 8 + 108, "moov");
  box(24, 108, "mvhd");
  // version 0, flags, creation, modification, then timescale and duration.
  view.setUint32(24 + 8 + 12, timescale);
  view.setUint32(24 + 8 + 16, duration);
  return bytes;
}

describe("Posts CSV", () => {
  it("links a Reel at its own /reel/ address, and other posts as they are", () => {
    expect(postUrl(post({}))).toBe("https://www.instagram.com/reel/DgKoelYvcdJ/");
    expect(postUrl(post({ format: "carousel" }))).toBe("https://www.instagram.com/p/DgKoelYvcdJ/");
    expect(
      postUrl(
        post({
          platform: "linkedin",
          format: "text",
          url: "https://www.linkedin.com/feed/update/x",
        }),
      ),
    ).toBe("https://www.linkedin.com/feed/update/x");
  });

  it("dates a post by the day and time it went up in India", () => {
    expect(publishedParts("2026-11-25T12:00:00Z")).toEqual({ date: "2026-11-25", time: "17:30" });
    // 8 PM UTC is already the next day in India.
    expect(publishedParts("2026-11-25T20:00:00Z").date).toBe("2026-11-26");
  });

  it("quotes what needs quoting and keeps a spreadsheet from running a formula", () => {
    const csv = toCsv(
      ["URL", "Duration", "Caption"],
      [
        ["https://x/reel/a/", 50.2, 'He said "hi", then\nleft'],
        ["https://x/p/b/", null, "=HYPERLINK(1)"],
      ],
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(
      'URL,Duration,Caption\r\nhttps://x/reel/a/,50.2,"He said ""hi"", then\nleft"\r\nhttps://x/p/b/,,\'=HYPERLINK(1)\r\n',
    );
    expect(csvFileName("instagram", new Date("2026-11-27T05:00:00Z"))).toBe(
      "instagram-posts-2026-11-27.csv",
    );
  });
});

describe("Reel length", () => {
  it("is read from the scraper's videoDuration", () => {
    const [record] = toPostRecords(
      [{ id: "1", timestamp: "2026-11-25T12:00:00Z", type: "Video", videoDuration: 50.048 }],
      10,
    );
    expect(record!.durationSeconds).toBe(50);
    const [image] = toPostRecords(
      [{ id: "2", timestamp: "2026-11-25T12:00:00Z", type: "Image" }],
      10,
    );
    expect(image!.durationSeconds).toBeUndefined();
  });

  it("is read from the start of the video file", () => {
    expect(mp4Duration(mp4(1000, 50_200))).toBe(50.2);
    expect(mp4Duration(mp4(90_000, 4_320_000))).toBe(48);
    expect(mp4Duration(new Uint8Array(32))).toBeNull();
  });
});
