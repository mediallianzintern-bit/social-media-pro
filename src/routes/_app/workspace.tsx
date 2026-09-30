import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { SectionHeading } from "@/components/dashboard/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { advanceIdea, workspaceQueryOptions } from "@/lib/analytics.functions";
import { PLATFORM_META } from "@/lib/platform-meta";
import {
  ROLE_LABEL,
  STATUS_LABEL,
  transitionsForAny,
  type Role,
  type Transition,
} from "@/lib/roles";
import type { WorkItem, Workspace } from "@/lib/workspace-types";

export const Route = createFileRoute("/_app/workspace")({ component: WorkspacePage });

const ROLES: Role[] = ["growth_manager", "creator", "editor", "team_manager"];

/**
 * Addendum B.3 — where an idea actually gets worked on.
 *
 * The lifecycle, the transition table and the server-side permission check
 * have existed since migration 0008; nothing in the interface reached any of
 * it, so every suggestion this system produced was stuck at "suggested"
 * forever. That is not only a missing screen: the transitions ARE the learning
 * loop's input. An idea that can never be marked published can never be graded
 * against what it did, which is why the §7 scorecard has 28 suggestions and
 * zero outcomes to score.
 *
 * Roles are CHOSEN here rather than looked up, because per-user roles (T46)
 * do not exist yet. The choice is a lens on the queue, never a permission: the
 * server re-checks every move against the transition table and the actor's
 * real assignments, so picking "growth manager" in this switcher grants
 * nothing. When T46 lands this becomes a default rather than a control.
 */
function WorkspacePage() {
  const [role, setRole] = useState<Role>("growth_manager");
  const { data, isLoading } = useQuery(workspaceQueryOptions(role));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {ROLES.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={option === role ? "default" : "outline"}
            onClick={() => setRole(option)}
          >
            {ROLE_LABEL[option]}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isLoading ? "Loading…" : (data?.today.headline ?? "Nothing waiting.")}
          </CardTitle>
          <CardDescription>
            What is waiting on the {ROLE_LABEL[role].toLowerCase()} right now. Moving an idea along
            here is also what links it to the post it becomes, which is how the scorecard learns.
          </CardDescription>
        </CardHeader>
        {data?.noUsers ? (
          <CardContent>
            <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              No team members have been added yet, so every role falls back to this single login.
              Moves are still checked against the lifecycle rules on the server.
            </p>
          </CardContent>
        ) : null}
      </Card>

      {data?.rollup ? <Rollup rollup={data.rollup} /> : null}

      <SectionHeading
        title="Queue"
        note={`${data?.items.length ?? 0} item${data?.items.length === 1 ? "" : "s"} · ${ROLE_LABEL[role]}`}
      />

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </CardContent>
        </Card>
      ) : data?.items.length ? (
        <div className="space-y-3">
          {data.items.map((item) => (
            <WorkCard key={item.id} item={item} role={role} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">
              Nothing in this queue. Ideas reach the growth manager first, and only move on once
              approved — so an empty creator queue usually means nothing has been approved yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Rollup({ rollup }: { rollup: NonNullable<Workspace["rollup"]> }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
        <div>
          <p className="text-2xl font-semibold tabular-nums">{rollup.adoptionPct}%</p>
          <p className="text-xs text-muted-foreground">
            of suggestions were made ({rollup.published} of {rollup.suggested})
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rollup.byStatus.map(({ status, count }) => (
            <Badge key={status} variant="outline" className="font-normal">
              {STATUS_LABEL[status]} · <span className="tabular-nums">{count}</span>
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function WorkCard({ item, role }: { item: WorkItem; role: Role }) {
  const queryClient = useQueryClient();
  const [shortcode, setShortcode] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  const moves = transitionsForAny([role], item.status);
  const accent = PLATFORM_META[item.platform].color;

  const mutation = useMutation({
    mutationFn: (move: Transition) =>
      advanceIdea({
        data: {
          id: item.id,
          from: item.status,
          to: move.to,
          role,
          ...(move.needsPermalink && shortcode.trim() ? { shortcode: shortcode.trim() } : {}),
        },
      }),
    onSuccess: async (result) => {
      // A refusal comes back as ok:false rather than a thrown error — the two
      // reasons the server distinguishes (not allowed, versus someone moved it
      // first) are both worth showing verbatim.
      if (!result.ok) {
        setFailure(result.reason ?? "That move was refused.");
        return;
      }
      setFailure(null);
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (error) => setFailure(String(error)),
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" style={{ color: accent }} className="font-medium">
            {PLATFORM_META[item.platform].label}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {STATUS_LABEL[item.status]}
          </Badge>
          {item.contentLane ? (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {item.contentLane}
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {item.ageDays === 0 ? "today" : `waiting ${item.ageDays}d`}
          </span>
        </div>

        <p className="text-sm font-medium leading-snug">{item.hook}</p>
        {item.whyNow ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{item.whyNow}</p>
        ) : null}
        {item.winningTrait ? (
          <p className="text-xs text-muted-foreground">
            Reproduces: <span className="font-medium">{item.winningTrait}</span>
          </p>
        ) : null}

        {moves.some((move) => move.needsPermalink) ? (
          <div className="space-y-1.5">
            <Input
              value={shortcode}
              onChange={(event) => setShortcode(event.target.value)}
              placeholder="Post link or shortcode"
              className="h-8 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Linking the published post is what lets the scorecard grade this idea against the
              account&rsquo;s own median. Without it the idea is marked made but never measured.
            </p>
          </div>
        ) : null}

        {moves.length ? (
          <div className="flex flex-wrap gap-2">
            {moves.map((move) => (
              <Button
                key={`${move.to}-${move.action}`}
                size="sm"
                variant={move.to === "dismissed" ? "outline" : "default"}
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(move)}
              >
                {mutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : null}
                {move.action}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nothing for a {ROLE_LABEL[role].toLowerCase()} to do at this stage.
          </p>
        )}

        {failure ? <p className="text-xs text-destructive">{failure}</p> : null}
      </CardContent>
    </Card>
  );
}
