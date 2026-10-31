import {
  EpcTenderRecord,
  ManagementDecision,
  EMDExchangeMode
} from "@/types/tender";
import { AttachmentJoinService } from "./attachmentJoinService";
import { prisma } from "@/lib/prisma";
import { TENDER_FILE_TYPES } from "@/lib/tender-file-types";
import { getAccessToken, getCleanCredentials } from "@/lib/googleDrive";
import { parseRupees } from "@/lib/rupees";

/**
 * Loads tender records from TenderMerged and joins costing attachment links
 * from the Google costing sheet (Service Account auth, server-side only).
 */
export class GoogleSheetService {
  /**
   * Fetches records using Service Account credentials.
   * Runs strictly in Node.js server-side environments.
   */
  public async fetchTenderRecords(options?: {
    onlyTendersMissingCosting?: boolean;
  }): Promise<EpcTenderRecord[]> {
    console.log("[GoogleSheetService] Fetching tender records from DB (TenderMerged with docketNo)...");

    const records = await prisma.tenderMerged.findMany({
      where: {
        docketNo: { not: null },
        deleteRequestedAt: null,
        ...(options?.onlyTendersMissingCosting
          ? {
              NOT: {
                tenderFiles: {
                  some: { tags: { has: TENDER_FILE_TYPES.COSTING_ATTACHMENT } },
                },
              },
            }
          : {}),
      },
      include: {
        tenderAssociations: { include: { association: true } },
      },
    });

    const tenders: EpcTenderRecord[] = records.map((r) => this.tenderMergedToEpcRecord(r));
    console.log(`[GoogleSheetService] Mapped ${tenders.length} tender records from DB.`);

    // Fetch and join costing attachments from Spreadsheet 2
    const creds = getCleanCredentials();
    if (!creds) {
      throw new Error(
        "Google Sheets Service Account credentials are missing. " +
        "To connect to private sheets, configure GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in your server environment."
      );
    }
    const accessToken = await getAccessToken(creds.email, creds.key);
    let costingRows: string[][] = [];
    try {
      const costingSpreadsheetId = "1m1ECaxiGYmQrvSPYOBov5YYFq8G-mVNMdPWvGcSfoHs";
      const costingRange = "TENDER COSTING ATTACHMENT!A1:ZZ";
      const costingUrl = `https://sheets.googleapis.com/v4/spreadsheets/${costingSpreadsheetId}/values/${encodeURIComponent(costingRange)}`;
      console.log("[GoogleSheetService] Fetching costing attachment sheet...");
      const costingResponse = await fetch(costingUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });
      if (costingResponse.ok) {
        const costingData = await costingResponse.json() as { values?: string[][] };
        costingRows = costingData.values || [];
        console.log(`[GoogleSheetService] Fetched costing sheet: ${costingRows.length} rows.`);
      } else {
        console.warn(`[GoogleSheetService] Failed to fetch costing sheet: ${costingResponse.statusText}. Proceeding without costing links.`);
      }
    } catch (err) {
      console.warn(`[GoogleSheetService] Error fetching costing sheet: ${(err as Error).message}. Proceeding without costing links.`);
    }

    const enriched = AttachmentJoinService.join(tenders, costingRows);
    const withAttachment = enriched.filter(t => t.attachmentUrl).length;
    console.log(`[GoogleSheetService] Costing join complete: ${withAttachment} of ${enriched.length} records have attachment URLs.`);
    return enriched;
  }

  // =========================================================================
  // TenderMerged DB → EpcTenderRecord mapping
  // =========================================================================

  private tenderMergedToEpcRecord(tm: Record<string, any>): EpcTenderRecord {
    const findAssociationName = (): string => {
      const assocs = tm.tenderAssociations;
      if (Array.isArray(assocs) && assocs.length > 0) {
        return assocs[0]?.association?.name || "";
      }
      return "";
    };

    const parseNum = (val: string | null | undefined): number | null => {
      if (val == null) return null;
      const n = parseFloat(val);
      return isNaN(n) ? null : n;
    };

    const apmToDecision = (apm: string | null): ManagementDecision => {
      if (apm === "YES") return ManagementDecision.GO;
      if (apm === "NO") return ManagementDecision.NO_GO;
      return ManagementDecision.PENDING;
    };

    return {
      slNo: tm.slNo ?? 0,
      docketNo: tm.docketNo ?? "",
      tenderFor: tm.tenderFor ?? "",
      tenderType: tm.tenderType === "GEM" ? "GEM" : "NON-GEM",
      tenderNoNitNo: tm.referenceNo,
      nameOfWorkDescription: tm.tenderBrief ?? undefined,
      totalQuantityMeter: parseNum(tm.size),
      nameOfTheClient: tm.organization ?? "",
      lastDateOfSubmission: tm.deadline,
      tenderOpeningDate: tm.tenderOpeningDate,
      costOfTenderFeeRs: parseRupees(tm.documentFees),
      emdAmountRs: parseRupees(tm.emd),
      estimatedCostRs: parseRupees(tm.value),
      bidValidityDays: tm.bidValidityDays,
      contractPeriodDays: tm.contractPeriodDays,
      managementDecision: apmToDecision(tm.apm),
      participated: tm.participated,
      tenderPrepareBy: findAssociationName(),
      currentStatus: tm.currentStatus ?? "",
      tenderSubmittedDate: null,
      reverseAuctionApplicable: tm.reverseAuctionApplicable,
      reverseAuctionDate: tm.reverseAuctionDate,
      reverseAuctionStartDate: tm.reverseAuctionStartDate
        ? new Date(tm.reverseAuctionStartDate)
        : null,
      reverseAuctionEndDate: tm.reverseAuctionEndDate
        ? new Date(tm.reverseAuctionEndDate)
        : null,
      emdPaymentMode: tm.emdPaymentMode as EMDExchangeMode | null,
      bgNoUtrNo: tm.bgNoUtrNo,
      emdValidity: tm.emdValidity,
      loiPoNoAndDate: tm.loiPoNoAndDate,
      remarks: tm.remarks,
      bidValidityExpired: tm.bidValidityExpired ?? false,
      diffPercentFromL1: tm.diffPercentFromL1,
      diffPercentFromL2: tm.diffPercentFromL2,
      reason: tm.reason,
      finalRemarks: tm.finalRemarks,
      price: tm.price ?? null,
      attachmentUrl: null,
    };
  }
}
