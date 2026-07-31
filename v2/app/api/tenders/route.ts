import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface TenderFileInfo {
  id: number;
  name: string;
  extension: string;
  url: string;
  source: string;
  tags: string[];
}

interface FlatRow {
  type: "Gem" | "Non-Gem";
  id: string;
  reportings?: string;
  evaluations?: string;
  tenderFiles?: string;
  [key: string]: string | undefined;
}

interface AssociationInfo {
  id: number;
  name: string;
}

const SKIP_RELATION_FIELDS = new Set([
  "extraFields", "tenderAssociations", "reportings", "evaluations",
  "tenderFiles", "file", "tenderStatus", "utilityMapping",
]);

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
  tenderFiles?: TenderFileInfo[],
): FlatRow {
  const assignedIds = tenderAssociations.map((ta) => ta.association.id).join(",");
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

  row.assignedTo = assignedIds;

  const docFile = tenderFiles?.find((f) => f.tags.includes("tenderDocument"));
  row.tenderFileUrl = docFile?.url ?? "";

  const costingFile = tenderFiles?.find((f) => f.tags.includes("costingAttachment"));
  row.costingFileUrl = costingFile?.source && costingFile.source !== 'SHEET_SYNC'
    ? `/api/executive-files/view/${costingFile.source}`
    : costingFile?.url ?? "";

  if (tenderFiles && tenderFiles.length > 0) {
    row.tenderFiles = JSON.stringify(tenderFiles);
  } else {
    row.tenderFiles = "";
  }

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

    const [tenderMerged, allAssociations] = await Promise.all([
      prisma.tenderMerged.findMany({
        where: { fileId },
        include: {
          extraFields: true,
          tenderAssociations: { include: { association: true } },
          reportings: true,
          evaluations: true,
          tenderFiles: true,
        },
      }),
      prisma.association.findMany({ select: { id: true, name: true, email: true } }),
    ]);

    const rows: FlatRow[] = [];

    let totalGem = 0;
    let totalNonGem = 0;

    for (const t of tenderMerged) {
      const type: "Gem" | "Non-Gem" = t.tenderType === "GEM" ? "Gem" : "Non-Gem";
      if (type === "Gem") totalGem++;
      else totalNonGem++;

      rows.push(flattenTender(
        t as unknown as Record<string, unknown>,
        t.extraFields,
        type,
        t.id,
        t.tenderAssociations,
        t.reportings,
        t.evaluations,
        t.tenderFiles,
      ));
    }

    const allExtraFieldNames = [
      ...new Set(
        tenderMerged.flatMap((t) =>
          t.extraFields.map((ef) => ef.fieldName)
        )
      ),
    ];

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return NextResponse.json({
      fileName: fileRecord.fileName,
      columns,
      rows,
      associations: allAssociations,
      totalGem,
      totalNonGem,
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
