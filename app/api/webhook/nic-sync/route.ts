import { prisma } from "@/lib/prisma";
import { createWebhookHandler, httpError, type WebhookEvent } from "@/lib/webhook-event";
import { TENDER_CATEGORIES } from "@/lib/tender-categories";
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

  // Same shape as an upload: one File row anchors the batch (TenderMerged.fileId is required).
  const file = await prisma.file.create({
    data: { fileName: `${SOURCE} ${evt.id}`, fileType: "application/json", status: "processing" },
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
  const filesByRef = new Map<string, NicFile[]>();
  for (const t of tenders) {
    const row = nicTenderToRow(t);
    const p = prepareTenderRow(row, headers, { ...ctx, categoryFields: nicCategoryFields(t) });
    if ("reason" in p) {
      result.rejected.push({ fileName: file.fileName, sheetName: SOURCE, reason: p.reason, row });
      continue;
    }
    Object.assign(p.createData, nicIntFields(t));
    if (p.createData.excludedCategory !== null) result.excludedCount++;
    prepared.push(p);
    filesByRef.set(p.refNo, nicDocsToFiles(t["Tenders Documents"]));
  }

  const refNos = prepared.map((p) => p.refNo);
  const before = new Set(
    (await prisma.tenderMerged.findMany({ where: { referenceNo: { in: refNos } }, select: { referenceNo: true } })).map(
      (r) => r.referenceNo,
    ),
  );

  await insertTenderMerged(prepared, file.id, result, file.fileName);

  // Documents for new and existing tenders alike; a URL already on the tender is not added twice.
  const saved = await prisma.tenderMerged.findMany({
    where: { referenceNo: { in: refNos }, deleteRequestedAt: null },
    select: { id: true, referenceNo: true, tenderFiles: { select: { url: true } } },
  });
  const newFiles: (NicFile & { tenderMergedId: number })[] = [];
  for (const t of saved) {
    const have = new Set(t.tenderFiles.map((f) => f.url));
    for (const f of filesByRef.get(t.referenceNo) ?? []) {
      if (!have.has(f.url)) newFiles.push({ ...f, tenderMergedId: t.id });
    }
  }
  if (newFiles.length) await prisma.tenderFile.createMany({ data: newFiles });

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
    received: tenders.length,
    created: result.count,
    updated: prepared.filter((p) => before.has(p.refNo) && !rejectedRefs.has(p.refNo)).length,
    excluded: result.excludedCount,
    rejected: result.rejected.map((r) => ({ referenceNo: r.row.referenceNo ?? null, reason: r.reason })),
    errors: result.errors,
    files: newFiles.length,
  };
}

export const POST = createWebhookHandler("NicSync", handleNicSyncEvent, { requireReferenceNo: false });
