import { createFileRoute } from "@tanstack/react-router";

import { IdeasTabs } from "@/components/dashboard/ideas-tabs";
import { SavedTopics } from "@/components/dashboard/saved-topics";

export const Route = createFileRoute("/_app/saved")({ component: SavedPage });

function SavedPage() {
  return (
    <div className="space-y-6">
      <IdeasTabs />
      <SavedTopics />
    </div>
  );
}
