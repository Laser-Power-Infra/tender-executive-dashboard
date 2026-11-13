"use server";

import { prisma } from "@/lib/prisma";
import { withLog } from "@/lib/activity-logger";
import {
  INGESTION_FILE_SELECT,
  publishAgentIntelligenceTask,
  publishIngestionTask,
  publishNicDownloadTask,
  publishTenderTask,
} from "@/lib/queue/publisher";
import { requireUserAction } from "@/lib/dal";
import {
  LIFECYCLE_SLOW_MS,
  QUEUE_OPTION_INFO,
  TENDER_LIFECYCLE_STATUS,
  lifecycleStageQueue,
  type LifecycleStageCount,
  type QueueOption,
} from "@/lib/tender-lifecycle";
import { setLifecycleStatus } from "@/lib/tender-lifecycle-store";
import { publishRelevance, queueRelevance } from "@/lib/relevance";

async function publishAiAnalysisJobFn(params: {
  referenceNo: string;
  tenderBrief: string;
  itemCategory: string;
}): Promise<boolean> {
  await requireUserAction();
  const tender = await prisma.tenderMerged.findUnique({
    where: { referenceNo: params.referenceNo },
    select: { subCategory: true, value: true },
  });
  return queueRelevance({ ...tender, ...params });
}

type RequeueStage = LifecycleStageCount["stage"];
const REQUEUE_STAGES: RequeueStage[] = ["RELEVANCE", "AUTOMATION", "INGESTION", "INTELLIGENCE"];
// ponytail: one request publishes them one by one; past this many, press again
// or move the loop to a background job.
const REQUEUE_LIMIT = 500;

const optionStage = (option: QueueOption): RequeueStage => (option === "NIC_DOWNLOAD" ? "AUTOMATION" : option);

const STAGE_TENDER_SELECT = {
  id: true,
  referenceNo: true,
  tenderType: true,
  website: true,
  tenderBrief: true,
  itemCategory: true,
  subCategory: true,
  value: true,
} as const;
type StageTender = {
  id: number;
  referenceNo: string;
  tenderType: "GEM" | "NON_GEM";
  website: string | null;
  tenderBrief: string | null;
  itemCategory: string | null;
  subCategory: string | null;
  value: string | null;
};

/** Publishes the job that starts `stage` for one tender; `reason` says why it was not sent. */
async function publishStageJob(
  stage: QueueOption,
  tender: StageTender,
): Promise<{ sent: boolean; reason: string }> {
  const { id, referenceNo } = tender;
  let reason = "Job not sent; RabbitMQ unreachable";
  let sent = false;
  if (stage === "RELEVANCE") {
    sent = await publishRelevance(tender);
  } else if (stage === "NIC_DOWNLOAD") {
    if (!tender.website) reason = "No website on the tender; the NIC worker needs the portal";
    sent =
      !!tender.website &&
      (await publishNicDownloadTask({ type: "NIC_DOWNLOAD", referenceNo, portal: tender.website }));
  } else if (stage === "AUTOMATION") {
    sent = await publishTenderTask(
      tender.tenderType === "GEM"
        ? { type: "GEM_DOWNLOAD", tenderId: id, gemId: referenceNo, referenceNo, timestamp: Date.now() }
        : { type: "NON_GEM_DOWNLOAD", tenderId: id, referenceNo, timestamp: Date.now() },
    );
  } else if (stage === "INGESTION") {
    const files = await prisma.tenderFile.findMany({
      where: { tenderMergedId: id },
      select: INGESTION_FILE_SELECT,
      orderBy: { id: "asc" },
    });
    // Nothing to ingest: the download has to be queued first.
    if (files.length === 0) reason = "No downloaded files to ingest; queue Documents first";
    sent = files.length > 0 && (await publishIngestionTask({ referenceNo, files }));
  } else {
    sent = await publishAgentIntelligenceTask({
      payloadType: "analysis",
      referenceNo,
      company: "laser",
      tenderbrief: tender.tenderBrief ?? "",
      itemcategory: tender.itemCategory ?? "",
    });
  }
  return { sent, reason };
}

/**
 * Publishes the stage's job again for every tender stuck on it, the same job the
 * stage before would have published. `from` picks the stuck tenders: FAILED, or
 * QUEUED for longer than LIFECYCLE_SLOW_MS (a younger job may still be in the queue).
 * A tender whose job is sent moves to that stage's QUEUED with a fresh wait time;
 * one that still cannot be sent keeps its status.
 */
async function requeueStageFn(stage: RequeueStage, from: "FAILED" | "QUEUED") {
  const user = await requireUserAction();
  if (user.role !== "developer") throw new Error("Forbidden: developer role required");
  if (!REQUEUE_STAGES.includes(stage)) throw new Error(`Unknown stage: ${stage}`);
  if (from !== "FAILED" && from !== "QUEUED") throw new Error(`Unknown status: ${from}`);

  const tenders = await prisma.tenderMerged.findMany({
    where: {
      deleteRequestedAt: null,
      ...(from === "FAILED"
        ? { lifecycleStatus: `${stage}_FAILED` }
        : {
            lifecycleStatus: `${stage}_QUEUED`,
            lifecycleUpdatedAt: { lt: new Date(Date.now() - LIFECYCLE_SLOW_MS) },
          }),
    },
    select: STAGE_TENDER_SELECT,
    orderBy: { lifecycleUpdatedAt: "asc" },
    take: REQUEUE_LIMIT,
  });

  let queued = 0;
  for (const tender of tenders) {
    const { referenceNo } = tender;
    const { sent, reason } = await publishStageJob(stage, tender);
    if (!sent) {
      // Say why on the tender, so the AI analysis page can show it.
      if (from === "FAILED") await setLifecycleStatus(referenceNo, `${stage}_FAILED`, `Requeue: ${reason}`);
      continue;
    }
    await setLifecycleStatus(referenceNo, `${stage}_QUEUED`);
    queued++;
  }

  return { stage, from, queued, notQueued: tenders.length - queued };
}

/** Developer only: starts `stage` for one tender whatever its current status (tenders page "Queue to"). */
async function queueTenderStageFn(option: QueueOption, referenceNo: string): Promise<boolean> {
  const user = await requireUserAction();
  if (user.role !== "developer") throw new Error("Forbidden: developer role required");
  if (!(option in QUEUE_OPTION_INFO)) throw new Error(`Unknown stage: ${option}`);
  const stage = optionStage(option);
  const tender = await prisma.tenderMerged.findUnique({
    where: { referenceNo, deleteRequestedAt: null },
    select: STAGE_TENDER_SELECT,
  });
  if (!tender) throw new Error(`Reference not found: ${referenceNo}`);
  const { sent, reason } = await publishStageJob(option, tender);
  await setLifecycleStatus(referenceNo, sent ? `${stage}_QUEUED` : `${stage}_FAILED`, sent ? undefined : reason);
  return sent;
}

export const queueTenderStage = withLog(queueTenderStageFn, (sent, stage, referenceNo) => ({
  action: "CREATE" as const,
  tableName: lifecycleStageQueue(optionStage(stage)),
  recordId: undefined,
  referenceNo,
  details: `Queued ${stage} from the tenders page (sent=${sent})`,
}));

export const requeueStage = withLog(requeueStageFn, (result) => ({
  action: "UPDATE" as const,
  tableName: "TenderMerged",
  details: `Requeued ${result.stage} from ${result.from}: ${result.queued} queued, ${result.notQueued} not queued`,
}));

// A new batch starts a fresh count: tenders an earlier batch rejected go back to
// "not started", so the AI analysis page does not show them as rejected again.
// Their saved verdict (aiRelevanceValid, aiRelevanceReason) is untouched.
async function startAiAnalysisRunFn(): Promise<number> {
  await requireUserAction();
  const { count } = await prisma.tenderMerged.updateMany({
    where: { lifecycleStatus: TENDER_LIFECYCLE_STATUS.RELEVANCE_REJECTED, deleteRequestedAt: null },
    data: { lifecycleStatus: null, lifecycleUpdatedAt: null, lifecycleError: null },
  });
  return count;
}

export const startAiAnalysisRun = withLog(startAiAnalysisRunFn, (cleared) => ({
  action: "UPDATE" as const,
  tableName: "TenderMerged",
  details: `AI analysis run started; cleared ${cleared} rejected lifecycle statuses`,
}));

export const publishAiAnalysisJob = withLog(
  publishAiAnalysisJobFn,
  (result, params) => ({
    action: "CREATE" as const,
    tableName: "agent:relevance",
    recordId: undefined,
    referenceNo: params.referenceNo,
    details: `Published AI analysis job (sent=${result})`,
  }),
);
