import fs from "fs";
import path from "path";

/**
 * Tender & Folder Index Matching Service
 * 
 * Performs an in-memory join between the primary Google Sheet tenders
 * and the network directory scanner index.
 */

const CONFIG = {
  dbFilePath: path.resolve(process.cwd(), "data", "tender_folder_matches.json")
};

// Ensure data directory exists
const dataDir = path.dirname(CONFIG.dbFilePath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * atomic JSON Database Store for matching records
 */
class MatchDatabase {
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
      console.error(`[DB_ERROR] Failed to load match database: ${err.message}`);
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
      console.error(`[DB_ERROR] Failed to save match database atomically: ${err.message}`);
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (e) {}
      }
      return false;
    }
  }
}

const matchDb = new MatchDatabase(CONFIG.dbFilePath);

/**
 * Matches Google Sheet tenders against the folder index.
 * 
 * @param {Array} tenders - List of tender records from Google Sheets (must contain docketNo and tenderNoNitNo)
 * @param {Object} folderIndex - Map or object containing docketNo -> folder details
 * @returns {Array} List of matched output models
 */
export async function matchTendersWithFolders(tenders, folderIndex) {
  if (!tenders || !Array.isArray(tenders)) {
    throw new Error("Invalid tenders input: Expected an array.");
  }
  
  // Normalize folderIndex into an object map if it's a Map
  const foldersMap = folderIndex instanceof Map ? Object.fromEntries(folderIndex) : (folderIndex || {});

  const matches = [];
  const unmatchedTenders = [];
  
  // Track conflicts if multiple folders match a single docket (duplicate folders scenario)
  const duplicateFolderLog = new Map();

  for (const tender of tenders) {
    const docketNo = tender.docketNo;
    const tenderNo = tender.tenderNoNitNo || "UNKNOWN_TENDER";

    // Handle tenders missing docket numbers
    if (!docketNo || docketNo === "-") {
      unmatchedTenders.push({ tenderNo, reason: "No docket number assigned" });
      matches.push({
        tenderNo,
        docketNo: null,
        folderFound: false,
        folderPath: null,
        folderName: null
      });
      continue;
    }

    const folderInfo = foldersMap[docketNo];

    if (folderInfo) {
      // Support duplicate folders validation and tracking
      if (Array.isArray(folderInfo)) {
        // If the scanner indexed multiple paths for this docket number
        if (folderInfo.length > 1) {
          duplicateFolderLog.set(docketNo, folderInfo);
        }
        
        // Match with primary (first) folder and store reference
        const primaryFolder = folderInfo[0];
        matches.push({
          tenderNo,
          docketNo,
          folderFound: true,
          folderPath: primaryFolder.folderPath,
          folderName: primaryFolder.folderName
        });
      } else {
        // Single folder match
        matches.push({
          tenderNo,
          docketNo,
          folderFound: true,
          folderPath: folderInfo.folderPath,
          folderName: folderInfo.folderName
        });
      }
    } else {
      // Docket has no folder mapping in index
      unmatchedTenders.push({ tenderNo, docketNo, reason: "Folder not found in index" });
      matches.push({
        tenderNo,
        docketNo,
        folderFound: false,
        folderPath: null,
        folderName: null
      });
    }
  }

  // Log unmatched tenders for audit and operational review
  if (unmatchedTenders.length > 0) {
    console.warn(
      `[Matcher] Warning: Detected ${unmatchedTenders.length} unmatched tenders.\n` +
      `  - Check system logs or index directory permissions.`
    );
  }

  // Log duplicate folder conflicts
  if (duplicateFolderLog.size > 0) {
    for (const [docketNo, folders] of duplicateFolderLog.entries()) {
      console.warn(
        `[Matcher] Conflict: Multiple folders found for Docket "${docketNo}".\n` +
        folders.map(f => `  - Path: "${f.folderPath}"`).join("\n")
      );
    }
  }

  // Save matching status in database
  await storeMatchingStatus(matches);

  return matches;
}

/**
 * Stores matching results in the database layer.
 */
async function storeMatchingStatus(matches) {
  const currentStore = await matchDb.load();
  const timestamp = Date.now();

  for (const match of matches) {
    // Only store key metrics to conserve disk space
    if (match.docketNo) {
      currentStore[match.docketNo] = {
        tenderNo: match.tenderNo,
        folderFound: match.folderFound,
        folderPath: match.folderPath,
        folderName: match.folderName,
        matchedAt: timestamp
      };
    }
  }

  await matchDb.save(currentStore);
}

/**
 * API Route Handler helper returning the response model
 */
export async function getMatchingStatusApiHandler(req, res, tendersFetcher, folderIndexFetcher) {
  try {
    const tenders = await tendersFetcher();
    const folderIndex = await folderIndexFetcher();

    const matches = await matchTendersWithFolders(tenders, folderIndex);

    res.status(200).json({
      success: true,
      timestamp: Date.now(),
      summary: {
        totalProcessed: matches.length,
        matched: matches.filter(m => m.folderFound).length,
        unmatched: matches.filter(m => !m.folderFound).length
      },
      data: matches
    });
  } catch (err) {
    console.error(`[API_ERROR] Matching handler failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: "Internal server error during record matching.",
      details: err.message
    });
  }
}
