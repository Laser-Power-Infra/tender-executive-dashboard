import { NextRequest, NextResponse } from "next/server";
import { syncDocketFromSmartsheet } from "@/services/smartsheetDocketSync";

export async function POST(req: NextRequest) {
  try {
    const stats = await syncDocketFromSmartsheet();
    return NextResponse.json({ success: true, stats });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
