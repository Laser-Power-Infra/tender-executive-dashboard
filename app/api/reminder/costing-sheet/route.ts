import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withLog } from "@/lib/activity-logger";
import { requireApiKey } from "@/lib/dal";
import { TENDER_FILE_TYPES } from "@/lib/tender-file-types";

function httpError(message: string, status: number) {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

// APM-approved tenders we participated in that still have no costing sheet file.
async function sendCostingSheetReminder() {
  // Costing sheet is shared per docket: one file covers every tender on that docket.
  const docketsWithCosting = await prisma.tenderMerged.findMany({
    where: {
      docketNo: { not: null },
      tenderFiles: {
        some: { tags: { has: TENDER_FILE_TYPES.COSTING_ATTACHMENT } },
      },
    },
    select: { docketNo: true },
    distinct: ["docketNo"],
  });
  const coveredDockets = new Set(docketsWithCosting.map((row) => row.docketNo));

  const tenders = await prisma.tenderMerged.findMany({
    where: {
      apm: "YES",
      participated: true,
      deleteRequestedAt: null,
      deadline: { gt: new Date("2026-01-01T00:00:00.000Z") },
      NOT: {
        tenderFiles: {
          some: { tags: { has: TENDER_FILE_TYPES.COSTING_ATTACHMENT } },
        },
      },
    },
    select: { referenceNo: true, organization: true, docketNo: true },
    orderBy: { referenceNo: "asc" },
  });

  const pending = tenders.filter(
    (tender) => !tender.docketNo || !coveredDockets.has(tender.docketNo),
  );

  if (pending.length === 0) {
    return { success: true, sent: false, count: 0 };
  }

  const url = process.env.N8N_COSTING_REMINDER_WEBHOOK_URL;
  if (!url) {
    throw httpError("N8N_COSTING_REMINDER_WEBHOOK_URL is not configured", 500);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      references: pending.map((tender) => ({
        referenceNumber: tender.referenceNo,
        organizationName: tender.organization ?? "",
      })),
    }),
  });

  if (!response.ok) {
    throw httpError(
      `n8n webhook returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
      502,
    );
  }

  return { success: true, sent: true, count: pending.length };
}

const sendCostingSheetReminderWithLog = withLog(
  sendCostingSheetReminder,
  (result) => ({
    action: "CREATE" as const,
    tableName: "agent:costing-sheet-reminder",
    details: result.sent
      ? `Costing sheet reminder sent for ${result.count} tender(s)`
      : "No pending costing sheets",
    // Scheduler/cron caller — no auth session, so label the actor explicitly.
    userId: null,
    userName: "Costing Sheet Reminder",
    userEmail: "reminder@laserpower.in",
  }),
);

export async function POST(req: NextRequest) {
  const forbidden = await requireApiKey(req);
  if (forbidden) return forbidden;

  try {
    return NextResponse.json(await sendCostingSheetReminderWithLog());
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status },
    );
  }
}
