import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { createGzip } from "zlib";
import { prisma } from "@/lib/prisma";
import { flattenTender, SKIP_RELATION_FIELDS } from "@/lib/tender-flatten";

export const runtime = "nodejs";

const BATCH_CHUNK_SIZE = 500;

function buildColumns(tenderMerged: any[]): string[] {
  if (tenderMerged.length === 0) return [];
  const baseFields = Object.keys(tenderMerged[0]).filter(
    (key) => !SKIP_RELATION_FIELDS.has(key),
  );
  return [
    "type",
    "id",
    ...baseFields,
    "assignedTo",
    "assignedDate",
    "tenderFileUrl",
    "costingFileUrl",
    "tenderFiles",
    "reportings",
    "evaluations",
    "itemSchedules",
  ];
}

export async function GET(_req: NextRequest) {
  const [tenderMerged, allAssociations] = await Promise.all([
    prisma.tenderMerged.findMany({
      orderBy: [{ fileId: "asc" }, { id: "asc" }],
      include: {
        tenderAssociations: { include: { association: true } },
        reportings: true,
        evaluations: true,
        tenderFiles: true,
        CostingSheetDetails: { select: { itemSchedule: true, proposedErpItemName: true, proposedErpQuantity: true, cva: true } },
      },
    }),
    prisma.association.findMany({ select: { id: true, name: true, email: true } }),
  ]);

  const columns = buildColumns(tenderMerged);
  let totalGem = 0;
  let totalNonGem = 0;

  function* lineGenerator(): Generator<string> {
    yield `${JSON.stringify({
      columns,
      associations: allAssociations,
      total: tenderMerged.length,
    })}\n`;

    let pending: string[] = [];

    for (const t of tenderMerged) {
      const type: "Gem" | "Non-Gem" = t.tenderType === "GEM" ? "Gem" : "Non-Gem";
      if (type === "Gem") totalGem++;
      else totalNonGem++;

      const flat = flattenTender(
        t as unknown as Record<string, unknown>,
        type,
        t.id,
        t.tenderAssociations,
        t.reportings,
        t.evaluations,
        t.tenderFiles,
      );

      const values = columns.map((col) => flat[col] ?? "");
      pending.push(`${JSON.stringify(values)}\n`);
      if (pending.length >= BATCH_CHUNK_SIZE) {
        yield pending.join("");
        pending = [];
      }
    }

    if (pending.length > 0) yield pending.join("");

    yield `${JSON.stringify({ done: true, totalGem, totalNonGem })}\n`;
  }

  const nodeStream = Readable.from(lineGenerator());
  const gzipped = nodeStream.pipe(createGzip());
  const webStream = Readable.toWeb(gzipped) as unknown as ReadableStream;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Encoding": "gzip",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
