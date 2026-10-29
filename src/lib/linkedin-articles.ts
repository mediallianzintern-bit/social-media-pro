// Pritesh Sir's LinkedIn articles: what the posts scraper says about the
// article a post shares, and how his articles compare with his other posts.
//
// An article is measured by the post that shares it. LinkedIn's API gives that
// post's impressions, not the article page's own views, which only his LinkedIn
// screen shows. Client-safe and pure.
import type { PostRecord } from "@/lib/analytics-types";
import { median } from "@/lib/analytics-types";
import type { LinkedInPostFigures } from "@/lib/linkedin-analytics";

export interface LinkedInArticle {
  postId: string;
  title: string;
  url: string | null;
  readMinutes: number | null;
  publishedAt: string | null;
}

/** The article block the posts scraper returns with a post that shares one. */
export interface ScrapedArticle {
  title?: string;
  link?: string;
  linkLabel?: string;
}

/** The article a scraped post shares, or null when it shares none. */
export function articleOf(
  postId: string,
  article: ScrapedArticle | undefined,
  publishedAt: string | null,
): LinkedInArticle | null {
  const title = article?.title?.replace(/\s+/g, " ").trim();
  if (!title) return null;
  const minutes = /(\d+)\s*min read/i.exec(article?.linkLabel ?? "")?.[1];
  return {
    postId,
    title,
    // The tracking parameter LinkedIn adds is per viewer; the article is the path.
    url: article?.link ? article.link.split("?")[0]! : null,
    readMinutes: minutes ? Number(minutes) : null,
    publishedAt,
  };
}

export interface FormatFigures {
  posts: number;
  medianImpressions: number;
  medianEngagements: number;
  /** Interactions ÷ impressions across the group, 0-1. Null without impressions. */
  engagementRate: number | null;
}

/**
 * His articles against his other posts, on what LinkedIn measured: impressions
 * from its API, reactions, comments and reposts from the post. Only posts
 * LinkedIn has measured, so both sides are judged the same way.
 */
export function articlesVsPosts(rows: Array<{ post: PostRecord; figures: LinkedInPostFigures }>): {
  articles: FormatFigures;
  posts: FormatFigures;
} {
  const figuresOf = (group: typeof rows): FormatFigures => {
    const engaged = (row: (typeof rows)[number]) =>
      row.post.likes + row.post.comments + row.post.shares;
    const impressions = group.reduce((sum, row) => sum + (row.figures.impressions ?? 0), 0);
    const interactions = group.reduce((sum, row) => sum + engaged(row), 0);
    return {
      posts: group.length,
      medianImpressions: Math.round(median(group.map((row) => row.figures.impressions ?? 0))),
      medianEngagements: Math.round(median(group.map(engaged))),
      engagementRate: impressions > 0 ? interactions / impressions : null,
    };
  };
  return {
    articles: figuresOf(rows.filter((row) => row.post.format === "article")),
    posts: figuresOf(rows.filter((row) => row.post.format !== "article")),
  };
}
