import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { downloadGemPdfs } from "@/lib/services/gem-pdf-downloader";
import { searchNonGemTenders } from "@/lib/services/non-gem-downloader";
import { publishTenderTask } from "@/lib/queue/publisher";

interface TenderRequest {
  id: number;
  type: "Gem" | "Non-Gem";
  gemId?: string;
  referenceNo?: string;
  tenderStatusId?: number | null;
}

interface ResolvedNonGem {
  id: number;
  referenceNo: string;
  tenderStatusId: number | null;
  website: string | null;
}

async function resolveNonGemTenderInfo(
  t: TenderRequest,
): Promise<ResolvedNonGem> {
  if (t.tenderStatusId && t.referenceNo) {
    return {
      id: t.id,
      referenceNo: t.referenceNo,
      tenderStatusId: t.tenderStatusId,
      website: null,
    };
  }

  const tender = await prisma.nonGemTender.findUnique({
    where: { id: t.id },
    select: { tenderStatusId: true, referenceNo: true, website: true },
  });

  return {
    id: t.id,
    referenceNo: tender?.referenceNo || t.referenceNo || "",
    tenderStatusId: tender?.tenderStatusId ?? null,
    website: tender?.website || null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenders } = body as { tenders: TenderRequest[] };

    if (!tenders || !Array.isArray(tenders) || tenders.length === 0) {
      return NextResponse.json(
        { error: "No tenders provided" },
        { status: 400 },
      );
    }

    const gemTenders = tenders.filter((t) => t.type === "Gem");
    const nonGemRequests = tenders.filter((t) => t.type === "Non-Gem");

    let gemResults: Awaited<ReturnType<typeof downloadGemPdfs>> = [];
    let nonGemResults: Awaited<ReturnType<typeof searchNonGemTenders>> = [];

    if (gemTenders.length > 0) {
      for (const t of gemTenders) {
        publishTenderTask({
          type: "GEM_DOWNLOAD",
          tenderId: t.id,
          gemId: t.gemId || t.referenceNo || "",
          referenceNo: t.referenceNo,
          timestamp: Date.now(),
        }).catch((e) => {
          console.error(e)
        });
      }

      gemResults = await downloadGemPdfs(
        gemTenders.map((t) => ({ id: t.id, gemId: t.gemId! })),
        (current, total) => {
          console.log(`GEM progress: ${current}/${total}`);
        },
      );

      for (const result of gemResults) {
        if (result.success && result.pdfPath) {
          try {
            await prisma.gemTender.update({
              where: { id: result.id },
              data: { tenderFileUrl: result.pdfPath } as any,
            });
          } catch (dbErr) {
            try {
              console.error(
                `Failed to update DB for GEM tender ${result.gemId}:`,
                dbErr,
              );
            } catch {}
          }
        }
      }
    }

    if (nonGemRequests.length > 0) {
      for (const t of nonGemRequests) {
        publishTenderTask({
          type: "NON_GEM_DOWNLOAD",
          tenderId: t.id,
          referenceNo: t.referenceNo,
          timestamp: Date.now(),
        }).catch((e) => {
          console.error(e)
        });
      }

      const resolved = await Promise.all(
        nonGemRequests.map(resolveNonGemTenderInfo),
      );

      // nonGemResults = await searchNonGemTenders(
      //   resolved,
      //   (current, total) => {
      //     console.log(`Non-GEM progress: ${current}/${total}`);
      //   },
      // );
    }

    const allResults = [...gemResults, ...nonGemResults];
    const successCount = allResults.filter((r) => r.success).length;

    return NextResponse.json({
      success: successCount,
      failed: allResults.length - successCount,
      total: allResults.length,
      results: allResults,
    });
  } catch (error) {
    try {
      console.error("Download PDFs error:", error);
    } catch {}
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
