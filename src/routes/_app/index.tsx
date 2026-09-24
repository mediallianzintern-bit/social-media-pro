import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Info, Users } from "lucide-react";

import { GrowthChart } from "@/components/dashboard/growth-chart";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { compactNumber, fullNumber, percent } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform-meta";
import { useFilteredDashboard } from "@/lib/use-dashboard";
import {
  cadence,
  engagementRate,
  engagementsOf,
  median,
  organicPosts,
  type PlatformData,
} from "@/lib/analytics-types";

export const Route = createFileRoute("/_app/")({ component: Overview });

function summarize(data: PlatformData) {
  const followers = data.latest?.followers ?? 0;
  // Pinned posts are excluded from every rate — see organicPosts.
  const organic = organicPosts(data.posts);
  const views = organic.map((post) => post.views).filter((value) => value > 0);
  return {
    followers,
    hasViews: views.length > 0,
    medianViews: median(views),
    medianEngagements: median(organic.map((post) => engagementsOf(post))),
    rate: engagementRate(data.posts, followers),
    perWeek: cadence(data.posts),
    posts: organic.length,
  };
}

function Overview() {
  const { data, range } = useFilteredDashboard();
  const reporting = data.platforms.filter((p) => p.status === "ok");
  const totalFollowers = reporting.reduce((sum, p) => sum + (p.latest?.followers ?? 0), 0);

  return (
    <>
      {/* Addendum A.6 — the goal and its trajectory, front and centre. The
          agency console proper needs multi-client; this is the single-client
          stand-in, showing the same thing a console row would. */}
      {data.goal ? (
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-xs font-bold uppercase tracking-wider">
              Goal &mdash; {data.goal.label}
            </CardDescription>
            <CardTitle className="text-lg">
              Judged on {data.goal.primaryMetric.replace(/_/g, " ")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {reporting.map((platform) => {
              const meta = PLATFORM_META[platform.platform];
              const t = platform.trajectory;
              return (
                <div key={platform.platform} className="rounded-lg border p-3">
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    {t ? (
                      <span
                        className={
                          t.trend === "declining"
                            ? "text-xs font-medium text-destructive"
                            : t.trend === "accelerating"
                              ? "text-xs font-medium text-emerald-600"
                              : "text-xs font-medium text-muted-foreground"
                        }
                      >
                        {t.trend}
                      </span>
                    ) : null}
                  </span>
                  {t ? (
                    <>
                      <span className="mt-1 block text-2xl font-bold tabular-nums">
                        {t.ratePerWeek >= 0 ? "+" : ""}
                        {t.ratePerWeek}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          / week
                        </span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t.sinceEngagementStart >= 0 ? "+" : ""}
                        {t.sinceEngagementStart} since we started
                        {t.directional ? " \u00b7 directional, not a result" : ""}
                      </span>
                    </>
                  ) : (
                    <span className="mt-1 block text-sm text-muted-foreground">
                      No growth history stored yet.
                    </span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {data.ephemeral && !data.setupError ? (
        <Alert>
          <Info className="size-4" aria-hidden />
          <AlertTitle>History is not being saved yet</AlertTitle>
          <AlertDescription>
            Syncs are working and every number below is live, but snapshots are held in memory and
            are lost when the server restarts &mdash; so the follower growth curve cannot build up.
            Add <code className="rounded bg-muted px-1 py-0.5">SUPABASE_SERVICE_ROLE_KEY</code> to{" "}
            <code className="rounded bg-muted px-1 py-0.5">.env</code> and run the migration to keep
            history.{" "}
            <Link to="/sources" className="font-medium underline underline-offset-4">
              Setup steps
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      {data.setupError ? (
        <Alert>
          <Info className="size-4" aria-hidden />
          <AlertTitle>Setup needed before the first sync</AlertTitle>
          <AlertDescription>
            {data.setupError}.{" "}
            <Link to="/sources" className="font-medium underline underline-offset-4">
              See what to add
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-label="Combined audience" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiTile
          label="Total audience"
          value={fullNumber(totalFollowers)}
          icon={Users}
          hint={`across ${reporting.length} platform${reporting.length === 1 ? "" : "s"} · ${range.label.toLowerCase()}`}
        />
        {reporting.map((platform) => {
          const meta = PLATFORM_META[platform.platform];
          const stats = summarize(platform);
          return (
            <KpiTile
              key={platform.platform}
              label={`${meta.label} followers`}
              value={fullNumber(stats.followers)}
              icon={meta.icon}
              accent={meta.color}
              hint={`${stats.perWeek.toFixed(1)} posts/wk`}
            />
          );
        })}
      </section>

      <p className="-mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
        Followers is the only figure that means the same thing on both platforms, so it is the only
        one added up. Instagram publishes view counts and LinkedIn does not, so their engagement
        rates use different denominators and are shown separately, never combined.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.platforms.map((platform) => {
          const meta = PLATFORM_META[platform.platform];
          const stats = summarize(platform);
          return (
            <Card key={platform.platform}>
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex size-9 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: meta.color }}
                  >
                    <meta.icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <CardTitle className="text-base">{meta.label}</CardTitle>
                    <CardDescription>
                      {platform.latest?.handle ?? platform.profileUrl.replace("https://www.", "")}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {platform.status === "ok" && platform.latest ? (
                  <>
                    <dl className="grid grid-cols-3 gap-3">
                      <div>
                        <dt className="text-xs text-muted-foreground">Followers</dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                          {fullNumber(stats.followers)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {stats.hasViews ? "Med. views" : "Med. interactions"}
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                          {compactNumber(
                            stats.hasViews ? stats.medianViews : stats.medianEngagements,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Eng. rate</dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                          {percent(stats.rate, 2)}
                        </dd>
                      </div>
                    </dl>
                    <GrowthChart points={platform.growth} color={meta.color} />
                  </>
                ) : (
                  <p className="rounded-md border border-dashed p-4 text-xs leading-relaxed text-muted-foreground">
                    {platform.status === "error"
                      ? platform.error
                      : platform.status === "unconfigured"
                        ? `Waiting on ${platform.missingEnv?.join(", ")}.`
                        : "No snapshot stored yet — press Sync."}
                  </p>
                )}

                <Link
                  to={meta.route}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold underline underline-offset-4"
                >
                  Open {meta.label}
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
