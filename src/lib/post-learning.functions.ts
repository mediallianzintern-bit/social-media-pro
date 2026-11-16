// What every reviewed LinkedIn post taught, for the LinkedIn page. Free:
// stored rows only (server/post-learning/view.ts).
import { createServerFn } from "@tanstack/react-start";

import { requireStaff } from "@/lib/require-staff";

export const getPostLessons = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async () => {
    const { postLessonsView } = await import("@/server/post-learning/view");
    return postLessonsView();
  });

export const postLessonsQueryOptions = () => ({
  queryKey: ["post-lessons"] as const,
  queryFn: () => getPostLessons(),
  staleTime: 5 * 60 * 1000,
});
