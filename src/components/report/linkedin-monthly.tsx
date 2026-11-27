// The LinkedIn layout of the monthly report (26 Nov 2026), from the agency's
// LinkedIn strategy workbook (Sep vs Oct 2026): LinkedIn's own figures
// (impressions, members reached, engagement rate, new followers), the weekly
// trend, the day of the week, topics by engagement rate, and every post of
// both months by impressions. Figures from lib/linkedin-review.ts.
import { ExternalLink } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PostCover } from "@/components/dashboard/post-cover";
import { InfoTip } from "@/components/dashboard/info-tip";
import {
  Delta,
  SectionCard,
  Stat,
  TableWrap,
  td,
  th,
  type DeltaKind,
} from "@/components/report/report-parts";
import type {
  LinkedInAccount,
  LinkedInPost,
  LinkedInPostFigures,
  LinkedInReview,
} from "@/lib/linkedin-review";
import { num, type Figures, type MonthlyReview } from "@/lib/monthly-review";
import { shortDate } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform-meta";
import { change } from "@/lib/report-format";
import type { PlatformId } from "@/lib/analytics-types";
import { cn } from "@/lib/utils";

const WEEKDAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const POST_ROWS = 20;

const pct = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`;
const topicName = (topic: string) =>
  topic.trim().toLowerCase() === "other" ? "Other" : topic.replace(/^./, (c) => c.toUpperCase());
const signed = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${num(Math.abs(value))}`;
const dash = <span className="text-muted-foreground">—</span>;

export function LinkedInTiles({
  review,
  linkedin,
}: {
  review: MonthlyReview;
  linkedin: LinkedInReview;
}) {
  const { current: now, previous: then } = linkedin;
  const against = then.days ? review.previousName : null;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat
        value={review.current.followersEnd !== null ? num(review.current.followersEnd) : "—"}
        label={
          now.newFollowers !== null
            ? `followers (${num(now.newFollowers)} new in ${review.currentName})`
            : "followers"
        }
        against={null}
      />
      <Stat
        value={num(now.impressions)}
        label="impressions"
        pct={change(now.impressions, then.impressions)}
        against={against}
      />
      <Stat
        value={now.membersReached !== null ? num(now.membersReached) : "—"}
        label="members reached"
        pct={now.membersReached !== null ? change(now.membersReached, then.membersReached) : null}
        against={against}
      />
      <Stat
        value={now.engagementRate !== null ? pct(now.engagementRate) : "—"}
        label="engagement rate"
        pct={now.engagementRate !== null ? change(now.engagementRate, then.engagementRate) : null}
        against={against}
      />
    </div>
  );
}

interface Row {
  label: string;
  info?: string;
  before: number | null;
  after: number | null;
  format: (value: number) => string;
  kind: DeltaKind;
  better?: "up" | "down" | "none";
  note?: string | null;
}

function measuredNote(figures: LinkedInPostFigures): string | null {
  return figures.posts && !figures.covered
    ? `${num(figures.measured)} of ${num(figures.posts)} posts measured`
    : null;
}

export function LinkedInNumbers({
  review,
  linkedin,
}: {
  review: MonthlyReview;
  linkedin: LinkedInReview;
}) {
  const { current: now, previous: then, postFigures } = linkedin;
  const pick = (f: (a: LinkedInAccount) => number | null) => ({ before: f(then), after: f(now) });
  const posts = (f: (p: LinkedInPostFigures) => number | null) => ({
    before: f(postFigures.previous),
    after: f(postFigures.current),
  });
  const own = (f: (p: Figures) => number | null) => ({
    before: f(review.previous),
    after: f(review.current),
  });
  const rows: Row[] = [
    {
      label: "Followers (end of period)",
      ...own((f) => f.followersEnd),
      format: num,
      kind: "diff",
    },
    {
      label: "Follower change",
      info: "The follower count at the end of the period against its start, from the account's own syncs. New followers minus people who left.",
      ...own((f) => f.followerChange),
      format: signed,
      kind: "diff",
    },
    {
      label: "New followers",
      info: "LinkedIn's own count of people who started following in the period. It does not subtract anyone who left.",
      ...pick((a) => a.newFollowers),
      format: num,
      kind: "pct",
    },
    {
      label: "New followers per 1,000 impressions",
      ...pick((a) => a.followersPerThousand),
      format: (v) => v.toFixed(1),
      kind: "diff",
    },
    { label: "Impressions", ...pick((a) => a.impressions), format: num, kind: "pct" },
    {
      label: "Members reached",
      info: "Distinct LinkedIn members who saw at least one post, LinkedIn's own count.",
      ...pick((a) => a.membersReached),
      format: num,
      kind: "pct",
    },
    {
      label: "Impressions per member reached",
      info: "How many times each person reached saw the content. Rising means the same, smaller group is seeing the posts more often.",
      ...pick((a) => a.impressionsPerMember),
      format: (v) => v.toFixed(1),
      kind: "diff",
      better: "none",
    },
    {
      label: "Total engagements",
      info: "Reactions, comments, reposts, saves and sends, as LinkedIn counts them.",
      ...pick((a) => a.engagements),
      format: num,
      kind: "pct",
    },
    {
      label: "Engagement rate",
      info: "Engagements divided by impressions, LinkedIn's own measure.",
      ...pick((a) => a.engagementRate),
      format: (v) => pct(v),
      kind: "pts",
    },
    {
      label: "Typical impressions per post",
      info: "The middle post's impressions: half the posts were seen more, half less. Shown only where LinkedIn measured most of the period's posts.",
      ...posts((p) => p.medianImpressions),
      format: num,
      kind: "pct",
      note: measuredNote(postFigures.previous),
    },
    {
      label: "Posts over 1,000 impressions",
      ...posts((p) => p.over1000),
      format: num,
      kind: "diff",
    },
    {
      label: "Best post by impressions",
      ...posts((p) => p.topByImpressions?.impressions ?? null),
      format: num,
      kind: "pct",
    },
    {
      label: "Best post by interactions",
      ...posts((p) => p.topByEngagements?.engagements ?? null),
      format: num,
      kind: "pct",
    },
    { label: "Posts published", ...posts((p) => p.posts), format: num, kind: "diff" },
    {
      label: "Posts that open with hashtags",
      info: "A post whose first line is hashtags hides its point in the feed. Fewer is better.",
      // Left out when neither period has one: a row of zeros says nothing.
      ...(postFigures.current.hashtagFirst || postFigures.previous.hashtagFirst
        ? posts((p) => p.hashtagFirst)
        : { before: null, after: null }),
      format: num,
      kind: "diff",
      better: "down",
    },
  ];
  const perDay: Row[] = [
    { label: "Impressions a day", ...pick((a) => a.impressionsPerDay), format: num, kind: "pct" },
    { label: "Engagements a day", ...pick((a) => a.engagementsPerDay), format: num, kind: "pct" },
    {
      label: "New followers a day",
      ...pick((a) => a.newFollowersPerDay),
      format: num,
      kind: "pct",
    },
  ];
  return (
    <>
      <SectionCard
        title={`${review.currentShort} against ${review.previousShort}`}
        info="LinkedIn's own figures for the account, the same as its analytics export, read from LinkedIn every day."
      >
        <RowsTable review={review} rows={rows} />
      </SectionCard>
      <SectionCard
        title="Per day"
        info="The two periods can differ in length (30 or 31 days, 28 or 29 in February), so a day's average is the fair comparison."
        description={`${num(then.days)} days against ${num(now.days)} days.`}
      >
        <RowsTable review={review} rows={perDay} />
      </SectionCard>
    </>
  );
}

function RowsTable({ review, rows }: { review: MonthlyReview; rows: Row[] }) {
  return (
    <TableWrap wide={false}>
      <thead>
        <tr>
          <th className={th}>Indicator</th>
          <th className={th}>{review.previousShort}</th>
          <th className={th}>{review.currentShort}</th>
          <th className={th}>Change</th>
        </tr>
      </thead>
      <tbody>
        {rows
          .filter((row) => row.before !== null || row.after !== null)
          .map((row) => (
            <tr key={row.label}>
              <td className={cn(td, "font-medium")}>
                <span className="inline-flex items-center gap-0.5">
                  {row.label}
                  {row.info ? <InfoTip text={row.info} label={`About ${row.label}`} /> : null}
                </span>
              </td>
              <td className={td}>
                {row.before === null ? dash : row.format(row.before)}
                {row.note ? (
                  <span className="block text-[13px] text-muted-foreground">{row.note}</span>
                ) : null}
              </td>
              <td className={td}>{row.after === null ? dash : row.format(row.after)}</td>
              <td className={td}>
                <Delta
                  before={row.before}
                  after={row.after}
                  kind={row.kind}
                  {...(row.better ? { better: row.better } : {})}
                />
              </td>
            </tr>
          ))}
      </tbody>
    </TableWrap>
  );
}

export function LinkedInWeeks({ linkedin }: { linkedin: LinkedInReview }) {
  if (!linkedin.weeks.length) return null;
  const best = Math.max(...linkedin.weeks.map((week) => week.impressions));
  return (
    <SectionCard
      title="Week by week"
      info="Seven days at a time from the first day of the earlier period, across both periods. The last block can be shorter."
    >
      <TableWrap>
        <thead>
          <tr>
            <th className={th}>Week</th>
            <th className={th}>Impressions</th>
            <th className={th}>Engagements</th>
            <th className={th}>Engagement rate</th>
            <th className={th}>New followers</th>
          </tr>
        </thead>
        <tbody>
          {linkedin.weeks.map((week) => (
            <tr key={week.label}>
              <td className={cn(td, "font-medium whitespace-nowrap")}>
                {week.label}
                {week.days < 7 ? (
                  <span className="block text-[13px] font-normal text-muted-foreground">
                    {week.days} {week.days === 1 ? "day" : "days"}
                  </span>
                ) : null}
              </td>
              <td className={cn(td, week.impressions === best && "font-semibold")}>
                {num(week.impressions)}
              </td>
              <td className={td}>{num(week.engagements)}</td>
              <td className={td}>{week.rate === null ? dash : pct(week.rate, 1)}</td>
              <td className={td}>{week.newFollowers === null ? dash : num(week.newFollowers)}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </SectionCard>
  );
}

export function LinkedInContent({
  review,
  linkedin,
}: {
  review: MonthlyReview;
  linkedin: LinkedInReview;
}) {
  return (
    <>
      {linkedin.topics.length ? (
        <SectionCard
          title="Topics"
          info="Each topic's engagement rate: its posts' interactions divided by their LinkedIn impressions. A topic with one or two posts is a hint, not a result. A dash means LinkedIn had no impressions for that topic's posts."
        >
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Topic</th>
                <th className={th}>Posts {review.previousShort}</th>
                <th className={th}>Rate {review.previousShort}</th>
                <th className={th}>Posts {review.currentShort}</th>
                <th className={th}>Rate {review.currentShort}</th>
              </tr>
            </thead>
            <tbody>
              {linkedin.topics.map((row) => (
                <tr key={row.topic}>
                  <td className={cn(td, "font-medium")}>{topicName(row.topic)}</td>
                  <td className={td}>{num(row.previous.posts)}</td>
                  <td className={td}>
                    {row.previous.rate === null ? dash : pct(row.previous.rate, 1)}
                  </td>
                  <td className={td}>{num(row.current.posts)}</td>
                  <td className={td}>
                    {row.current.rate === null ? dash : pct(row.current.rate, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </SectionCard>
      ) : null}

      {linkedin.weekdays.length ? (
        <SectionCard
          title="Day of the week"
          info="From LinkedIn's daily figures for the account: each weekday's engagement rate, and its average impressions a day. With four or five of each day in a month, read it as a direction to test."
        >
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Day</th>
                <th className={th}>Rate {review.previousShort}</th>
                <th className={th}>Rate {review.currentShort}</th>
                <th className={th}>Impressions a day, {review.previousShort}</th>
                <th className={th}>Impressions a day, {review.currentShort}</th>
              </tr>
            </thead>
            <tbody>
              {linkedin.weekdays.map((row) => (
                <tr key={row.weekday}>
                  <td className={cn(td, "font-medium")}>{WEEKDAY[row.weekday]}</td>
                  <td className={td}>
                    {row.previous.rate === null ? dash : pct(row.previous.rate, 1)}
                  </td>
                  <td className={td}>
                    {row.current.rate === null ? dash : pct(row.current.rate, 1)}
                  </td>
                  <td className={td}>
                    {row.previous.avgImpressions === null ? dash : num(row.previous.avgImpressions)}
                  </td>
                  <td className={td}>
                    {row.current.avgImpressions === null ? dash : num(row.current.avgImpressions)}
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

function PostTable({
  title,
  rows,
  figures,
  platform,
}: {
  title: string;
  rows: LinkedInPost[];
  figures: LinkedInPostFigures;
  platform: PlatformId;
}) {
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  return (
    <SectionCard
      title={title}
      info="Most impressions first. Tap a post to read it in full. The rate is the post's interactions divided by its LinkedIn impressions."
      description={
        figures.covered
          ? undefined
          : `LinkedIn has impressions for ${num(figures.measured)} of these ${num(figures.posts)} posts; the rest are listed by interactions.`
      }
    >
      <TableWrap>
        <thead>
          <tr>
            <th className={th}>Post</th>
            <th className={th}>Date</th>
            <th className={th}>Impressions</th>
            <th className={th}>Interactions</th>
            <th className={th}>Rate</th>
            <th className={th}>Topic</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.post.postId}
              className={cn(!all && index >= POST_ROWS && "hidden print:table-row")}
            >
              <td className={cn(td, "min-w-[14rem]")}>
                <details>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2">
                    <PostCover post={row.post} className="size-9" />
                    <span className="line-clamp-1">{row.title}</span>
                  </summary>
                  <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground">
                    {row.post.caption.trim() || "(no caption)"}
                  </p>
                  {row.post.url ? (
                    <a
                      href={row.post.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 inline-flex items-center gap-0.5 text-[13px] underline-offset-2 hover:underline"
                    >
                      Open on {PLATFORM_META[platform].label}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : null}
                </details>
              </td>
              <td className={cn(td, "whitespace-nowrap")}>
                {WEEKDAY_SHORT[row.weekday]} {shortDate(row.post.publishedAt)}
              </td>
              <td className={td}>{row.impressions === null ? dash : num(row.impressions)}</td>
              <td className={td}>{num(row.engagements)}</td>
              <td className={td}>{row.rate === null ? dash : pct(row.rate, 1)}</td>
              <td className={td}>{row.topic ? topicName(row.topic) : dash}</td>
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

export function LinkedInPosts({
  review,
  linkedin,
  platform,
}: {
  review: MonthlyReview;
  linkedin: LinkedInReview;
  platform: PlatformId;
}) {
  return (
    <div className="space-y-5">
      <PostTable
        title={`Every post, ${review.currentShort}`}
        rows={linkedin.posts.current}
        figures={linkedin.postFigures.current}
        platform={platform}
      />
      <PostTable
        title={`Every post, ${review.previousShort}`}
        rows={linkedin.posts.previous}
        figures={linkedin.postFigures.previous}
        platform={platform}
      />
    </div>
  );
}
