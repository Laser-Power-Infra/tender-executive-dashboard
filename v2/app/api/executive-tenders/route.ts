import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { DatabaseTenderService } from "@/services/databaseTenderService";
import { GoogleSheetService } from "@/services/googleSheetService";
import { encryptPath } from "@/lib/fileCrypto";
import { extractNumericDocket } from "@/lib/extractNumericDocket";
import { getAccessToken, getCleanCredentials } from "@/lib/googleDrive";
import { getCostingDetails } from "@/services/smartsheetEnrichmentService";
import type { EpcTenderRecord } from "@/types/tender";

export const runtime = "nodejs";

const CONDUTOR_PATH = path.resolve(process.env.CONDUTOR_PATH!); // X: asmita, W: bidyut // comparative chart
// const CONDUTOR_PATH = path.resolve("X:\\Tenders-bd\\Condutor"); // X: asmita, W: bidyut
const TENDER_ID_PATTERN = /(\d{4}_[A-Z]+_\d+_\d+)/;
const MATCHES_PATH = path.resolve(process.cwd(), "data", "tender_folder_matches.json");

interface BoqCacheEntry {
  modifiedDate: number;
  tenderId: string;
  cleanTenderId: string;
  competitors: string;
  parentFolderPath: string;
}

function loadBoqCache(): Record<string, BoqCacheEntry> {
  const cachePath = path.resolve(process.cwd(), "data", "boq_cache.json");
  try {
    if (!fs.existsSync(cachePath)) {
      console.warn("[BoQ Cache] Cache file not found at", cachePath);
      return {};
    }
    const raw = fs.readFileSync(cachePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn("[BoQ Cache] Failed to load:", (err as Error).message);
    return {};
  }
}

function loadCondutorBoqFiles(): Map<string, string> {
  const result = new Map<string, string>();
  try {
    if (!fs.existsSync(CONDUTOR_PATH)) {
      console.warn("[Condutor BoQ] Directory not found at", CONDUTOR_PATH);
      return result;
    }
    const files = fs.readdirSync(CONDUTOR_PATH);
    for (const filename of files) {
      if (!filename.toLowerCase().endsWith(".xlsx")) continue;
      const match = filename.match(TENDER_ID_PATTERN);
      if (!match) continue;
      const tenderId = match[1];
      const cleanId = tenderId.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!cleanId) continue;
      const filePath = path.join(CONDUTOR_PATH, filename);
      if (!result.has(cleanId)) {
        result.set(cleanId, filePath);
      } else if (!/\(\d+\)/.test(filename)) {
        result.set(cleanId, filePath);
      }
    }
  } catch (err) {
    console.warn("[Condutor BoQ] Failed to scan:", (err as Error).message);
  }
  return result;
}

function loadFolderMatches(): Record<string, any> {
  try {
    if (!fs.existsSync(MATCHES_PATH)) {
      console.warn("[Folder Matches] File not found at", MATCHES_PATH);
      return {};
    }
    return JSON.parse(fs.readFileSync(MATCHES_PATH, "utf-8"));
  } catch (err) {
    console.warn("[Folder Matches] Failed to load:", (err as Error).message);
    return {};
  }
}

function getFileCount(dirPath: string): number {
  if (!dirPath || !fs.existsSync(dirPath)) return 0;
  let count = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += getFileCount(fullPath);
      } else if (
        entry.isFile() &&
        !entry.name.startsWith("~$") &&
        !entry.name.endsWith(".tmp")
      ) {
        count++;
      }
    }
  } catch { /* ignore */ }
  return count;
}

function enrichTendersWithBoq(tenders: any[]): EpcTenderRecord[] {
  const cache = loadBoqCache();
  const cacheEntries = Object.entries(cache);
  const condutorFiles = loadCondutorBoqFiles();
  const folderMatches = loadFolderMatches();

  return tenders.map((tender) => {
    const lookupKey = extractNumericDocket(tender.docketNo) || tender.docketNo;
    const match = tender.docketNo ? folderMatches[lookupKey] : null;
    const fileCount =
      match?.folderFound && match?.folderPath
        ? getFileCount(match.folderPath)
        : 0;
    const enriched: any = { ...tender, fileCount };

    if (!enriched.tenderNoNitNo) return enriched;

    const cleanTenderNo = enriched.tenderNoNitNo
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (!cleanTenderNo) return enriched;

    const cacheMatch = cacheEntries.find(([, entry]) => {
      if (!entry.cleanTenderId) return false;
      return (
        cleanTenderNo.includes(entry.cleanTenderId) ||
        entry.cleanTenderId.includes(cleanTenderNo)
      );
    });

    if (cacheMatch) {
      const [filePath, entry] = cacheMatch;
      enriched.hasBoqChart = true;
      enriched.competitors = entry.competitors;
      enriched.boqFileId = encryptPath(filePath);
      return enriched;
    }

    for (const [condutorCleanId, condutorFilePath] of condutorFiles) {
      if (
        cleanTenderNo.includes(condutorCleanId) ||
        condutorCleanId.includes(cleanTenderNo)
      ) {
        enriched.hasBoqChart = true;
        enriched.boqFileId = encryptPath(condutorFilePath);
        break;
      }
    }

    return enriched;
  });
}

async function enrichWithCosting(tenders: any[]): Promise<any[]> {
  const creds = getCleanCredentials();
  if (!creds) {
    console.warn("[CostingEnrich] No Google credentials, skipping costing enrichment");
    return tenders;
  }

  let driveAccessToken: string | null = null;
  try {
    driveAccessToken = await getAccessToken(creds.email, creds.key);
  } catch (err) {
    console.warn(`[CostingEnrich] Failed to get Drive token: ${(err as Error).message}`);
    return tenders;
  }

  const results = await Promise.allSettled(
    tenders.map(async (tender: any) => {
      if (!tender.attachmentUrl || tender.attachmentUrl === "-") return tender;

      const numericDocket = extractNumericDocket(tender.docketNo) || tender.docketNo || "";
      const costing = await getCostingDetails(tender.attachmentUrl, numericDocket, driveAccessToken);
      if (!costing) return tender;

      return {
        ...tender,
        priceBasis: costing.priceBasis ?? tender.priceBasis,
        proposedErpItemName: costing.proposedErpItemName ?? tender.proposedErpItemName,
        proposedQty: costing.proposedQty ?? tender.proposedQty,
        aluminiumPrice: costing.aluminiumPrice ?? tender.aluminiumPrice,
        aluminiumAlloyPrice: costing.aluminiumAlloyPrice ?? tender.aluminiumAlloyPrice,
        copperTapePrice: costing.copperTapePrice ?? tender.copperTapePrice,
        extrudedSemiconductivePrice: costing.extrudedSemiconductivePrice ?? tender.extrudedSemiconductivePrice,
        htXlpePrice: costing.htXlpePrice ?? tender.htXlpePrice,
        pvcTypeSt2Price: costing.pvcTypeSt2Price ?? tender.pvcTypeSt2Price,
        galvanisedSteelFlatStripPrice: costing.galvanisedSteelFlatStripPrice ?? tender.galvanisedSteelFlatStripPrice,
        fillerPrice: costing.fillerPrice ?? tender.fillerPrice,
      };
    })
  );

  return results.map((r) => (r.status === "fulfilled" ? r.value : tenders[results.indexOf(r)]));
}

export async function GET(req: NextRequest) {
  try {
    const tenders = await DatabaseTenderService.getAllTenders();
    if (tenders && tenders.length > 0) {
      try {
        const enriched = await enrichWithCosting(enrichTendersWithBoq(tenders));
        return NextResponse.json(enriched);
      } catch (costErr) {
        console.error("[API] Costing enrichment failed, returning base tenders:", costErr);
        return NextResponse.json(enrichTendersWithBoq(tenders));
      }
    }
  } catch (dbErr) {
    console.warn(
      "[API:GET /api/executive-tenders] DB fetch failed, trying Google Sheets:",
      dbErr,
    );
  }

  try {
    const sheetService = new GoogleSheetService();
    const records = await sheetService.fetchTenderRecords();
    if (records && records.length > 0) {
      try {
        const enriched = await enrichWithCosting(enrichTendersWithBoq(records));
        return NextResponse.json(enriched);
      } catch (costErr) {
        console.error("[API] Costing enrichment failed, returning base tenders:", costErr);
        return NextResponse.json(enrichTendersWithBoq(records));
      }
    }
  } catch (sheetErr) {
    console.warn(
      "[API:GET /api/executive-tenders] Sheet fetch also failed:",
      sheetErr,
    );
  }

  return NextResponse.json([]);
}
