import { prisma } from "@/lib/prisma";
import { createWebhookHandler, httpError, type WebhookEvent } from "@/lib/webhook-event";
import { buildResultUpdate, parseResultRows } from "@/lib/result-sync";

const RESULT_TYPES = new Set(["TENDER_TIGER_RESULT", "TENDER247_RESULT"]);

async function handleResultEvent(evt: WebhookEvent) {
  // Failure events are only logged.
  if (evt.event !== "result.synced_success" || evt.data.error) return { handled: false };

  if (!RESULT_TYPES.has(evt.data.type)) {
    throw httpError(`data.type must be one of: ${[...RESULT_TYPES].join(", ")}`, 400);
  }

  const rows = parseResultRows(evt.data.result);
  const tenders = await prisma.tenderMerged.findMany({
    where: { referenceNo: { in: rows.map((r) => r.referenceNo) }, deleteRequestedAt: null },
    select: { id: true, referenceNo: true, competitors: true },
  });
  const byRef = new Map(tenders.map((t) => [t.referenceNo, t]));

  // Unknown references are reported, not fatal, so one stale row does not block the batch.
  const notFound: string[] = [];
  const updated: string[] = [];
  for (const row of rows) {
    const tender = byRef.get(row.referenceNo);
    if (!tender) {
      notFound.push(row.referenceNo);
      continue;
    }
    const data = buildResultUpdate(row, tender.competitors);
    if (Object.keys(data).length === 0) continue;
    const saved = await prisma.tenderMerged.update({
      where: { id: tender.id },
      data,
      select: { competitors: true },
    });
    // Keep competitors current if the same reference appears twice in one batch.
    tender.competitors = saved.competitors;
    updated.push(row.referenceNo);
  }

  return { handled: true, file: (evt.data.result as { file?: unknown }).file ?? null, updated, notFound };
}

export const POST = createWebhookHandler("Result", handleResultEvent, { requireReferenceNo: false });
