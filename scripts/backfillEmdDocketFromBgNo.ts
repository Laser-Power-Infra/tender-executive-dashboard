/**
 * Backfill docketNo in emd_merged via bgNo -> tender_merged.bgUtrNo
 * Only where emd_merged.docketNo IS NULL
 * Usage: npx tsx scripts/backfillEmdDocketFromBgNo.ts [--dryRun] [--verbose]
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import pLimit from "p-limit";

const DRY_RUN = process.argv.includes("--dryRun");
const VERBOSE = process.argv.includes("--verbose");

function normalizeBgNo(v: string | null | undefined): string | null {
  if (!v || String(v).trim() === "") return null;
  return String(v).trim().toLowerCase().replace(/[\s_-]+/g, "");
}

async function main() {
  console.log("=".repeat(60));
  console.log("  Backfill emd_merged.docketNo via bgNo -> tender_merged.bgUtrNo");
  console.log(`  Mode: ${DRY_RUN ? "DRY_RUN (no writes)" : "LIVE"}`);
  console.log("  Filter: only emd_merged.docketNo IS NULL");
  console.log("=".repeat(60));

  const tenderRows = await prisma.tenderMerged.findMany({
    where: { bgNoUtrNo: { not: null } },
    select: { id: true, bgNoUtrNo: true, docketNo: true },
  });

  const bgMap = new Map<string, { id: number; docketNo: string; bgNoUtrNo: string }>();
  const duplicateBg = new Set<string>();
  let tenderWithoutDocket = 0;
  let tenderEmptyBg = 0;

  for (const t of tenderRows) {
    const rawBg = (t.bgNoUtrNo ?? "").trim();
    if (!rawBg) { tenderEmptyBg++; continue; }
    if (!t.docketNo || String(t.docketNo).trim() === "") { tenderWithoutDocket++; continue; }
    const norm = normalizeBgNo(rawBg);
    if (!norm) { tenderEmptyBg++; continue; }
    if (bgMap.has(norm)) {
      duplicateBg.add(norm);
      continue;
    }
    bgMap.set(norm, { id: t.id, docketNo: String(t.docketNo).trim(), bgNoUtrNo: rawBg });
  }

  // Remove duplicates from map so we don't make ambiguous updates
  duplicateBg.forEach((dup) => bgMap.delete(dup));

  console.log(`  tender_merged with bgUtrNo: ${tenderRows.length}`);
  console.log(`  usable (not null docket + unique bg): ${bgMap.size}`);
  console.log(`  skipped tender without docket: ${tenderWithoutDocket}`);
  console.log(`  skipped empty bgUtrNo: ${tenderEmptyBg}`);
  console.log(`  duplicate bgUtrNo (skipped): ${duplicateBg.size}`);
  if (VERBOSE && duplicateBg.size > 0) {
    const dupArr = Array.from(duplicateBg);
    console.log(`  duplicate norms: ${dupArr.slice(0, 20).join(", ")}${duplicateBg.size > 20 ? " ..." : ""}`);
  }

  const emdCandidates = await prisma.emdMerged.findMany({
    where: { docketNo: null, bgNo: { not: null } },
    select: { id: true, bgNo: true, docketNo: true },
  });

  console.log(`  emd_merged candidates (docketNo IS NULL + bgNo NOT NULL): ${emdCandidates.length}`);

  let skippedEmptyBgNo = 0;
  let noMatch = 0;
  let matched = 0;
  const updates: { id: string; bgNo: string; docketNo: string; tenderId: number }[] = [];

  for (const emd of emdCandidates) {
    const norm = normalizeBgNo(emd.bgNo);
    if (!norm) { skippedEmptyBgNo++; continue; }
    const hit = bgMap.get(norm);
    if (!hit) {
      noMatch++;
      if (VERBOSE) console.log(`  [NO MATCH] emd ${emd.id} bgNo="${emd.bgNo}" norm="${norm}"`);
      continue;
    }
    matched++;
    updates.push({ id: emd.id, bgNo: String(emd.bgNo), docketNo: hit.docketNo, tenderId: hit.id });
  }

  console.log(`  skipped empty bgNo after normalize: ${skippedEmptyBgNo}`);
  console.log(`  noMatch: ${noMatch}`);
  console.log(`  matched (to update): ${matched}`);

  if (updates.length === 0) {
    console.log("  Nothing to update.");
    await prisma.$disconnect();
    return;
  }

  if (VERBOSE) {
    for (const u of updates.slice(0, 20)) {
      console.log(`  [MATCH] emd ${u.id} bgNo="${u.bgNo}" -> docketNo="${u.docketNo}" (tender ${u.tenderId})`);
    }
    if (updates.length > 20) console.log(`  ... and ${updates.length - 20} more`);
  }

  if (DRY_RUN) {
    console.log(`  [DRY_RUN] would update ${updates.length} rows`);
    await prisma.$disconnect();
    return;
  }

  const limit = pLimit(10);
  let updated = 0;
  let errors = 0;

  await Promise.all(
    updates.map((u) =>
      limit(async () => {
        try {
          await prisma.emdMerged.update({
            where: { id: u.id },
            data: { docketNo: u.docketNo },
          });
          updated++;
        } catch (e: any) {
          errors++;
          console.warn(`  Failed emd ${u.id}: ${e.message}`);
        }
      })
    )
  );

  console.log("-".repeat(60));
  console.log(`  Updated: ${updated}/${updates.length}`);
  console.log(`  Errors: ${errors}`);
  console.log("  Done.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[backfillEmdDocketFromBgNo] Fatal:", e);
  await prisma.$disconnect();
  process.exit(1);
});
