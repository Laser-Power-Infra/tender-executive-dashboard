import { NextRequest, NextResponse } from "next/server";
import { syncQuotationFromSmartsheet } from "@/services/smartsheetQuotationSync";

export async function POST(req: NextRequest) {
  try {
    const result = await syncQuotationFromSmartsheet();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
