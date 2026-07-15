import { NextRequest, NextResponse } from "next/server";
import { TenderController } from "@/controllers/tenderController";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenderId: string }> }) {
  try {
    const { tenderId } = await params;
    const body = await req.json();
    const result = await TenderController.updateTender(tenderId, body);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.error || err.message }, { status: err.status || 500 });
  }
}
