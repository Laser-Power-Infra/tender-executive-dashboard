import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiKey } from "@/lib/dal";
import { publishNicSyncTask } from "@/lib/queue/publisher";

export const runtime = "nodejs";

// Publishes every NIC portal from the tender status table to automation-v2:sync.
export async function POST(req: NextRequest) {
  const unauthorized = await requireApiKey(req);
  if (unauthorized) return unauthorized;

  // An explicit `portals` body (for tests) skips the DB lookup.
  const body = await req.json().catch(() => null);
  const override = Array.isArray(body?.portals) ? body.portals : null;
  const rows = override
    ? null
    : await prisma.tenderStatusTable.findMany({
        where: { type: "NIC", website: { not: null } },
        select: { website: true },
        distinct: ["website"],
      });
  const portals = (override ?? rows!.map((r) => r.website))
    .map((p: unknown) => String(p ?? "").trim())
    .filter(Boolean);
  if (portals.length === 0) {
    return NextResponse.json({ error: "No NIC portals found" }, { status: 404 });
  }

  const queued = await publishNicSyncTask({ portals });
  if (!queued) {
    return NextResponse.json({ error: "Sync job not queued (RabbitMQ unavailable?)" }, { status: 503 });
  }
  return NextResponse.json({ queued: true, portals });
}
