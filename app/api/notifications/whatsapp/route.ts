import { NextRequest, NextResponse } from "next/server";
import { withLog } from "@/lib/activity-logger";
import { requireApiKey } from "@/lib/dal";
import { sendWhatsAppNotifications } from "@/lib/whatsapp-notifications";

export const runtime = "nodejs";

const sendWithLog = withLog(
  () => sendWhatsAppNotifications(),
  (result) => ({
    action: "CREATE" as const,
    tableName: "notification:whatsapp",
    details: `${result.dryRun ? "[dry run] " : ""}WhatsApp notifications: ${result.types
      .map((t) => `${t.key} sent ${t.sent}/${t.tenders}, no recipient ${t.noRecipient}, failed ${t.failed}`)
      .join("; ")}`,
    // Scheduler/cron caller — no auth session, so label the actor explicitly.
    userId: null,
    userName: "WhatsApp Notifications",
    userEmail: "reminder@laserpower.in",
  }),
);

/** Called on a schedule with the external API key. Sends deadline over / catalogue missing WhatsApp messages. */
export async function POST(req: NextRequest) {
  const forbidden = await requireApiKey(req);
  if (forbidden) return forbidden;
  try {
    return NextResponse.json(await sendWithLog());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
