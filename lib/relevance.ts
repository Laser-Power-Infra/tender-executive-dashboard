import "server-only";
import { publishAiRelevanceTask } from "@/lib/queue/publisher";
import { setRelevanceQueued } from "@/lib/tender-lifecycle-store";
import { parseRupees } from "@/lib/rupees";

// Stage 1 of the lifecycle (docs/tender-lifecycle.md §4): the same relevance job whether a user
// presses "Analyse", a developer requeues, or the tenders webhook brings a new tender in.

export interface RelevanceTender {
  referenceNo: string;
  tenderBrief?: string | null;
  itemCategory?: string | null;
  subCategory?: string | null;
  value?: string | null;
}

// "Power Distribution" -> "power_distribution", "Cables & Conductors" -> "cables_conductors"
function toSnakeCase(label: string | null | undefined): string | null {
  if (!label) return null;
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function publishRelevance(tender: RelevanceTender): Promise<boolean> {
  return publishAiRelevanceTask({
    payloadType: "analysis",
    referenceNo: tender.referenceNo,
    company: "laser",
    tenderbrief: tender.tenderBrief ?? "",
    itemcategory: tender.itemCategory ?? "",
    category: toSnakeCase(tender.subCategory),
    tenderAmount: parseRupees(tender.value),
  });
}

/** Publishes the relevance job and records RELEVANCE_QUEUED / RELEVANCE_FAILED. */
export async function queueRelevance(tender: RelevanceTender): Promise<boolean> {
  const sent = await publishRelevance(tender);
  await setRelevanceQueued(tender.referenceNo, sent);
  return sent;
}
