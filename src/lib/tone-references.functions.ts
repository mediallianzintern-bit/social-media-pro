// "Sounds like Pritesh?" on a script: the team's check on whether the tone
// references did their job. Staff only; the verdict is kept on the idea.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireStaff } from "@/lib/require-staff";

export const checkScriptTone = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) =>
    z
      .object({
        ideaId: z.string().min(1),
        verdict: z.enum(["yes", "no"]),
        note: z.string().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveToneCheck } = await import("@/server/ai/tone");
    const ok = await saveToneCheck(
      data.ideaId,
      data.verdict,
      data.note,
      context.staffEmail ?? null,
    );
    return ok ? { ok } : { ok, reason: "That check could not be saved. Reload and try again." };
  });
