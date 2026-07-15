import fs from "fs";
import path from "path";
import type { DocumentIndex, DocumentIndexEntry } from "@/types/indexer";

let resolvedPath = "\\\\192.168.1.242\\dipankar roy\\COSTING & INVOLVEMENT\\2026-27";
if (fs.existsSync("Z:\\COSTING & INVOLVEMENT\\2026-27")) {
  resolvedPath = "Z:\\COSTING & INVOLVEMENT\\2026-27";
} else if (fs.existsSync("\\\\192.168.1.242\\dipankar roy\\COSTING & INVOLVEMENT\\2026-27")) {
  resolvedPath = "\\\\192.168.1.242\\dipankar roy\\COSTING & INVOLVEMENT\\2026-27";
}

const CONFIG = {
  networkPath: process.env.INDEXER_NETWORK_PATH || resolvedPath,
  monthlyFolders: [
    "04_APRIL 2026", "05_MAY 2026", "06_JUNE 2026",
    "04_APRIL_2026", "05_MAY_2026", "06_JUNE_2026"
  ],
  dbFilePath: path.resolve(process.cwd(), "data", "document_index.json"),
  scanIntervalMs: 60 * 60 * 1000
};

const dataDir = path.dirname(CONFIG.dbFilePath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

class IndexDatabase {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<DocumentIndex> {
    try {
      if (!fs.existsSync(this.filePath)) {
        return {};
      }
      const raw = await fs.promises.readFile(this.filePath, "utf-8");
      return JSON.parse(raw || "{}");
    } catch (err) {
      console.error(`[DB_ERROR] Failed to load database: ${(err as Error).message}`);
      return {};
    }
  }

  async save(data: DocumentIndex): Promise<boolean> {
    const tempPath = `${this.filePath}.tmp`;
    try {
      await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
      await fs.promises.rename(tempPath, this.filePath);
      return true;
    } catch (err) {
      console.error(`[DB_ERROR] Failed to save database atomically: ${(err as Error).message}`);
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
      }
      return false;
    }
  }
}

const db = new IndexDatabase(CONFIG.dbFilePath);

function extractDocketNumber(folderName: string): string | null {
  if (!folderName) return null;

  const fiveDigitMatch = folderName.match(/\b\d{5}\b/);
  if (fiveDigitMatch) {
    return fiveDigitMatch[0];
  }

  const numericSegments = folderName.match(/\d+/g);
  if (numericSegments) {
    for (const segment of numericSegments) {
      if (
        segment.length >= 4 &&
        segment.length <= 6 &&
        segment !== "2026" &&
        segment !== "2027"
      ) {
        return segment;
      }
    }
  }

  return null;
}

interface ScanRecord {
  docketNo: string;
  folderName: string;
  folderPath: string;
  lastModified: number;
}

async function scanNetworkLocation(): Promise<Map<string, ScanRecord>> {
  const scannedIndex = new Map<string, ScanRecord>();
  console.log(`[Scanner] Initializing network scan at: ${CONFIG.networkPath}`);

  for (const monthFolder of CONFIG.monthlyFolders) {
    const targetMonthPath = path.join(CONFIG.networkPath, monthFolder);

    try {
      if (!fs.existsSync(targetMonthPath)) {
        console.warn(`[Scanner] Warning: Monthly folder does not exist: "${targetMonthPath}"`);
        continue;
      }

      const files = await fs.promises.readdir(targetMonthPath, { withFileTypes: true });

      for (const file of files) {
        if (file.isDirectory()) {
          const folderName = file.name;
          const folderPath = path.join(targetMonthPath, folderName);

          const docketNo = extractDocketNumber(folderName);
          if (!docketNo) {
            console.warn(`[Scanner] Warning: Could not extract docket number from folder name: "${folderName}"`);
            continue;
          }

          let lastModified = Date.now();
          try {
            const stats = await fs.promises.stat(folderPath);
            lastModified = stats.mtimeMs;
          } catch {
            console.error(`[Scanner] Failed to get stats for: ${folderPath}`);
          }

          const record: ScanRecord = {
            docketNo,
            folderName,
            folderPath,
            lastModified
          };

          if (scannedIndex.has(docketNo)) {
            const existing = scannedIndex.get(docketNo)!;
            console.warn(
              `[Conflict] Duplicate docket number "${docketNo}" detected during scan.\n` +
              `  - Retaining: "${existing.folderPath}"\n` +
              `  - Ignoring:  "${folderPath}"`
            );
            continue;
          }

          scannedIndex.set(docketNo, record);
        }
      }
    } catch (err) {
      console.error(`[Scanner] Error reading directory "${targetMonthPath}": ${(err as Error).message}`);
    }
  }

  return scannedIndex;
}

export async function runIndexer(): Promise<void> {
  const startTime = Date.now();
  console.log(`[Indexer] Starting indexing process at ${new Date(startTime).toLocaleTimeString()}...`);

  try {
    const scannedRecords = await scanNetworkLocation();
    const currentDb = await db.load();
    let updatedCount = 0;
    let addedCount = 0;

    for (const [docketNo, scannedRecord] of scannedRecords.entries()) {
      const existingRecord = currentDb[docketNo];

      if (existingRecord) {
        if (
          existingRecord.folderPath !== scannedRecord.folderPath ||
          existingRecord.lastModified !== scannedRecord.lastModified
        ) {
          currentDb[docketNo] = {
            ...scannedRecord,
            indexedAt: Date.now()
          };
          updatedCount++;
        }
      } else {
        currentDb[docketNo] = {
          ...scannedRecord,
          indexedAt: Date.now()
        };
        addedCount++;
      }
    }

    const success = await db.save(currentDb);
    if (success) {
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(
        `[Indexer] Scan completed in ${durationSec}s.\n` +
        `  - Total Indexed: ${Object.keys(currentDb).length}\n` +
        `  - Added:         ${addedCount}\n` +
        `  - Updated:       ${updatedCount}`
      );
    }
  } catch (err) {
    console.error(`[Indexer] Critical indexing failure: ${(err as Error).message}`);
  }
}

let scheduleInterval: ReturnType<typeof setInterval> | null = null;

export function startScheduling(): void {
  if (scheduleInterval) return;

  runIndexer();

  scheduleInterval = setInterval(() => {
    runIndexer();
  }, CONFIG.scanIntervalMs);

  console.log(`[Scheduler] Indexer scheduled to run every ${CONFIG.scanIntervalMs / 3600000} hour(s).`);
}

export function stopScheduling(): void {
  if (scheduleInterval) {
    clearInterval(scheduleInterval);
    scheduleInterval = null;
    console.log("[Scheduler] Indexer schedule stopped.");
  }
}
