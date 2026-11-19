// /ideas: the Ideas section opens on Trends (18 Nov 2026).
//
// It was a one-card review with Approve and Dismiss. The team chose to learn
// only from what is actually made: an Instagram reel once "I filmed this" is
// pressed, every LinkedIn post and article he publishes, each reviewed 14 days
// after it goes up (reel-learning, post-learning). The address stays, so an
// old link still lands in the Ideas section.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/ideas")({
  beforeLoad: () => {
    throw redirect({ to: "/trends" });
  },
});
