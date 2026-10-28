// Connecting Pritesh Sir's personal LinkedIn to LinkedIn's own analytics API,
// the one source of the owner-only figures (impressions, members reached).
// Step 1: connect, see the connection, and prove it with a free test read.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Link2, Loader2, PlugZap, Unlink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dateTime } from "@/lib/format";
import {
  disconnectLinkedIn,
  linkedInApiStatusQueryOptions,
  startLinkedInConnect,
  testLinkedInAnalytics,
} from "@/lib/linkedin-api.functions";

const METRIC_LABEL: Record<string, string> = {
  IMPRESSION: "Impressions",
  MEMBERS_REACHED: "Members reached",
  REACTION: "Reactions",
  COMMENT: "Comments",
  RESHARE: "Reposts",
  FOLLOWER_GAINED_FROM_CONTENT: "Followers gained from posts",
  PROFILE_VIEW_FROM_CONTENT: "Profile views from posts",
};

export function LinkedInApiCard() {
  const queryClient = useQueryClient();
  const { data: status } = useQuery(linkedInApiStatusQueryOptions);
  const connect = useMutation({
    mutationFn: () => startLinkedInConnect({ data: { origin: window.location.origin } }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectLinkedIn(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["linkedin-api-status"] }),
  });
  const test = useMutation({ mutationFn: () => testLinkedInAnalytics() });

  if (!status) return null;
  const days = status.expiresAt
    ? Math.max(0, Math.ceil((Date.parse(status.expiresAt) - Date.now()) / 86_400_000))
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">LinkedIn official analytics</CardTitle>
            <CardDescription>
              LinkedIn&rsquo;s own API for Pritesh Sir&rsquo;s personal profile: impressions,
              members reached and followers gained from his posts, which scraping cannot see.
              Pritesh Sir signs in to LinkedIn once and presses Allow; nothing is posted and it
              costs nothing.
            </CardDescription>
          </div>
          <Badge variant={status.connected ? "secondary" : "outline"} className="shrink-0 gap-1">
            {status.connected ? (
              <CheckCircle2 className="size-3" aria-hidden />
            ) : (
              <PlugZap className="size-3" aria-hidden />
            )}
            {status.connected ? "Connected" : "Not connected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!status.configured ? (
          <p className="text-muted-foreground">
            Add <code className="rounded bg-muted px-1 py-0.5 text-xs">LINKEDIN_CLIENT_ID</code> and{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">LINKEDIN_CLIENT_SECRET</code>{" "}
            (LinkedIn Developer app → Auth) to the server&rsquo;s settings first.
          </p>
        ) : status.connected ? (
          <p className="text-muted-foreground">
            Connected {status.connectedAt ? dateTime(status.connectedAt) : ""}
            {status.connectedBy ? ` by ${status.connectedBy}` : ""}. Expires{" "}
            {status.expiresAt ? dateTime(status.expiresAt) : "—"}
            {days !== null ? ` (${days} days)` : ""}; connect again before then.
          </p>
        ) : status.expiresAt ? (
          <p className="text-destructive">
            The connection expired {dateTime(status.expiresAt)}. Connect again to keep the figures
            updating.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Sign in as Pritesh Sir: the LinkedIn account signed in on this browser is the one that
            gets connected.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {status.configured ? (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={connect.isPending}
              onClick={() => connect.mutate()}
            >
              {connect.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Link2 className="size-3.5" aria-hidden />
              )}
              {status.connected ? "Connect again" : "Connect LinkedIn"}
            </Button>
          ) : null}
          {status.connected ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={test.isPending}
                onClick={() => test.mutate()}
              >
                {test.isPending ? "Reading…" : "Test: last 30 days"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate()}
              >
                <Unlink className="size-3.5" aria-hidden />
                Disconnect
              </Button>
            </>
          ) : null}
        </div>

        {connect.error ? <p className="text-xs text-destructive">{connect.error.message}</p> : null}
        {test.error ? <p className="text-xs text-destructive">{test.error.message}</p> : null}
        {test.data ? (
          <div className="rounded-md border p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              All of his posts, {dateTime(test.data.from)} – {dateTime(test.data.to)}
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {Object.entries(test.data.totals).map(([metric, value]) => (
                <div key={metric}>
                  <dt className="text-xs text-muted-foreground">
                    {METRIC_LABEL[metric] ?? metric}
                  </dt>
                  <dd className="font-medium">
                    {value === null ? "not available" : value.toLocaleString("en-US")}
                  </dd>
                </div>
              ))}
            </dl>
            {test.data.errors.length ? (
              <p className="mt-2 text-xs text-muted-foreground">
                LinkedIn refused: {test.data.errors.join("; ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
