"use server";

import { prisma } from "@/lib/prisma";
import { withLog } from "@/lib/activity-logger";
import { requireUserAction } from "@/lib/dal";
import { checkQueues } from "@/lib/rabbitmq";
import {
  LIFECYCLE_MAIN_STAGES,
  TENDER_LIFECYCLE_STATUS,
  lifecycleStageQueue,
  summarizeLifecycle,
  type LifecycleCounts,
} from "@/lib/tender-lifecycle";

/** Live queue state per stage; a stage whose queue cannot be named or checked gets null. */
async function stageQueues() {
  const names = LIFECYCLE_MAIN_STAGES.map((stage) => {
    try {
      return lifecycleStageQueue(stage);
    } catch {
      return null;
    }
  });
  const stats = await checkQueues(names.filter((n): n is string => n !== null));
  let i = 0;
  return Object.fromEntries(
    LIFECYCLE_MAIN_STAGES.map((stage, j) => [stage, names[j] === null ? null : stats[i++]]),
  );
}

async function fetchLifecycleCountsFn(): Promise<LifecycleCounts> {
  await requireUserAction();
  const [tenders, files, queues] = await Promise.all([
    prisma.tenderMerged.groupBy({
      by: ["lifecycleStatus"],
      where: { deleteRequestedAt: null },
      _count: { _all: true },
      _min: { lifecycleUpdatedAt: true },
    }),
    prisma.tenderFile.groupBy({ by: ["parseStatus"], _count: { _all: true } }),
    stageQueues(),
  ]);
  return summarizeLifecycle(
    tenders.map((g) => ({
      status: g.lifecycleStatus,
      count: g._count._all,
      oldest: g._min.lifecycleUpdatedAt,
    })),
    files.map((g) => ({ status: g.parseStatus, count: g._count._all })),
    queues,
  );
}

// A read, polled every few seconds: never logged.
export const fetchLifecycleCounts = withLog(fetchLifecycleCountsFn, () => null);

/** "ALL" is every tender in the pipeline; "NEW" is every tender not in it. */
export type LifecycleTenderFilter = keyof typeof TENDER_LIFECYCLE_STATUS | "ALL";

export interface LifecycleTender {
  id: number;
  referenceNo: string | null;
  tenderBrief: string | null;
  lifecycleStatus: string | null;
  lifecycleUpdatedAt: string | null;
  lifecycleError: string | null;
}

const PAGE_SIZE = 50;

async function fetchLifecycleTendersFn(
  filter: LifecycleTenderFilter,
  page: number,
): Promise<{ tenders: LifecycleTender[]; total: number }> {
  await requireUserAction();
  const where =
    filter === "NEW"
      ? { OR: [{ lifecycleStatus: null }, { lifecycleStatus: "NEW" }] }
      : filter === "ALL"
        ? { AND: [{ lifecycleStatus: { not: null } }, { lifecycleStatus: { not: "NEW" } }] }
        : filter in TENDER_LIFECYCLE_STATUS
          ? { lifecycleStatus: filter }
          : null;
  if (!where) throw new Error(`Unknown status: ${filter}`);

  const [rows, total] = await Promise.all([
    prisma.tenderMerged.findMany({
      where: { ...where, deleteRequestedAt: null },
      select: {
        id: true,
        referenceNo: true,
        tenderBrief: true,
        lifecycleStatus: true,
        lifecycleUpdatedAt: true,
        lifecycleError: true,
      },
      orderBy: [{ lifecycleUpdatedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
      skip: (Math.max(1, Math.trunc(page) || 1) - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.tenderMerged.count({ where: { ...where, deleteRequestedAt: null } }),
  ]);
  return {
    tenders: rows.map((r) => ({
      ...r,
      lifecycleUpdatedAt: r.lifecycleUpdatedAt?.toISOString() ?? null,
    })),
    total,
  };
}

export const fetchLifecycleTenders = withLog(fetchLifecycleTendersFn, () => null);
