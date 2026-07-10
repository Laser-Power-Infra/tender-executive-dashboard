import fs from "fs";
import path from "path";

/**
 * Enterprise Document Indexing Service
 * 
 * Target Network Location: \\192.168.1.242\COSTING & INVOLVEMENT\2026-27
 * Scans monthly subdirectories (e.g., 04_APRIL_2026, 05_MAY_2026, 06_JUNE_2026)
 * to index folder structures and map them to their extracted numeric docket numbers.
 */

// Resolve the path dynamically
let resolvedPath = "\\\\192.168.1.242\\dipankar roy\\COSTING & INVOLVEMENT\\2026-27";
if (fs.existsSync("Z:\\COSTING & INVOLVEMENT\\2026-27")) {
  resolvedPath = "Z:\\COSTING & INVOLVEMENT\\2026-27";
} else if (fs.existsSync("\\\\192.168.1.242\\dipankar roy\\COSTING & INVOLVEMENT\\2026-27")) {
  resolvedPath = "\\\\192.168.1.242\\dipankar roy\\COSTING & INVOLVEMENT\\2026-27";
}

// Configuration
const CONFIG = {
  networkPath: process.env.INDEXER_NETWORK_PATH || resolvedPath,
  monthlyFolders: [
    "04_APRIL 2026", "05_MAY 2026", "06_JUNE 2026",
    "04_APRIL_2026", "05_MAY_2026", "06_JUNE_2026"
  ],
  dbFilePath: path.resolve(process.cwd(), "data", "document_index.json"),
  scanIntervalMs: 60 * 60 * 1000 // 1 hour
};

// Ensure data directory exists
const dataDir = path.dirname(CONFIG.dbFilePath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Simple atomic file-based Database Store for production stability without external drivers.
 * Can be replaced with a relational DB client (e.g., pg, mysql2, or sqlite3).
 */
class IndexDatabase {
  constructor(filePath) {
    this.filePath = filePath;
  }

  // Load current database index
  async load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return {};
      }
      const raw = await fs.promises.readFile(this.filePath, "utf-8");
      return JSON.parse(raw || "{}");
    } catch (err) {
      console.error(`[DB_ERROR] Failed to load database: ${err.message}`);
      return {};
    }
  }

  // Save current database index atomically to prevent corruption
  async save(data) {
    const tempPath = `${this.filePath}.tmp`;
    try {
      await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
      await fs.promises.rename(tempPath, this.filePath);
      return true;
    } catch (err) {
      console.error(`[DB_ERROR] Failed to save database atomically: ${err.message}`);
      // Clean up temp file if exists
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (e) {}
      }
      return false;
    }
  }
}

const db = new IndexDatabase(CONFIG.dbFilePath);

/**
 * Robustly extracts the numeric docket identifier from a folder name.
 * Handles examples such as:
 * - BHEL-6326-CONTROLCABLE-18970 -> "18970"
 * - BHUTAN-19300 -> "19300"
 * - GEM-01-04-2026-18829-ER -> "18829"
 * - GEM-02-04-2026-18830-NER -> "18830"
 */
function extractDocketNumber(folderName) {
  if (!folderName) return null;

  // 1. Search for standard 5-digit docket sequence
  const fiveDigitMatch = folderName.match(/\b\d{5}\b/);
  if (fiveDigitMatch) {
    return fiveDigitMatch[0];
  }

  // 2. Fallback: Search for any sequence of 4-6 digits that is NOT the fiscal year (2026 or 2027)
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

/**
 * Recursively scans monthly subdirectories at the network path.
 */
async function scanNetworkLocation() {
  const scannedIndex = new Map();
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
        // We only index folders (directories)
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
          } catch (e) {
            console.error(`[Scanner] Failed to get stats for: ${folderPath}`);
          }

          const record = {
            docketNo,
            folderName,
            folderPath,
            lastModified
          };

          // Handle duplicate docket numbers within the current scan
          if (scannedIndex.has(docketNo)) {
            const existing = scannedIndex.get(docketNo);
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
      console.error(`[Scanner] Error reading directory "${targetMonthPath}": ${err.message}`);
    }
  }

  return scannedIndex;
}

/**
 * Main function to execute a single run of the indexer.
 */
export async function runIndexer() {
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
        // Log update if the path changed or the modification timestamp is newer
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
        // Add new record
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
    console.error(`[Indexer] Critical indexing failure: ${err.message}`);
  }
}

// Support rescanning every hour
let scheduleInterval = null;
export function startScheduling() {
  if (scheduleInterval) return;
  
  // Execute immediately on startup
  runIndexer();

  scheduleInterval = setInterval(() => {
    runIndexer();
  }, CONFIG.scanIntervalMs);
  
  console.log(`[Scheduler] Indexer scheduled to run every ${CONFIG.scanIntervalMs / 3600000} hour(s).`);
}

export function stopScheduling() {
  if (scheduleInterval) {
    clearInterval(scheduleInterval);
    scheduleInterval = null;
    console.log("[Scheduler] Indexer schedule stopped.");
  }
}
