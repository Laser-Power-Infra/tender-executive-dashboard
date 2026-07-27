import { NextRequest, NextResponse } from "next/server";
import { syncSheetToTenderMerged } from "@/services/sheetToTenderMergedService";

export async function POST(req: NextRequest) {
  try {
    const result = await syncSheetToTenderMerged();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
