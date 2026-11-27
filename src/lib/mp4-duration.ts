// A video's length from the start of its MP4 file (27 Nov 2026), for Reels
// the scrapers no longer return: the movie header ("mvhd") inside "moov"
// holds a timescale and a duration. Instagram serves its videos with "moov"
// at the front, so the first few hundred kilobytes are enough. Pure: bytes in,
// seconds out, or null when the header is not in the bytes given.

const text = (bytes: Uint8Array, at: number) =>
  String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);

/** Seconds, to a tenth; null without a movie header in `bytes`. */
export function mp4Duration(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Walk the top-level boxes to "moov", then its children to "mvhd".
  const find = (start: number, end: number, type: string): [number, number] | null => {
    let at = start;
    while (at + 8 <= end) {
      let size = view.getUint32(at);
      let header = 8;
      if (size === 1) {
        if (at + 16 > end) return null;
        size = Number(view.getBigUint64(at + 8));
        header = 16;
      } else if (size === 0) size = end - at;
      if (size < header) return null;
      if (text(bytes, at + 4) === type) return [at + header, Math.min(at + size, end)];
      at += size;
    }
    return null;
  };
  const moov = find(0, bytes.length, "moov");
  if (!moov) return null;
  const mvhd = find(moov[0], moov[1], "mvhd");
  if (!mvhd) return null;
  const [body, end] = mvhd;
  const version = bytes[body];
  let timescale: number;
  let duration: number;
  if (version === 1) {
    if (body + 32 > end) return null;
    timescale = view.getUint32(body + 20);
    duration = Number(view.getBigUint64(body + 24));
  } else {
    if (body + 20 > end) return null;
    timescale = view.getUint32(body + 12);
    duration = view.getUint32(body + 16);
  }
  if (!timescale || !duration) return null;
  return Math.round((duration / timescale) * 10) / 10;
}
