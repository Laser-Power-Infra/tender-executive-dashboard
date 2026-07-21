import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

const SKIP_COLS = new Set([
  "id",
  "file_id",
  "created_at",
  "updated_at",
  "tender_status_id",
  "utility_mapping_id",
]);

export async function GET() {
  try {
    const columnRows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT DISTINCT column_name FROM information_schema.columns WHERE table_name IN ('gem_tenders', 'non_gem_tenders')`,
    );

    const allFields = new Set<string>();
    for (const row of columnRows) {
      if (!SKIP_COLS.has(row.column_name)) {
        allFields.add(snakeToCamel(row.column_name));
      }
    }

    const extraFieldRows = await prisma.tenderExtraField.findMany({
      select: { fieldName: true },
      distinct: ["fieldName"],
      where: { fieldName: { not: "" } },
    });

    for (const row of extraFieldRows) {
      allFields.add(row.fieldName);
    }

    return NextResponse.json({
      fields: Array.from(allFields).sort((a, b) => a.localeCompare(b)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
