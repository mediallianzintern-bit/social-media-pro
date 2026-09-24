import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ExternalLink, PlugZap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLATFORM_META } from "@/lib/platform-meta";
import { useDashboard } from "@/lib/use-dashboard";

export const Route = createFileRoute("/_app/sources")({ component: Sources });

/** Which Apify actor supplies each platform, and what it costs per sync. */
const ACTORS: Record<string, Array<{ name: string; url: string; gives: string; cost: string }>> = {
  instagram: [
    {
      name: "apify/instagram-profile-scraper",
      url: "https://apify.com/apify/instagram-profile-scraper",
      gives: "Followers, following, post count, and recent posts with views, likes and comments",
      cost: "$0.0026 per profile",
    },
  ],
  linkedin: [
    {
      name: "harvestapi/linkedin-profile-scraper",
      url: "https://apify.com/harvestapi/linkedin-profile-scraper",
      gives: "Follower count, connections, headline",
      cost: "$0.004 per profile",
    },
    {
      name: "harvestapi/linkedin-profile-posts",
      url: "https://apify.com/harvestapi/linkedin-profile-posts",
      gives: "Recent posts with reactions, comments and reposts",
      cost: "$0.002 per post",
    },
  ],
};

const NOT_AVAILABLE = [
  ["Impressions / reach", "Owner-only; never rendered on a public profile"],
  ["Profile visits, link taps", "Owner-only"],
  ["Audience age, gender, location", "Owner-only"],
  ["Video retention, watch time", "Owner-only"],
  ["Saves and shares (Instagram)", "Not published publicly"],
];

function Sources() {
  const data = useDashboard();

  return (
    <>
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Every number in this dashboard is scraped from the public profile through Apify and stored
        on each sync. Credentials are read from{" "}
        <code className="rounded bg-muted px-1 py-0.5">.env</code> on the server and never reach the
        browser.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.platforms.map((platform) => {
          const meta = PLATFORM_META[platform.platform];
          const connected = platform.status === "ok" || platform.status === "empty";
          return (
            <Card key={platform.platform}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
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
                        {platform.profileUrl.replace("https://www.", "")}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant={connected ? "secondary" : "outline"} className="gap-1">
                    {connected ? (
                      <CheckCircle2 className="size-3" aria-hidden />
                    ) : (
                      <PlugZap className="size-3" aria-hidden />
                    )}
                    {connected ? "Ready" : "Needs setup"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {platform.missingEnv?.length ? (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Add to <code className="rounded bg-muted px-1 py-0.5">.env</code>:
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {platform.missingEnv.map((name) => (
                        <li key={name}>
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{name}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <ul className="space-y-3">
                  {(ACTORS[platform.platform] ?? []).map((actor) => (
                    <li key={actor.name} className="border-l-2 border-border pl-3">
                      <a
                        href={actor.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-4"
                      >
                        {actor.name}
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {actor.gives}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{actor.cost}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What scraping cannot reach</CardTitle>
          <CardDescription>
            These metrics are visible only to the account owner inside the platform&rsquo;s own
            analytics. They are absent from this dashboard rather than estimated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Metric</TableHead>
                  <TableHead>Why it is not here</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {NOT_AVAILABLE.map(([metric, reason]) => (
                  <TableRow key={metric}>
                    <TableCell className="font-medium">{metric}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-4 border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
            Instagram&rsquo;s versions of these become available if{" "}
            <strong className="font-medium text-foreground">@priteshpatel.co</strong> is switched to
            a Business or Creator account and linked to a Facebook Page &mdash; the Meta Graph API
            then serves reach, impressions, profile visits and demographics. LinkedIn publishes no
            equivalent API for personal profiles at any tier.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
