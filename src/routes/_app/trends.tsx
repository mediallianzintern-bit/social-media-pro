import { createFileRoute } from "@tanstack/react-router";

import { IdeasTabs } from "@/components/dashboard/ideas-tabs";
import { UniversalTrends } from "@/components/dashboard/universal-trends";

export const Route = createFileRoute("/_app/trends")({ component: TrendsPage });

function TrendsPage() {
  return (
    <div className="space-y-6">
      <IdeasTabs />
      <UniversalTrends />
    </div>
  );
}
