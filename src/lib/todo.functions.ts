// The To do board (server/todo.ts). Every call passes the staff check in
// src/start.ts; who is asking is read from the session, never the request.
// "Mark completed" and "I filmed this" use markFilmed (reel-learning), the
// same call as the button on the account pages, so the two stay in step.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { TodoLens } from "@/lib/todo-types";

const lensSchema = z.enum(["growth_manager", "editor", "team_manager"]);

export const getTodo = createServerFn({ method: "GET" })
  .validator((input: unknown) => lensSchema.catch("growth_manager").parse(input))
  .handler(async ({ data, context }) => {
    const { loadTodo } = await import("@/server/todo");
    return loadTodo(context.staffEmail, data);
  });

export const todoQueryOptions = (lens: TodoLens) => ({
  queryKey: ["todo", lens] as const,
  queryFn: () => getTodo({ data: lens }),
  staleTime: 15 * 1000,
  // Scripts written, ticked or filmed on other pages show up on their own.
  refetchInterval: 30 * 1000,
});

export const sendScriptToEditor = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ ideaId: z.string().min(1), editorId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { sendToEditor } = await import("@/server/todo");
    return sendToEditor({ ...data, staffEmail: context.staffEmail });
  });

export const markScriptDone = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ ideaId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { markEditorDone } = await import("@/server/todo");
    return markEditorDone({ ...data, staffEmail: context.staffEmail });
  });
