import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { PlatformId } from "@/lib/analytics-types";
import { requireStaff } from "@/lib/require-staff";
import { REJECT_REASON_KEYS } from "@/lib/script-feedback";

const platformSchema = z.enum(["instagram", "linkedin"]);

/** Every script verdict on a platform, as the drawer and cards show them. Free. */
export const getScriptVerdicts = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .validator((input: unknown) => platformSchema.parse(input))
  .handler(async ({ data }) => {
    const { readScriptVerdicts } = await import("@/server/script-feedback");
    const verdicts = await readScriptVerdicts(data).catch(() => []);
    return verdicts.map(({ ideaId, verdict, reasons, note }) => ({
      ideaId,
      verdict,
      reasons,
      note,
    }));
  });

export const scriptVerdictsQueryOptions = (platform: PlatformId) => ({
  queryKey: ["script-verdicts", platform] as const,
  queryFn: () => getScriptVerdicts({ data: platform }),
  staleTime: 30 * 1000,
});

/**
 * Approves a script, rejects it with reasons, or clears the verdict
 * (`verdict: null`). The script is copied as it reads now, opening with the
 * chosen hook, so an approval keeps teaching after the idea ages out.
 *
 * The topic vote follows from it, so the subject learning (preferences.ts)
 * still hears about scripts: an approval likes the subject, a rejection for
 * "wrong topic" dislikes it, and a rejection for the writing alone says
 * nothing about the subject, so a good topic badly written is not faded out.
 */
export const judgeScript = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .validator((input: unknown) =>
    z
      .object({
        platform: platformSchema,
        ideaId: z.string().uuid(),
        verdict: z.enum(["approve", "reject"]).nullable(),
        reasons: z.array(z.enum(REJECT_REASON_KEYS as [string, ...string[]])).max(7),
        note: z.string().max(500).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ readIdeaById, saveTopicVote }, { saveScriptVerdict }, { scriptText }] =
      await Promise.all([
        import("@/server/store"),
        import("@/server/script-feedback"),
        import("@/lib/script-feedback"),
      ]);
    const idea = await readIdeaById(data.ideaId);
    if (!idea) throw new Error("That script is no longer stored.");
    const script = scriptText(idea);
    const reasons = data.reasons as Parameters<typeof saveScriptVerdict>[0]["reasons"];
    await saveScriptVerdict({
      platform: data.platform,
      ideaId: data.ideaId,
      verdict: data.verdict,
      reasons,
      note: data.note,
      script,
      hook:
        script
          .split("\n")
          .find((line) => line.trim())
          ?.trim() ?? idea.hook,
      title: idea.title,
      lane: idea.contentLane ?? null,
      actor: context.staffEmail,
    });

    const topic =
      data.verdict === "approve"
        ? "like"
        : data.verdict === "reject" && reasons.includes("topic")
          ? "dislike"
          : null;
    await saveTopicVote({
      platform: data.platform,
      kind: "idea",
      itemId: data.ideaId,
      verdict: topic,
      text: [idea.hook, idea.angle, idea.winningTrait].filter(Boolean).join(" · ").slice(0, 2000),
      lane: idea.contentLane ?? null,
      actor: context.staffEmail,
    }).catch((error: unknown) => console.warn("[script-feedback] topic vote skipped:", error));
    return { ok: true };
  });
