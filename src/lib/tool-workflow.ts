/** Shared by the topic actions and writer; other AI/news lanes are not workflows. */
export function isAiToolWorkflowLane(lane: string | null | undefined): boolean {
  return /^ai tools? workflows?$/.test(
    (lane ?? "").trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " "),
  );
}
