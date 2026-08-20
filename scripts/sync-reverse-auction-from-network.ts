/**
 * Script to scan INDEXER_NETWORK_PATH for docket folders that contain a
 * "REVERSE AUCTION" subfolder (case-insensitive, recursive) and set
 * reverseAuctionApplicable = true on the matching TenderMerged record.
 *
 * Usage:
 *   cd v2 && npx tsx scripts/sync-reverse-auction-from-network.ts
 */
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { extractNumericDocket } from "../lib/extractNumericDocket";
import {
  resolveRootPath,
  scanDirectoryRecursive,
} from "../services/documentIndexer";

const RA_FOLDER_NAME = "REVERSE AUCTION";

function findReverseAuctionSubfolder(folderPath: string): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.toUpperCase() === RA_FOLDER_NAME) return true;
    if (findReverseAuctionSubfolder(path.join(folderPath, entry.name)))
      return true;
  }
  return false;
}

async function main() {
  console.log("[sync-ra] Validating INDEXER_NETWORK_PATH...");
  const networkRoot = process.env.OLD_FILES!;
  // const networkRoot = resolveRootPath();
  console.log(`[sync-ra] Root: ${networkRoot}`);

  console.log("[sync-ra] Scanning network folders...");
  const scannedIndex = new Map<
    string,
    { docketNo: string; folderName: string; folderPath: string; lastModified: number }
  >();
  await scanDirectoryRecursive(networkRoot, scannedIndex, 0);
  console.log(`[sync-ra] Network scan complete. Found ${scannedIndex.size} indexed folders.`);

  console.log("[sync-ra] Fetching TenderMerged records with docketNo...");
  const tenders = await prisma.tenderMerged.findMany({
    where: { docketNo: { not: null } },
    select: { id: true, referenceNo: true, docketNo: true, reverseAuctionApplicable: true },
  });
  console.log(`[sync-ra] Found ${tenders.length} records with docketNo.`);

  let networkMatchCount = 0;
  let raFoundCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let noRaCount = 0;
  let noMatchCount = 0;

  console.log("[sync-ra] Processing...\n");

  for (const tender of tenders) {
    const numericId = extractNumericDocket(tender.docketNo);
    if (!numericId) {
      noMatchCount++;
      console.log(`  [NO-NUM] ${tender.referenceNo} (docket: ${tender.docketNo}) — could not extract numeric docket`);
      continue;
    }

    const scanRecord = scannedIndex.get(numericId);
    if (!scanRecord) {
      noMatchCount++;
      console.log(`  [MISS] ${tender.referenceNo} (docket: ${tender.docketNo}, num: ${numericId}) — no network folder found`);
      continue;
    }

    networkMatchCount++;

    if (!findReverseAuctionSubfolder(scanRecord.folderPath)) {
      noRaCount++;
      console.log(`  [NO-RA] ${tender.referenceNo} — folder found, no RA subfolder`);
      continue;
    }

    raFoundCount++;

    if (tender.reverseAuctionApplicable === true) {
      skippedCount++;
      console.log(`  [MATCH] ${tender.referenceNo} — RA folder found, already true → skipped`);
      continue;
    }

    await prisma.tenderMerged.update({
      where: { id: tender.id },
      data: { reverseAuctionApplicable: true },
    });

    updatedCount++;
    console.log(`  [MATCH] ${tender.referenceNo} — RA folder found → updated to true`);
  }

  console.log("\n--- Summary ---");
  console.log(`  Tenders with docketNo:  ${tenders.length}`);
  console.log(`  Network folder matches:  ${networkMatchCount}`);
  console.log(`  RA folder found:         ${raFoundCount}`);
  console.log(`  Updated:                 ${updatedCount}`);
  console.log(`  Skipped (already true):  ${skippedCount}`);
  console.log(`  No RA folder:            ${noRaCount}`);
  console.log(`  No network match:        ${noMatchCount}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[sync-ra] Fatal error:", err);
  prisma.$disconnect().then(() => process.exit(1));
});
