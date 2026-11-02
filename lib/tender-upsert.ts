import { prisma } from "@/lib/prisma";
import {
  MERGED_FIELDS,
  mapRowToTender,
  getReferenceNo,
  isGemReference,
  parseDate,
  getFieldValue,
  buildMergedColumnMap,
} from "@/lib/tender-columns";
import { sendTenderWebhook } from "@/lib/webhook";
import { TENDER_FILE_TYPES } from "@/lib/tender-file-types";
import { format } from "date-fns";
import { parseEmd, parseRupees } from "@/lib/rupees";
import { resolveEpcSubCategory, TENDER_CATEGORIES } from "@/lib/tender-categories";

// Shared by the Excel upload (app/api/upload) and the NIC sync webhook (app/api/webhook/nic-sync):
// one row -> PreparedTender, then create-or-fill into TenderMerged.

const INSERT_BATCH_SIZE = 50;
const TX_TIMEOUT = 10 * 60 * 1000;

const OVERWRITE_FIELDS = new Set([
  "nameOfRank1", "valueOfRank1", "differenceBetweenRank1",
  "nameOfRank2", "valueOfRank2", "differenceBetweenRank2",
  "ourRank", "ourValue",
]);
const COMPETITORS_SEPARATOR = " - ";

export interface RejectedRow {
  fileName: string;
  sheetName: string;
  reason: string;
  row: Record<string, unknown>;
}

export interface SheetResult {
  sheetName: string;
  count: number;
  excludedCount: number;
  errors: string[];
  skipped: boolean;
  rejected: RejectedRow[];
}

export interface PreparedTender {
  refNo: string;
  tenderType: "GEM" | "NON_GEM";
  createData: Record<string, unknown>;
  originalRow: Record<string, unknown>;
}

export interface CategoryFields {
  category: string;
  subCategory: string | null;
}

export type Association = { id: number; name: string; email: string };

export interface UpsertContext {
  cableKeywords: string[];
  conductorsKeywords: string[];
  today: Date;
  categoryFields: CategoryFields;
  customColumnMap: Record<string, string>;
  associations: Association[];
}

/** Exclusion keywords, active column mappings and associates, loaded once per batch. */
export async function loadUpsertContext(categoryFields: CategoryFields): Promise<UpsertContext> {
  const keywordRows = await prisma.exlusionKeywords.findMany();

  const cableRow = keywordRows.find((r) => r.category === "cable");
  const conductorsRow = keywordRows.find((r) => r.category === "conductors");

  function parseKeywordRow(row: typeof cableRow): string[] {
    if (!row || !row.keywords) return [];
    return [
      ...new Set(
        row.keywords
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
  }

  const dbMappingRows = await prisma.columnMapping.findMany({
    where: { status: "active" },
  });

  const associations = await prisma.association.findMany();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    cableKeywords: parseKeywordRow(cableRow),
    conductorsKeywords: parseKeywordRow(conductorsRow),
    today,
    categoryFields,
    customColumnMap: buildMergedColumnMap(dbMappingRows),
    associations,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function buildCreateData(
  row: Record<string, unknown>,
  headers: string[],
  fileId: number,
  excludedCategory: string | null,
  customColumnMap?: Record<string, string>,
  associations?: Association[],
): { refNo: string; tenderType: "GEM" | "NON_GEM"; createData: Record<string, unknown> } {
  const refNo = getReferenceNo(row, headers, customColumnMap) || "";
  const { knownFields } = mapRowToTender(row, MERGED_FIELDS, customColumnMap);
  const tenderType: "GEM" | "NON_GEM" = isGemReference(refNo) ? "GEM" : "NON_GEM";

  const createData: Record<string, unknown> = {
    fileId,
    referenceNo: refNo,
    tenderType,
    excludedCategory,
  };

  for (const [key, value] of Object.entries(knownFields)) {
    if (key !== "referenceNo") {
      createData[key] = value;
    }
  }

  const assignedValue = knownFields.assignedTo as string | undefined;
  if (assignedValue && associations) {
    const lowerValue = assignedValue.toLowerCase().trim();
    const matched = associations.find(
      (a) => a.name.toLowerCase() === lowerValue || a.email.toLowerCase() === lowerValue,
    );
    if (matched) {
      createData.tenderAssociations = {
        create: [{ associationId: matched.id }],
      };
    } else {
      const testUser = associations.find((a) => a.name.toLowerCase() === "test_user");
      if (testUser) {
        createData.tenderAssociations = {
          create: [{ associationId: testUser.id }],
        };
      }
    }
    delete createData.assignedTo;
  }

  return { refNo, tenderType, createData };
}

/** One source row -> PreparedTender, or the reason it is rejected. */
export function prepareTenderRow(
  row: Record<string, unknown>,
  headers: string[],
  ctx: UpsertContext,
): PreparedTender | { reason: string } {
  const { cableKeywords, conductorsKeywords, today, categoryFields, customColumnMap, associations } = ctx;

  const refNo = getReferenceNo(row, headers, customColumnMap) || "";
  if (!refNo) return { reason: "Missing reference number" };

  const tenderBrief = getFieldValue(row, headers, "tenderBrief", customColumnMap);
  const briefText =
    tenderBrief == null ? "" : String(tenderBrief).toLowerCase();

  const excludedCategories: string[] = [];

  const matchesCable =
    briefText.length > 0 &&
    cableKeywords.some((kw) => briefText.includes(kw));
  if (matchesCable) excludedCategories.push("cable");

  const matchesConductors =
    briefText.length > 0 &&
    conductorsKeywords.some((kw) => briefText.includes(kw));
  if (matchesConductors) excludedCategories.push("conductors");

  const deadlineRaw = getFieldValue(row, headers, "deadline", customColumnMap);
  const deadlineDate = deadlineRaw ? parseDate(deadlineRaw) : null;
  if (!deadlineDate) {
    const isEmpty = deadlineRaw == null || String(deadlineRaw).trim() === "";
    return { reason: isEmpty ? "Missing deadline date" : "Invalid deadline date" };
  }
  const isDateExcluded = deadlineDate.getTime() <= today.getTime();
  if (isDateExcluded) excludedCategories.push("date");

  const excludedCategory =
    excludedCategories.length > 0 ? excludedCategories.join(",") : null;

  const { refNo: r, tenderType, createData } = buildCreateData(
    row,
    headers,
    0,
    excludedCategory,
    customColumnMap,
    associations,
  );
  const rowCategoryFields: CategoryFields =
    categoryFields.category === TENDER_CATEGORIES.EPC
      ? {
          category: categoryFields.category,
          subCategory: resolveEpcSubCategory(
            tenderBrief,
            createData.organization,
            categoryFields.subCategory ?? "",
          ),
        }
      : categoryFields;
  Object.assign(createData, rowCategoryFields);
  // Value is stored as plain rupees so it filters and sorts as a number.
  // Text that is not an amount ("NA", "Not visible", PDF text) becomes "0",
  // so the column stays all numbers; the tender still imports.
  if (createData.value != null) {
    createData.value = String(parseRupees(createData.value) ?? 0);
  }
  if (createData.emd != null) {
    createData.emd = String(parseEmd(createData.emd) ?? 0);
  }
  console.log(
    `[UPLOAD] Deadline for ${r}:`,
    createData.deadline ? format(createData.deadline as Date, "do MMM yyyy") : "null",
  );
  return { refNo: r, tenderType, createData, originalRow: row };
}

// Prefix matches shorter than this are ignored: "2026" alone must not claim every 2026 tender.
const MIN_PREFIX_REF_LENGTH = 6;

/**
 * The stored reference an incoming one belongs to. Exact (case-insensitive) wins; otherwise
 * "abcd" and "abcd1234" are the same tender when either is a prefix of the other, and the
 * most specific (longest) stored reference is taken.
 */
export function pickExistingReference(incoming: string, candidates: string[]): string | undefined {
  const inc = incoming.toLowerCase();
  const exact = candidates.find((c) => c.toLowerCase() === inc);
  if (exact) return exact;
  if (inc.length < MIN_PREFIX_REF_LENGTH) return undefined;
  return candidates
    .filter((c) => {
      const cand = c.toLowerCase();
      return cand.length >= MIN_PREFIX_REF_LENGTH && (cand.startsWith(inc) || inc.startsWith(cand));
    })
    .sort((a, b) => b.length - a.length)[0];
}

/** Stored tenders whose reference equals, or is a prefix of / is prefixed by, one of `refNos`. */
async function findExistingByReference(refNos: string[]) {
  const ids = await prisma.$queryRaw<{ id: number }[]>`
    SELECT t."id" FROM "tender_merged" t
    WHERE EXISTS (
      SELECT 1 FROM unnest(${refNos}::text[]) AS r
      WHERE lower(t."referenceNo") = lower(r)
         OR (length(r) >= ${MIN_PREFIX_REF_LENGTH} AND length(t."referenceNo") >= ${MIN_PREFIX_REF_LENGTH}
             AND (lower(t."referenceNo") = left(lower(r), length(t."referenceNo"))
               OR lower(r) = left(lower(t."referenceNo"), length(r))))
    )`;
  if (ids.length === 0) return [];
  return prisma.tenderMerged.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    include: { tenderAssociations: { include: { association: true } } },
  });
}

/**
 * Creates new tenders and fills empty fields on existing ones. A prepared row that matches an
 * existing tender by reference prefix gets its `refNo` rewritten to the stored reference.
 * Returns the stored references that were matched (updated or skipped), not created.
 */
export async function insertTenderMerged(
  prepared: PreparedTender[],
  fileId: number,
  sheetResult: SheetResult,
  fileName: string,
): Promise<Set<string>> {
  const matched = new Set<string>();
  if (!prepared.length) return matched;

  const refNos = prepared.map((p) => p.refNo);

  const existingRecords = await findExistingByReference(refNos);
  const existingByRef = new Map(existingRecords.map((r) => [r.referenceNo, r]));
  const candidates = existingRecords.map((r) => r.referenceNo);

  const toCreate: Record<string, unknown>[] = [];
  const webhookQueue: string[] = [];
  const seenRefs = new Set<string>();
  const originalRowByRef = new Map<string, Record<string, unknown>>();

  for (const p of prepared) {
    const storedRef = pickExistingReference(p.refNo, candidates);
    const old = storedRef ? existingByRef.get(storedRef) : undefined;
    if (old) {
      p.refNo = old.referenceNo;
      p.createData.referenceNo = old.referenceNo;
      matched.add(old.referenceNo);
    }
    if (old?.deleteRequestedAt) {
      // The row is kept until a developer decides; reject the delete request first to bring it back.
      sheetResult.rejected.push({
        fileName,
        sheetName: sheetResult.sheetName,
        reason: "Pending delete",
        row: p.originalRow,
      });
      continue;
    }
    if (old) {
      const updateData: Record<string, unknown> = {
        fileId,
      };

      const newDeadline = p.createData.deadline as Date | undefined;
      if (newDeadline && (!old.deadline || newDeadline.getTime() >= old.deadline.getTime())) {
        updateData.deadline = newDeadline;
      }

      if (p.createData.app && p.createData.app !== "NOT_DECIDED" && old.app === "NOT_DECIDED") {
        updateData.app = p.createData.app;
      }
      if (p.createData.aps && p.createData.aps !== "NOT_DECIDED" && old.aps === "NOT_DECIDED") {
        updateData.aps = p.createData.aps;
      }
      if (p.createData.apm && p.createData.apm !== "NOT_DECIDED" && old.apm === "NOT_DECIDED") {
        updateData.apm = p.createData.apm;
      }

      const SKIP_KEYS = new Set([
        "fileId", "referenceNo", "tenderType", "excludedCategory",
        "deadline", "app", "aps", "apm",
        "tenderAssociations",
      ]);

      for (const [key, value] of Object.entries(p.createData)) {
        if (SKIP_KEYS.has(key)) continue;

        if (key === "competitors") {
          const newValue = String(value).trim();
          if (newValue) {
            const existing = (old.competitors ?? "").toString().trim();
            const seen = new Set(
              existing
                ? existing.split(COMPETITORS_SEPARATOR).map((s) => s.trim()).filter(Boolean)
                : [],
            );
            if (!seen.has(newValue)) {
              updateData.competitors = existing
                ? `${existing}${COMPETITORS_SEPARATOR}${newValue}`
                : newValue;
            }
          }
          continue;
        }

        if (OVERWRITE_FIELDS.has(key)) {
          if (value != null && value !== "") {
            updateData[key] = value;
          }
          continue;
        }

        const oldVal = (old as any)[key];
        // value and emd default to "0", which means "no amount yet" and can be filled.
        const amount = key === "value" || key === "emd";
        const isEmpty = oldVal == null || oldVal === "" || (amount && oldVal === "0");
        if (isEmpty && value != null && value !== "" && !(amount && value === "0")) {
          updateData[key] = value;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.tenderMerged.update({
          where: { id: old.id },
          data: updateData as any,
        });
        // console.log(`[UPDATE] ${p.refNo} -> fields: ${Object.keys(updateData).join(", ")}`);
      } else {
        console.log(`[SKIP] ${p.refNo} - no changes`);
      }

      const addedAssociations = p.createData.tenderAssociations && old.tenderAssociations.length === 0;
      if (addedAssociations) {
        const assocData = p.createData.tenderAssociations as { create: { associationId: number }[] };
        await prisma.tenderAssociation.createMany({
          data: assocData.create.map((a) => ({
            tenderMergedId: old.id,
            associationId: a.associationId,
          })),
          skipDuplicates: true,
        });
      }

      const wasAlready = old.apm === "YES" && old.tenderAssociations.length > 0;
      const afterApm = (updateData.apm as string | undefined) ?? old.apm;
      const afterHasAssociations = addedAssociations || old.tenderAssociations.length > 0;
      if (!wasAlready && afterApm === "YES" && afterHasAssociations) {
        webhookQueue.push(old.referenceNo);
      }
    } else {
      const hasBrief =
        p.createData.tenderBrief != null &&
        String(p.createData.tenderBrief).trim() !== "";
      if (!hasBrief) {
        console.log(`[SKIP] ${p.refNo} - missing tender brief`);
        sheetResult.rejected.push({
          fileName,
          sheetName: sheetResult.sheetName,
          reason: "Missing tender brief",
          row: p.originalRow,
        });
        continue;
      }
      if (seenRefs.has(p.refNo)) {
        console.log(`[SKIP] Duplicate refNo in same batch: ${p.refNo}`);
        sheetResult.rejected.push({
          fileName,
          sheetName: sheetResult.sheetName,
          reason: "Duplicate reference number in batch",
          row: p.originalRow,
        });
        continue;
      }
      seenRefs.add(p.refNo);
      // console.log(`[INSERT] ${p.refNo}`);
      originalRowByRef.set(p.refNo, p.originalRow);
      toCreate.push({ ...p.createData, fileId });
      if (p.createData.apm === "YES" && p.createData.tenderAssociations) {
        webhookQueue.push(p.refNo);
      }
    }
  }

  const batches = chunk(toCreate, INSERT_BATCH_SIZE);

  for (const batch of batches) {
    try {
      await prisma.$transaction(
        batch.map((data) => prisma.tenderMerged.create({ data: data as any })),
        { timeout: TX_TIMEOUT },
      );
      sheetResult.count += batch.length;
    } catch (error) {
      console.error(error);

      for (const data of batch) {
        try {
          await prisma.tenderMerged.create({ data: data as any });
          sheetResult.count++;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          sheetResult.errors.push(
            `Row ${(data as any).referenceNo || "unknown"}: ${errorMessage}`,
          );
          const refNo = (data as any).referenceNo as string | undefined;
          const originalRow = refNo ? originalRowByRef.get(refNo) : undefined;
          sheetResult.rejected.push({
            fileName,
            sheetName: sheetResult.sheetName,
            reason: `Insert failed: ${errorMessage}`,
            row: originalRow ?? {},
          });
        }
      }
    }
  }

  if (webhookQueue.length > 0) {
    const tenders = await prisma.tenderMerged.findMany({
      where: { referenceNo: { in: webhookQueue } },
      include: { tenderAssociations: { include: { association: true } }, tenderFiles:true },
    });
    for (const t of tenders) {
      if (t.apm === "YES" && t.tenderAssociations.length > 0) {
        sendTenderWebhook(
          {
            referenceNo: t.referenceNo,
            itemCategory: t.itemCategory,
            organization: t.organization,
            deadline: t.deadline,
            tenderFileUrl:
                      t.tenderFiles.find((t) =>
                        t.tags.includes(TENDER_FILE_TYPES.TENDER_DOCUMENT),
                      )?.url ?? "",
          },
          t.tenderType === "GEM" ? "Gem" : "Non-Gem",
          t.tenderAssociations,
        );
      }
    }
  }

  return matched;
}
