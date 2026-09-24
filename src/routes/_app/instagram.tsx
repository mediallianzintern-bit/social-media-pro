import { createFileRoute } from "@tanstack/react-router";

import { PlatformView } from "@/components/dashboard/platform-view";
import { usePlatform } from "@/lib/use-dashboard";

export const Route = createFileRoute("/_app/instagram")({ component: InstagramPage });

function InstagramPage() {
  const { data, range } = usePlatform("instagram");
  if (!data) return null;
  return <PlatformView data={data} range={range} />;
}
