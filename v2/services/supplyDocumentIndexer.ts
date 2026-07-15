import fs from "fs";
import path from "path";
import type { SupplyIndex, SupplyIndexEntry } from "@/types/indexer";

const CONFIG = {
  networkPath: "W:\\",
  dbFilePath: path.resolve(process.cwd(), "data", "supply_document_index.json"),
  scanIntervalMs: 12 * 60 * 60 * 1000
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

  async load(): Promise<SupplyIndex> {
    try {
      if (!fs.existsSync(this.filePath)) {
        return {};
      }
      const raw = await fs.promises.readFile(this.filePath, "utf-8");
      return JSON.parse(raw || "{}");
    } catch (err) {
      console.error(`[SupplyDB_ERROR] Failed to load index: ${(err as Error).message}`);
      return {};
    }
  }

  async save(data: SupplyIndex): Promise<boolean> {
    const tempPath = `${this.filePath}.tmp`;
    try {
      await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
      await fs.promises.rename(tempPath, this.filePath);
      return true;
    } catch (err) {
      console.error(`[SupplyDB_ERROR] Failed to save index atomically: ${(err as Error).message}`);
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
      }
      return false;
    }
  }
}

const db = new IndexDatabase(CONFIG.dbFilePath);

interface ScanRecord {
  billNo: string;
  folderName: string;
  folderPath: string;
  lastModified: number;
}

function extractBillNumber(folderName: string): string | null {
  if (!folderName) return null;
  const match = folderName.match(/(LP\d{2}Y-\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

async function scanDirectory(
  dir: string,
  depth = 0,
  indexMap = new Map<string, ScanRecord>()
): Promise<void> {
  if (depth > 8) return;

  try {
    const items = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const item of items) {
      if (item.isDirectory()) {
        const folderName = item.name;
        const folderPath = path.join(dir, folderName);
        const billNo = extractBillNumber(folderName);

        if (billNo) {
          let hasFiles = false;
          try {
            const subItems = await fs.promises.readdir(folderPath);
            hasFiles = subItems.some(f => !f.startsWith("~$") && !f.endsWith(".tmp"));
          } catch { /* ignore */ }

          if (hasFiles) {
            let lastModified = Date.now();
            try {
              const stats = await fs.promises.stat(folderPath);
              lastModified = stats.mtimeMs;
            } catch { /* ignore */ }

            const record: ScanRecord = {
              billNo,
              folderName,
              folderPath,
              lastModified
            };

            if (indexMap.has(billNo)) {
              const existing = indexMap.get(billNo)!;
              if (lastModified > existing.lastModified) {
                indexMap.set(billNo, record);
              }
            } else {
              indexMap.set(billNo, record);
            }
          }
        }

        await scanDirectory(folderPath, depth + 1, indexMap);
      }
    }
  } catch { /* Ignore read errors */ }
}

export async function runIndexer(): Promise<void> {
  const startTime = Date.now();
  console.log(`[SupplyIndexer] Starting indexing process at ${new Date(startTime).toLocaleTimeString()}...`);

  if (!fs.existsSync(CONFIG.networkPath)) {
    console.error(`[SupplyIndexer] Mapped drive "${CONFIG.networkPath}" is not accessible. Skipping scan.`);
    return;
  }

  try {
    const indexMap = new Map<string, ScanRecord>();
    await scanDirectory(CONFIG.networkPath, 0, indexMap);

    const currentDb: SupplyIndex = {};
    for (const [billNo, record] of indexMap.entries()) {
      currentDb[billNo] = {
        ...record,
        indexedAt: Date.now()
      };
    }

    const success = await db.save(currentDb);
    if (success) {
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(
        `[SupplyIndexer] Scan completed in ${durationSec}s.\n` +
        `  - Total Mapped: ${Object.keys(currentDb).length}`
      );
    }
  } catch (err) {
    console.error(`[SupplyIndexer] Critical indexing failure: ${(err as Error).message}`);
  }
}

let scheduleInterval: ReturnType<typeof setInterval> | null = null;

export function startScheduling(): void {
  if (scheduleInterval) return;

  runIndexer().catch(err => console.error("[SupplyIndexer] Startup run failed:", err));

  scheduleInterval = setInterval(() => {
    runIndexer().catch(err => console.error("[SupplyIndexer] Scheduled run failed:", err));
  }, CONFIG.scanIntervalMs);

  console.log(`[SupplyIndexer] Scheduled to scan every ${CONFIG.scanIntervalMs / 3600000} hours.`);
}

export function stopScheduling(): void {
  if (scheduleInterval) {
    clearInterval(scheduleInterval);
    scheduleInterval = null;
    console.log("[SupplyIndexer] Schedule stopped.");
  }
}
