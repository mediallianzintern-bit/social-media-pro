// The Discovery and Engagement cards of Pritesh Sir's LinkedIn Content
// analytics screen, for the period selected on the dashboard, measured by
// LinkedIn's own API: his whole account, day by day (server/linkedin-analytics
// refreshMemberDaily), not only the posts the scraper found.
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bookmark,
  Globe,
  MessageCircle,
  Repeat2,
  Send,
  ThumbsUp,
  Users,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResolvedRange } from "@/lib/date-range";
import { delta, fullNumber, shortDate, signedPercent } from "@/lib/format";
import { periodOf, socialEngagements, type PeriodTotals } from "@/lib/linkedin-analytics";
import { linkedInPeriodQueryOptions } from "@/lib/linkedin-api.functions";

function Change({ now, before }: { now: number; before: number | null }) {
  if (before === null) return null;
  const change = delta(now, before);
  if (change === null) return null;
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        up ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
      }`}
      title={`${fullNumber(now)} now, ${fullNumber(before)} in the previous period`}
    >
      <Icon className="size-3.5" aria-hidden />
      {signedPercent(change)} vs previous period
    </span>
  );
}

function Big({ value, label, change }: { value: string; label: string; change?: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-3xl font-bold tabular-nums">{value}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </p>
      {change}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ThumbsUp;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" aria-hidden />
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function LinkedInDiscovery({ range }: { range: ResolvedRange }) {
  const period = periodOf(range);
  const { data } = useQuery(linkedInPeriodQueryOptions(period));
  if (!data?.period) return null;
  const now: PeriodTotals = data.period;
  const before = data.prior;
  const source = `Measured by LinkedIn for his whole account, ${range.label.charAt(0).toLowerCase()}${range.label.slice(1)}${data.lastDay ? `; days up to ${shortDate(data.lastDay)}` : ""}. Daily data is recorded in UTC.`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discovery</CardTitle>
          <CardDescription>{source}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Big
            value={fullNumber(now.impressions)}
            label="Impressions"
            change={<Change now={now.impressions} before={before?.impressions ?? null} />}
          />
          <div className="space-y-2 border-y py-3">
            <Row icon={Users} label="In-network (followers and connections)" value="—" />
            <Row icon={Globe} label="Out-of-network" value="—" />
            <p className="text-xs text-muted-foreground">
              Not offered by LinkedIn&rsquo;s API; shown only on his own LinkedIn screen.
            </p>
          </div>
          <Big
            value={data.membersReached === null ? "—" : fullNumber(data.membersReached)}
            label="Members reached"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engagement</CardTitle>
          <CardDescription>{source}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Big
            value={fullNumber(socialEngagements(now))}
            label="Social engagements"
            change={
              <Change
                now={socialEngagements(now)}
                before={before ? socialEngagements(before) : null}
              />
            }
          />
          <div className="space-y-2.5 border-t pt-3">
            <Row icon={ThumbsUp} label="Reactions" value={fullNumber(now.reactions)} />
            <Row icon={MessageCircle} label="Comments" value={fullNumber(now.comments)} />
            <Row icon={Repeat2} label="Reposts" value={fullNumber(now.reposts)} />
            <Row icon={Bookmark} label="Saves" value={fullNumber(now.saves)} />
            <Row icon={Send} label="Sends on LinkedIn" value={fullNumber(now.sends)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
