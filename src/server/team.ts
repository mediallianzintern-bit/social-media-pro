// Team and roles, for Settings (13 Nov 2026): who is on the team, what each
// person may do, and adding someone before their first sign-in.
//
// Built on T46 (server/workspace.ts accessFor and changeRole): who is asking
// and what they hold is read from the verified session, never from the
// request, and only an admin (team_manager) changes anything.
import { ASSIGNABLE_ROLES, type Role } from "@/lib/roles";
import type { Access, TeamMember } from "@/lib/workspace-types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { hasDurableStore, readUsers, saveUser } from "./store";
import { accessFor, changeRole, syncTeamFromLogins } from "./workspace";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

export async function loadTeam(
  staffEmail: string,
): Promise<{ access: Access; team: TeamMember[] }> {
  const access = await accessFor(staffEmail);
  await syncTeamFromLogins();
  const users = await readUsers().catch(() => []);
  return {
    access,
    team: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isYou: user.id === access.userId,
    })),
  };
}

/**
 * Changes one person's role. A role given per account (client_assignments)
 * overrides the main one, so it is cleared: otherwise a person assigned every
 * role on the account would keep them all whatever Settings says.
 */
export async function setRole(input: {
  staffEmail: string;
  userId: string;
  role: Role;
}): Promise<{ ok: boolean; reason?: string }> {
  const result = await changeRole(input);
  if (!result.ok || !hasDurableStore()) return result;
  const { error } = await db().from("client_assignments").delete().eq("user_id", input.userId);
  if (error) {
    return {
      ok: false,
      reason: `The role changed, but an older account role stays: ${error.message}`,
    };
  }
  return result;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adds someone to the team before their first sign-in, with the role they
 * should have. When they sign in with this address, they are already it.
 */
export async function addMember(input: {
  staffEmail: string;
  email: string;
  name: string;
  role: Role;
}): Promise<{ ok: boolean; reason?: string }> {
  const access = await accessFor(input.staffEmail);
  if (!access.canManageTeam) {
    return { ok: false, reason: "Only an admin can add people to the team." };
  }
  if (!ASSIGNABLE_ROLES.includes(input.role)) {
    return { ok: false, reason: "Choose Admin, Growth manager or Content editor." };
  }
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, reason: "That does not look like an email address." };
  const users = await readUsers().catch(() => []);
  if (users.some((user) => user.email?.toLowerCase() === email)) {
    return { ok: false, reason: "That person is already on the team. Change their role above." };
  }
  const name =
    input.name.trim() ||
    (email.split("@")[0] ?? email).replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const id = await saveUser(name, input.role, email).catch(() => null);
  return id ? { ok: true } : { ok: false, reason: "That person could not be added. Try again." };
}
