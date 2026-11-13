// An account's posts, as the UI review asked for them (13 Nov 2026, mockup
// "Instagram, Posts tab"): one line per post with its cover, search, a topic
// filter and a sort, twenty at a time, and each post scored against the
// account's typical post. The full caption opens on a click; the old table
// printed every caption whole, so each row was a paragraph.
import { ExternalLink } from "lucide-react";
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
import { cn } from "@/lib/utils";

const PAGE = 20;

type Sort = "primary" | "newest" | "oldest" | "against";

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
  const [sort, setSort] = useState<Sort>("primary");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<PostRecord | null>(null);

  const rows = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = posts.filter(
      (post) =>
        (topic === "all" || post.contentLane === topic) &&
        words.every((word) =>
          `${post.caption} ${post.contentLane ?? ""}`.toLowerCase().includes(word),
        ),
    );
    const by = (post: PostRecord) => primaryOf(post, usesViews);
    return [...filtered].sort((a, b) =>
      sort === "newest"
        ? b.publishedAt.localeCompare(a.publishedAt)
        : sort === "oldest"
          ? a.publishedAt.localeCompare(b.publishedAt)
          : by(b) - by(a),
    );
  }, [posts, search, topic, sort, usesViews]);

  const instagram = platform === "instagram";
  const primaryLabel = usesViews ? "Views" : "Interactions";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem_12rem]">
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
          <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
            <SelectTrigger className="h-11" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="primary">Most {primaryLabel.toLowerCase()}</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
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
              <th className="px-3 py-3 text-right font-medium">{primaryLabel}</th>
              {instagram ? <th className="px-3 py-3 text-right font-medium">Saves</th> : null}
              {instagram ? null : <th className="px-3 py-3 text-right font-medium">Comments</th>}
              <th className="px-3 py-3 text-right font-medium">
                {instagram ? "Shares" : "Reposts"}
              </th>
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
                      <span className="line-clamp-2 max-w-[22rem]">
                        {postTitle(post.caption)}
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
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {compact(primaryOf(post, usesViews))}
                  </td>
                  {instagram ? (
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {post.insight ? compact(post.insight.saved) : "—"}
                    </td>
                  ) : (
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {compact(post.comments)}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {compact(post.insight?.shares ?? post.shares)}
                  </td>
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
        {rows.length > shown ? (
          <Button
            variant="outline"
            className="h-11"
            onClick={() => setShown((value) => value + PAGE)}
          >
            Show {Math.min(PAGE, rows.length - shown)} more
          </Button>
        ) : null}
      </div>

      <Dialog open={Boolean(open)} onOpenChange={(next) => (next ? null : setOpen(null))}>
        {open ? (
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogDescription className="text-[13px]">
                {dayMonth(new Date(open.publishedAt))}
                {open.contentLane && open.contentLane !== "other" ? ` · ${open.contentLane}` : ""}
              </DialogDescription>
              <DialogTitle className="text-left text-base leading-snug">
                {postTitle(open.caption, 120)}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{open.caption}</p>
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              {open.url ? (
                <Button asChild variant="outline" className="h-11 gap-2">
                  <a href={open.url} target="_blank" rel="noreferrer noopener">
                    Open the post
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
