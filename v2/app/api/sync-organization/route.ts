import { NextRequest, NextResponse } from "next/server";
import { syncOrganizationFromSmartsheet } from "@/services/smartsheetOrganizationSync";

export async function POST(req: NextRequest) {
  try {
    const result = await syncOrganizationFromSmartsheet();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
