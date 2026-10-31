import { prisma } from "@/lib/prisma";
import { createWebhookHandler, httpError, type WebhookEvent } from "@/lib/webhook-event";
import { publishAgentIntelligenceTask, requireClientId } from "@/lib/queue/publisher";
import { setLifecycleStatus } from "@/lib/tender-lifecycle-store";

async function handleIngestionEvent(evt: WebhookEvent) {
  if (!evt.event.endsWith("_success") || evt.data.error) {
    // Any other event without an error is only logged.
    if (evt.data.error || evt.event.endsWith("_failed")) {
      await setLifecycleStatus(evt.data.referenceNo, "INGESTION_FAILED", evt.data.error ?? evt.event);
    }
    return { handled: false };
  }

  requireClientId("TENDER_AGENT_INTELLIGENCE_CLIENT_ID");

  const { referenceNo } = evt.data;
  const tender = await prisma.tenderMerged.findUnique({
    where: { referenceNo, deleteRequestedAt: null },
    select: { tenderBrief: true, itemCategory: true },
  });
  if (!tender) throw httpError(`Reference not found: ${referenceNo}`, 404);

  // Publish failure must not fail the webhook (docs/tender-lifecycle.md §9).
  const intelligenceQueued = await publishAgentIntelligenceTask({
    payloadType: "analysis",
    referenceNo,
    company: "laser",
    tenderbrief: tender.tenderBrief ?? "",
    itemcategory: tender.itemCategory ?? "",
  });
  if (!intelligenceQueued) {
    console.warn(`[ingestion] Intelligence job not queued for ${referenceNo} (RabbitMQ unavailable?)`);
  }
  await (intelligenceQueued
    ? setLifecycleStatus(referenceNo, "INTELLIGENCE_QUEUED")
    : setLifecycleStatus(referenceNo, "INTELLIGENCE_FAILED", "Intelligence job not queued"));

  return { handled: true, intelligenceQueued };
}

export const POST = createWebhookHandler("Ingestion", handleIngestionEvent);
