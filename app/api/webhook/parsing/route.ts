import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { createWebhookHandler, httpError, type WebhookEvent } from "@/lib/webhook-event";
import { TENDER_FILE_TYPES } from "@/lib/tender-file-types";

const SUCCESS_EVENT = "file.parsed_success";
const FAILED_EVENT = "file.parsed_failed";

// Shape of the costing worker's COSTING_ATTACHMENT_PARSING result.
interface CostingResult {
  price?: string | null;
  applicableIndex?: string | null;
  tables?: Array<{
    rows?: Array<{
      item_code?: string;
      item_name?: string | null;
      quantity?: number | string | null;
      total_price?: number | string | null;
      location?: string | null;
      cva?: string | null;
    }>;
    materials?: Record<string, unknown>;
  }>;
}

const str = (v: unknown): string | null => (v == null ? null : String(v));

// Costing results feed CostingSheetDetails (one row per parsed item) and TenderMerged.rawMaterials.
// itemSchedule is left null here — it is filled later by the item-schedule sync.
async function syncCostingResult(tenderMergedId: number, result: unknown) {
  const r = result as CostingResult | null;
  const tables = r?.tables;
  if (!Array.isArray(tables)) return;

  const rows = tables
    .flatMap((t) => (Array.isArray(t.rows) ? t.rows : []))
    .filter((r) => r && typeof r.item_code === "string" && r.item_code.trim() !== "")
    .map((r) => ({
      tenderMergedId,
      itemCode: r.item_code!.trim(),
      proposedErpItemName: r.item_name?.trim() || null,
      proposedErpQuantity: str(r.quantity),
      priceOfFullQuantity: str(r.total_price),
      location: r.location?.trim() || null,
      cva: r.cva?.trim() || null,
    }));
  if (rows.length > 0) await prisma.costingSheetDetails.createMany({ data: rows });

  const materials: Record<string, number> = {};
  for (const t of tables) {
    if (!t.materials || typeof t.materials !== "object") continue;
    for (const [key, value] of Object.entries(t.materials)) {
      const n = Number(value);
      if (value == null || value === "" || isNaN(n)) continue;
      materials[key] = (materials[key] ?? 0) + n;
    }
  }
  if (Object.keys(materials).length > 0) {
    // Never clobber a manually entered rawMaterials value.
    await prisma.tenderMerged.updateMany({
      where: { id: tenderMergedId, OR: [{ rawMaterials: null }, { rawMaterials: "" }] },
      data: { rawMaterials: JSON.stringify(materials) },
    });
  }

  const update: Prisma.TenderMergedUpdateManyMutationInput = {};
  const price = typeof r?.price === "string" ? r.price.trim().toUpperCase() : "";
  if (price === "FIRM" || price === "VARIABLE") update.price = price;
  if (typeof r?.applicableIndex === "string" && r.applicableIndex.trim() !== "") {
    update.applicableIndex = r.applicableIndex.trim();
  }
  if (Object.keys(update).length > 0) {
    await prisma.tenderMerged.updateMany({ where: { id: tenderMergedId }, data: update });
  }
}

// Parsing is a side branch (docs/tender-lifecycle.md): it stores the result per file and publishes nothing.
async function handleParsingEvent(evt: WebhookEvent) {
  if (evt.event !== SUCCESS_EVENT && evt.event !== FAILED_EVENT) return { handled: false };

  const { referenceNo, file_link: fileLink } = evt.data;
  if (!fileLink) throw httpError("data.file_link is required", 400);

  const tender = await prisma.tenderMerged.findUnique({
    where: { referenceNo, deleteRequestedAt: null },
    select: { id: true },
  });
  if (!tender) throw httpError(`Reference not found: ${referenceNo}`, 404);

  // Only a PENDING file is settled, so a retried event for it is a no-op.
  const file = await prisma.tenderFile.findFirst({
    where: { tenderMergedId: tender.id, url: fileLink, parseStatus: "PENDING" },
    select: { id: true, tags: true },
  });
  if (!file) return { handled: false, reason: "no PENDING file for file_link" };

  const failed = evt.event === FAILED_EVENT || evt.data.error != null;
  const data = failed
    ? {
        parseStatus: "FAILED",
        parseError: typeof evt.data.error === "string" ? evt.data.error : JSON.stringify(evt.data.error ?? "Parsing failed"),
      }
    : {
        parseStatus: "COMPLETED",
        parseResult: (evt.data.result ?? Prisma.DbNull) as Prisma.InputJsonValue,
        parseError: null,
      };

  await prisma.tenderFile.update({ where: { id: file.id }, data });

  if (!failed && file.tags.includes(TENDER_FILE_TYPES.COSTING_ATTACHMENT)) {
    await syncCostingResult(tender.id, evt.data.result);
  }

  return { handled: true, parseStatus: data.parseStatus };
}

export const POST = createWebhookHandler("Parsing", handleParsingEvent);
