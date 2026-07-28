/**
 * services/smartsheetDocketSync.ts
 *
 * Fetches Smartsheet data and populates blank docketNo fields in TenderMerged
 * by matching referenceNo against "Email Subject Line (Debosmita Nath)" or
 * "Enquiry Tender No (Marketing Team)" columns, then copying the corresponding
 * "Docket No  (Debosmita Nath)" value from the same row.
 *
 * This is a secondary lookup — it does NOT replace the primary Google Sheet
 * "Docket No-enq" flow.
 */
import { prisma } from "@/lib/prisma";
import { fetchSmartsheet } from "@/lib/smartsheet";

const EMAIL_SUBJECT_COLUMN = "Email Subject Line  (Debosmita Nath)";
const ENQUIRY_TENDER_NO_COLUMN = "Enquiry / Tender No. (Marketing Team)";
const DOCKET_NO_COLUMN = "Docket No  (Debosmita Nath)";

export interface DocketSyncStats {
  totalBlank: number;
  foundInEmailSubject: number;
  foundInEnquiryTender: number;
  notFound: number;
  errors: number;
}

export async function syncDocketFromSmartsheet(): Promise<DocketSyncStats> {
  const stats: DocketSyncStats = {
    totalBlank: 0,
    foundInEmailSubject: 0,
    foundInEnquiryTender: 0,
    notFound: 0,
    errors: 0,
  };

  // 1. Fetch raw Smartsheet data
  let sheetData;
  try {
    sheetData = await fetchSmartsheet();
  } catch (err) {
    console.warn(
      "[SmartsheetDocketSync] Failed to fetch Smartsheet data:",
      (err as Error).message,
    );
    stats.errors++;
    return stats;
  }

  // 2. Build column title → columnId map
  const columnIndex = new Map<string, number>();
  for (const col of sheetData.columns) {
    if (col.title) {
      columnIndex.set(col.title, col.id);
    }
  }

  const emailSubjectColId = columnIndex.get(EMAIL_SUBJECT_COLUMN);
  const enquiryTenderColId = columnIndex.get(ENQUIRY_TENDER_NO_COLUMN);
  const docketNoColId = columnIndex.get(DOCKET_NO_COLUMN);

  if (!docketNoColId) {
    console.warn(
      "[SmartsheetDocketSync] Docket No column not found in Smartsheet. Aborting.",
    );
    stats.errors++;
    return stats;
  }

  // 3. Query TenderMerged records with blank docketNo
  const blankDocketRecords = await prisma.tenderMerged.findMany({
    where: {
      docketNo: { equals: null },
    },
    select: { id: true, referenceNo: true },
  });

  stats.totalBlank = blankDocketRecords.length;

  if (blankDocketRecords.length === 0) {
    return stats;
  }

  // 4. Build lookup maps from Smartsheet rows for fast searching
  const rows = sheetData.rows || [];

  // Pre-process Smartsheet rows into lookup structures
  const emailSubjectToDocket = new Map<string, string>();
  const enquiryTenderToDocket = new Map<string, string>();

  for (const row of rows) {
    const cells = row.cells || [];

    const getCellValue = (colId: number | undefined): string | null => {
      if (colId === undefined) return null;
      const cell = cells.find((c) => c.columnId === colId);
      if (!cell) return null;
      if (cell.displayValue !== undefined && cell.displayValue !== null) {
        return String(cell.displayValue).trim() || null;
      }
      if (cell.value !== undefined && cell.value !== null) {
        return String(cell.value).trim() || null;
      }
      return null;
    };

    const docketVal = getCellValue(docketNoColId);
    if (!docketVal) continue;

    if (emailSubjectColId !== undefined) {
      const emailVal = getCellValue(emailSubjectColId);
      if (emailVal) {
        emailSubjectToDocket.set(emailVal.toLowerCase(), docketVal);
      }
    }

    if (enquiryTenderColId !== undefined) {
      const enquiryVal = getCellValue(enquiryTenderColId);
      if (enquiryVal) {
        enquiryTenderToDocket.set(enquiryVal.toLowerCase(), docketVal);
      }
    }
  }

  // 5. For each blank-docket TenderMerged record, search Smartsheet rows
  for (const record of blankDocketRecords) {
    const refNoLower = record.referenceNo.toLowerCase().trim();
    if (!refNoLower) {
      stats.notFound++;
      continue;
    }

    let foundDocket: string | null = null;
    let source: "emailSubject" | "enquiryTender" | null = null;

    // Check "Email Subject Line (Debosmita Nath)" — substring match
    for (const [emailVal, docketVal] of emailSubjectToDocket) {
      if (emailVal.includes(refNoLower)) {
        foundDocket = docketVal;
        source = "emailSubject";
        break;
      }
    }

    // Fallback: check "Enquiry Tender No (Marketing Team)" — substring match
    if (!foundDocket) {
      for (const [enquiryVal, docketVal] of enquiryTenderToDocket) {
        if (enquiryVal.includes(refNoLower)) {
          foundDocket = docketVal;
          source = "enquiryTender";
          break;
        }
      }
    }

    if (!foundDocket) {
      stats.notFound++;
      continue;
    }

    // 6. Update TenderMerged record
    try {
      await prisma.tenderMerged.update({
        where: { id: record.id },
        data: { docketNo: foundDocket },
      });

      if (source === "emailSubject") {
        stats.foundInEmailSubject++;
      } else {
        stats.foundInEnquiryTender++;
      }
    } catch (err) {
      console.warn(
        `[SmartsheetDocketSync] Failed to update docketNo for ${record.referenceNo}:`,
        (err as Error).message,
      );
      stats.errors++;
    }
  }

  return stats;
}
