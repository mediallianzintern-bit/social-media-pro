import { createFileRoute } from "@tanstack/react-router";

import { PlatformView } from "@/components/dashboard/platform-view";
import { usePlatform } from "@/lib/use-dashboard";

export const Route = createFileRoute("/_app/linkedin")({ component: LinkedInPage });

function LinkedInPage() {
  const { data, range } = usePlatform("linkedin");
  if (!data) return null;
  return <PlatformView data={data} range={range} />;
}
