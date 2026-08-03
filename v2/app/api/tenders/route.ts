import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { flattenTender } from "@/lib/tender-flatten";

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

    const rows = [];

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
