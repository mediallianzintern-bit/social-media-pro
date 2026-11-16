// Followed and unfollowed in a period, from Instagram's own count
// (server/graph/follows.ts). Client-safe.
export interface FollowFlow {
  /** People who followed in the period. */
  followed: number;
  /** People who unfollowed, or closed their account, in the period. */
  unfollowed: number;
  /** The first day counted, YYYY-MM-DD. */
  from: string;
  /** True when the period reached further back than Instagram keeps (about a year). */
  capped: boolean;
}
