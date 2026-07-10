import fs from "fs";
import path from "path";

/**
 * Supply History Document Indexing Service
 * 
 * Target Network Location: W:\
 * Scans directories recursively (up to depth 8)
 * to locate folders matching Sale Bill numbers (e.g. LP22Y-04017)
 * and index them for instantaneous database lookup.
 */

const CONFIG = {
  networkPath: "W:\\",
  dbFilePath: path.resolve(process.cwd(), "data", "supply_document_index.json"),
  scanIntervalMs: 12 * 60 * 60 * 1000 // 12 hours
};

// Ensure data directory exists
const dataDir = path.dirname(CONFIG.dbFilePath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

class IndexDatabase {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return {};
      }
      const raw = await fs.promises.readFile(this.filePath, "utf-8");
      return JSON.parse(raw || "{}");
    } catch (err) {
      console.error(`[SupplyDB_ERROR] Failed to load index: ${err.message}`);
      return {};
    }
  }

  async save(data) {
    const tempPath = `${this.filePath}.tmp`;
    try {
      await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
      await fs.promises.rename(tempPath, this.filePath);
      return true;
    } catch (err) {
      console.error(`[SupplyDB_ERROR] Failed to save index atomically: ${err.message}`);
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (e) {}
      }
      return false;
    }
  }
}

const db = new IndexDatabase(CONFIG.dbFilePath);

/**
 * Extracts a standard Sale Bill number (e.g., LP22Y-04017) from a folder name.
 */
function extractBillNumber(folderName) {
  if (!folderName) return null;
  const match = folderName.match(/(LP\d{2}Y-\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Recursively scans directory down to depth 8.
 */
async function scanDirectory(dir, depth = 0, indexMap = new Map()) {
  if (depth > 8) return;

  try {
    const items = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const item of items) {
      if (item.isDirectory()) {
        const folderName = item.name;
        const folderPath = path.join(dir, folderName);
        const billNo = extractBillNumber(folderName);

        if (billNo) {
          // Check if folder contains any valid files (excluding temp lock files)
          let hasFiles = false;
          try {
            const subItems = await fs.promises.readdir(folderPath);
            hasFiles = subItems.some(f => !f.startsWith("~$") && !f.endsWith(".tmp"));
          } catch (e) {}

          if (hasFiles) {
            let lastModified = Date.now();
            try {
              const stats = await fs.promises.stat(folderPath);
              lastModified = stats.mtimeMs;
            } catch (e) {}

            const record = {
              billNo,
              folderName,
              folderPath,
              lastModified
            };

            // Keep the one with the latest modification time in case of duplicates
            if (indexMap.has(billNo)) {
              const existing = indexMap.get(billNo);
              if (lastModified > existing.lastModified) {
                indexMap.set(billNo, record);
              }
            } else {
              indexMap.set(billNo, record);
            }
          }
        }

        // Continue recursion into subfolders
        await scanDirectory(folderPath, depth + 1, indexMap);
      }
    }
  } catch (err) {
    // Ignore read errors
  }
}

/**
 * Executes a single run of the indexer.
 */
export async function runIndexer() {
  const startTime = Date.now();
  console.log(`[SupplyIndexer] Starting indexing process at ${new Date(startTime).toLocaleTimeString()}...`);

  if (!fs.existsSync(CONFIG.networkPath)) {
    console.error(`[SupplyIndexer] Mapped drive "${CONFIG.networkPath}" is not accessible. Skipping scan.`);
    return;
  }

  try {
    const indexMap = new Map();
    await scanDirectory(CONFIG.networkPath, 0, indexMap);

    const currentDb = {};
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
    console.error(`[SupplyIndexer] Critical indexing failure: ${err.message}`);
  }
}

let scheduleInterval = null;

export function startScheduling() {
  if (scheduleInterval) return;

  // Run asynchronously on startup
  runIndexer().catch(err => console.error("[SupplyIndexer] Startup run failed:", err));

  scheduleInterval = setInterval(() => {
    runIndexer().catch(err => console.error("[SupplyIndexer] Scheduled run failed:", err));
  }, CONFIG.scanIntervalMs);

  console.log(`[SupplyIndexer] Scheduled to scan every ${CONFIG.scanIntervalMs / 3600000} hours.`);
}

export function stopScheduling() {
  if (scheduleInterval) {
    clearInterval(scheduleInterval);
    scheduleInterval = null;
    console.log("[SupplyIndexer] Schedule stopped.");
  }
}
