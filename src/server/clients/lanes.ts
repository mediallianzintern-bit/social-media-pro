// After a Studio client's sync: what Pro sends back to Studio (Studio spec
// §7.6, Phase 5). Four steps, each optional and none able to fail the sync:
//
//   1. Suggest lanes   when the client has no lanes in Studio yet. Pro's own
//                      lane reader, once per client (one model call); its
//                      vocabulary is kept, so a later pass resends it free.
//   2. File posts      into the lanes a manager CONFIRMED in Studio. Studio's
//                      names are the vocabulary of record: when they change,
//                      every post is filed again, so no post keeps a label
//                      that no longer exists.
//   3. Score lanes     on likes + comments over the last 90 days, sent as one
//                      dated snapshot. No model call.
//   4. Match posts     each exported Studio post to the live Instagram post it
//                      became, by caption. No model call.
//   5. 14-day results  each matched post's figures once it is 14 days old,
//                      against the client's typical post, with a one-line
//                      lesson (one cheap call per sync, capped per client per
//                      month; clients/outcomes.ts). Needs Studio's bridge
//                      version 2.
//
// Runs inside the client's context, so ownerAccount() is the client's account.
import { z } from "zod";

import {
  MATCH_WINDOW_DAYS,
  confirmedLanes,
  laneSnapshot,
  laneSuggestions,
  matchPublications,
  sameVocabulary,
  type ExportedPost,
} from "@/lib/client-lanes";
import type { PublicationMatch } from "@/lib/client-lanes";
import type { PostRecord } from "@/lib/analytics-types";

import { hasOpenAi } from "../ai/client";
import { classifyPosts, deriveTaxonomy } from "../ai/lanes";
import { ownerAccount } from "../apify/accounts";
import { readPosts, readTaxonomy, saveTaxonomy } from "../store";
import type { ActiveClient } from "./context";
import { sendOutcomes } from "./outcomes";
import { OUTCOMES_VERSION, callStudio, fetchStudioLink } from "./studio";

const exportsResponse = z.object({
  ok: z.literal(true),
  data: z.object({
    posts: z.array(
      z.object({
        postId: z.string().uuid(),
        slotDate: z.string(),
        exportedAt: z.string(),
        caption: z.string(),
        hashtags: z.array(z.string()).catch([]),
        publication: z
          .object({ platformPostId: z.string(), url: z.string(), publishedAt: z.string() })
          .nullable(),
        lane: z.string().nullable().optional(),
        // Absent from a Studio before bridge version 2.
        outcome: z
          .object({ measuredAt: z.string(), lessonCostUsd: z.coerce.number().catch(0) })
          .nullable()
          .optional(),
      }),
    ),
  }),
});

export interface StudioSteps {
  /** What was sent to Studio, one line per step, in words a manager can read. */
  notes: string[];
  lanesAssigned: number;
}

const post = (path: string, body: unknown) =>
  callStudio(path, { method: "POST", body: JSON.stringify(body) });

/** Never throws: the client's figures are already saved by the time this runs. */
export async function sendToStudio(client: ActiveClient, now = new Date()): Promise<StudioSteps> {
  const steps: StudioSteps = { notes: [], lanesAssigned: 0 };
  if (!client.studioClientId) return steps;
  const studioId = client.studioClientId;
  const platform = "instagram" as const;
  const handle = ownerAccount(platform).handle;

  const step = async (what: string, work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[clients:studio] ${client.displayName}: ${what} failed:`, message);
      steps.notes.push(`${what} failed: ${message}`);
    }
  };

  let studioVersion = 1;
  const found = await fetchStudioLink()
    .then(({ clients, version }) => {
      studioVersion = version;
      return clients.find((c) => c.id === studioId) ?? "unlinked";
    })
    .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
  if (typeof found === "string") {
    steps.notes.push(
      found === "unlinked"
        ? "Nothing sent to Studio: this client is no longer linked to Pro there."
        : `Nothing sent to Studio: ${found}`,
    );
    return steps;
  }
  const lanes = found.lanes;

  const posts: PostRecord[] = await readPosts(platform, handle, 1000).catch(() => []);

  // 1. Suggestions, only while Studio has no lanes for this client at all.
  if (!lanes.length) {
    await step("Suggesting lanes", async () => {
      let vocabulary = await readTaxonomy(platform, handle);
      if (!vocabulary?.length) {
        if (!hasOpenAi()) {
          steps.notes.push("Lane suggestions need OPENAI_API_KEY in Pro's .env.");
          return;
        }
        if (posts.filter((p) => p.caption.trim()).length < 4) {
          steps.notes.push("Too few captioned posts to suggest lanes from yet.");
          return;
        }
        vocabulary = await deriveTaxonomy(platform, handle, posts);
      }
      const suggestions = laneSuggestions(vocabulary ?? []);
      if (!suggestions.length) return;
      const result = (await post("lanes", { clientId: studioId, lanes: suggestions })) as {
        data?: { added?: number };
      };
      const added = result.data?.added ?? 0;
      steps.notes.push(
        added
          ? `${added} lane suggestion${added === 1 ? "" : "s"} sent to Studio. Confirm them on the client's Content lanes tab.`
          : "Lane suggestions are waiting in Studio. Confirm them on the client's Content lanes tab.",
      );
    });
  }

  // 2 and 3. Filing and scoring, in the confirmed lanes only.
  const confirmed = confirmedLanes(lanes);
  if (!confirmed.length) {
    if (lanes.length)
      steps.notes.push("No confirmed lanes in Studio yet, so lanes were not scored.");
  } else {
    let filed = false;
    await step("Filing posts into lanes", async () => {
      const stored = await readTaxonomy(platform, handle);
      const changed = !stored || !sameVocabulary(stored, confirmed);
      if (!hasOpenAi()) {
        // Labels from another vocabulary would score the wrong lanes.
        if (changed) {
          steps.notes.push("Filing posts into lanes needs OPENAI_API_KEY in Pro's .env.");
          return;
        }
        filed = true;
        return;
      }
      if (changed) await saveTaxonomy(platform, handle, confirmed);
      steps.lanesAssigned = await classifyPosts(platform, confirmed, posts, { all: changed });
      filed = true;
    });
    if (filed)
      await step("Scoring lanes", async () => {
        const snapshot = laneSnapshot({ handle, posts, lanes: confirmed, now });
        if (!snapshot) {
          steps.notes.push("No posts in the last 90 days fall in a confirmed lane yet.");
          return;
        }
        await post("performance", { clientId: studioId, ...snapshot });
        steps.notes.push(
          `Lane figures for ${snapshot.lanes.length} lane${snapshot.lanes.length === 1 ? "" : "s"} sent to Studio.`,
        );
      });
  }

  // 4. Which exported posts went live.
  let exported: ExportedPost[] | null = null;
  const matched: PublicationMatch[] = [];
  await step("Matching published posts", async () => {
    const since = new Date(now.getTime() - MATCH_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const list: ExportedPost[] = exportsResponse.parse(
      await callStudio(`exports?clientId=${encodeURIComponent(studioId)}&since=${since}`),
    ).data.posts;
    exported = list;
    if (!list.length) return;
    let recorded = 0;
    const refused: string[] = [];
    for (const match of matchPublications(list, posts)) {
      // One refused match (Studio already holds another for that post) must
      // not stop the rest.
      try {
        const result = (await post("publications", { clientId: studioId, ...match })) as {
          data?: { recorded?: boolean };
        };
        if (result.data?.recorded) {
          recorded += 1;
          matched.push(match);
        }
      } catch (error) {
        refused.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (recorded)
      steps.notes.push(
        `${recorded} published post${recorded === 1 ? "" : "s"} matched to Studio's export.`,
      );
    if (refused.length)
      steps.notes.push(
        `Studio refused ${refused.length} match${refused.length === 1 ? "" : "es"}: ${refused[0]}`,
      );
  });

  // 5. How the published posts did after 14 days.
  const exportedPosts: ExportedPost[] = exported ?? [];
  if (exportedPosts.some((item) => item.publication) || matched.length) {
    if (studioVersion < OUTCOMES_VERSION)
      steps.notes.push(
        "14-day results were not sent: Studio's bridge is older than version 2. Update Studio and apply its migration 0011.",
      );
    else
      await step("Sending 14-day results", async () => {
        steps.notes.push(
          ...(await sendOutcomes({
            client,
            studioId,
            industry: found.industry,
            exported: exportedPosts,
            matches: matched,
            posts,
            now,
          })),
        );
      });
  }

  return steps;
}
