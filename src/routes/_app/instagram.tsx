import { createFileRoute } from "@tanstack/react-router";

import { LinkedIdea } from "@/components/dashboard/linked-idea";
import { PlatformView } from "@/components/dashboard/platform-view";
import { usePlatform } from "@/lib/use-dashboard";

export const Route = createFileRoute("/_app/instagram")({ component: InstagramPage });

function InstagramPage() {
  const { data, range } = usePlatform("instagram");
  if (!data) return null;
  return (
    <>
      <PlatformView data={data} range={range} />
      <LinkedIdea platform="instagram" />
    </>
  );
}
