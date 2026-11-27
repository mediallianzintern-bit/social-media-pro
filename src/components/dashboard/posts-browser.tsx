// An account's posts, as the UI review asked for them (13 Nov 2026, mockup
// "Instagram, Posts tab"): one line per post with its cover, search, a topic
// filter and a sort, twenty at a time, and each post scored against the
// account's typical post. The full caption opens on a click; the old table
// printed every caption whole, so each row was a paragraph.
//
// Every figure as its own column again (19 Nov 2026), as the old table had
// them, and each one a sort: Instagram views, reach, likes, comments, saves,
// shares and average watch; LinkedIn's own impressions, reach, saves and
// sends beside reactions, comments and reposts. A column shows only when some
// post has that figure. Newest first by default.
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";

import { PostCover } from "@/components/dashboard/post-cover";
import { PostInsightButton } from "@/components/dashboard/post-insight-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compact, postTitle, primaryOf } from "@/lib/account-summary";
import {
  median,
  organicPosts,
  viewsOf,
  type PlatformId,
  type PostRecord,
} from "@/lib/analytics-types";
import { dayMonth } from "@/lib/date-range";
import { linkedInAnalyticsQueryOptions } from "@/lib/linkedin-api.functions";
import { getReelDurations } from "@/lib/analytics.functions";
import { csvFileName, downloadCsv, postUrl, publishedParts, toCsv } from "@/lib/posts-csv";
import { cn } from "@/lib/utils";

const PAGE = 20;

type Figures = {
  impressions: number | null;
  membersReached: number | null;
  saves: number | null;
  sends: number | null;
};

interface Metric {
  key: string;
  label: string;
  /** null when this post has no such figure. */
  value: (post: PostRecord, linkedin: Figures | undefined) => number | null;
  format?: (value: number) => string;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const INSTAGRAM_METRICS: Metric[] = [
  { key: "views", label: "Views", value: (post) => viewsOf(post) || null },
  { key: "reach", label: "Reach", value: (post) => post.insight?.reach ?? null },
  { key: "likes", label: "Likes", value: (post) => post.likes },
  { key: "comments", label: "Comments", value: (post) => post.comments },
  { key: "saves", label: "Saves", value: (post) => post.insight?.saved ?? null },
  { key: "shares", label: "Shares", value: (post) => post.insight?.shares ?? post.shares },
  {
    key: "watch",
    label: "Avg watch",
    value: (post) => post.insight?.avgWatchMs ?? null,
    format: seconds,
  },
  // How long the Reel runs (27 Nov 2026), from the scraper or Instagram itself.
  {
    key: "length",
    label: "Length",
    value: (post) => (post.durationSeconds ? post.durationSeconds * 1000 : null),
    format: seconds,
  },
];

const LINKEDIN_METRICS: Metric[] = [
  { key: "impressions", label: "Impressions", value: (_post, f) => f?.impressions ?? null },
  { key: "reach", label: "Reached", value: (_post, f) => f?.membersReached ?? null },
  { key: "likes", label: "Reactions", value: (post) => post.likes },
  { key: "comments", label: "Comments", value: (post) => post.comments },
  { key: "saves", label: "Saves", value: (_post, f) => f?.saves ?? null },
  { key: "shares", label: "Reposts", value: (post) => post.shares },
  { key: "sends", label: "Sends", value: (_post, f) => f?.sends ?? null },
];

export function PostsBrowser({ posts, platform }: { posts: PostRecord[]; platform: PlatformId }) {
  const usesViews = posts.some((post) => viewsOf(post) > 0);
  const typical = median(organicPosts(posts).map((post) => primaryOf(post, usesViews)));
  const topics = useMemo(
    () =>
      [
        ...new Set(
          posts.map((post) => post.contentLane).filter((lane): lane is string => Boolean(lane)),
        ),
      ]
        .filter((lane) => lane !== "other")
        .sort(),
    [posts],
  );
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("all");
  const instagram = platform === "instagram";
  // LinkedIn's own figures per post (impressions, reach, saves, sends).
  const { data: linkedin } = useQuery({
    ...linkedInAnalyticsQueryOptions,
    enabled: !instagram,
  });
  const figures = useMemo(
    () => new Map((linkedin?.posts ?? []).map((row) => [row.postId, row as Figures])),
    [linkedin],
  );
  // LinkedIn: which posts are articles, with each article's own title and
  // reading time (19 Nov 2026), so a post and an article read apart at a glance.
  const articles = useMemo(
    () => new Map((linkedin?.articles ?? []).map((article) => [article.postId, article])),
    [linkedin],
  );
  const isArticle = (post: PostRecord) =>
    !instagram && (post.format === "article" || articles.has(post.postId));
  const hasArticles = posts.some(isArticle);
  const [kind, setKind] = useState<"all" | "post" | "article">("all");
  const metrics = (instagram ? INSTAGRAM_METRICS : LINKEDIN_METRICS).filter((metric) =>
    posts.some((post) => metric.value(post, figures.get(post.postId)) != null),
  );
  // "newest", "oldest", or a metric's key for "Most …".
  const [sort, setSort] = useState<string>("newest");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<PostRecord | null>(null);

  const rows = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = posts.filter(
      (post) =>
        (topic === "all" || post.contentLane === topic) &&
        (kind === "all" || (kind === "article") === isArticle(post)) &&
        words.every((word) =>
          `${post.caption} ${articles.get(post.postId)?.title ?? ""} ${post.contentLane ?? ""}`
            .toLowerCase()
            .includes(word),
        ),
    );
    const metric = metrics.find((entry) => entry.key === sort);
    const by = (post: PostRecord) => metric?.value(post, figures.get(post.postId)) ?? -1;
    return [...filtered].sort((a, b) =>
      sort === "oldest"
        ? a.publishedAt.localeCompare(b.publishedAt)
        : metric
          ? by(b) - by(a) || b.publishedAt.localeCompare(a.publishedAt)
          : b.publishedAt.localeCompare(a.publishedAt),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, search, topic, kind, sort, figures, articles, metrics.length]);

  /**
   * Every post the tab is showing (the search, topic and sort applied, all
   * pages, not just the twenty on screen) as a CSV: the exact link, the day
   * and time it went up in India, a Reel's length and its topic, then each
   * figure as a plain number (watch time and length in seconds).
   */
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    // Reels without a stored length get it from Instagram first (free), so
    // the download is complete even before a refresh has stored them.
    let lengths: Record<string, number> = {};
    const unmeasured = instagram
      ? rows.filter(
          (post) => (post.format === "reel" || post.format === "video") && !post.durationSeconds,
        )
      : [];
    if (unmeasured.length) {
      lengths = await getReelDurations({
        data: {
          posts: unmeasured
            .slice(0, 200)
            .map((post) => ({ postId: post.postId, url: post.url ?? "" })),
        },
      }).catch(() => ({}));
    }
    const lengthOf = (post: PostRecord) => post.durationSeconds ?? lengths[post.postId] ?? null;
    const header = [
      "Post URL",
      "Published date",
      "Published time (IST)",
      "Format",
      ...(instagram ? ["Duration (seconds)"] : []),
      "Topic",
      "Title",
      ...metrics
        .filter((metric) => metric.key !== "length")
        .map((metric) => (metric.key === "watch" ? "Avg watch (seconds)" : metric.label)),
      "Against your typical post (×)",
      "Pinned",
      "Caption",
    ];
    const lines = rows.map((post) => {
      const { date, time } = publishedParts(post.publishedAt);
      const values = metrics
        .filter((metric) => metric.key !== "length")
        .map((metric) => {
          const value = metric.value(post, figures.get(post.postId));
          if (value == null) return null;
          return metric.key === "watch" ? Math.round(value / 100) / 10 : value;
        });
      const ratio = typical > 0 && !post.pinned ? primaryOf(post, usesViews) / typical : null;
      return [
        postUrl(post),
        date,
        time,
        isArticle(post) ? "article" : post.format,
        ...(instagram ? [lengthOf(post)] : []),
        post.contentLane ?? "",
        articles.get(post.postId)?.title ?? postTitle(post.caption, 120),
        ...values,
        ratio === null ? null : Math.round(ratio * 100) / 100,
        post.pinned ? "yes" : "",
        post.caption,
      ];
    });
    downloadCsv(csvFileName(platform), toCsv(header, lines));
    setExporting(false);
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "grid gap-3",
          hasArticles ? "sm:grid-cols-[1fr_10rem_14rem_14rem]" : "sm:grid-cols-[1fr_14rem_14rem]",
        )}
      >
        <div className="space-y-1.5">
          <Label htmlFor="post-search" className="text-[13px] text-muted-foreground">
            Search posts
          </Label>
          <Input
            id="post-search"
            type="search"
            className="h-11"
            placeholder="Brand, topic or word"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setShown(PAGE);
            }}
          />
        </div>
        {hasArticles ? (
          <div className="space-y-1.5">
            <Label className="text-[13px] text-muted-foreground">Type</Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                setKind(value as typeof kind);
                setShown(PAGE);
              }}
            >
              <SelectTrigger className="h-11" aria-label="Post or article">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Posts and articles</SelectItem>
                <SelectItem value="post">Posts only</SelectItem>
                <SelectItem value="article">Articles only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label className="text-[13px] text-muted-foreground">Topic</Label>
          <Select
            value={topic}
            onValueChange={(value) => {
              setTopic(value);
              setShown(PAGE);
            }}
          >
            <SelectTrigger className="h-11" aria-label="Topic">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All topics</SelectItem>
              {topics.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[13px] text-muted-foreground">Sort by</Label>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-11" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              {metrics.map((metric) => (
                <SelectItem key={metric.key} value={metric.key}>
                  {metric.key === "watch"
                    ? "Longest avg watch"
                    : metric.key === "length"
                      ? "Longest Reel"
                      : `Most ${metric.label.toLowerCase()}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[13px] text-muted-foreground">
              <th className="px-4 py-3 font-medium">Post</th>
              <th className="px-3 py-3 font-medium">Topic</th>
              <th className="px-3 py-3 font-medium">Date</th>
              {metrics.map((metric) => (
                <th
                  key={metric.key}
                  className={cn(
                    "px-3 py-3 text-right font-medium whitespace-nowrap",
                    sort === metric.key && "text-foreground",
                  )}
                >
                  {metric.label}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium">Against your typical post</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((post) => {
              const ratio = typical > 0 ? primaryOf(post, usesViews) / typical : null;
              return (
                <tr
                  key={post.postId}
                  className="cursor-pointer border-b last:border-b-0 hover:bg-muted/40"
                  onClick={() => setOpen(post)}
                >
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      className="flex min-h-11 items-center gap-3 text-left font-medium"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpen(post);
                      }}
                    >
                      {instagram ? <PostCover post={post} className="size-10" /> : null}
                      <span className="max-w-[18rem]">
                        {instagram ? null : (
                          <KindBadge
                            article={isArticle(post)}
                            minutes={articles.get(post.postId)?.readMinutes ?? null}
                          />
                        )}
                        <span className="line-clamp-2">
                          {articles.get(post.postId)?.title ?? postTitle(post.caption)}
                        </span>
                        {post.pinned ? (
                          <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">
                            (pinned)
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-muted-foreground">
                    {post.contentLane && post.contentLane !== "other" ? post.contentLane : "—"}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[13px]">
                    {dayMonth(new Date(post.publishedAt))}
                  </td>
                  {metrics.map((metric, index) => {
                    const value = metric.value(post, figures.get(post.postId));
                    return (
                      <td
                        key={metric.key}
                        className={cn(
                          "px-3 py-2.5 text-right tabular-nums",
                          (sort === metric.key ||
                            (index === 0 && !metrics.some((m) => m.key === sort))) &&
                            "font-semibold",
                        )}
                      >
                        {value == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          (metric.format ?? compact)(value)
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right">
                    <AgainstTypical ratio={post.pinned ? null : ratio} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No posts match{search.trim() ? ` “${search.trim()}”` : ""}
            {topic !== "all" ? ` in ${topic}` : ""}.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          Showing {Math.min(shown, rows.length)} of {rows.length} · your typical post gets{" "}
          {compact(typical)} {usesViews ? "views" : "interactions"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {rows.length > shown ? (
            <Button
              variant="outline"
              className="h-11"
              onClick={() => setShown((value) => value + PAGE)}
            >
              Show {Math.min(PAGE, rows.length - shown)} more
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="h-11 gap-2"
            disabled={!rows.length || exporting}
            onClick={() => void exportCsv().finally(() => setExporting(false))}
          >
            <Download className="size-4" aria-hidden />
            {exporting ? "Preparing CSV…" : `Download CSV (${rows.length})`}
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(open)} onOpenChange={(next) => (next ? null : setOpen(null))}>
        {open ? (
          <DialogContent
            className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
            // Opens at the top: focusing the first button scrolled a long post
            // down to it and cut the title off.
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogDescription className="text-[13px]">
                {instagram ? "" : isArticle(open) ? "LinkedIn article · " : "LinkedIn post · "}
                {dayMonth(new Date(open.publishedAt))}
                {open.contentLane && open.contentLane !== "other" ? ` · ${open.contentLane}` : ""}
              </DialogDescription>
              <DialogTitle className="text-left text-base leading-snug">
                {articles.get(open.postId)?.title ?? postTitle(open.caption, 120)}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{open.caption}</p>
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              {/* An article opens on its own article page, not on the post that
                  shared it (19 Nov 2026). */}
              {(articles.get(open.postId)?.url ?? open.url) ? (
                <Button asChild variant="outline" className="h-11 gap-2">
                  <a
                    href={articles.get(open.postId)?.url ?? open.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {articles.get(open.postId)?.url ? "Open the article" : "Open the post"}
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                </Button>
              ) : null}
              <PostInsightButton post={open} platform={platform} className="h-11" />
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

/** "Article · 5 min read" or "Post", above a LinkedIn row's title. */
export function KindBadge({ article, minutes }: { article: boolean; minutes: number | null }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "mb-1 rounded-full px-2 py-0 text-[12px] font-semibold",
        article
          ? "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300"
          : "text-muted-foreground",
      )}
    >
      {article ? `Article${minutes ? ` · ${minutes} min read` : ""}` : "Post"}
    </Badge>
  );
}

function AgainstTypical({ ratio }: { ratio: number | null }) {
  if (ratio == null) return <span className="text-[13px] text-muted-foreground">—</span>;
  const better = ratio >= 1.5;
  const below = ratio <= 0.67;
  const text = better
    ? `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}× better`
    : below
      ? `${ratio.toFixed(1)}× · below`
      : "About typical";
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[13px] font-semibold whitespace-nowrap",
        better &&
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
        below &&
          "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
        !better && !below && "bg-muted text-muted-foreground",
      )}
    >
      {text}
    </Badge>
  );
}
