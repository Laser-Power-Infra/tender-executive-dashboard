import { prisma } from "@/lib/prisma";
import { createWebhookHandler, httpError, type WebhookEvent } from "@/lib/webhook-event";
import { TENDER_CATEGORIES } from "@/lib/tender-categories";
import { queueRelevance } from "@/lib/relevance";
import { publishNicDownloadTask } from "@/lib/queue/publisher";
import {
  insertTenderMerged,
  loadUpsertContext,
  prepareTenderRow,
  type PreparedTender,
  type SheetResult,
} from "@/lib/tender-upsert";
import {
  NIC_ROW_HEADERS,
  nicCategoryFields,
  nicDocsToFiles,
  nicIntFields,
  nicTenderToRow,
  type NicFile,
  type NicTender,
} from "@/lib/nic-sync";

const SOURCE = "nic-sync";

async function handleNicSyncEvent(evt: WebhookEvent) {
  // Failure events are only logged.
  if (evt.event !== "nic.synced_success" || evt.data.error) return { handled: false };
  if (evt.data.type !== "NIC_SYNC") throw httpError('data.type must be "NIC_SYNC"', 400);
  if (!Array.isArray(evt.data.result)) throw httpError("data.result must be an array of tenders", 400);
  const tenders = evt.data.result.filter((t): t is NicTender => !!t && typeof t === "object");
  const portal = evt.data.portal ?? "";

  // Same shape as an upload: one File row anchors the batch (TenderMerged.fileId is required).
  const file = await prisma.file.create({
    data: { fileName: `${SOURCE} ${portal || evt.id}`, fileType: "application/json", status: "processing" },
  });
  const ctx = await loadUpsertContext({ category: TENDER_CATEGORIES.MANUFACTURING, subCategory: null });
  const result: SheetResult = {
    sheetName: SOURCE,
    count: 0,
    excludedCount: 0,
    errors: [],
    skipped: false,
    rejected: [],
  };

  const headers = [...NIC_ROW_HEADERS];
  const prepared: PreparedTender[] = [];
  // Keyed by the prepared row: insertTenderMerged may rewrite refNo to a prefix-matched stored reference.
  const filesByRow = new Map<PreparedTender, NicFile[]>();
  for (const t of tenders) {
    const row = nicTenderToRow(t, portal);
    const p = prepareTenderRow(row, headers, { ...ctx, categoryFields: nicCategoryFields(t) });
    if ("reason" in p) {
      result.rejected.push({ fileName: file.fileName, sheetName: SOURCE, reason: p.reason, row });
      continue;
    }
    Object.assign(p.createData, nicIntFields(t));
    if (p.createData.excludedCategory !== null) result.excludedCount++;
    prepared.push(p);
    filesByRow.set(p, nicDocsToFiles(t["Tenders Documents"]));
  }

  // Rewrites p.refNo to the stored reference when an existing tender matches by prefix.
  const matched = await insertTenderMerged(prepared, file.id, result, file.fileName);
  const refNos = prepared.map((p) => p.refNo);

  // Documents for new and existing tenders alike; a URL already on the tender is not added twice.
  const saved = await prisma.tenderMerged.findMany({
    where: { referenceNo: { in: refNos }, deleteRequestedAt: null },
    select: {
      id: true,
      referenceNo: true,
      tenderBrief: true,
      itemCategory: true,
      category: true,
      subCategory: true,
      value: true,
      excludedCategory: true,
      website: true,
      tenderFiles: { select: { url: true } },
    },
  });
  const newFiles: (NicFile & { tenderMergedId: number })[] = [];
  const withoutFiles: typeof saved = [];
  const savedByRef = new Map(saved.map((t) => [t.referenceNo, t]));
  for (const p of prepared) {
    const t = savedByRef.get(p.refNo);
    if (!t) continue;
    const have = new Set(t.tenderFiles.map((f) => f.url));
    for (const f of filesByRow.get(p) ?? []) {
      if (!have.has(f.url)) {
        have.add(f.url);
        newFiles.push({ ...f, tenderMergedId: t.id });
      }
    }
    if (have.size === 0) withoutFiles.push(t);
  }
  if (newFiles.length) await prisma.tenderFile.createMany({ data: newFiles });

  // A tender with no document, stored or incoming, gets its documents fetched by the automation worker.
  // Sequential: parallel publishes race the RabbitMQ connect.
  let downloadQueued = 0;
  for (const t of withoutFiles) {
    const ok = await publishNicDownloadTask({
      type: "NIC_DOWNLOAD",
      referenceNo: t.referenceNo,
      portal: t.website ?? portal,
    });
    if (ok) downloadQueued++;
    else console.warn(`[nic-sync] Download job not queued for ${t.referenceNo} (RabbitMQ unavailable?)`);
  }

  // New tenders enter the lifecycle at stage 1. Existing ones are already in it (or were handled),
  // and a tender whose deadline has passed is not worth an analysis.
  let relevanceQueued = 0;
  for (const t of saved) {
    if (matched.has(t.referenceNo)) continue;
    if (t.excludedCategory?.split(",").includes("date")) continue;
    if (await queueRelevance(t)) relevanceQueued++;
  }

  await prisma.file.update({
    where: { id: file.id },
    data: {
      status: result.errors.length ? "completed_with_errors" : "completed",
      totalCount: result.count,
      excludedCount: result.excludedCount,
    },
  });

  const rejectedRefs = new Set(result.rejected.map((r) => String(r.row.referenceNo ?? "")));
  return {
    handled: true,
    portal,
    received: tenders.length,
    created: result.count,
    updated: [...matched].filter((ref) => !rejectedRefs.has(ref)).length,
    excluded: result.excludedCount,
    rejected: result.rejected.map((r) => ({ referenceNo: r.row.referenceNo ?? null, reason: r.reason })),
    errors: result.errors,
    files: newFiles.length,
    downloadQueued,
    relevanceQueued,
  };
}

export const POST = createWebhookHandler("NicSync", handleNicSyncEvent, { requireReferenceNo: false });
