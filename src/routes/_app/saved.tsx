import { createFileRoute } from "@tanstack/react-router";

import { SavedTopics } from "@/components/dashboard/saved-topics";

export const Route = createFileRoute("/_app/saved")({ component: SavedPage });

function SavedPage() {
  return <SavedTopics />;
}
