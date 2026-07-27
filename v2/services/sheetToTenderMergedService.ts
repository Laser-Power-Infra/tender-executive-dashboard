import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { GoogleSheetService } from "./googleSheetService";
import { TENDER_FILE_TYPES } from "@/lib/tender-file-types";
import { getNetworkFolderIndex } from "./documentIndexer";
import { extractNumericDocket } from "@/lib/extractNumericDocket";
import { encryptPath } from "@/lib/fileCrypto";
import type { EpcTenderRecord } from "@/types/tender";

interface AssociationInfo {
  id: number;
  name: string;
  email: string;
}

interface FlatRow {
  type: "Gem" | "Non-Gem";
  id: string;
  reportings?: string;
  evaluations?: string;
  tenderFiles?: string;
  [key: string]: string | undefined;
}

export interface SyncResult {
  summary: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    linked: number;
    errors: number;
  };
  tenders: {
    fileName: string;
    columns: string[];
    rows: FlatRow[];
    associations: AssociationInfo[];
    totalGem: number;
    totalNonGem: number;
  };
}

const SKIP_RELATION_FIELDS = new Set([
  "extraFields", "tenderAssociations", "reportings", "evaluations",
  "file", "tenderStatus", "utilityMapping",
]);

function flattenTender(
  tender: Record<string, unknown>,
  type: "Gem" | "Non-Gem",
  id: number,
): FlatRow {
  const row: FlatRow = { type, id: String(id) };
  for (const field of Object.keys(tender)) {
    if (SKIP_RELATION_FIELDS.has(field)) continue;
    const val = tender[field];
    if (val instanceof Date) {
      row[field] = val.toISOString().split("T")[0];
    } else {
      row[field] = val == null ? "" : String(val);
    }
  }
  const tenderFilesVal = tender["tenderFiles"];
  if (Array.isArray(tenderFilesVal) && tenderFilesVal.length > 0) {
    row.tenderFiles = JSON.stringify(tenderFilesVal);
  } else {
    row.tenderFiles = "";
  }
  return row;
}

function deriveTenderType(typeOfTender: string): "GEM" | "NON_GEM" {
  return typeOfTender?.toLowerCase().includes("gem") ? "GEM" : "NON_GEM";
}

function parseParticipated(val: unknown): boolean | null {
  const s = String(val ?? "").toLowerCase().trim();
  if (s === "yes") return true;
  if (s === "no") return false;
  return null;
}

function parsePrice(val: unknown): "FIRM" | "VARIABLE" | null {
  const s = String(val ?? "").toUpperCase().trim();
  if (s === "FIRM") return "FIRM";
  if (s === "VARIABLE") return "VARIABLE";
  return null;
}

function parseApm(val: unknown): "YES" | "NO" | "NOT_DECIDED" {
  const s = String(val ?? "").toUpperCase().trim();
  if (s === "YES") return "YES";
  if (s === "NO") return "NO";
  return "NOT_DECIDED";
}

function parseDate(val: unknown): Date | null {
  if (!val || val === "N/A" || val === "") return null;
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

function deriveDeadline(...dates: (Date | null)[]): Date | null {
  const valid = dates.filter((d): d is Date => d !== null);
  if (valid.length === 0) return null;
  return new Date(Math.max(...valid.map((d) => d.getTime())));
}

function findMatchingAssociation(
  name: string,
  associations: { id: number; name: string }[],
): { id: number } | null {
  if (!name || name === "#N/A") return null;
  const lower = name.toLowerCase().trim();
  return (
    associations.find(
      (a) =>
        a.name.toLowerCase() === lower ||
        a.name.toLowerCase().includes(lower) ||
        lower.includes(a.name.toLowerCase()),
    ) ?? null
  );
}

async function findOrCreateSheetSyncFile(): Promise<number> {
  let file = await prisma.file.findFirst({ where: { fileName: "Sheet Sync" } });
  if (!file) {
    file = await prisma.file.create({
      data: { fileName: "Sheet Sync", status: "active" },
    });
  }
  return file.id;
}

interface ScannedFile {
  name: string;
  extension: string;
  absolutePath: string;
  size: number;
  modifiedDate: Date;
}

async function scanFolderFiles(folderPath: string): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  async function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const fullPath = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(fullPath);
      } else if (e.isFile() && !e.name.startsWith("~$") && !e.name.endsWith(".tmp")) {
        let stats: fs.Stats;
        try {
          stats = await fs.promises.stat(fullPath);
        } catch {
          continue;
        }
        const ext = path.extname(e.name);
        results.push({
          name: path.basename(e.name, ext),
          extension: ext,
          absolutePath: fullPath,
          size: stats.size,
          modifiedDate: stats.mtime,
        });
      }
    }
  }
  await walk(folderPath);
  return results;
}

function buildTenderData(
  row: EpcTenderRecord,
  deadline: Date | null,
  participated: boolean | null,
  price: "FIRM" | "VARIABLE" | null,
) {
  return {
    tenderType: deriveTenderType(row.typeOfTender),
    tenderBrief: row.nameOfWorkDescription || null,
    docketNo: row.docketNo || null,
    organization: row.nameOfTheClient || null,
    deadline,
    tenderOpeningDate: parseDate(row.tenderOpeningDate),
    size: row.totalQuantityMeter != null ? String(row.totalQuantityMeter) : null,
    documentFees: row.costOfTenderFeeRs != null ? String(row.costOfTenderFeeRs) : null,
    emd: row.emdAmountRs != null ? String(row.emdAmountRs) : null,
    estimatedBidValue: row.estimatedCostRs != null ? String(row.estimatedCostRs) : null,
    bidOfferValidity: row.bidValidityDays != null ? String(row.bidValidityDays) : null,
    contractPeriod: row.contractPeriodDays != null ? String(row.contractPeriodDays) : null,
    bidStatus: String(row.currentStatus ?? ""),
    slNo: row.slNo || null,
    participated: participated !== null ? participated : undefined,
    reverseAuctionApplicable: row.reverseAuctionApplicable ?? null,
    reverseAuctionDate: parseDate(row.reverseAuctionDate),
    emdPaymentMode: row.emdPaymentMode || null,
    bgNoUtrNo: row.bgNoUtrNo || null,
    emdValidity: parseDate(row.emdValidity),
    loiPoNoAndDate: row.loiPoNoAndDate || null,
    remarks: row.remarks || null,
    bidValidityExpired: row.bidValidityExpired ?? null,
    price,
    diffPercentFromL1: row.diffPercentFromL1 ?? null,
    diffPercentFromL2: row.diffPercentFromL2 ?? null,
    reason: row.reason || null,
    finalRemarks: row.finalRemarks || null,
  };
}

export async function syncSheetToTenderMerged(): Promise<SyncResult> {
  const summary = { total: 0, created: 0, updated: 0, skipped: 0, linked: 0, errors: 0 };

  const [associations, fileId] = await Promise.all([
    prisma.association.findMany(),
    findOrCreateSheetSyncFile(),
  ]);

  const sheetService = new GoogleSheetService();
  let records: EpcTenderRecord[];
  try {
    records = await sheetService.fetchTenderRecords();
  } catch (e) {
    throw new Error(`Failed to fetch sheet data: ${(e as Error).message}`);
  }

  console.log("[SheetSync] Fetched", records.length, "records from sheet");
  console.log("[SheetSync] Sample (first 10):");
  for (let i = 0; i < Math.min(records.length, 10); i++) {
    const r = records[i];
    console.log("[SheetSync] [" + (i + 1) + "]", JSON.stringify({
      tenderNoNitNo: r.tenderNoNitNo,
      docketNo: r.docketNo,
      typeOfTender: r.typeOfTender,
      nameOfWorkDescription: r.nameOfWorkDescription,
      nameOfTheClient: r.nameOfTheClient,
      lastDateOfSubmission: r.lastDateOfSubmission,
      tenderSubmittedDate: r.tenderSubmittedDate,
      managementDecision: r.managementDecision,
      participated: r.participated,
      currentStatus: r.currentStatus,
      price: r.price,
      attachmentUrl: r.attachmentUrl,
      itemCategory: r.itemCategory,
      tenderPrepareBy: r.tenderPrepareBy,
    }, null, 2));
  }

  const valid = records.filter((r) => r.tenderNoNitNo?.trim());
  summary.total = valid.length;

  const affectedRefNos: string[] = [];

  for (const row of valid) {
    try {
      const refNo = row.tenderNoNitNo.trim();

      const deadline = deriveDeadline(
        parseDate(row.lastDateOfSubmission),
        parseDate(row.tenderSubmittedDate),
      );

      const participated = parseParticipated(row.participated);
      const price = parsePrice(row.price);
      const data = buildTenderData(row, deadline, participated, price);

      const existing = await prisma.tenderMerged.findUnique({
        where: { referenceNo: refNo },
        select: { id: true, deadline: true },
      });

      if (!existing) {
        await prisma.tenderMerged.create({
          data: {
            ...data,
            referenceNo: refNo,
            apm: parseApm(row.managementDecision),
            fileId,
            app: "NOT_DECIDED",
            aps: "NOT_DECIDED",
          },
        });
        summary.created++;
        affectedRefNos.push(refNo);
      } else {
        const updateData: Record<string, unknown> = { ...data };
        if (deadline && (!existing.deadline || deadline > existing.deadline)) {
          updateData.deadline = deadline;
        } else {
          delete updateData.deadline;
        }
        if (participated !== null) {
          updateData.participated = participated;
        } else {
          delete updateData.participated;
        }
        await prisma.tenderMerged.update({
          where: { referenceNo: refNo },
          data: updateData,
        });
        summary.updated++;
        affectedRefNos.push(refNo);
      }

      // Get TenderMerged id for association linking and TenderFile
      const merged = await prisma.tenderMerged.findUnique({
        where: { referenceNo: refNo },
        select: { id: true },
      });
      if (!merged) continue;

      // Association linking
      const matched = findMatchingAssociation(row.tenderPrepareBy, associations);
      if (matched) {
        const already = await prisma.tenderAssociation.findFirst({
          where: { tenderMergedId: merged.id, associationId: matched.id },
        });
        if (!already) {
          await prisma.tenderAssociation.create({
            data: { tenderMergedId: merged.id, associationId: matched.id },
          });
          summary.linked++;
        }
      }

      // Costing attachment - sync as TenderFile
      if (row.attachmentUrl) {
        await prisma.tenderFile.deleteMany({
          where: {
            tenderMergedId: merged.id,
            tags: { has: TENDER_FILE_TYPES.COSTING_ATTACHMENT },
          },
        });
        const urlStr = row.attachmentUrl;
        const urlParts = urlStr.split("/").pop()?.split(".") || [];
        const name = urlParts.length > 1 ? urlParts.slice(0, -1).join(".") : urlParts[0] || "attachment";
        const extension = urlParts.length > 1 ? urlParts[urlParts.length - 1] : "";
        await prisma.tenderFile.create({
          data: {
            name,
            extension,
            url: urlStr,
            source: "SHEET_SYNC",
            tags: [TENDER_FILE_TYPES.COSTING_ATTACHMENT],
            tenderMergedId: merged.id,
          },
        });
        console.log("[SheetSync] Created TenderFile for", refNo, { name, extension, url: urlStr, tenderMergedId: merged.id });
      }
    } catch (e) {
      summary.errors++;
    }
  }

  // ── Network folder scan → TenderFile entries (parallel with concurrency) ──
  try {
    const folderIndex = await getNetworkFolderIndex();
    const networkTenders = await prisma.tenderMerged.findMany({
      where: { referenceNo: { in: affectedRefNos } },
      select: { id: true, docketNo: true },
    });

    const matchedTenders = networkTenders.filter((tm) => {
      const numericDocket = extractNumericDocket(tm.docketNo);
      return numericDocket && folderIndex.has(numericDocket);
    });

    const CONCURRENCY = 6;
    for (let i = 0; i < matchedTenders.length; i += CONCURRENCY) {
      const chunk = matchedTenders.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async (tm) => {
          const numericDocket = extractNumericDocket(tm.docketNo)!;
          const { folderPath } = folderIndex.get(numericDocket)!;
          const files = await scanFolderFiles(folderPath);

          await prisma.tenderFile.deleteMany({
            where: {
              tenderMergedId: tm.id,
              tags: { has: TENDER_FILE_TYPES.NETWORK_FILES },
            },
          });

          for (const f of files) {
            await prisma.tenderFile.create({
              data: {
                name: f.name,
                extension: f.extension,
                url: f.absolutePath,
                source: encryptPath(f.absolutePath),
                tags: [TENDER_FILE_TYPES.NETWORK_FILES],
                tenderMergedId: tm.id,
              },
            });
          }
        }),
      );
    }

    if (matchedTenders.length > 0) {
      console.log(`[SheetSync] Network files synced for ${matchedTenders.length} tenders (${Math.ceil(matchedTenders.length / CONCURRENCY)} batches)`);
    }
  } catch (e) {
    console.warn("[SheetSync] Network folder scan failed:", (e as Error).message);
  }

  // ── Condutor BoQ comparative chart files ──
  try {
    const condutorPath = process.env.CONDUTOR_PATH;
    if (!condutorPath) {
      console.warn("[SheetSync] CONDUTOR_PATH not set, skipping BoQ comparative chart sync");
    } else {
      const resolvedCondutorPath = path.resolve(condutorPath);
      if (!fs.existsSync(resolvedCondutorPath)) {
        console.warn("[SheetSync] CONDUTOR_PATH not found:", resolvedCondutorPath);
      } else {
        const tenderIdPattern = /(\d{4}_[A-Z]+_\d+_\d+)/;
        const condutorMap = new Map<string, string>();
        const condutorFiles = fs.readdirSync(resolvedCondutorPath);
        for (const filename of condutorFiles) {
          if (!filename.toLowerCase().endsWith(".xlsx")) continue;
          const match = filename.match(tenderIdPattern);
          if (!match) continue;
          const tenderId = match[1];
          const cleanId = tenderId.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!cleanId) continue;
          const filePath = path.join(resolvedCondutorPath, filename);
          if (!condutorMap.has(cleanId)) {
            condutorMap.set(cleanId, filePath);
          } else if (!/\(\d+\)/.test(filename)) {
            condutorMap.set(cleanId, filePath);
          }
        }

        if (condutorMap.size > 0) {
          const condutorTenders = await prisma.tenderMerged.findMany({
            where: { referenceNo: { in: affectedRefNos } },
            select: { id: true, referenceNo: true },
          });

          let matchedCount = 0;
          for (const tm of condutorTenders) {
            if (!tm.referenceNo) continue;
            const cleanRefNo = tm.referenceNo.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!cleanRefNo) continue;

            let matchedPath: string | undefined;
            for (const [condutorCleanId, condutorFilePath] of condutorMap) {
              if (
                cleanRefNo.includes(condutorCleanId) ||
                condutorCleanId.includes(cleanRefNo)
              ) {
                matchedPath = condutorFilePath;
                break;
              }
            }

            if (!matchedPath) continue;
            matchedCount++;

            await prisma.tenderFile.deleteMany({
              where: {
                tenderMergedId: tm.id,
                tags: { has: TENDER_FILE_TYPES.BOQ_COMPARATIVE_CHART },
              },
            });

            const filename = path.basename(matchedPath);
            const ext = path.extname(filename);
            const name = ext ? filename.slice(0, -ext.length) : filename;
            await prisma.tenderFile.create({
              data: {
                name,
                extension: ext.replace(".", ""),
                url: matchedPath,
                source: encryptPath(matchedPath),
                tags: [TENDER_FILE_TYPES.BOQ_COMPARATIVE_CHART],
                tenderMergedId: tm.id,
              },
            });
          }

          console.log(`[SheetSync] BoQ comparative chart synced for ${matchedCount} tenders from Condutor`);
        }
      }
    }
  } catch (e) {
    console.warn("[SheetSync] Condutor BoQ scan failed:", (e as Error).message);
  }

  // Fetch affected records to return as TenderData
  const affected = await prisma.tenderMerged.findMany({
    where: { referenceNo: { in: affectedRefNos } },
    include: {
      extraFields: true,
      tenderAssociations: { include: { association: true } },
      reportings: true,
      evaluations: true,
      tenderFiles: true,
    },
  });

  const rows: FlatRow[] = [];
  let totalGem = 0;
  let totalNonGem = 0;

  for (const t of affected) {
    const type: "Gem" | "Non-Gem" = t.tenderType === "GEM" ? "Gem" : "Non-Gem";
    if (type === "Gem") totalGem++;
    else totalNonGem++;
    rows.push(flattenTender(t as unknown as Record<string, unknown>, type, t.id));
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const allAssociations = associations.map((a) => ({ id: a.id, name: a.name, email: a.email }));

  return {
    summary,
    tenders: {
      fileName: `Sheet Sync (${summary.created} new, ${summary.updated} updated)`,
      columns,
      rows,
      associations: allAssociations,
      totalGem,
      totalNonGem,
    },
  };
}
