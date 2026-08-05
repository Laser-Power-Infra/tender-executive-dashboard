import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withLog } from "@/lib/activity-logger";

export const runtime = "nodejs";

const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || "dhinchakpuja";

function isAuthorized(req: NextRequest): boolean {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const apiKey = req.headers.get("x-api-key") ?? "";
  return bearer === EXTERNAL_API_KEY || apiKey === EXTERNAL_API_KEY;
}

const TENDER_MERGED_SELECT = {
  referenceNo: true,
  docketNo: true,
  proposedErpItemName: true,
  proposedErpQuantity: true,
  cva: true,
  rawMaterials: true,
  price: true,
  applicableIndex: true,
} as const;

type TenderMergedSummary = Awaited<
  ReturnType<typeof prisma.tenderMerged.findMany<{ select: typeof TENDER_MERGED_SELECT }>>
>[number];

const RESPONSE_FIELDS = [
  "referenceNo",
  "proposedErpItemName",
  "proposedErpQuantity",
  "cva",
  "rawMaterials",
  "price",
  "applicableIndex",
] as const;

async function lookupTenders(identifiers: string[]) {
  const [refRows, docketRows] = (await Promise.all([
    prisma.tenderMerged.findMany({
      where: { referenceNo: { in: identifiers } },
      select: TENDER_MERGED_SELECT,
    }),
    prisma.tenderMerged.findMany({
      where: { docketNo: { in: identifiers } },
      select: TENDER_MERGED_SELECT,
    }),
  ])) as [TenderMergedSummary[], TenderMergedSummary[]];

  const mergedByRef = new Map<string, TenderMergedSummary>();
  for (const row of [...refRows, ...docketRows]) {
    if (!mergedByRef.has(row.referenceNo)) mergedByRef.set(row.referenceNo, row);
  }
  const rows = [...mergedByRef.values()];

  const matchedRefNos = new Set(refRows.map((row) => row.referenceNo));
  const matchedDocketNos = new Set(
    docketRows
      .map((row) => row.docketNo)
      .filter((d): d is string => !!d),
  );

  const tenders = rows.map((row) => {
    const summary: Record<string, unknown> = {};
    for (const field of RESPONSE_FIELDS) {
      summary[field] = row[field];
    }
    return summary;
  });

  const notFound = identifiers.filter(
    (id) => !matchedRefNos.has(id) && !matchedDocketNos.has(id),
  );

  return { tenders, notFound };
}

const lookupTendersWithLog = withLog(
  lookupTenders,
  (result, identifiers) => ({
    action: "READ",
    tableName: "TenderMerged",
    details: `External lookup of ${identifiers.length} identifiers (${result.tenders.length} found, ${result.notFound.length} not found)`,
  }),
);

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const referenceNos = (body as { referenceNos?: unknown })?.referenceNos;
  if (!Array.isArray(referenceNos)) {
    return NextResponse.json(
      { error: "Body must include a 'referenceNos' array of strings" },
      { status: 400 },
    );
  }

  const normalized = [
    ...new Set(
      referenceNos
        .filter((r): r is string => typeof r === "string")
        .map((r) => r.trim())
        .filter((r) => r.length > 0),
    ),
  ];

  if (normalized.length === 0) {
    return NextResponse.json({ tenders: [], notFound: [] });
  }

  const { tenders, notFound } = await lookupTendersWithLog(normalized);
  return NextResponse.json({ tenders, notFound });
}
