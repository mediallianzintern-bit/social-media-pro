// Active accounts, in Settings (25 Nov 2026): every client Pro measures, for
// everyone to see. An admin can pause, resume or delete a client from Studio;
// the server checks that it is an admin asking (server/clients/manage.ts), so
// hiding the buttons is a courtesy, not the protection. Pritesh, the main
// client, can be neither paused nor deleted.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Loader2, Pause, Play, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clientAccountsQueryOptions,
  deleteClientFn,
  setClientStatusFn,
} from "@/lib/clients.functions";
import { shortDate } from "@/lib/format";
import type { ClientAccount } from "@/server/clients/manage";

export function ActiveAccounts() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data, isLoading, error } = useQuery(clientAccountsQueryOptions);
  const [deleting, setDeleting] = useState<ClientAccount | null>(null);
  const [typed, setTyped] = useState("");

  // A paused or deleted client may be the one someone has chosen: refetch
  // everything, the switcher and the dashboard included.
  async function refresh() {
    await queryClient.invalidateQueries();
    await router.invalidate();
  }

  const status = useMutation({
    mutationFn: (input: { id: string; status: "active" | "paused" }) =>
      setClientStatusFn({ data: input }),
    onSuccess: (result) => {
      if (result.ok) void refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (input: { id: string; confirmName: string }) => deleteClientFn({ data: input }),
    onSuccess: (result) => {
      if (result.ok) {
        setDeleting(null);
        setTyped("");
        void refresh();
      }
    },
  });

  const admin = Boolean(data?.canManage);
  const accounts = data?.accounts ?? [];
  const active = accounts.filter((account) => account.status === "active");
  const paused = accounts.filter((account) => account.status !== "active");
  const problem =
    (status.data && !status.data.ok ? status.data.reason : null) ??
    (status.error instanceof Error ? status.error.message : null);
  const deleteProblem =
    (remove.data && !remove.data.ok ? remove.data.reason : null) ??
    (remove.error instanceof Error ? remove.error.message : null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Active accounts</CardTitle>
        <CardDescription className="text-sm">
          {admin
            ? "Every client Pro measures. As an admin, you can pause or delete a client from Studio."
            : "Every client Pro measures. Only an admin can pause or delete a client."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading the clients…
          </p>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            {error instanceof Error ? error.message : "The clients could not be loaded."}
          </p>
        ) : (
          <>
            <AccountList
              accounts={active}
              admin={admin}
              busy={status.isPending}
              onPause={(account) => status.mutate({ id: account.id, status: "paused" })}
              onDelete={(account) => {
                remove.reset();
                setTyped("");
                setDeleting(account);
              }}
            />
            {paused.length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Paused</p>
                <p className="text-[13px] text-muted-foreground">
                  Not in the client switcher and not refreshed. Their data is kept, and a Studio
                  import does not bring them back; only Resume does.
                </p>
                <AccountList
                  accounts={paused}
                  admin={admin}
                  busy={status.isPending}
                  onResume={(account) => status.mutate({ id: account.id, status: "active" })}
                  onDelete={(account) => {
                    remove.reset();
                    setTyped("");
                    setDeleting(account);
                  }}
                />
              </div>
            ) : null}
          </>
        )}
        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : null}
      </CardContent>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.displayName}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                This removes the client from Pro for good: its refresh history, competitors, lanes,
                ideas and learning. It cannot be undone.
              </span>
              <span className="block">
                If it is still linked in Studio, the next &ldquo;Import clients from Studio&rdquo;
                adds it back with no history. Unlink it in Studio first, or pause it instead.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-delete-client">
              Type <span className="font-semibold">{deleting?.displayName}</span> to confirm
            </Label>
            <Input
              id="confirm-delete-client"
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
            {deleteProblem ? (
              <p role="alert" className="text-sm text-destructive">
                {deleteProblem}
              </p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={
                remove.isPending || !deleting || typed.trim() !== deleting.displayName.trim()
              }
              onClick={() => deleting && remove.mutate({ id: deleting.id, confirmName: typed })}
            >
              {remove.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
              Delete client
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function AccountList({
  accounts,
  admin,
  busy,
  onPause,
  onResume,
  onDelete,
}: {
  accounts: ClientAccount[];
  admin: boolean;
  busy: boolean;
  onPause?: (account: ClientAccount) => void;
  onResume?: (account: ClientAccount) => void;
  onDelete: (account: ClientAccount) => void;
}) {
  if (!accounts.length) return <p className="text-sm text-muted-foreground">No clients here.</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {accounts.map((account) => {
        const handles = [
          account.instagramHandle ? `@${account.instagramHandle}` : null,
          account.linkedinHandle ? `in/${account.linkedinHandle}` : null,
        ].filter(Boolean);
        return (
          <li key={account.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span className="truncate">{account.displayName}</span>
                <Badge variant="secondary" className="text-[13px] font-normal">
                  {account.service === "full" ? "Full service" : "Tracking"}
                </Badge>
                {account.isDefault ? (
                  <Badge variant="outline" className="text-[13px] font-normal">
                    Main client
                  </Badge>
                ) : null}
              </p>
              <p className="truncate text-[13px] text-muted-foreground">
                {handles.length ? handles.join(" · ") : "No accounts"}
                {account.source === "studio" ? " · from Studio" : ""}
                {account.lastSyncedAt ? ` · refreshed ${shortDate(account.lastSyncedAt)}` : ""}
              </p>
            </div>
            {admin && !account.isDefault ? (
              <div className="flex gap-2">
                {account.status === "active" && onPause ? (
                  <Button
                    variant="outline"
                    className="h-11 gap-2"
                    disabled={busy}
                    onClick={() => onPause(account)}
                    aria-label={`Pause ${account.displayName}`}
                  >
                    <Pause className="size-4" aria-hidden /> Pause
                  </Button>
                ) : null}
                {account.status !== "active" && onResume ? (
                  <Button
                    variant="outline"
                    className="h-11 gap-2"
                    disabled={busy}
                    onClick={() => onResume(account)}
                    aria-label={`Resume ${account.displayName}`}
                  >
                    <Play className="size-4" aria-hidden /> Resume
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="h-11 gap-2 text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => onDelete(account)}
                  aria-label={`Delete ${account.displayName}`}
                >
                  <Trash2 className="size-4" aria-hidden /> Delete
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
