import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withLog } from "@/lib/activity-logger";

export const runtime = "nodejs";

async function getEmdDetailsBg() {
  const rows = await prisma.emdDetailsBG.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows;
}

const getEmdDetailsBgWithLog = withLog(getEmdDetailsBg, (result) => ({
  action: "READ" as const,
  tableName: "EmdDetailsBG",
  details: `Fetched ${result.length} EMD BG records`,
}));

export async function GET(req: NextRequest) {
  try {
    const rows = await getEmdDetailsBgWithLog();
    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error("[API:GET /api/emd-details-bg] failed:", err.message);
    return NextResponse.json({ success: false, error: err.message, data: [] }, { status: 500 });
  }
}
