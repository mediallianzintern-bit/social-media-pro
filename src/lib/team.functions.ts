// Team and roles in Settings (server/team.ts). Every call passes the staff
// check registered in src/start.ts, and who is asking is read from that
// session, never from the request.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const roleSchema = z.enum(["growth_manager", "creator", "editor", "team_manager"]);

export const getTeamRoles = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  const { loadTeam } = await import("@/server/team");
  return loadTeam(context.staffEmail);
});

export const teamRolesQueryOptions = {
  queryKey: ["team-roles"] as const,
  queryFn: () => getTeamRoles(),
  staleTime: 30 * 1000,
};

export const changeTeamRole = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ userId: z.string().uuid(), role: roleSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { setRole } = await import("@/server/team");
    return setRole({ ...data, staffEmail: context.staffEmail });
  });

export const addTeamMember = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        email: z.string().min(3).max(200),
        name: z.string().max(120).default(""),
        role: roleSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { addMember } = await import("@/server/team");
    return addMember({ ...data, staffEmail: context.staffEmail });
  });
