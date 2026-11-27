// The monthly layout of the Performance report (26 Nov 2026), used whenever
// the period is about a month: a calendar month, the last 30 days, or custom
// dates of 25 to 35 days. Built on the agency's October 2026 monthly report.
//
// Per the UI/UX brief of 12 Nov 2026: one answer per screen (a Summary tab
// that fits about a screen and a half, the detail behind tabs), plain words,
// explanations behind an "i", one-line post titles with a cover, text no
// smaller than 13px and controls 44px tall. On paper every tab prints, one
// after the other, so the PDF is the whole report.
//
// Every figure comes from lib/monthly-review.ts, so the sentences and the
// tables beside them quote the same numbers.
import { ArrowDownRight, ArrowUpRight, ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GrowthChart } from "@/components/dashboard/growth-chart";
import { InfoTip } from "@/components/dashboard/info-tip";
import { PostCover } from "@/components/dashboard/post-cover";
import {
  Delta,
  DOWN,
  SectionCard,
  Stat,
  TableWrap,
  td,
  th,
  UP,
  type DeltaKind,
} from "@/components/report/report-parts";
import {
  LinkedInContent,
  LinkedInNumbers,
  LinkedInPosts,
  LinkedInTiles,
  LinkedInWeeks,
} from "@/components/report/linkedin-monthly";
import { change } from "@/lib/report-format";
import {
  countryName,
  genderName,
  num,
  type Figures,
  type MonthlyReview,
  type ReviewPost,
  type TopicStat,
} from "@/lib/monthly-review";
import { shortDate } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform-meta";
import type { ClientReportPlatform } from "@/lib/report-types";
import { cn } from "@/lib/utils";

const WEEKDAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Rows of the posts table shown before "Show all". */
const POST_ROWS = 20;

const count = (value: number, one: string) => `${num(value)} ${value === 1 ? one : `${one}s`}`;
const pct = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`;
const times = (value: number) => `${value.toFixed(2)}×`;
const topicName = (topic: string) =>
  topic.trim().toLowerCase() === "other" ? "Other" : topic.replace(/^./, (c) => c.toUpperCase());

/** "since September" for a month; "against the 30 days before" otherwise. */
const sinceOrAgainst = (name: string) =>
  /^[A-Z]/.test(name) ? `since ${name}` : `against ${name}`;

/** A section that is a tab on screen and a heading on paper. */
function Panel({ value, title, children }: { value: string; title: string; children: ReactNode }) {
  return (
    <TabsContent
      value={value}
      forceMount
      className="mt-5 space-y-5 data-[state=inactive]:hidden print:mt-8 print:data-[state=inactive]:block"
    >
      {/* The tab names it on screen; on paper, where every tab prints, it needs a heading. */}
      <h3 className="sr-only print:not-sr-only print:text-base print:font-semibold">{title}</h3>
      {children}
    </TabsContent>
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function Summary({ review }: { review: MonthlyReview }) {
  const { current: now, previous: then } = review;
  const against = then.posts > 0 ? review.previousName : null;
  const views = review.basis === "views";
  return (
    <>
      <p className="text-[15px] leading-relaxed">{review.intro}</p>

      {review.changes.length ? (
        <SectionCard title={`What changed ${sinceOrAgainst(review.previousName)}`}>
          <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed">
            {review.changes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {review.linkedin ? (
        <LinkedInTiles review={review} linkedin={review.linkedin} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            value={now.followersEnd !== null ? num(now.followersEnd) : "—"}
            label={
              now.followerChange !== null
                ? `followers (${now.followerChange >= 0 ? "+" : "−"}${num(Math.abs(now.followerChange))} in ${review.currentName})`
                : "followers"
            }
            against={null}
          />
          <Stat
            value={num(now.posts)}
            label={`posts (about ${num(now.postsPerWeek)} a week)`}
            pct={change(now.posts, then.posts)}
            against={against}
          />
          {views && now.typicalViews !== null ? (
            <Stat
              value={num(now.typicalViews)}
              label="typical views per post"
              pct={change(now.typicalViews, then.typicalViews)}
              against={against}
            />
          ) : (
            <Stat
              value={num(now.interactions)}
              label="likes, comments and shares"
              pct={change(now.interactions, then.interactions)}
              against={against}
            />
          )}
          <Stat
            value={num(now.interactionsPerPost)}
            label="interactions per post"
            pct={change(now.interactionsPerPost, then.interactionsPerPost)}
            against={against}
          />
        </div>
      )}

      {review.findings.length ? (
        <SectionCard title="Key findings">
          <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
            {review.findings.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </SectionCard>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// The numbers, period against period
// ---------------------------------------------------------------------------

interface Row {
  label: string;
  info?: string;
  pick: (figures: Figures) => number | null;
  format: (value: number) => string;
  kind: DeltaKind;
  better?: "up" | "down" | "none";
}

function rowsFor(review: MonthlyReview): Row[] {
  const views = review.basis === "views";
  const unit = views ? "views" : "interactions";
  const rows: Array<Row | false> = [
    {
      label: "Followers (end of period)",
      pick: (f) => f.followersEnd,
      format: num,
      kind: "diff",
    },
    { label: "Follower change", pick: (f) => f.followerChange, format: signed, kind: "diff" },
    { label: "Posts published", pick: (f) => f.posts, format: num, kind: "diff" },
    { label: "Posts a week", pick: (f) => f.postsPerWeek, format: num, kind: "diff" },
    views && { label: "Total views", pick: (f) => f.totalViews, format: num, kind: "pct" },
    views && {
      label: "Average views per post",
      info: "The period's views divided by its posts. One big post moves it; the typical post below does not.",
      pick: (f) => f.averageViews,
      format: num,
      kind: "pct",
    },
    views && {
      label: "Posts with 1,000+ views",
      pick: (f) => f.postsOver1000,
      format: num,
      kind: "diff",
    },
    views && {
      label: "Posts under 300 views",
      info: "Posts that barely travelled beyond existing followers. Fewer is better.",
      pick: (f) => f.postsUnder300,
      format: num,
      kind: "diff",
      better: "down",
    },
    {
      label: "Total interactions",
      info: "Likes, comments and shares on the period's posts.",
      pick: (f) => f.interactions,
      format: num,
      kind: "pct",
    },
    {
      label: "Interactions per post",
      pick: (f) => f.interactionsPerPost,
      format: num,
      kind: "pct",
    },
    {
      label: "Typical interactions per post",
      info: "The middle post's interactions: half the posts earned more, half less. One big post does not move it.",
      pick: (f) => f.typicalInteractions,
      format: num,
      kind: "pct",
    },
    views && {
      label: "Engagement rate (interactions ÷ views)",
      info: "Interactions on the period's posts divided by their public views, the same measure used for competitors.",
      pick: (f) => f.engagementRate,
      format: (v) => pct(v),
      kind: "pts",
    },
    {
      label: "Engagement ÷ reach",
      info: "Interactions, saves and shares divided by the people the posts reached, from Instagram's own figures.",
      pick: (f) => f.reachRate,
      format: (v) => pct(v),
      kind: "pts",
    },
    views && {
      label: "Typical views per post",
      info: "The middle post's views: half the posts were seen more, half less.",
      pick: (f) => f.typicalViews,
      format: num,
      kind: "pct",
    },
    { label: "Typical reach per post", pick: (f) => f.typicalReach, format: num, kind: "pct" },
    { label: "Typical saves per post", pick: (f) => f.typicalSaves, format: num, kind: "pct" },
    { label: "Typical shares per post", pick: (f) => f.typicalShares, format: num, kind: "pct" },
    {
      label: "Typical watch time per Reel (seconds)",
      info: "The middle Reel's average watch time, the same figure as the dashboard's Avg watch time.",
      pick: (f) => f.avgWatchSeconds,
      format: (v) => v.toFixed(1),
      kind: "pct",
    },
    {
      label: `Best post (${unit})`,
      pick: (f) => f.best?.value ?? null,
      format: num,
      kind: "pct",
    },
    {
      label: "Posts at 3× the typical post or better",
      pick: (f) => f.postsAt3x,
      format: num,
      kind: "diff",
    },
  ];
  return rows.filter(
    (row): row is Row =>
      Boolean(row) &&
      ((row as Row).pick(review.current) !== null || (row as Row).pick(review.previous) !== null),
  );
}

function signed(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${num(Math.abs(value))}`;
}

function Numbers({ review }: { review: MonthlyReview }) {
  return (
    <>
      <SectionCard
        title={`${review.currentShort} against ${review.previousShort}`}
        info="Typical means the middle post of the period, so one unusually big or small post does not move it. Reach, saves, shares and watch time are Instagram's own figures and exist for this account only."
      >
        <TableWrap wide={false}>
          <thead>
            <tr>
              <th className={th}>Indicator</th>
              <th className={th}>
                {review.previousShort}
                {review.excluded.length ? (
                  <span className="block font-normal">
                    {num(review.previous.posts)} posts, without {num(review.excluded.length)}{" "}
                    {review.excluded.length === 1 ? "breakout" : "breakouts"}
                  </span>
                ) : null}
              </th>
              <th className={th}>{review.currentShort}</th>
              <th className={th}>Change</th>
            </tr>
          </thead>
          <tbody>
            {rowsFor(review).map((row) => {
              const before = row.pick(review.previous);
              const after = row.pick(review.current);
              return (
                <tr key={row.label}>
                  <td className={cn(td, "font-medium")}>
                    <span className="inline-flex items-center gap-0.5">
                      {row.label}
                      {row.info ? <InfoTip text={row.info} label={`About ${row.label}`} /> : null}
                    </span>
                  </td>
                  <td className={td}>{before === null ? "—" : row.format(before)}</td>
                  <td className={td}>{after === null ? "—" : row.format(after)}</td>
                  <td className={td}>
                    <Delta
                      before={before}
                      after={after}
                      kind={row.kind}
                      {...(row.better ? { better: row.better } : {})}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </SectionCard>
    </>
  );
}

/** The follower chart and the follower count's start, end and change in each period. */
function FollowerTrend({
  report,
  review,
}: {
  report: ClientReportPlatform;
  review: MonthlyReview;
}) {
  const meta = PLATFORM_META[report.platform];
  const trend = [
    { name: review.previousShort, figures: review.previous },
    { name: review.currentShort, figures: review.current },
  ].filter(({ figures }) => figures.followerChange !== null && figures.followersEnd !== null);
  return (
    <>
      {trend.length ? (
        <SectionCard title="Follower trend">
          {report.growth.length > 1 ? (
            <div className="mb-4">
              <GrowthChart points={report.growth} color={meta.color} />
            </div>
          ) : null}
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Period</th>
                <th className={th}>Start</th>
                <th className={th}>End</th>
                <th className={th}>Change</th>
                <th className={th}>Days</th>
                <th className={th}>A day</th>
              </tr>
            </thead>
            <tbody>
              {trend.map(({ name, figures }) => {
                const end = figures.followersEnd!;
                const gained = figures.followerChange!;
                const days = figures.followerDays ?? 0;
                return (
                  <tr key={name}>
                    <td className={cn(td, "font-medium")}>
                      {name}
                      {figures.followersFrom ? (
                        <span className="block text-[13px] font-normal text-muted-foreground">
                          counted from {shortDate(figures.followersFrom)}
                        </span>
                      ) : null}
                    </td>
                    <td className={td}>{num(end - gained)}</td>
                    <td className={td}>{num(end)}</td>
                    <td className={cn(td, gained > 0 ? UP : gained < 0 ? DOWN : "")}>
                      {signed(gained)}
                    </td>
                    <td className={td}>{days ? num(days) : "—"}</td>
                    <td className={td}>
                      {days ? signed(Number((gained / days).toFixed(1))) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </SectionCard>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Topics and days
// ---------------------------------------------------------------------------

function TopicCell({ stat }: { stat: TopicStat | null }) {
  if (!stat) return <span className="text-muted-foreground">—</span>;
  return (
    <span>
      {times(stat.vsTypical)}
      {stat.fewPosts ? (
        <span className="block text-[13px] text-muted-foreground">few posts</span>
      ) : null}
    </span>
  );
}

function Topics({ review }: { review: MonthlyReview }) {
  const usual = review.basis === "views" ? "usual views" : "usual interactions";
  const saves = review.topics.some((row) => row.current?.typicalSaves !== null && row.current);
  const day = review.basis === "views" ? "Typical views" : "Typical interactions";
  return (
    <>
      {review.topics.length ? (
        <SectionCard
          title="Topics"
          info={`How each topic's typical post compares with the account's typical post in the same period: 1.00× is a usual post, 2.00× twice the ${usual}. A topic with fewer than three posts is marked "few posts": one post moves its figure a long way.`}
        >
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Topic</th>
                <th className={th}>Posts {review.previousShort}</th>
                <th className={th}>Posts {review.currentShort}</th>
                <th className={th}>
                  × {usual}, {review.previousShort}
                </th>
                <th className={th}>
                  × {usual}, {review.currentShort}
                </th>
                <th className={th}>Share of posts / interactions</th>
                {saves ? <th className={th}>Typical saves</th> : null}
              </tr>
            </thead>
            <tbody>
              {review.topics.map((row) => (
                <tr key={row.topic}>
                  <td className={cn(td, "font-medium")}>{topicName(row.topic)}</td>
                  <td className={td}>{num(row.previous?.posts ?? 0)}</td>
                  <td className={td}>{num(row.current?.posts ?? 0)}</td>
                  <td className={td}>
                    <TopicCell stat={row.previous} />
                  </td>
                  <td className={td}>
                    <TopicCell stat={row.current} />
                  </td>
                  <td className={td}>
                    {row.current
                      ? `${row.current.shareOfPostsPct}% / ${row.current.shareOfInteractionsPct}%`
                      : "—"}
                  </td>
                  {saves ? (
                    <td className={td}>
                      {row.current?.typicalSaves != null ? num(row.current.typicalSaves) : "—"}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </SectionCard>
      ) : null}

      {review.weekdays.length ? (
        <SectionCard
          title="Day of the week"
          info="With only a few posts on each day, one big post decides a day's figure. Read it as something to test, not a rule."
        >
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Day</th>
                <th className={th}>
                  {day}, {review.previousShort}
                </th>
                <th className={th}>
                  {day}, {review.currentShort}
                </th>
                <th className={th}>Change</th>
                <th className={th}>Posts</th>
              </tr>
            </thead>
            <tbody>
              {review.weekdays.map((row) => (
                <tr key={row.weekday}>
                  <td className={cn(td, "font-medium")}>{WEEKDAY[row.weekday]}</td>
                  <td className={td}>{row.previous.posts ? num(row.previous.typical) : "—"}</td>
                  <td className={td}>{row.current.posts ? num(row.current.typical) : "—"}</td>
                  <td className={td}>
                    <Delta
                      before={row.previous.posts ? row.previous.typical : null}
                      after={row.current.posts ? row.current.typical : null}
                      kind="pct"
                    />
                  </td>
                  <td className={td}>
                    {num(row.previous.posts)} / {num(row.current.posts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </SectionCard>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

function Figure({ row, basis }: { row: ReviewPost; basis: MonthlyReview["basis"] }) {
  return (
    <span className="tabular-nums">
      <span className="font-semibold">{num(row.value)}</span>{" "}
      {basis === "views" ? "views" : "interactions"}
      {row.vsTypical !== null ? (
        <span className="text-muted-foreground"> · {times(row.vsTypical)} typical</span>
      ) : null}
    </span>
  );
}

function BestList({
  title,
  rows,
  basis,
  platform,
}: {
  title: string;
  rows: ReviewPost[];
  basis: MonthlyReview["basis"];
  platform: ClientReportPlatform["platform"];
}) {
  if (!rows.length) return null;
  return (
    <SectionCard title={title}>
      <ul className="divide-y">
        {rows.map((row) => (
          <li
            key={row.post.postId}
            className="flex gap-3 py-3 first:pt-0 last:pb-0 print:break-inside-avoid"
          >
            <PostCover post={row.post} className="size-14" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="line-clamp-2 font-medium">{row.title}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {WEEKDAY_SHORT[row.weekday]} {shortDate(row.post.publishedAt)}
                {row.topic ? ` · ${topicName(row.topic)}` : ""}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px]">
                <Figure row={row} basis={basis} />
                <span className="text-muted-foreground">
                  {[
                    count(row.post.likes, "like"),
                    count(row.post.comments, "comment"),
                    ...(row.post.insight
                      ? [
                          count(row.post.insight.saved, "save"),
                          count(row.post.insight.shares, "share"),
                        ]
                      : []),
                  ].join(" · ")}
                </span>
                {row.post.url ? (
                  <a
                    href={row.post.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-6 items-center gap-0.5 text-muted-foreground underline-offset-2 hover:underline print:hidden"
                  >
                    View on {PLATFORM_META[platform].label}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : null}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/**
 * Every post of a period, with the figures the monthly workbook lists per
 * post. On the period before, last month's breakout posts are listed too,
 * marked as left out of the comparison.
 */
function AllPosts({
  review,
  rows,
  title,
}: {
  review: MonthlyReview;
  rows: ReviewPost[];
  title: string;
}) {
  const [all, setAll] = useState(false);
  const views = review.basis === "views";
  const left = new Set(review.excluded.map((row) => row.post.postId));
  const measured = rows.some((row) => row.post.insight);
  const under = rows.filter((row) => row.vsTypical !== null && row.vsTypical < 0.5).length;
  if (!rows.length) return null;
  return (
    <SectionCard
      title={title}
      info="Tap a post to read its full caption. × typical compares each post with that period's typical post; 3× or more is a standout. Reach, saves and shares are Instagram's own figures."
      description={
        under
          ? `${num(under)} of ${num(rows.length)} posts reached under half the typical post: they barely travelled beyond existing followers.`
          : undefined
      }
    >
      <TableWrap>
        <thead>
          <tr>
            <th className={th}>Date</th>
            <th className={th}>Post</th>
            <th className={th}>Topic</th>
            <th className={th}>{views ? "Views" : "Interactions"}</th>
            {measured ? <th className={th}>Reach</th> : null}
            <th className={th}>Likes</th>
            <th className={th}>Comments</th>
            {measured ? <th className={th}>Saves</th> : null}
            {measured ? <th className={th}>Shares</th> : null}
            <th className={th}>× typical</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.post.postId}
              className={cn(
                !all && index >= POST_ROWS && "hidden print:table-row",
                left.has(row.post.postId) && "bg-muted/40",
              )}
            >
              <td className={cn(td, "whitespace-nowrap")}>
                {WEEKDAY_SHORT[row.weekday]} {shortDate(row.post.publishedAt)}
              </td>
              <td className={cn(td, "min-w-[14rem]")}>
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2">
                    <PostCover post={row.post} className="size-9" />
                    <span className="line-clamp-1">{row.title}</span>
                  </summary>
                  <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
                    {row.post.caption.trim() || "(no caption)"}
                  </p>
                  {row.post.url ? (
                    <a
                      href={row.post.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 inline-flex items-center gap-0.5 text-[13px] underline-offset-2 hover:underline"
                    >
                      Open the post <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : null}
                </details>
                {left.has(row.post.postId) ? (
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">
                    Breakout: left out of the comparison
                  </span>
                ) : null}
              </td>
              <td className={td}>{row.topic ? topicName(row.topic) : "—"}</td>
              <td className={td}>{num(row.value)}</td>
              {measured ? (
                <td className={td}>{row.post.insight ? num(row.post.insight.reach) : "—"}</td>
              ) : null}
              <td className={td}>{num(row.post.likes)}</td>
              <td className={td}>{num(row.post.comments)}</td>
              {measured ? (
                <td className={td}>{row.post.insight ? num(row.post.insight.saved) : "—"}</td>
              ) : null}
              {measured ? (
                <td className={td}>{row.post.insight ? num(row.post.insight.shares) : "—"}</td>
              ) : null}
              <td className={td}>
                {row.vsTypical === null ? (
                  "—"
                ) : (
                  <span
                    className={cn(
                      row.vsTypical >= 3 && cn("font-semibold", UP),
                      row.vsTypical < 0.5 && "text-muted-foreground",
                    )}
                  >
                    {times(row.vsTypical)}
                    {row.vsTypical >= 3 ? " · standout" : ""}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      {rows.length > POST_ROWS ? (
        <Button
          variant="outline"
          className="mt-4 h-11 print:hidden"
          onClick={() => setAll((value) => !value)}
        >
          {all ? `Show the first ${POST_ROWS}` : `Show all ${num(rows.length)} posts`}
        </Button>
      ) : null}
    </SectionCard>
  );
}

/** Last period's breakout posts, on their own: what the comparison leaves out, and why. */
function LeftOut({ review }: { review: MonthlyReview }) {
  if (!review.excluded.length) return null;
  return (
    <SectionCard
      title={`Left out of the comparison: ${review.previousShort}'s breakout posts`}
      info={`Posts at 3× ${review.previousName}'s typical post or more. A single viral post can be bigger than the rest of a month put together, so ${review.previousName} is compared without them and they are listed here instead. Followers are account-wide and not affected.`}
      description={`${review.previousShort} is compared on its other ${num(review.previous.posts)} posts.`}
    >
      <TableWrap>
        <thead>
          <tr>
            <th className={th}>Post</th>
            <th className={th}>Date</th>
            <th className={th}>{review.basis === "views" ? "Views" : "Interactions"}</th>
            <th className={th}>Reach</th>
            <th className={th}>× all-post typical</th>
          </tr>
        </thead>
        <tbody>
          {review.excluded.map((row) => (
            <tr key={row.post.postId}>
              <td className={cn(td, "min-w-[14rem]")}>
                <span className="flex items-center gap-2">
                  <PostCover post={row.post} className="size-9" />
                  <span className="line-clamp-2">{row.title}</span>
                </span>
              </td>
              <td className={cn(td, "whitespace-nowrap")}>
                {WEEKDAY_SHORT[row.weekday]} {shortDate(row.post.publishedAt)}
              </td>
              <td className={td}>{num(row.value)}</td>
              <td className={td}>{row.post.insight ? num(row.post.insight.reach) : "—"}</td>
              <td className={td}>{row.vsTypical === null ? "—" : times(row.vsTypical)}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Audience and competitors
// ---------------------------------------------------------------------------

function Bars({ title, rows }: { title: string; rows: Array<{ label: string; share: number }> }) {
  if (!rows.length) return null;
  const top = Math.max(...rows.map((row) => row.share));
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li
            key={row.label}
            className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-2 text-sm"
          >
            <span className="truncate">{row.label}</span>
            <span className="h-2.5 rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary/70"
                style={{ width: `${top > 0 ? (row.share / top) * 100 : 0}%` }}
              />
            </span>
            <span className="text-right tabular-nums">{pct(row.share, 1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Audience({ review }: { review: MonthlyReview }) {
  const { audience, last28Days } = review;
  return (
    <>
      {last28Days ? (
        <SectionCard
          title="The last 28 days"
          info="Instagram's own account figures cover the last 28 days up to the latest update, so they are shown only for a period that has just ended."
          description={`Instagram's figures for the 28 days to ${shortDate(last28Days.capturedAt)}.`}
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Accounts reached", last28Days.reach],
              ["Accounts engaged", last28Days.accountsEngaged],
              ["Profile visits", last28Days.profileViews],
              ["Website taps", last28Days.websiteClicks],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="text-2xl font-bold tabular-nums">{num(value as number)}</p>
                <p className="text-[13px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
      {audience ? (
        <SectionCard
          title="Who follows the account"
          info="Shares of all followers, as Instagram reports them over the account's lifetime. Cities count only followers who share a location."
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <Bars title="Age" rows={audience.age} />
            <Bars
              title="Country"
              rows={audience.country.map((row) => ({ ...row, label: countryName(row.label) }))}
            />
            <Bars
              title="Gender"
              rows={audience.gender.map((row) => ({ ...row, label: genderName(row.label) }))}
            />
            <Bars title="Top cities" rows={audience.city} />
          </div>
        </SectionCard>
      ) : null}
    </>
  );
}

function Competitors({ review }: { review: MonthlyReview }) {
  if (!review.benchmark) return null;
  const { you, rivals } = review.benchmark;
  const rate = review.basis === "views" ? "Engagement rate" : "Interactions per follower";
  return (
    <SectionCard
      title="Competitors"
      info={`Competitors are measured on the same schedule and with the same calculations as the account, from their latest posts; the account's own row is ${review.currentName}. ${rate} uses public counts for everyone, so the comparison is like for like.`}
    >
      <TableWrap>
        <thead>
          <tr>
            <th className={th}>Account</th>
            <th className={th}>Followers</th>
            <th className={th}>Posts a week</th>
            <th className={th}>Typical interactions</th>
            <th className={th}>{rate}</th>
            <th className={th}>Compared with you</th>
          </tr>
        </thead>
        <tbody>
          {[you, ...rivals].map((row) => (
            <tr key={row.handle} className={cn(row === you && "font-semibold")}>
              <td className={td}>
                {row === you ? `${row.displayName} (you)` : row.displayName}
                {row.aspirational ? (
                  <span className="ml-1 text-[13px] font-normal text-muted-foreground">
                    · one to aim at
                  </span>
                ) : null}
              </td>
              <td className={td}>{num(row.followers)}</td>
              <td className={td}>{num(row.postsPerWeek)}</td>
              <td className={td}>{num(row.typicalInteractions)}</td>
              <td className={td}>{row.engagementRate === null ? "—" : pct(row.engagementRate)}</td>
              <td className={td}>{row === you ? "—" : (row.gap ?? "—")}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// The platform
// ---------------------------------------------------------------------------

export function MonthlyPlatform({
  report,
  review,
}: {
  report: ClientReportPlatform;
  review: MonthlyReview;
}) {
  const meta = PLATFORM_META[report.platform];
  const tabs = [
    { value: "summary", label: "Summary" },
    { value: "numbers", label: "Numbers" },
    { value: "topics", label: "Topics & days" },
    { value: "posts", label: "Posts" },
    ...(review.audience || review.last28Days ? [{ value: "audience", label: "Audience" }] : []),
    ...(review.benchmark ? [{ value: "competitors", label: "Competitors" }] : []),
  ];
  return (
    <section className="space-y-2" aria-label={`${meta.label} monthly report`}>
      <Tabs defaultValue="summary">
        <div className="-mx-1 overflow-x-auto px-1 print:hidden">
          <TabsList className="h-auto w-max gap-1 p-1">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="h-11 px-4 text-sm">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <Panel value="summary" title="Summary">
          <Summary review={review} />
        </Panel>
        <Panel
          value="numbers"
          title={`The numbers, ${review.currentShort} against ${review.previousShort}`}
        >
          {review.linkedin ? (
            <LinkedInNumbers review={review} linkedin={review.linkedin} />
          ) : (
            <>
              <Numbers review={review} />
              <LeftOut review={review} />
            </>
          )}
          <FollowerTrend report={report} review={review} />
          {review.linkedin ? <LinkedInWeeks linkedin={review.linkedin} /> : null}
        </Panel>
        <Panel value="topics" title="Topics and days">
          {review.linkedin ? (
            <LinkedInContent review={review} linkedin={review.linkedin} />
          ) : (
            <Topics review={review} />
          )}
        </Panel>
        <Panel value="posts" title="Posts">
          {review.linkedin ? (
            <LinkedInPosts review={review} linkedin={review.linkedin} platform={report.platform} />
          ) : (
            <div className="space-y-5">
              <BestList
                title={`Best posts, ${review.currentShort}`}
                rows={review.best.current}
                basis={review.basis}
                platform={report.platform}
              />
              <BestList
                title={`Best posts, ${review.previousShort}`}
                rows={review.best.previous}
                basis={review.basis}
                platform={report.platform}
              />
              <AllPosts
                review={review}
                rows={review.posts}
                title={`Every post, ${review.currentShort}`}
              />
              <AllPosts
                review={review}
                rows={review.previousPosts}
                title={`Every post, ${review.previousShort}`}
              />
            </div>
          )}
        </Panel>
        {review.audience || review.last28Days ? (
          <Panel value="audience" title="Audience">
            <Audience review={review} />
          </Panel>
        ) : null}
        {review.benchmark ? (
          <Panel value="competitors" title="Competitors">
            <Competitors review={review} />
          </Panel>
        ) : null}
      </Tabs>
    </section>
  );
}
