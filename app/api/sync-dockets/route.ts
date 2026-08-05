import { NextRequest, NextResponse } from "next/server";
import { syncDocketFromSmartsheet } from "@/services/smartsheetDocketSync";
import { requireAdminApi } from "@/lib/dal";

export async function POST(req: NextRequest) {
  const forbidden = await requireAdminApi()
  if (forbidden) return forbidden

  try {
    const stats = await syncDocketFromSmartsheet();
    return NextResponse.json({ success: true, stats });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
