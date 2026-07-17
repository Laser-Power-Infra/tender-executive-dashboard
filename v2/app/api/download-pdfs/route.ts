import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { downloadGemPdfs } from "@/lib/services/gem-pdf-downloader";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenders } = body as {
      tenders: { id: number; gemId: string }[];
    };

    if (!tenders || !Array.isArray(tenders) || tenders.length === 0) {
      return NextResponse.json(
        { error: "No tenders provided" },
        { status: 400 },
      );
    }

    const results = await downloadGemPdfs(tenders, (current, total) => {
      console.log(`Progress: ${current}/${total}`);
    });

    // Update database with downloaded PDF paths
    for (const result of results) {
      if (result.success && result.pdfPath) {
        try {
          await prisma.gemTender.update({
            where: { id: result.id },
            data: { tenderFileUrl: result.pdfPath } as any,
          });
        } catch (dbErr) {
          try { console.error(
            `Failed to update DB for tender ${result.gemId}:`,
            dbErr,
          ); } catch {}
        }
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: successCount,
      failed: results.length - successCount,
      total: results.length,
      results,
    });
  } catch (error) {
    try { console.error("Download PDFs error:", error); } catch {}
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
