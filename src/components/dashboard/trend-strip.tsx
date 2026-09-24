import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Flame, RefreshCw, TrendingDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listenerStatusQueryOptions,
  runTrendListener,
  trendsQueryOptions,
} from "@/lib/analytics.functions";
import { PLATFORM_META } from "@/lib/platform-meta";
import type { PlatformId } from "@/lib/analytics-types";

/**
 * Addendum C.4 — "rising in your space", where the team already looks.
 *
 * Fed by the standing listener's stored signals rather than by a per-analysis
 * agent run, which is the whole difference between Phase 1's trend card and
 * Phase 2's listener: momentum only exists because readings accumulated across
 * runs, so this can say "rising" and mean it.
 *
 * Renders nothing at all until the listener has run. An empty strip is better
 * than a strip explaining why it is empty on every page load.
 */
export function TrendStrip({ platform }: { platform: PlatformId }) {
  const meta = PLATFORM_META[platform];
  const queryClient = useQueryClient();
  const { data } = useQuery(trendsQueryOptions(platform));
  const { data: status } = useQuery(listenerStatusQueryOptions);

  const listen = useMutation({
    mutationFn: () => runTrendListener({ data: { platform } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trends", platform] });
    },
  });

  // Nothing detected AND no feed configured: say what is missing, once, rather
  // than rendering an empty card on every page load forever.
  if (!data?.length && status && !status.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Flame className="size-4 text-muted-foreground" aria-hidden />
            Trend listener is off
          </CardTitle>
          <CardDescription>
            Set {status.missing.join(" and ")} in <code>.env</code> to switch it on, then restart
            the dev server. Each run scrapes on a schedule rather than on sync, so it is the one
            place that spends outside a sync — it never runs on its own.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data?.length && !listen.data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Flame className="size-4" style={{ color: meta.color }} aria-hidden />
          Rising in your space
        </CardTitle>
        <CardDescription>
          Detected across repeated checks of this niche, then filtered to what fits the lanes this
          account already publishes into. Momentum is computed, not asserted.
        </CardDescription>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-fit"
          disabled={listen.isPending}
          onClick={() => listen.mutate()}
        >
          <RefreshCw
            className={listen.isPending ? "size-3.5 animate-spin" : "size-3.5"}
            aria-hidden
          />
          {listen.isPending ? "Checking…" : "Check for new trends"}
        </Button>
        {listen.data && !listen.data.ran ? (
          <p className="mt-2 text-xs text-muted-foreground">{listen.data.reason}</p>
        ) : null}
        {listen.data?.ran ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {listen.data.observations} readings stored · {listen.data.rising} rising
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {(data ?? []).map(({ signal, relevance }) => (
            <li key={signal.label} className="rounded-lg border bg-muted/40 p-3">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{signal.label}</span>
                {signal.momentum === "rising" ? (
                  <Badge
                    variant="secondary"
                    className="bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-400"
                  >
                    rising
                    {signal.changePct != null ? ` ${Math.round(signal.changePct * 100)}%` : ""}
                  </Badge>
                ) : signal.momentum === "fading" ? (
                  <Badge variant="secondary" className="bg-muted font-normal">
                    <TrendingDown className="mr-1 size-3" aria-hidden />
                    fading
                  </Badge>
                ) : null}
                {/* Thin data is labelled here exactly as it is for lanes and
                    predictions — a sighting is not a trend. */}
                {signal.directional ? (
                  <Badge variant="secondary" className="bg-muted font-normal">
                    {signal.observations} checks — directional
                  </Badge>
                ) : null}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {relevance.reasons.join("; ")}.
              </span>
              {/* C.4 — link to what established the trend, so the team can
                  judge it rather than take the label on trust. */}
              {signal.evidence?.length ? (
                <span className="mt-1.5 flex flex-wrap gap-2">
                  {signal.evidence.slice(0, 3).map((url, index) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-[11px] font-medium underline underline-offset-2"
                      style={{ color: meta.color }}
                    >
                      <ExternalLink className="size-3" aria-hidden />
                      evidence {index + 1}
                    </a>
                  ))}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
