// Turning a permalink a person pasted into something that finds the stored post.
//
// The two platforms expose different stable identifiers, and neither is the
// primary key we store posts under on both sides:
//
//   Instagram  the shortcode in /reel/<code>/ — Apify and the Graph API assign
//              different media ids to the same post, so the shortcode is the
//              only thing they agree on. It is not a column, but it appears
//              inside the stored url.
//   LinkedIn   the activity id in ...-activity-<id>-xxxx. This one IS the
//              stored post_id, so it matches exactly.
import type { PlatformId } from "@/lib/analytics-types";

export interface PostLink {
  platform: PlatformId;
  /** How to find the stored row: by the id column, or by substring of the url. */
  match: "postId" | "urlContains";
  /** The identifier itself — also what gets stored on the suggestion. */
  value: string;
}

/**
 * Parses an Instagram or LinkedIn permalink. Returns null when the URL is
 * neither, so the caller can reject it rather than storing a link that would
 * never resolve to a post.
 */
export function parsePostLink(url: string | undefined): PostLink | null {
  if (!url) return null;
  const trimmed = url.trim();

  const instagram = /instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i.exec(trimmed);
  if (instagram?.[1]) {
    return { platform: "instagram", match: "urlContains", value: instagram[1] };
  }

  // The trailing suffix after the id varies and is not part of the identifier.
  const linkedin = /linkedin\.com\/.*-activity-(\d+)/i.exec(trimmed);
  if (linkedin?.[1]) {
    return { platform: "linkedin", match: "postId", value: linkedin[1] };
  }

  // A bare LinkedIn activity urn, which is what some share dialogs copy.
  const urn = /urn:li:activity:(\d+)/i.exec(trimmed);
  if (urn?.[1]) {
    return { platform: "linkedin", match: "postId", value: urn[1] };
  }

  return null;
}
