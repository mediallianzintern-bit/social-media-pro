import { createFileRoute } from "@tanstack/react-router";

import { UniversalTrends } from "@/components/dashboard/universal-trends";

export const Route = createFileRoute("/_app/trends")({ component: TrendsPage });

function TrendsPage() {
  return <UniversalTrends />;
}
