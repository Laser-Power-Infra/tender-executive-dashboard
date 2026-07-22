import fs from "fs";
import path from "path";
import type { DocumentIndex, DocumentIndexEntry } from "@/types/indexer";

interface ScanRecord {
  docketNo: string;
  folderName: string;
  folderPath: string;
  lastModified: number;
}

function resolveRootPath(): string {
  const candidates = [
    process.env.INDEXER_NETWORK_PATH,
    "Z:\\",                                        // asmita : Z, bidyut : Z
    "\\\\192.168.1.242\\dipankar roy\\",
    "\\\\192.168.1.242\\COSTING & INVOLVEMENT\\",
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      return c;
    }
  }
  return "Z:\\";
}

const CONFIG = {
  networkRoot: resolveRootPath(),
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

  const allFiveDigit = folderName.match(/\b\d{5}\b/g);
  if (allFiveDigit && allFiveDigit.length > 0) {
    return allFiveDigit[allFiveDigit.length - 1];
  }

  const numericSegments = folderName.match(/\d+/g);
  if (numericSegments) {
    const valid = numericSegments.filter(s => {
      const len = s.length;
      return len >= 4 && len <= 6 && s !== "2026" && s !== "2027";
    });
    if (valid.length > 0) {
      return valid[valid.length - 1];
    }
  }

  return null;
}

async function scanDirectoryRecursive(
  currentDir: string,
  scannedIndex: Map<string, ScanRecord>,
  depth: number
): Promise<void> {
  if (depth > 8) return;

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  const dirs = entries.filter(e => e.isDirectory());
  const files = entries.filter(e => e.isFile() && !e.name.startsWith("~$") && !e.name.endsWith(".tmp"));

  for (const dir of dirs) {
    const folderPath = path.join(currentDir, dir.name);
    const docketNo = extractDocketNumber(dir.name);

    if (docketNo) {
      let lastModified = Date.now();
      try {
        const stats = await fs.promises.stat(folderPath);
        lastModified = stats.mtimeMs;
      } catch { /* ignore */ }

      if (!scannedIndex.has(docketNo)) {
        scannedIndex.set(docketNo, {
          docketNo,
          folderName: dir.name,
          folderPath,
          lastModified
        });
      } else {
        const existing = scannedIndex.get(docketNo)!;
        const existingFiles = await countFiles(existing.folderPath);
        const currentFiles = await countFiles(folderPath);
        if (currentFiles > existingFiles) {
          scannedIndex.set(docketNo, {
            docketNo,
            folderName: dir.name,
            folderPath,
            lastModified
          });
        }
      }
    }

    await scanDirectoryRecursive(folderPath, scannedIndex, depth + 1);
  }
}

async function countFiles(dirPath: string): Promise<number> {
  try {
    let count = 0;
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        count += await countFiles(path.join(dirPath, e.name));
      } else if (e.isFile() && !e.name.startsWith("~$") && !e.name.endsWith(".tmp")) {
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function scanNetworkLocation(): Promise<Map<string, ScanRecord>> {
  const scannedIndex = new Map<string, ScanRecord>();
  console.log(`[Scanner] Initializing recursive scan at root: ${CONFIG.networkRoot}`);

  try {
    if (!fs.existsSync(CONFIG.networkRoot)) {
      console.warn(`[Scanner] Root path does not exist: "${CONFIG.networkRoot}"`);
      return scannedIndex;
    }

    await scanDirectoryRecursive(CONFIG.networkRoot, scannedIndex, 0);

    console.log(`[Scanner] Scan complete. Found ${scannedIndex.size} indexed folders.`);
  } catch (err) {
    console.error(`[Scanner] Error scanning root "${CONFIG.networkRoot}": ${(err as Error).message}`);
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
