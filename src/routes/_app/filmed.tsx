import { createFileRoute } from "@tanstack/react-router";

import { FilmedReels } from "@/components/dashboard/filmed-reels";

export const Route = createFileRoute("/_app/filmed")({ component: FilmedPage });

function FilmedPage() {
  return <FilmedReels />;
}
