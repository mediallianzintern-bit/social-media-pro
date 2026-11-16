// "What his posts taught" on the LinkedIn page (16 Nov 2026): every post he
// published, reviewed 14 days after it went up on LinkedIn's impressions
// against his typical post, with the lessons the writer now reads, and the
// patterns counted across all of them. Free: stored rows only.
import { useQuery } from "@tanstack/react-query";
import { Ban, ExternalLink, Loader2, Repeat2 } from "lucide-react";
import { useState } from "react";

import { Patterns } from "@/components/dashboard/filmed-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { shortDate } from "@/lib/format";
import { REVIEW_DAYS, type PostLessonsView } from "@/lib/post-learning";
import { postLessonsQueryOptions } from "@/lib/post-learning.functions";
import { VIRAL_RATIO } from "@/lib/reel-learning-types";
import { cn } from "@/lib/utils";

const SHOWN = 5;

export function PostLessons() {
  const { data, isLoading, error } = useQuery(postLessonsQueryOptions());
  const [all, setAll] = useState(false);

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
      </p>
    );
  }
  if (error || !data) {
    return <p className="text-sm text-muted-foreground">This could not be loaded. Try again.</p>;
  }
  if (!data.ready) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          This turns on once the database update 0036_linkedin_post_learning.sql is applied in
          Supabase. After that, his posts are analysed after each refresh and reviewed {REVIEW_DAYS}{" "}
          days after they go up.
        </CardContent>
      </Card>
    );
  }

  const shown = all ? data.posts : data.posts.slice(0, SHOWN);
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <p className="text-sm text-muted-foreground">
          {summaryLine(data)} Each post is judged on LinkedIn&rsquo;s impressions against his
          typical post, whether it was drafted here or written by the team. The lessons go into
          every new post.
        </p>

        {data.posts.length ? (
          <ul className="divide-y rounded-md border">
            {shown.map((post) => (
              <PostRow key={post.postId} post={post} />
            ))}
          </ul>
        ) : null}
        {data.posts.length > SHOWN ? (
          <Button variant="outline" size="sm" onClick={() => setAll((value) => !value)}>
            {all ? "Show fewer" : `Show all ${data.posts.length}`}
          </Button>
        ) : null}

        <Patterns platform="linkedin" />
      </CardContent>
    </Card>
  );
}

function summaryLine(data: PostLessonsView): string {
  const reviewed = data.posts.length;
  const next = data.nextReviewAt ? ` The next is due ${shortDate(data.nextReviewAt)}.` : "";
  if (!reviewed && !data.analysed) {
    return `Nothing yet: his posts are analysed on the next refresh and reviewed ${REVIEW_DAYS} days after they go up.`;
  }
  if (!reviewed) {
    return `${data.analysed} post${data.analysed === 1 ? "" : "s"} analysed, none reviewed yet.${next}`;
  }
  return `${reviewed} post${reviewed === 1 ? "" : "s"} reviewed${data.waiting ? `, ${data.waiting} waiting for ${REVIEW_DAYS} days` : ""}.${next}`;
}

function PostRow({ post }: { post: PostLessonsView["posts"][number] }) {
  const viral = post.ratio >= VIRAL_RATIO;
  const title = post.opening.split("\n")[0] ?? "";
  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">
            {shortDate(post.publishedAt)}
            {post.lane ? ` · ${post.lane}` : ""} · {post.hookType} opening · {post.bodyShape}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "font-semibold tabular-nums",
              post.worked
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
            )}
          >
            {post.ratio.toFixed(2)}× ·{" "}
            {viral ? "3× or more" : post.worked ? "Worked" : "Did not work"}
          </Badge>
          {post.url ? (
            <a
              href={post.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center text-muted-foreground hover:text-foreground"
              aria-label="Open the post on LinkedIn"
            >
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
      <p className="text-sm leading-relaxed">{post.summary}</p>
      {post.lessons.length ? (
        <ul className="space-y-1.5">
          {post.lessons.map((lesson, index) => (
            <li key={index} className="flex gap-2 text-sm">
              {lesson.kind === "repeat" ? (
                <Repeat2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Repeat" />
              ) : (
                <Ban className="mt-0.5 size-4 shrink-0 text-red-600" aria-label="Avoid" />
              )}
              <span>
                <span className="font-medium">
                  {lesson.kind === "repeat" ? "Repeat" : "Avoid"}:
                </span>{" "}
                {lesson.lesson}{" "}
                <span className="text-xs text-muted-foreground">({lesson.evidence})</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
