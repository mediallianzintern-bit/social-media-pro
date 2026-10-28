import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { finishLinkedInConnect } from "@/lib/linkedin-api.functions";

/**
 * Where LinkedIn sends the browser back after Pritesh Sir presses Allow (or
 * Cancel). Inside the signed-in app, so only staff can complete a connection,
 * and the server checks the `state` was minted for the same staff member.
 * Registered in the LinkedIn app's Auth tab as {origin}/connect/linkedin.
 */
export const Route = createFileRoute("/_app/connect/linkedin")({
  validateSearch: z.object({
    code: z.string().optional(),
    state: z.string().optional(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }),
  component: LinkedInCallback,
});

function LinkedInCallback() {
  const { code, state, error, error_description: errorDescription } = Route.useSearch();
  // LinkedIn's code is single use, and sending one twice makes LinkedIn REVOKE
  // the token the first exchange received (the OAuth rule for a replayed code).
  // React's development mode mounts this page twice, and the first real
  // connection was stored and then revoked a moment later because of it. A
  // query keyed on the code is one request however many times the page mounts,
  // and it is never retried or refetched.
  const finish = useQuery({
    queryKey: ["linkedin-connect", code],
    queryFn: () =>
      finishLinkedInConnect({
        data: { code: code!, state: state!, origin: window.location.origin },
      }),
    enabled: Boolean(code && state && !error),
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const refused = error ? (errorDescription ?? error) : null;
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Connecting LinkedIn</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {refused ? (
          <p className="flex items-start gap-2 text-destructive">
            <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            LinkedIn did not connect: {refused}
          </p>
        ) : !code || !state ? (
          <p className="text-muted-foreground">
            Nothing to finish here. Start from Data sources → Connect LinkedIn.
          </p>
        ) : finish.isPending ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Finishing the connection…
          </p>
        ) : finish.error ? (
          <p className="flex items-start gap-2 text-destructive">
            <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {finish.error.message}
          </p>
        ) : (
          <p className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
            Connected. The dashboard can now read his post impressions and reach from LinkedIn.
          </p>
        )}
        <Button asChild size="sm" variant="outline">
          <Link to="/sources" search={(previous) => ({ range: previous.range ?? "era" })}>
            Back to Data sources
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
