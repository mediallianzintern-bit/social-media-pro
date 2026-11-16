// Write a LinkedIn piece in the format the team chose (16 Nov 2026): a text
// post or an article, from the Write post / Write article buttons. Without a
// choice the writer picks, as generateOneIdea does. One AI call, explicit
// button only. Every server function passes the staff check in src/start.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const writeLinkedIn = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        sourceId: z.string().uuid(),
        format: z.enum(["text_post", "article"]),
        regenerate: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { generateMore } = await import("@/server/ai/index");
    return generateMore("linkedin", {
      sourceId: data.sourceId,
      format: data.format,
      ...(data.regenerate ? { regenerate: true } : {}),
    });
  });
