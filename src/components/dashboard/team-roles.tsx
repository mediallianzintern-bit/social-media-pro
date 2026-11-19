// Team and roles, in Settings (13 Nov 2026): everyone on the team with what
// they may do, a role menu beside each person for an admin, and a box to add
// someone before their first sign-in. Anyone else sees the list, read only.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTION, ROLE_LABEL, ROLE_ORDER, type Role } from "@/lib/roles";
import { addTeamMember, changeTeamRole, teamRolesQueryOptions } from "@/lib/team.functions";

export function TeamRoles() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery(teamRolesQueryOptions);
  const refresh = () => queryClient.invalidateQueries({ queryKey: teamRolesQueryOptions.queryKey });

  const change = useMutation({
    mutationFn: (input: { userId: string; role: Role }) => changeTeamRole({ data: input }),
    onSuccess: (result) => {
      if (result.ok) void refresh();
    },
  });

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const add = useMutation({
    mutationFn: () => addTeamMember({ data: { email, name, role } }),
    onSuccess: (result) => {
      if (result.ok) {
        setEmail("");
        setName("");
        setRole("editor");
        void refresh();
      }
    },
  });

  const admin = Boolean(data?.access.canManageTeam);
  const team = [...(data?.team ?? [])].sort(
    (a, b) =>
      ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name),
  );
  const problem =
    (change.data && !change.data.ok ? change.data.reason : null) ??
    (change.error instanceof Error ? change.error.message : null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team and roles</CardTitle>
        <CardDescription className="text-sm">
          {admin
            ? "You are an admin, so you decide what each person may do."
            : data
              ? `You are ${ROLE_LABEL[data.access.roles[0] ?? "creator"].toLowerCase()}. Only an admin can change roles.`
              : "Who is on the team and what each person may do."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading the team…
          </p>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            {error instanceof Error ? error.message : "The team could not be loaded."}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {team.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {member.name}
                    {member.isYou ? (
                      <Badge
                        variant="secondary"
                        className="ml-2 align-middle text-[13px] font-normal"
                      >
                        You
                      </Badge>
                    ) : null}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {member.email ?? "No email"}
                  </p>
                </div>
                {admin ? (
                  <Select
                    value={member.role}
                    disabled={change.isPending}
                    onValueChange={(value) =>
                      change.mutate({ userId: member.id, role: value as Role })
                    }
                  >
                    <SelectTrigger className="h-11 w-48" aria-label={`Role for ${member.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* The three roles a person can be given, and their current
                          one if it is no longer offered (Content creator). */}
                      {[
                        ...ASSIGNABLE_ROLES,
                        ...(ASSIGNABLE_ROLES.includes(member.role) ? [] : [member.role]),
                      ].map((option) => (
                        <SelectItem
                          key={option}
                          value={option}
                          disabled={!ASSIGNABLE_ROLES.includes(option)}
                        >
                          {ROLE_LABEL[option]}
                          {ASSIGNABLE_ROLES.includes(option) ? "" : " (no longer offered)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className="px-3 py-1 text-[13px] font-medium">
                    {ROLE_LABEL[member.role]}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : null}

        {admin ? (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-semibold">Add a person</p>
            <p className="text-[13px] text-muted-foreground">
              They get this role the first time they sign in with this email.
            </p>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_12rem]">
              <div className="space-y-1.5">
                <Label htmlFor="member-email" className="text-[13px]">
                  Email
                </Label>
                <Input
                  id="member-email"
                  type="email"
                  className="h-11"
                  placeholder="name@mediallianz.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-name" className="text-[13px]">
                  Name <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="member-name"
                  className="h-11"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Role</Label>
                <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                  <SelectTrigger className="h-11" aria-label="Role for the new person">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {ROLE_LABEL[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              className="h-11 gap-2"
              disabled={!email.trim() || add.isPending}
              onClick={() => add.mutate()}
            >
              {add.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <UserPlus className="size-4" aria-hidden />
              )}
              Add to the team
            </Button>
            {add.data && !add.data.ok ? (
              <p role="alert" className="text-sm text-destructive">
                {add.data.reason}
              </p>
            ) : null}
          </div>
        ) : null}

        <dl className="grid gap-3 sm:grid-cols-2">
          {ASSIGNABLE_ROLES.map((option) => (
            <div key={option} className="rounded-lg bg-muted/50 p-3">
              <dt className="text-sm font-semibold">{ROLE_LABEL[option]}</dt>
              <dd className="text-[13px] text-muted-foreground">{ROLE_DESCRIPTION[option]}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
