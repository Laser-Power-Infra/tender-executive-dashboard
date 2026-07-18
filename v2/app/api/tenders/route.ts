import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface FlatRow {
  type: "Gem" | "Non-Gem";
  id: string;
  reportings?: string;
  evaluations?: string;
  [key: string]: string | undefined;
}

interface AssociationInfo {
  id: number;
  name: string;
}

const GEM_DISPLAY_FIELDS = [
  "referenceNo", "tenderBrief", "value", "deadline", "quantity", "app", "aps", "apm", "assignedTo", "location", "website",
  "organization", "documentFees", "emd", "msmeExemption",
  "startupExemption", "bidOpeningDateTime",
  "bidOfferValidity", "ministryStateName", "departmentName",
  "officeName", "minimumAverageAnnualTurnover", "yearsOfPastExperience",
  "oemAverageTurnover", "contractPeriod",
  "financialDocumentPriceBreakupRequired", "similarCategory",
  "pastExperienceSimilarServicesRequired", "documentRequiredFromSeller",
  "pastPerformance", "bidToRaEnabled", "raQualificationRule",
  "boqTitle", "bidDetails", "comprehensiveMaintenanceChargesRequired",
  "typeOfBid", "technicalClarificationTimeAllowed", "inspectionRequired",
  "estimatedBidValue", "evaluationMethod", "advisoryBank",
  "ePbgPercentage", "ePbgDurationMonths", "msePurchasePreference",
  "miiPurchasePreference", "consigneesReportingOfficer",
  "mediationClause", "arbitrationClause", "checklist",
  "t247Id", "scrapedDate", "source", "assignedTo",
  "markedStatus", "sheetStatus", "ready", "searchKey",
  "downloadLink", "currency",
  "bidStatus", "differenceBetweenRank1",
] as const;

const NON_GEM_DISPLAY_FIELDS = [
  "referenceNo", "tenderBrief", "estimatedBidValue", "deadline", "quantity", "app", "aps", "apm", "assignedTo",
  "location", "website", "organization", "documentFees", "emd",
  "msmeExemption", "startupExemption", "checklist",
  "t247Id", "scrapedDate", "source", "assignedTo",
  "markedStatus", "sheetStatus", "ready", "searchKey",
  "downloadLink", "currency",
] as const;

const ALL_KNOWN_FIELDS = (() => {
  const fields = [...new Set([
    ...GEM_DISPLAY_FIELDS,
    ...NON_GEM_DISPLAY_FIELDS,
    "tenderStatusId",
    "aiRelevanceValid",
    "aiRelevanceReason",
    "excludedCategory",
    "tenderFileUrl",
    "itemCategory",
    "totalQuantity",
    "reportings",
    "evaluations",
    "parseStatus",
    "parseError",
  ])];
  const urlIdx = fields.indexOf("tenderFileUrl");
  if (urlIdx > 0) {
    fields.splice(urlIdx, 1);
    fields.splice(10, 0, "tenderFileUrl");
  }
  const catIdx = fields.indexOf("itemCategory");
  if (catIdx > 0) {
    fields.splice(catIdx, 1);
    fields.splice(11, 0, "itemCategory");
  }
  const qtyIdx = fields.indexOf("totalQuantity");
  if (qtyIdx > 0) {
    fields.splice(qtyIdx, 1);
    fields.splice(12, 0, "totalQuantity");
  }
  const repIdx = fields.indexOf("reportings");
  if (repIdx > 0) {
    fields.splice(repIdx, 1);
    fields.splice(13, 0, "reportings");
  }
  const evalIdx = fields.indexOf("evaluations");
  if (evalIdx > 0) {
    fields.splice(evalIdx, 1);
    fields.splice(14, 0, "evaluations");
  }
  const bsIdx = fields.indexOf("bidStatus");
  if (bsIdx > 0) {
    fields.splice(bsIdx, 1);
    fields.splice(15, 0, "bidStatus");
  }
  const diffIdx = fields.indexOf("differenceBetweenRank1");
  if (diffIdx > 0) {
    fields.splice(diffIdx, 1);
    fields.splice(16, 0, "differenceBetweenRank1");
  }
  const psIdx = fields.indexOf("parseStatus");
  if (psIdx > 0) {
    fields.splice(psIdx, 1);
    fields.splice(17, 0, "parseStatus");
  }
  const peIdx = fields.indexOf("parseError");
  if (peIdx > 0) {
    fields.splice(peIdx, 1);
    fields.splice(18, 0, "parseError");
  }
  return fields;
})();

interface ReportingInfo {
  id: number;
  officer: string;
  address: string | null;
  quantity: string | null;
}

interface EvaluationInfo {
  id: number;
  sellerName: string;
  offeredItem: string | null;
  totalPrice: string | null;
  rank: string | null;
  status: string | null;
}

function flattenTender(
  tender: Record<string, unknown>,
  extraFields: { fieldName: string; fieldValue: string | null }[],
  type: "Gem" | "Non-Gem",
  id: number,
  tenderAssociations: { association: AssociationInfo }[],
  reportings?: ReportingInfo[],
  evaluations?: EvaluationInfo[],
): FlatRow {
  const assignedIds = tenderAssociations.map((ta) => ta.association.id).join(",");
  const row: FlatRow = { type, id: String(id) };

  for (const field of ALL_KNOWN_FIELDS) {
    const val = tender[field];
    if (val instanceof Date) {
      row[field] = val.toISOString().split("T")[0];
    } else {
      row[field] = val == null ? "" : String(val);
    }
  }

  row.assignedTo = assignedIds;

  for (const ef of extraFields) {
    row[ef.fieldName] = ef.fieldValue ?? "";
  }

  if (reportings && reportings.length > 0) {
    row.reportings = JSON.stringify(reportings);
  } else {
    row.reportings = "";
  }

  if (evaluations && evaluations.length > 0) {
    row.evaluations = JSON.stringify(evaluations);
  } else {
    row.evaluations = "";
  }

  return row;
}

export async function GET(request: NextRequest) {
  try {
    const fileIdStr = request.nextUrl.searchParams.get("fileId");
    if (!fileIdStr) {
      return NextResponse.json(
        { error: "fileId query parameter is required" },
        { status: 400 }
      );
    }
    const fileId = parseInt(fileIdStr, 10);
    if (isNaN(fileId)) {
      return NextResponse.json({ error: "invalid fileId" }, { status: 400 });
    }

    const fileRecord = await prisma.file.findUnique({ where: { id: fileId } });
    if (!fileRecord) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const [gemTenders, nonGemTenders, allAssociations] = await Promise.all([
      prisma.gemTender.findMany({
        where: { fileId },
        include: { extraFields: true, tenderAssociations: { include: { association: true } }, reportings: true, evaluations: true },
      }),
      prisma.nonGemTender.findMany({
        where: { fileId },
        include: { extraFields: true, tenderAssociations: { include: { association: true } } },
      }),
      prisma.association.findMany({ select: { id: true, name: true, email: true } }),
    ]);

    // console.log("associations count:", allAssociations.length, allAssociations);

    const rows: FlatRow[] = [];

    for (const t of gemTenders) {
      rows.push(flattenTender(t as unknown as Record<string, unknown>, t.extraFields, "Gem", t.id, t.tenderAssociations, t.reportings, t.evaluations));
    }
    for (const t of nonGemTenders) {
      rows.push(flattenTender(t as unknown as Record<string, unknown>, t.extraFields, "Non-Gem", t.id, t.tenderAssociations));
    }

    const allExtraFieldNames = [
      ...new Set(
        [...gemTenders, ...nonGemTenders].flatMap((t) =>
          t.extraFields.map((ef) => ef.fieldName)
        )
      ),
    ];

    const columns = ["type", "id", ...ALL_KNOWN_FIELDS, ...allExtraFieldNames];

    return NextResponse.json({
      fileName: fileRecord.fileName,
      columns,
      rows,
      associations: allAssociations,
      totalGem: gemTenders.length,
      totalNonGem: nonGemTenders.length,
    });
  } catch (error) {
    console.error("Tenders fetch error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
