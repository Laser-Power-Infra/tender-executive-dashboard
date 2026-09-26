import type { ParticipationFilter } from "@/lib/slices/filtersSlice";

/**
 * Shape of fetchParticipationCounts' result.
 *
 * It lives here rather than beside the action so the sidebar can import it
 * without pulling the Prisma client into the browser bundle - the same reason
 * lib/tender-filter-meta.ts exists.
 */
export interface ParticipationCountsResult {
  /** One docket-deduped count per ParticipationFilter. */
  nodes: Record<ParticipationFilter, number>;
  personCounts: { id: number; count: number }[];
}
