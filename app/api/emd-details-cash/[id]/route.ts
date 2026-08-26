import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withLog } from "@/lib/activity-logger";
import { TENDER_REASON_OPTIONS } from "@/lib/emdReasonOptions";

export const runtime = "nodejs";

async function updateEmdDetailsCashReason(id: number, reason: string | null) {
  if (reason !== null && reason !== "" && !(TENDER_REASON_OPTIONS as readonly string[]).includes(reason)) {
    throw new Error("Invalid reason option");
  }
  const updated = await prisma.emdDetailsCash.update({
    where: { id },
    data: { reason: reason || null },
  });
  return updated;
}

const updateReasonWithLog = withLog(updateEmdDetailsCashReason, (result, id, reason) => ({
  action: "UPDATE" as const,
  tableName: "EmdDetailsCash",
  recordId: String(id),
  details: `Updated reason to "${reason ?? ""}" on EMD Cash #${id}`,
}));

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!rawId || Number.isNaN(id)) return NextResponse.json({ success: false, error: "Missing or invalid id" }, { status: 400 });
    const body = await req.json();
    const reason = body.reason !== undefined ? (body.reason as string | null) : null;
    const normalized = reason === "" ? null : reason;
    const updated = await updateReasonWithLog(id, normalized);
    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    const msg = err.message ?? "Failed to update reason";
    const status = msg.includes("Invalid reason") ? 400 : msg.includes("Record to update does not exist") ? 404 : 500;
    console.error("[API:PATCH /api/emd-details-cash/[id]] failed:", msg);
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
