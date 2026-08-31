import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withLog } from "@/lib/activity-logger";
import { TENDER_REASON_OPTIONS } from "@/lib/emdReasonOptions";

export const runtime = "nodejs";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function updateEmdMergedFields(id: string, data: { reason?: string | null; contactEmailId?: string | null }) {
  const updateData: any = {};
  if (data.reason !== undefined) {
    const reason = data.reason === "" ? null : data.reason;
    if (reason !== null && !(TENDER_REASON_OPTIONS as readonly string[]).includes(reason)) throw new Error("Invalid reason option");
    updateData.reason = reason;
  }
  if (data.contactEmailId !== undefined) {
    const raw = data.contactEmailId === "" ? null : (data.contactEmailId as string)?.trim() ?? null;
    if (raw !== null && !EMAIL_RE.test(raw)) throw new Error("Invalid contact email");
    updateData.contactEmailId = raw;
  }
  if (Object.keys(updateData).length === 0) throw new Error("No fields to update");
  const updated = await prisma.emdMerged.update({ where: { id }, data: updateData });
  return updated;
}

const updateWithLog = withLog(updateEmdMergedFields, (result, id, data) => ({
  action: "UPDATE" as const,
  tableName: "EmdMerged",
  recordId: String(id),
  details: `Updated ${Object.keys(data).join(",")} on EmdMerged #${id}`,
}));

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    const body = await req.json();
    const data: any = {};
    if ("reason" in body) data.reason = body.reason as string | null;
    if ("contactEmailId" in body) data.contactEmailId = body.contactEmailId as string | null;
    const updated = await updateWithLog(id, data);
    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    const msg = err.message ?? "Failed to update";
    const status = msg.includes("Invalid") ? 400 : msg.includes("does not exist") ? 404 : msg.includes("No fields") ? 400 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
