// Tender lifecycle (v2). Source of truth: docs/tender-lifecycle.md — keep both in sync.
// Stored in TenderMerged.lifecycleStatus by setLifecycleStatus (lib/tender-lifecycle-store.ts).
import { QUEUES, automationQueues } from "@/lib/queue/config";

export const TENDER_LIFECYCLE_STATUS = {
  NEW: "NEW",
  RELEVANCE_QUEUED: "RELEVANCE_QUEUED",
  RELEVANCE_REJECTED: "RELEVANCE_REJECTED",
  RELEVANCE_FAILED: "RELEVANCE_FAILED",
  AUTOMATION_QUEUED: "AUTOMATION_QUEUED",
  AUTOMATION_FAILED: "AUTOMATION_FAILED",
  INGESTION_QUEUED: "INGESTION_QUEUED",
  INGESTION_FAILED: "INGESTION_FAILED",
  INTELLIGENCE_QUEUED: "INTELLIGENCE_QUEUED",
  INTELLIGENCE_FAILED: "INTELLIGENCE_FAILED",
  COMPLETED: "COMPLETED",
} as const;

export type TenderLifecycleStatus =
  (typeof TENDER_LIFECYCLE_STATUS)[keyof typeof TENDER_LIFECYCLE_STATUS];

// Stages in pipeline order. A stage is "done" when the next main-chain stage is QUEUED (or COMPLETED after intelligence).
// PARSING is a side branch published together with INGESTION by the automation webhook; it has no tender status
// and is tracked per file in TenderFile.parseStatus.
const TENDER_LIFECYCLE_STAGES = [
  {
    stage: "RELEVANCE",
    queue: QUEUES.AGENT_RELEVANCE,
    clientIdEnv: "TENDER_AGENT_RELEVANCE_CLIENT_ID",
    webhook: "/api/webhook/ai-relevance",
  },
  {
    stage: "AUTOMATION",
    queue: QUEUES.AUTOMATION_V2_TASKS,
    clientIdEnv: "TENDER_AUTOMATION_AUTOMATION_CLIENT_ID",
    webhook: "/api/webhook/automation",
  },
  {
    stage: "PARSING",
    queue: QUEUES.AUTOMATION_V2_PARSING,
    clientIdEnv: "TENDER_AUTOMATION_PARSING_CLIENT_ID",
    webhook: "/api/webhook/parsing",
  },
  {
    stage: "INGESTION",
    queue: QUEUES.AGENT_INGESTION,
    clientIdEnv: "TENDER_AGENT_INGESTION_CLIENT_ID",
    webhook: "/api/webhook/ingestion",
  },
  {
    stage: "INTELLIGENCE",
    queue: QUEUES.AGENT_INTELLIGENCE,
    clientIdEnv: "TENDER_AGENT_INTELLIGENCE_CLIENT_ID",
    webhook: "/api/webhook/intelligence",
  },
] as const satisfies readonly {
  stage: string;
  queue: string;
  clientIdEnv: keyof NodeJS.ProcessEnv;
  webhook: string;
}[];

export type TenderLifecycleStage = (typeof TENDER_LIFECYCLE_STAGES)[number]["stage"];

/** The stages that carry a tender status, in pipeline order. */
export type LifecycleMainStage = Exclude<TenderLifecycleStage, "PARSING">;
export const LIFECYCLE_MAIN_STAGES = TENDER_LIFECYCLE_STAGES.flatMap(({ stage }) =>
  stage === "PARSING" ? [] : [stage],
);

/** How the UI names each main stage. */
export const LIFECYCLE_STAGE_INFO: Record<LifecycleMainStage, { label: string; detail: string }> = {
  RELEVANCE: { label: "Relevance", detail: "AI checks the tender is relevant" },
  AUTOMATION: { label: "Documents", detail: "Tender files are downloaded" },
  INGESTION: { label: "Ingestion", detail: "The agent reads the files" },
  INTELLIGENCE: { label: "Report", detail: "The agent writes its report" },
};

/** The RabbitMQ queue a stage's jobs go to; automation follows AUTOMATION_VERSION. */
export function lifecycleStageQueue(stage: LifecycleMainStage): string {
  if (stage === "AUTOMATION") return automationQueues().tasks;
  return TENDER_LIFECYCLE_STAGES.find((s) => s.stage === stage)!.queue;
}

// A tender queued longer than this is shown as slow, and may be requeued by hand.
// ponytail: one threshold for every stage; make it per stage if their normal waits differ.
export const LIFECYCLE_SLOW_MS = 60 * 60 * 1000;

/** One row of a `groupBy` on the status column. */
export interface LifecycleGroup {
  status: string | null;
  count: number;
  /** When the longest-waiting tender in this status got it. */
  oldest: Date | string | null;
}

/** Live state of a RabbitMQ queue. */
export interface QueueStats {
  /** Messages no worker has taken yet. A job being worked on is not counted. */
  ready: number;
  /** Workers listening on the queue. */
  workers: number;
}

export interface LifecycleStageCount {
  stage: LifecycleMainStage;
  /** Job sent, no reply from the worker yet. */
  queued: number;
  failed: number;
  /** ISO time the longest-waiting queued tender entered the stage; null when none is queued. */
  oldestQueued: string | null;
  /** null when RabbitMQ could not be asked. */
  queue: QueueStats | null;
}

export interface LifecycleCounts {
  stages: LifecycleStageCount[];
  completed: number;
  rejected: number;
  notStarted: number;
  /** Per file, from TenderFile.parseStatus. */
  parsing: { pending: number; completed: number; failed: number; notSent: number };
}

/** Folds grouped status counts into what the AI analysis page shows. */
export function summarizeLifecycle(
  tenders: LifecycleGroup[],
  files: { status: string | null; count: number }[],
  queues: Partial<Record<LifecycleMainStage, QueueStats | null>> = {},
): LifecycleCounts {
  const by = new Map(tenders.map((g) => [g.status ?? TENDER_LIFECYCLE_STATUS.NEW, g]));
  const count = (status: string) => by.get(status)?.count ?? 0;
  const fileCount = (status: string | null) => files.find((f) => f.status === status)?.count ?? 0;
  const known = new Set<string>(Object.values(TENDER_LIFECYCLE_STATUS));

  return {
    stages: LIFECYCLE_MAIN_STAGES.map((stage) => {
      const oldest = by.get(`${stage}_QUEUED`)?.oldest;
      return {
        stage,
        queued: count(`${stage}_QUEUED`),
        failed: count(`${stage}_FAILED`),
        oldestQueued: oldest ? new Date(oldest).toISOString() : null,
        queue: queues[stage] ?? null,
      };
    }),
    completed: count(TENDER_LIFECYCLE_STATUS.COMPLETED),
    rejected: count(TENDER_LIFECYCLE_STATUS.RELEVANCE_REJECTED),
    // A value this code does not know is counted here, not dropped.
    notStarted: tenders
      .filter((g) => !g.status || g.status === "NEW" || !known.has(g.status))
      .reduce((sum, g) => sum + g.count, 0),
    parsing: {
      pending: fileCount("PENDING"),
      completed: fileCount("COMPLETED"),
      failed: fileCount("FAILED"),
      notSent: fileCount(null),
    },
  };
}
