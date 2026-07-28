import { NextRequest, NextResponse } from "next/server";
import { syncBeneficiaryBankDetails } from "@/services/lcSmartsheetService";

export async function POST(req: NextRequest) {
  try {
    const result = await syncBeneficiaryBankDetails();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
