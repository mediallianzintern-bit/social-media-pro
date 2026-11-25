import { createFileRoute } from "@tanstack/react-router";

import { LinkedIdea } from "@/components/dashboard/linked-idea";
import { PlatformView } from "@/components/dashboard/platform-view";
import { useDashboard, usePlatform } from "@/lib/use-dashboard";

export const Route = createFileRoute("/_app/instagram")({ component: InstagramPage });

function InstagramPage() {
  const { data, range } = usePlatform("instagram");
  // Ideas are still Pritesh's alone (Studio Phase 5).
  // Tracking only (migration 0041): no idea card.
  const forClient = useDashboard().client?.service === "tracking";
  if (!data) return null;
  return (
    <>
      <PlatformView data={data} range={range} />
      {forClient ? null : <LinkedIdea platform="instagram" />}
    </>
  );
}
