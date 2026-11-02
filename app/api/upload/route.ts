import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import pLimit from "p-limit";
import { prisma } from "@/lib/prisma";
import { hasReferenceNoColumn, findHeaderRowIndex } from "@/lib/tender-columns";
import { withLog } from "@/lib/activity-logger";
import { isValidCategorySelection } from "@/lib/tender-categories";
import {
  insertTenderMerged,
  loadUpsertContext,
  prepareTenderRow,
  type CategoryFields,
  type PreparedTender,
  type RejectedRow,
  type SheetResult,
  type UpsertContext,
} from "@/lib/tender-upsert";

const SHEET_CONCURRENCY = 3;

interface FileResult {
  fileName: string;
  fileId: number;
  sheets: SheetResult[];
  totalCount: number;
  totalErrors: string[];
  excludedCount: number;
  rejected: RejectedRow[];
}

interface ParsedSheet {
  sheetName: string;
  prepared: PreparedTender[];
  skipped: boolean;
  excludedCount: number;
  rejected: RejectedRow[];
}

function parseSheetData(
  workbook: XLSX.WorkBook,
  sheetName: string,
  fileName: string,
  ctx: UpsertContext,
): ParsedSheet {
  const sheet = workbook.Sheets[sheetName];
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  });

  if (!rawRows.length) {
    return {
      sheetName,
      prepared: [],
      skipped: true,
      excludedCount: 0,
      rejected: [],
    };
  }

  const headerRowIdx = findHeaderRowIndex(rawRows);
  if (headerRowIdx < 0) {
    return {
      sheetName,
      prepared: [],
      skipped: true,
      excludedCount: 0,
      rejected: [],
    };
  }

  const headers = (rawRows[headerRowIdx] as unknown[])
    .map((h) => (h == null ? "" : String(h).trim()))
    .filter(Boolean);

  console.log(`[UPLOAD] Headers for sheet "${sheetName}":`, headers);

  if (!hasReferenceNoColumn(headers, ctx.customColumnMap)) {
    return {
      sheetName,
      prepared: [],
      skipped: true,
      excludedCount: 0,
      rejected: [],
    };
  }

  const jsonData: Record<string, unknown>[] = rawRows
    .slice(headerRowIdx + 1)
    .map((row) => {
      const obj: Record<string, unknown> = {};
      const headerRow = rawRows[headerRowIdx] as unknown[];
      headerRow.forEach((h, i) => {
        if (h) obj[String(h).trim()] = row[i] ?? "";
      });
      return obj;
    });

  const prepared: PreparedTender[] = [];
  const rejected: RejectedRow[] = [];
  let excludedCount = 0;

  for (const row of jsonData) {
    const result = prepareTenderRow(row, headers, ctx);
    if ("reason" in result) {
      rejected.push({ fileName, sheetName, reason: result.reason, row });
      continue;
    }
    if (result.createData.excludedCategory !== null) excludedCount++;
    prepared.push(result);
  }

  return {
    sheetName,
    prepared,
    skipped: false,
    excludedCount,
    rejected,
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const category = formData.get("category");
    const subCategory = formData.get("subCategory") || null;

    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }
    if (!isValidCategorySelection(category, subCategory)) {
      return NextResponse.json(
        { error: "Invalid category/subcategory" },
        { status: 400 },
      );
    }
    const categoryFields: CategoryFields = {
      category: category as string,
      subCategory: subCategory as string | null,
    };

    const results: FileResult[] = [];

    for (const file of files) {
      const fileResult = await processFileWithLog(file, categoryFields);
      results.push(fileResult);
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

async function processFile(
  file: File,
  categoryFields: CategoryFields,
): Promise<FileResult> {
  const fileResult: FileResult = {
    fileName: file.name,
    fileId: 0,
    sheets: [],
    totalCount: 0,
    totalErrors: [],
    excludedCount: 0,
    rejected: [],
  };

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const ctx = await loadUpsertContext(categoryFields);

  const fileRecord = await prisma.file.create({
    data: {
      fileName: file.name,
      fileType:
        file.type ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileSize: file.size,
      status: "processing",
    },
  });
  fileResult.fileId = fileRecord.id;

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const limit = pLimit(SHEET_CONCURRENCY);

  const sheetTasks = workbook.SheetNames.map((sheetName) =>
    limit(async () => {
      const parsed = parseSheetData(workbook, sheetName, file.name, ctx);

      const sheetResult: SheetResult = {
        sheetName: parsed.sheetName,
        count: 0,
        excludedCount: parsed.excludedCount,
        errors: [],
        skipped: parsed.skipped,
        rejected: parsed.rejected,
      };

      if (parsed.skipped) return sheetResult;

      await insertTenderMerged(parsed.prepared, fileRecord.id, sheetResult, file.name);

      return sheetResult;
    }),
  );

  const sheetResults = await Promise.all(sheetTasks);
  fileResult.sheets = sheetResults;

  for (const s of sheetResults) {
    fileResult.totalCount += s.count;
    fileResult.excludedCount += s.excludedCount;
    fileResult.totalErrors.push(...s.errors);
    fileResult.rejected.push(...s.rejected);
  }

  await prisma.file.update({
    where: { id: fileRecord.id },
    data: {
      status: fileResult.totalErrors.length
        ? "completed_with_errors"
        : "completed",
      totalCount: fileResult.totalCount,
      excludedCount: fileResult.excludedCount,
    },
  });

  return fileResult;
}

const processFileWithLog = withLog(processFile, (result, _file, categoryFields) => ({
  action: "CREATE" as const,
  tableName: "TenderMerged",
  recordId: String(result.fileId),
  details: `Uploaded ${result.fileName} (${categoryFields.category}${categoryFields.subCategory ? ` / ${categoryFields.subCategory}` : ""}): ${result.totalCount} tenders`,
}));
