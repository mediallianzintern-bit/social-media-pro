// Content lanes — what an account actually talks about, attached to each post.
//
// Two stages with deliberately different lifetimes:
//
//   deriveTaxonomy()  runs ONCE per account and is persisted. Re-deriving on
//                     every run would let "Brand teardowns" drift into "Brand
//                     case studies" and silently break every comparison made
//                     against the older label.
//   classifyPosts()   runs on every analysis, but only over posts that have no
//                     lane yet. Steady state is a handful of new posts, not the
//                     whole history.
//
// Classification is a labelling job, not a reasoning one, so it runs on a
// cheaper model than the analysis calls — see CLASSIFIER_MODEL below.
import { completeJson } from "./client";
import { CLASSIFY_SCHEMA, TAXONOMY_SCHEMA, classifySchema, taxonomySchema } from "./schemas";
import { readTaxonomy, savePostLanes, saveTaxonomy } from "../store";
import type { ContentLane, PlatformId, PostRecord } from "@/lib/analytics-types";

/**
 * Cheap by design. Assigning a caption to one of six named buckets does not
 * benefit from deep reasoning, and this runs over every post of every tracked
 * account — the one place in the system where volume, not judgement, dominates.
 */
const CLASSIFIER_MODEL = "gpt-5.4-mini";

/** Posts read to derive the vocabulary. More than this adds cost, not accuracy. */
const TAXONOMY_SAMPLE = 30;

/** Classified per request. Keeps any single call well inside its token budget. */
const CLASSIFY_BATCH = 25;

/** The bucket for posts that fit no lane. Never invented by the model. */
export const OTHER_LANE = "other";

/**
 * Share of recent posts landing in `other` above which the taxonomy is stale.
 *
 * Not acted on automatically — a rebuild would invalidate history, so this is
 * surfaced as a signal that the account's content has genuinely moved on and a
 * human should decide.
 */
export const STALE_OTHER_SHARE = 0.2;

function captionFor(post: PostRecord): string {
  return post.caption.replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Derives the stable vocabulary for one account from its own captions. */
export async function deriveTaxonomy(
  platform: PlatformId,
  handle: string,
  posts: PostRecord[],
): Promise<ContentLane[]> {
  const sample = posts.slice(0, TAXONOMY_SAMPLE).map(captionFor).filter(Boolean);
  if (sample.length < 4) return [];

  const system = `You define the content vocabulary for one social media account.

You will be given that account's recent captions. Return the 4-7 recurring lanes its
content falls into.

Rules:
- Lanes describe what THIS account actually publishes, in its own terms. Do not impose
  a generic marketing taxonomy.
- Lanes must be separable by reading a caption alone — that is how they will be applied
  to future posts.
- They should partition the output, not overlap. A post should obviously belong to one.
- Name a lane for its subject or format, never for how well it performs. Performance is
  measured separately and a lane named "high performers" would make that circular.`;

  const user = `ACCOUNT: ${handle} (${platform})

CAPTIONS (${sample.length}):
${JSON.stringify(sample, null, 2)}

Define this account's content lanes.`;

  const result = await completeJson<unknown>({
    system,
    user,
    schemaName: "content_taxonomy",
    schema: TAXONOMY_SCHEMA,
    model: CLASSIFIER_MODEL,
    temperature: 0.2,
    effort: "low",
  });

  const lanes = taxonomySchema.parse(result.data).lanes;
  if (lanes.length) await saveTaxonomy(platform, handle, lanes);
  return lanes;
}

/** Assigns lanes to posts that do not have one yet. Returns how many were written. */
export async function classifyPosts(
  platform: PlatformId,
  lanes: ContentLane[],
  posts: PostRecord[],
): Promise<number> {
  const pending = posts.filter((post) => !post.contentLane);
  if (!pending.length || !lanes.length) return 0;

  const names = lanes.map((lane) => lane.name);
  const system = `You assign social media posts to content lanes that already exist.

LANES:
${lanes.map((lane) => `- ${lane.name}: ${lane.definition}`).join("\n")}

Rules:
- Every postId in the input gets exactly one lane.
- Copy a lane name VERBATIM from the list above, or return the literal "${OTHER_LANE}".
- Never invent a lane. A new name here corrupts every comparison made against the
  existing vocabulary, and "${OTHER_LANE}" is the correct, useful answer for a genuine
  outlier.
- Judge by what the post is ABOUT, not by how well written it is.`;

  let written = 0;
  for (let index = 0; index < pending.length; index += CLASSIFY_BATCH) {
    const batch = pending.slice(index, index + CLASSIFY_BATCH);
    const user = `POSTS (${batch.length}):
${JSON.stringify(
  batch.map((post) => ({ postId: post.postId, caption: captionFor(post) })),
  null,
  2,
)}

Assign each post a lane.`;

    const result = await completeJson<unknown>({
      system,
      user,
      schemaName: "lane_assignments",
      schema: CLASSIFY_SCHEMA,
      model: CLASSIFIER_MODEL,
      temperature: 0,
      effort: "low",
    });

    // Anything not matching a known lane is coerced to "other" rather than
    // trusted. A hallucinated lane name would otherwise become a permanent
    // one-post category that quietly widens the vocabulary.
    const assignments = classifySchema
      .parse(result.data)
      .assignments.filter((row) => batch.some((post) => post.postId === row.postId))
      .map((row) => ({
        postId: row.postId,
        lane: names.includes(row.lane) ? row.lane : OTHER_LANE,
      }));

    written += await savePostLanes(platform, assignments);
    for (const row of assignments) {
      const post = batch.find((item) => item.postId === row.postId);
      if (post) post.contentLane = row.lane;
    }
  }

  return written;
}

/**
 * Makes sure an account's posts carry lanes, deriving the vocabulary first if
 * this is the first time. Mutates `posts` in place so the caller's brief sees
 * the lanes without a second read.
 *
 * Never throws: lanes enrich the analysis, and losing them must not cost the
 * analysis itself — the same reasoning that keeps Graph insight failures from
 * taking down a sync.
 */
export async function ensureLanes(
  platform: PlatformId,
  handle: string,
  posts: PostRecord[],
): Promise<ContentLane[]> {
  try {
    let lanes = await readTaxonomy(platform, handle);
    if (!lanes?.length) lanes = await deriveTaxonomy(platform, handle, posts);
    if (!lanes.length) return [];
    await classifyPosts(platform, lanes, posts);
    return lanes;
  } catch (error) {
    console.error(`[lanes:${platform}/${handle}] classification skipped:`, error);
    return [];
  }
}

/** True when enough recent posts fell outside the taxonomy to warrant a rebuild. */
export function taxonomyLooksStale(posts: PostRecord[]): boolean {
  const classified = posts.filter((post) => post.contentLane);
  if (classified.length < 8) return false;
  const other = classified.filter((post) => post.contentLane === OTHER_LANE).length;
  return other / classified.length > STALE_OTHER_SHARE;
}
