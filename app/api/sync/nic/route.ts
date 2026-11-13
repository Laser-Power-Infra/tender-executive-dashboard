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
  const portals: string[] = (override ?? rows!.map((r) => r.website))
    .map((p: unknown) => String(p ?? "").trim())
    .filter(Boolean);
  if (portals.length === 0) {
    return NextResponse.json({ error: "No NIC portals found" }, { status: 404 });
  }
  // Optional `days`: how many days back the worker scrapes. Omitted = the worker's default.
  const days = body?.days === undefined ? undefined : Number(body.days);
  if (days !== undefined && (!Number.isInteger(days) || days < 1)) {
    return NextResponse.json({ error: "days must be a positive integer" }, { status: 400 });
  }

  // One message per portal, each still a one-element `portals` array, so the worker sees one shape.
  // Sequential: parallel publishes race the RabbitMQ connect and some get ConnectionClose.
  const results: boolean[] = [];
  for (const portal of portals) {
    results.push(await publishNicSyncTask({ portals: [portal], ...(days !== undefined && { days }) }));
  }
  const queued = portals.filter((_, i) => results[i]);
  const failed = portals.filter((_, i) => !results[i]);
  if (queued.length === 0) {
    return NextResponse.json({ error: "Sync jobs not queued (RabbitMQ unavailable?)", failed }, { status: 503 });
  }
  return NextResponse.json({ queued: queued.length, portals: queued, failed, ...(days !== undefined && { days }) });
}
