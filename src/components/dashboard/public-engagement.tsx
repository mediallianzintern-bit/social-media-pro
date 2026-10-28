// LinkedIn's top performing posts for the selected window: ranked by
// impressions, the way Pritesh's own LinkedIn screen ranks them, once
// LinkedIn's API has measured the posts (server/linkedin-analytics.ts); until
// then by their public engagement (analytics-types engagementsOf).
//
// The period's totals are not here: the Discovery and Engagement cards under
// Owner-only metrics come from LinkedIn itself, for his whole account.
import { ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { LinkedInPostList } from "@/components/dashboard/linkedin-owner-metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { engagementsOf, organicPosts, type PostRecord } from "@/lib/analytics-types";
import { labelInSentence, type ResolvedRange } from "@/lib/date-range";
import { fullNumber, shortDate } from "@/lib/format";
import { measuredByImpressions } from "@/lib/linkedin-analytics";
import { linkedInAnalyticsQueryOptions } from "@/lib/linkedin-api.functions";

const TOP_POSTS = 5;

export function PublicEngagement({
  posts,
  range,
}: {
  /** Posts in the selected window. */
  posts: PostRecord[];
  range: ResolvedRange;
}) {
  const current = organicPosts(posts);
  const top = [...current].sort((a, b) => engagementsOf(b) - engagementsOf(a)).slice(0, TOP_POSTS);
  // Ranked by impressions, as his own LinkedIn screen ranks them, once
  // LinkedIn's API has measured the posts. Until then, by engagements.
  const { data: linkedIn } = useQuery(linkedInAnalyticsQueryOptions);
  const byImpressions = measuredByImpressions(current, linkedIn?.posts);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top performing posts</CardTitle>
        <CardDescription>
          {byImpressions.length
            ? `By impressions in ${labelInSentence(range)}, as LinkedIn measures them. Engagements are each post's reactions, comments and reposts.`
            : `By engagements in ${labelInSentence(range)}. Ranked by impressions once Pritesh's LinkedIn is connected on Data sources.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {byImpressions.length ? (
          <LinkedInPostList rows={byImpressions} first={3} />
        ) : top.length ? (
          <ol className="divide-y">
            {top.map((post, index) => (
              <li key={post.postId} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="w-4 shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="line-clamp-2 text-sm leading-snug">{post.caption || "(no text)"}</p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{shortDate(post.publishedAt)}</span>
                    <span className="font-medium text-foreground tabular-nums">
                      {fullNumber(engagementsOf(post))} engagements
                    </span>
                    <span className="tabular-nums">
                      {fullNumber(post.likes)} reactions · {fullNumber(post.comments)} comments ·{" "}
                      {fullNumber(post.shares)} reposts
                    </span>
                    {post.url ? (
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                      >
                        Open <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No posts in this window.</p>
        )}
      </CardContent>
    </Card>
  );
}
