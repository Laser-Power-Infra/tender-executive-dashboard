import express from "express";
import cors from "cors";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import { registerAttachmentRoutes } from "./controllers/tenderAttachmentController.js";
import { registerTenderRoutes } from "./controllers/tenderController.js";
import { DatabaseTenderService } from "./services/databaseTenderService.js";
import { analyzeCostingSheet, analyzeCostingSheetCached, findCostingSheet } from "./services/costingSheetAnalyzer.js";
import { startScheduling as startSupplyIndexer } from "./services/supplyDocumentIndexer.js";

// Native multiline-aware .env file loader
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const regex = /^\s*([\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\n\r]*))/mg;
    let match;
    while ((match = regex.exec(envContent)) !== null) {
      const key = match[1];
      const value = match[2] || match[3] || match[4] || "";
      process.env[key] = value.trim();
    }
  }
} catch (e) {
  // Ignore
}

/**
 * Extracts the pure numeric portion from an ENQ-style docket string.
 * Examples:
 *   "ENQ-20277-25-26"  → "20277"
 *   "20277"            → "20277"
 *   "ENG-18970-24-25" → "18970"
 *   "-" / null        → null
 * Used to build the docketNo that matches local server folder names.
 */
const extractNumericDocket = (docketStr) => {
  if (!docketStr || docketStr.trim() === "" || docketStr.trim() === "-") return null;
  // Priority 1: ENQ/ENG/ENC prefix pattern → capture the middle number segment
  const prefixMatch = docketStr.match(/(?:ENQ|ENG|ENC|FNO)[-_](\d+)/i);
  if (prefixMatch) return prefixMatch[1];
  // Priority 2: Already a pure number
  const pureNum = docketStr.trim();
  if (/^\d+$/.test(pureNum)) return pureNum;
  // Priority 3: First run of 4–6 digits anywhere in the string
  const looseMatch = docketStr.match(/(\d{4,6})/);
  return looseMatch ? looseMatch[1] : null;
};

/**
 * Helper to identify if a string matches a date format.
 */
function isDate(str) {
  return /^\d{1,2}[-.\/][a-z0-9]{2,4}[-.\/]\d{2,4}$/i.test(str);
}

/**
 * Parses and extracts a clean bank guarantee (BG) number from the raw input text.
 */
function extractBgNumber(str) {
  if (!str) return "";
  
  const trimmed = str.trim();
  
  // 1. Check if it's the Excel tab-separated paste format (usually contains BG No\tBG Date or multiple tabs/newlines)
  if (trimmed.includes("\t") && (trimmed.toLowerCase().includes("bg no\t") || trimmed.toLowerCase().includes("bg date"))) {
    const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      const cols = lines[1].split("\t").map(c => c.trim()).filter(Boolean);
      if (cols.length > 0) {
        const candidate = cols[0].replace(/['"]/g, "").trim();
        if (!isDate(candidate)) {
          return candidate;
        }
      }
    }
  }

  // 2. Look for explicit prefixes: "BG No :", "BG No:", "BG No-", "BG No.", "BG "
  // We want to capture the alphanumeric string right after.
  const explicitRegex = /(?:bg\s*no\s*[:.-]?\s*|bg\s+)([a-z0-9]{8,25})/i;
  const match = trimmed.match(explicitRegex);
  if (match) {
    const candidate = match[1];
    if (!isDate(candidate)) {
      return candidate;
    }
  }

  // 3. Fallback: If no explicit prefix matches, let's see if the word starts with a known BG pattern (e.g. contains "BG" or is a long number)
  const words = trimmed.split(/[\s,;:\r\n\t]+/).map(w => w.trim()).filter(Boolean);
  for (const word of words) {
    const cleanWord = word.replace(/[^a-z0-9]/ig, "");
    if (cleanWord.length >= 10 && cleanWord.length <= 20) {
      const lower = cleanWord.toLowerCase();
      if (!lower.includes("dated") && !lower.includes("issue") && !lower.includes("value") && !lower.includes("amount")) {
        if (lower.includes("bg") && !isDate(word)) {
          return cleanWord;
        }
      }
    }
  }

  // Second pass: check for a long digit-only word
  for (const word of words) {
    const cleanWord = word.replace(/[^a-z0-9]/ig, "");
    if (/^\d{12,20}$/.test(cleanWord) && !isDate(word)) {
      return cleanWord;
    }
  }

  return "";
}

const getGoogleDriveFileId = (url) => {
  if (!url) return null;
  let match = url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return null;
};

const getGoogleDriveDownloadUrl = (url) => {
  const fileId = getGoogleDriveFileId(url);
  if (fileId) {
    return `https://docs.google.com/uc?export=download&id=${fileId}`;
  }
  return url;
};

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Register the serverless handler as a local Express route
app.get("/api/tenders", handler);

// Register attachment and download API routes
registerAttachmentRoutes(app);
registerTenderRoutes(app);

// ── SWR Cache for Smartsheet Tender Dashboard ─────────────────────────────
const USE_DISK_CACHE = true; // enable disk cache to persist enriched data across restarts
const ENABLE_PERSISTENT_CACHE = true; // When true, load/save enriched cache to disk to survive restarts
const ENABLE_BACKGROUND_REFRESH = false; // Disable automatic refresh after serving cached data
const smartsheetCache = { data: null, updatedAt: 0 };
let smartsheetFetchPromise = null;
let enrichmentPromise = null;
const SMARTSHEET_CACHE_PATH = path.resolve(process.cwd(), "data", "smartsheet_cache.json");

function loadSmartsheetCacheFromDisk() {
  if (!USE_DISK_CACHE) return false;
  try {
    if (fs.existsSync(SMARTSHEET_CACHE_PATH)) {
      const cached = JSON.parse(fs.readFileSync(SMARTSHEET_CACHE_PATH, "utf-8"));
      if (cached && cached.data && Array.isArray(cached.data)) {
        smartsheetCache.data = cached.data;
        smartsheetCache.updatedAt = cached.updatedAt || 0;
        console.log(`[SmartsheetCache] Loaded ${cached.data.length} rows from disk`);
        return true;
      }
    }
  } catch (err) {
    console.warn("[SmartsheetCache] Failed to load disk cache:", err.message);
  }
  return false;
}

async function saveSmartsheetCacheToDisk() {
  if (!USE_DISK_CACHE) return;
  try {
    if (!fs.existsSync(path.dirname(SMARTSHEET_CACHE_PATH))) {
      fs.mkdirSync(path.dirname(SMARTSHEET_CACHE_PATH), { recursive: true });
    }
    await fs.promises.writeFile(SMARTSHEET_CACHE_PATH, JSON.stringify({
      data: smartsheetCache.data,
      updatedAt: smartsheetCache.updatedAt
    }), "utf-8");
  } catch (err) {
    console.warn("[SmartsheetCache] Failed to save disk cache:", err.message);
  }
}

if (ENABLE_PERSISTENT_CACHE) { loadSmartsheetCacheFromDisk(); }

/**
 * Fetches fresh Smartsheet + costing data. Throws on failure.
 */
async function fetchSmartsheetData(token, sheetId) {
  try {
    const url = `https://api.smartsheet.com/2.0/sheets/${sheetId.trim()}`;
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          "Content-Type": "application/json",
        },
      });
    } catch (networkErr) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      console.error(`[SmartsheetAPI] Network error: ${msg}`);
      throw new Error(`Cannot reach Smartsheet API. Check your network connection. (${msg})`);
    }

    if (!response.ok) {
      let body = "";
      try { body = await response.text(); } catch (_) {}
      console.error(`[SmartsheetAPI] HTTP ${response.status}: ${body}`);

      if (response.status === 401) {
        throw new Error("Invalid or expired Smartsheet API token. Verify SMARTSHEET_API_TOKEN in .env.");
      }
      if (response.status === 403) {
        throw new Error(`Smartsheet token does not have access to sheet ${sheetId}. Grant read permissions.`);
      }
      if (response.status === 404) {
        throw new Error(`Sheet ID "${sheetId}" not found in Smartsheet. Verify SMARTSHEET_SHEET_ID.`);
      }
      if (response.status === 429) {
        throw new Error("Smartsheet API rate limit exceeded. Please wait a moment and try again.");
      }
      throw new Error(`Unexpected Smartsheet API error (${response.status}).`);
    }

    const sheetData = await response.json();
    const columns = sheetData.columns || [];
    const rows = sheetData.rows || [];

    // Build column title → columnId lookup (by name, never by index)
    // NOTE: titles match the actual Smartsheet column titles exactly (verified by debug inspection)
    const COLUMN_MAP = {
      enquiryDate:     "Enquiry Date(MM-DD-YY)  (Debosmita Nath)",
      partyName:       "Party Name  (Debosmita Nath)",
      docketNumber:    "Docket No  (Debosmita Nath)",
      utility:         "Utility (Marketing Team)",
      quotationNumber: "Quotation No. (Dipankar)",
      quotationDate:   "Quotation DateFORMAT(MM-DD-YY) (Dipankar)",
      accountHolder:   "Account Holder",
      tenderPurchase:  "Tender/ Purchase/Bugetary/ Laser Tender (Marketing",
    };

    const columnIndex = new Map();
    for (const col of columns) {
      if (col.title) columnIndex.set(col.title.trim(), col.id);
    }

    const getCellValue = (cells, columnId) => {
      if (columnId === undefined) return null;
      const cell = cells.find((c) => c.columnId === columnId);
      if (!cell) return null;
      if (cell.displayValue !== undefined && cell.displayValue !== null) {
        return String(cell.displayValue).trim() || null;
      }
      if (cell.value !== undefined && cell.value !== null) {
        return String(cell.value).trim() || null;
      }
      return null;
    };

    const data = rows.map((row) => {
      const cells = row.cells || [];
      const get = (field) => getCellValue(cells, columnIndex.get(COLUMN_MAP[field]));
      return {
        enquiryDate:     get("enquiryDate"),
        partyName:       get("partyName"),
        docketNumber:    get("docketNumber"),
        utility:         get("utility"),
        quotationNumber: get("quotationNumber"),
        quotationDate:   get("quotationDate"),
        accountHolder:   get("accountHolder"),
        tenderPurchase:  get("tenderPurchase"),
      };
    });

    // 2. Fetch Google Sheets Costing Attachment list to join
    let costingRows = [];
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY;

    if (email && key) {
      try {
        let cleanKey = key.trim().replace(/^["']|["']$/g, "");
        cleanKey = cleanKey.replace(/\\n/g, "\n");
        let cleanEmail = email.trim().replace(/^["']|["']$/g, "");

        const accessToken = await getAccessToken(cleanEmail, cleanKey);

        const COSTING_SPREADSHEET_ID = "1FK1t7FeAjQ3v4saIxJUS-5KbE6YlQv-8WFQCBRuaxDQ";
        const COSTING_WORKSHEET_NAME = "Cost";
        const costingRange = `${COSTING_WORKSHEET_NAME}!A1:ZZ`;
        const costingUrl = `https://sheets.googleapis.com/v4/spreadsheets/${COSTING_SPREADSHEET_ID}/values/${encodeURIComponent(costingRange)}`;

        const costingResponse = await fetch(costingUrl, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        });

        if (costingResponse.ok) {
          const costingData = await costingResponse.json();
          costingRows = costingData.values || [];
        }
      } catch (costingErr) {
        console.warn(`[SmartsheetAPI] Failed to fetch Google Sheet costing data: ${costingErr.message}`);
      }
    }

    // Build active lookup map of costing records keyed by numericDocket
    const costingMap = new Map();
    if (costingRows && costingRows.length > 1) {
      const cHeaders = costingRows[0].map(h => h.trim());
      const cNormalizeHeader = (h) => h.trim().toLowerCase().replace(/\s+/g, "");

      const pasteTmNoIdx = cHeaders.findIndex(h => cNormalizeHeader(h).includes("pastetmno") || cNormalizeHeader(h).includes("puststmno"));
      const enqDocketNoIdx = cHeaders.findIndex(h => cNormalizeHeader(h).includes("enqdocketno"));
      const uploadCostingSheetIdx = cHeaders.findIndex(h => cNormalizeHeader(h).includes("uploadcostingsheet"));

      if (uploadCostingSheetIdx !== -1) {
        for (let i = 1; i < costingRows.length; i++) {
          const cRow = costingRows[i];
          if (!cRow || cRow.length === 0) continue;

          const rawUrl = uploadCostingSheetIdx < cRow.length ? cRow[uploadCostingSheetIdx] : "";
          const rawEnqDocket = (enqDocketNoIdx !== -1 && enqDocketNoIdx < cRow.length) ? cRow[enqDocketNoIdx] : "";
          const rawPasteTmNo = (pasteTmNoIdx !== -1 && pasteTmNoIdx < cRow.length) ? cRow[pasteTmNoIdx] : "";

          if (!rawUrl || rawUrl.trim() === "-" || rawUrl.trim() === "") continue;

          let numericDocket = extractNumericDocket(rawEnqDocket);
          if (!numericDocket) {
            numericDocket = extractNumericDocket(rawPasteTmNo);
          }

          if (numericDocket) {
            costingMap.set(numericDocket, {
              url: rawUrl.trim(),
              itemCategory: null // Will be dynamically parsed from Excel sheet file details
            });
          }
        }
      }
    }

    // Fetch Drive access token once for all costing Excel downloads
    let driveAccessToken = null;
    try {
      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
      const key = process.env.GOOGLE_PRIVATE_KEY;
      if (email && key) {
        let cleanKey = key.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
        let cleanEmail = email.trim().replace(/^["']|["']$/g, "");
        driveAccessToken = await getAccessToken(cleanEmail, cleanKey);
      }
    } catch (tokErr) {
      console.warn(`[SmartsheetAPI] Failed to get Drive access token, skipping all Drive costing downloads: ${tokErr.message}`);
    }

    // Probe Drive access with the first available attachment URL
    if (driveAccessToken) {
      const firstDriveEntry = [...costingMap.entries()].find(([_, v]) => v.url && getGoogleDriveFileId(v.url));
      if (firstDriveEntry) {
        const fileId = getGoogleDriveFileId(firstDriveEntry[1].url);
        try {
          const probeResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { "Authorization": `Bearer ${driveAccessToken}` }
          });
          if (!probeResponse.ok) {
            console.warn(`[SmartsheetAPI] Drive access probe returned ${probeResponse.status}, skipping all Drive costing downloads`);
            driveAccessToken = null;
          }
        } catch (probeErr) {
          console.warn(`[SmartsheetAPI] Drive access probe failed, skipping all Drive costing downloads: ${probeErr.message}`);
          driveAccessToken = null;
        }
      }
    }

    // Build basic data immediately (NO Excel downloads — they happen in background)
    const basicData = [];
    for (const row of data) {
      const numericDocket = extractNumericDocket(row.docketNumber);
      let attachmentUrl = null;
      let itemCategory = null;

      if (numericDocket && costingMap.has(numericDocket)) {
        const match = costingMap.get(numericDocket);
        attachmentUrl = match.url;
        itemCategory = match.itemCategory;
      }

      basicData.push({
        ...row,
        attachmentUrl: getGoogleDriveDownloadUrl(attachmentUrl),
        proposedErpItemName: null,
        proposedQty: null,
        priceBasis: null,
        itemCategory,
        aluminiumPrice: null,
        aluminiumAlloyPrice: null,
        copperTapePrice: null,
        extrudedSemiconductivePrice: null,
        htXlpePrice: null,
        pvcTypeSt2Price: null,
        galvanisedSteelFlatStripPrice: null,
        fillerPrice: null
      });
    }

    console.log(`[SmartsheetAPI] ✓ Fetched ${data.length} rows. Enriching in background...`);

    // Fire-and-forget background enrichment
    enrichSmartsheetCacheInBackground(data, costingMap, driveAccessToken).catch(err =>
      console.error("[SmartsheetCache] Background enrichment error:", err.message)
    );

    return basicData;
  } catch (err) {
    console.error("[SmartsheetAPI] Unhandled error:", err);
    throw err;
  }
}

/**
 * Background enrichment: downloads costing Excel files and updates the cache.
 * Uses a promise guard to prevent concurrent runs.
 */
async function enrichSmartsheetCacheInBackground(data, costingMap, driveAccessToken) {
  if (enrichmentPromise) return enrichmentPromise;
  enrichmentPromise = enrichSmartsheetData(data, costingMap, driveAccessToken);
  try {
    return await enrichmentPromise;
  } finally {
    enrichmentPromise = null;
  }
}

async function enrichSmartsheetData(data, costingMap, driveAccessToken) {
  console.log(`[SmartsheetCache] Starting background enrichment for ${data.length} rows...`);
  const enrichedData = [];

  for (const row of data) {
    const numericDocket = extractNumericDocket(row.docketNumber);
    let attachmentUrl = null;
    let proposedErpItemName = null;
    let proposedQty = null;
    let priceBasis = null;
    let itemCategory = null;
    let aluminiumPrice = null;
    let aluminiumAlloyPrice = null;
    let copperTapePrice = null;
    let extrudedSemiconductivePrice = null;
    let htXlpePrice = null;
    let pvcTypeSt2Price = null;
    let galvanisedSteelFlatStripPrice = null;
    let fillerPrice = null;

    if (numericDocket && costingMap.has(numericDocket)) {
      const match = costingMap.get(numericDocket);
      attachmentUrl = match.url;
      itemCategory = match.itemCategory;

      try {
        const costingDetails = await getCostingDetails(attachmentUrl, numericDocket, driveAccessToken);
        if (costingDetails) {
          proposedErpItemName = costingDetails.proposedErpItemName;
          proposedQty = costingDetails.proposedQty;
          priceBasis = costingDetails.priceBasis;
          if (costingDetails.prices) {
            aluminiumPrice = costingDetails.prices.aluminium;
            aluminiumAlloyPrice = costingDetails.prices.aluminiumAlloy;
            copperTapePrice = costingDetails.prices.copperTape;
            extrudedSemiconductivePrice = costingDetails.prices.extrudedSemiconductive;
            htXlpePrice = costingDetails.prices.htXlpe;
            pvcTypeSt2Price = costingDetails.prices.pvcTypeSt2;
            galvanisedSteelFlatStripPrice = costingDetails.prices.galvanisedSteelFlatStrip;
            fillerPrice = costingDetails.prices.filler;
          }
        }
      } catch (err) {
        console.warn(`[SmartsheetAPI] Failed to parse costing Excel for docket "${numericDocket}": ${err.message}`);
      }
    }

    enrichedData.push({
      ...row,
      attachmentUrl: getGoogleDriveDownloadUrl(attachmentUrl),
      proposedErpItemName,
      proposedQty,
      priceBasis,
      itemCategory,
      aluminiumPrice,
      aluminiumAlloyPrice,
      copperTapePrice,
      extrudedSemiconductivePrice,
      htXlpePrice,
      pvcTypeSt2Price,
      galvanisedSteelFlatStripPrice,
      fillerPrice
    });
  }

  smartsheetCache.data = enrichedData;
  smartsheetCache.updatedAt = Date.now();
  if (USE_DISK_CACHE) { if (ENABLE_PERSISTENT_CACHE) { await saveSmartsheetCacheToDisk(); } }
  console.log(`[SmartsheetCache] ✓ Background enrichment complete: ${enrichedData.length} rows.`);
}

/**
 * SWR wrapper: returns cached data or fetches fresh, deduplicates concurrent calls.
 */
async function refreshSmartsheetCache(token, sheetId, forceNew = false) {
  // Return already‑enriched cache if present and not forcing a refresh
  if (smartsheetCache.data && smartsheetCache.data.length > 0 && !forceNew) {
    console.log('[SmartsheetCache] Returning already‑enriched cache');
    return smartsheetCache.data;
  }

  // If a fetch is already in progress, either wait for it (forceNew) or reuse it
  if (smartsheetFetchPromise) {
    if (forceNew) {
      await smartsheetFetchPromise.catch(() => {});
    } else {
      return smartsheetFetchPromise;
    }
  }

  smartsheetFetchPromise = fetchSmartsheetData(token, sheetId);
  try {
    const data = await smartsheetFetchPromise;
    smartsheetCache.data = data;
    smartsheetCache.updatedAt = Date.now();
    if (ENABLE_PERSISTENT_CACHE) {
      saveSmartsheetCacheToDisk();
    }
    return data;
  } finally {
    smartsheetFetchPromise = null;
  }
}

// ── Smartsheet Tender Dashboard API ─────────────────────────────────────────
// GET /api/smartsheet-tenders
// Uses SWR pattern: returns cached data immediately, refreshes in background.
app.get("/api/smartsheet-tenders", async (req, res) => {
  const token = process.env.SMARTSHEET_API_TOKEN;
  const sheetId = process.env.SMARTSHEET_SHEET_ID;

  if (!token || token.trim() === "") {
    return res.status(500).json({
      success: false,
      error: "Server is not configured. SMARTSHEET_API_TOKEN is missing.",
      code: "MISSING_TOKEN",
    });
  }

  if (!sheetId || sheetId.trim() === "") {
    return res.status(500).json({
      success: false,
      error: "Server is not configured. SMARTSHEET_SHEET_ID is missing.",
      code: "MISSING_SHEET_ID",
    });
  }

  const forceFresh = req.query.fresh === "true";

  // SWR: serve stale cache immediately, refresh in background
  if (smartsheetCache.data && !forceFresh) {
    res.json({ success: true, data: smartsheetCache.data });
    // Only trigger background refresh if the feature is enabled
    if (ENABLE_BACKGROUND_REFRESH && !smartsheetFetchPromise) {
      refreshSmartsheetCache(token.trim(), sheetId.trim()).catch(err =>
        console.error("[SmartsheetCache] Background refresh:", err.message)
      );
    }
    return;
  }

  // No cache or forced fresh — wait for fresh data
  try {
    const data = await refreshSmartsheetCache(token.trim(), sheetId.trim(), forceFresh);
    res.status(200).json({ success: true, data });
  } catch (err) {
    // Fallback to stale cache if fetch fails
    if (smartsheetCache.data) {
      console.warn("[SmartsheetAPI] Fetch failed, serving stale cache:", err.message);
      return res.json({ success: true, data: smartsheetCache.data });
    }
    console.error("[SmartsheetAPI] Unhandled error:", err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "An unexpected server error occurred.",
      code: "UNKNOWN",
    });
  }
});
// ────────────────────────────────────────────────────────────────────────────


// ── Supply History Dashboard Cache ───────────────────────────────────────────
let supplyHistoryCache = { data: null, timestamp: 0, promise: null };
const SUPPLY_SPREADSHEET_ID = "1tXiJC9AZNiAAoL8mM_KxKuzrFqzuk-n3n16abJbaam0";

// GET /api/supply-history — fetches LASER MFG SALE BILL sheet
app.get("/api/supply-history", async (req, res) => {
  const forceFresh = req.query.fresh === "true";

  if (supplyHistoryCache.data && !forceFresh) {
    res.json({ success: true, data: supplyHistoryCache.data });
    if (ENABLE_BACKGROUND_REFRESH && !supplyHistoryCache.promise) {
      refreshSupplyHistoryCache().catch(err =>
        console.error("[SupplyCache] Background refresh:", err.message)
      );
    }
    return;
  }

  try {
    const data = await refreshSupplyHistoryCache(forceFresh);
    res.status(200).json({ success: true, data });
  } catch (err) {
    if (supplyHistoryCache.data) {
      console.warn("[SupplyAPI] Fetch failed, serving stale cache:", err.message);
      return res.json({ success: true, data: supplyHistoryCache.data });
    }
    console.error("[SupplyAPI] Unhandled error:", err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "An unexpected server error occurred.",
    });
  }
});

async function refreshSupplyHistoryCache(forceFresh = false) {
  if (supplyHistoryCache.promise) return supplyHistoryCache.promise;
  if (supplyHistoryCache.data && !forceFresh) return supplyHistoryCache.data;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) throw new Error("Google Service Account credentials are not configured.");

  let cleanKey = key.trim().replace(/^["']|["']$/g, "");
  cleanKey = cleanKey.replace(/\\n/g, "\n");
  let cleanEmail = email.trim().replace(/^["']|["']$/g, "");

  const fn = async () => {
    const accessToken = await getAccessToken(cleanEmail, cleanKey);

    // Discover the actual sheet name from spreadsheet metadata
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SUPPLY_SPREADSHEET_ID}`;
    const metaResponse = await fetch(metaUrl, {
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    if (!metaResponse.ok) {
      const text = await metaResponse.text();
      throw new Error(`Failed to fetch spreadsheet metadata: ${text}`);
    }
    const meta = await metaResponse.json();
    const sheetTitle = meta.sheets?.[0]?.properties?.title;
    if (!sheetTitle) throw new Error("No sheets found in the spreadsheet");

    const range = `${sheetTitle}!A1:ZZ`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SUPPLY_SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Sheets API returned status ${response.status}: ${text}`);
    }

    const data = await response.json();
    const rows = data.values || [];
    if (rows.length < 2) return [];

    // Load supply document index
    let supplyDocIndex = {};
    try {
      const dbPath = path.resolve(process.cwd(), "data", "supply_document_index.json");
      if (fs.existsSync(dbPath)) {
        supplyDocIndex = JSON.parse(await fs.promises.readFile(dbPath, "utf-8"));
      }
    } catch (err) {
      console.error("[SupplyIndexer] Failed to load supply document index:", err.message);
    }

    // First row is headers
    const records = rows.slice(1).map(row => {
      const billNumber = row[1] || null;
      const trimmedBill = billNumber ? billNumber.trim().toUpperCase() : "";
      return {
        fy:              row[0]  || null,
        saleBillNumber:  billNumber,
        saleBillDate:    row[2]  || null,
        itemCode:        row[3]  || null,
        itemName:        row[4]  || null,
        lrNo:            row[5]  || null,
        truckNo:         row[6]  || null,
        partyRefNo:      row[7]  || null,
        partyRefDate:    row[8]  || null,
        contractVrNo:    row[9]  || null,
        rate:            row[11] !== undefined && row[11] !== "" ? parseFloat(row[11]) : null,
        invoiceQty:      row[14] !== undefined && row[14] !== "" ? parseFloat(row[14]) : null,
        invoiceAmt:      row[15] !== undefined && row[15] !== "" ? parseFloat(row[15]) : null,
        partyName:       row[16]  || null,
        hasDocuments:    !!(trimmedBill && supplyDocIndex[trimmedBill]),
      };
    });

    supplyHistoryCache = { data: records, timestamp: Date.now(), promise: null };
    return records;
  };

  supplyHistoryCache.promise = fn();
  try {
    return await supplyHistoryCache.promise;
  } finally {
    supplyHistoryCache.promise = null;
  }
}
// ────────────────────────────────────────────────────────────────────────────


const SPREADSHEET_ID = "1GTwzxMgViohbCimXqfiBZBJsKbCSr7hCgbcHF_En1VE";
const WORKSHEET_NAME = "LASER_Master_Tender_List";

// Vercel Serverless environment write-restriction compliant cache path
const isVercel = process.env.VERCEL || process.env.NOW_BUILDER;
const CACHE_DIR = isVercel 
  ? path.join("/tmp", "excel_cache") 
  : path.resolve(process.cwd(), "excel_cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Downloads and parses an Excel costing sheet, extracting the Price Basis
 * and raw material rates. Uses a local filesystem cache (in /tmp for Vercel).
 */
async function getCostingDetails(attachmentUrl, docketNo, driveAccessToken) {
  if (!attachmentUrl) return null;
  
  let downloadUrl = attachmentUrl;
  let headers = {};

  const fileId = getGoogleDriveFileId(attachmentUrl);
  if (fileId) {
    if (!driveAccessToken) {
      console.warn(`[Cache] No Drive access token available, skipping Drive download for docket "${docketNo}"`);
      return null;
    }
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    headers["Authorization"] = `Bearer ${driveAccessToken}`;
  }

  const hash = crypto.createHash("md5").update(downloadUrl).digest("hex");
  const localPath = path.join(CACHE_DIR, `${hash}.xlsx`);

  let fileExists = fs.existsSync(localPath);

  if (!fileExists) {
    try {
      console.log(`[Cache] Downloading costing Excel for docket "${docketNo}"...`);
      const response = await fetch(downloadUrl, { headers });
      if (!response.ok) {
        console.warn(`[Cache] Failed to download Excel for docket "${docketNo}": ${response.statusText}`);
        return null;
      }
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(localPath, Buffer.from(buffer));
      fileExists = true;
    } catch (err) {
      console.warn(`[Cache] Error downloading Excel for docket "${docketNo}": ${err.message}`);
      return null;
    }
  }

  if (fileExists) {
    const analysisPath = localPath.replace(/\.xlsx$/, ".analysis.json");
    let analysis = null;
    if (fs.existsSync(analysisPath)) {
      try {
        analysis = JSON.parse(fs.readFileSync(analysisPath, "utf-8"));
      } catch (e) {
        console.warn(`[Analyzer] Failed to read cached analysis for docket "${docketNo}": ${e.message}`);
      }
    }
    if (!analysis) {
      try {
        analysis = analyzeCostingSheetCached(localPath, docketNo);
        fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
      } catch (analysisErr) {
        console.warn(`[Analyzer] Error analyzing docket "${docketNo}": ${analysisErr.message}`);
      }
    }
    if (analysis) {
      console.log(`[Analyzer] Docket "${docketNo}": ${analysis.items.length} items, ${analysis.materialsFound.length} materials`);
    }
  }

  if (fileExists) {
    try {
      const workbook = XLSX.readFile(localPath);
      const sheetName = findCostingSheet(workbook);
      const sheet = sheetName ? workbook.Sheets[sheetName] : null;
      if (!sheet) {
        console.warn(`[Cache] Costing sheet could not be resolved for docket "${docketNo}"`);
        return null;
      }

      // Extract Price Basis
      let priceBasis = "Firm";
      for (let c = 0; c < 5; c++) {
        const cellRef = XLSX.utils.encode_cell({ r: 7, c });
        const cell = sheet[cellRef];
        if (cell && cell.v) {
          const valStr = String(cell.v);
          if (valStr.toLowerCase().includes("variable")) {
            priceBasis = "Variable";
          }
        }
      }

      // Extract Material Prices
      const prices = {
        aluminium: null,
        aluminiumAlloy: null,
        copperTape: null,
        extrudedSemiconductive: null,
        htXlpe: null,
        pvcTypeSt2: null,
        galvanisedSteelFlatStrip: null,
        filler: null
      };

      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:ZZ100");

      // Material matching regex patterns
      const patterns = {
        aluminium: /^(aluminium|alumimium)$/i,
        aluminiumAlloy: /^(aluminium alloy|alumimium alloy)$/i,
        copperTape: /^(copper tape - 0\.060? mm|copper tape - 0\.06 mm|coper tape - 0\.1 mm|copper tape - 0\.03 mm|copper tape - 0\.035 mm|copper tape - 0\.04 mm|copper tape - 0\.045 mm|copper tape - 0\.050? mm|copper tape)$/i,
        extrudedSemiconductive: /^(extruded semiconductive|extruded semiconductive\(stripable\))$/i,
        htXlpe: /^(ht-xlpe|lt-xlpe|tr xlpe|xlpe)$/i,
        pvcTypeSt2: /^(pvc type st-2|fr pvc type st-2|frlsh pvc type st-2|pvc type st-2-pressure extruded)$/i,
        galvanisedSteelFlatStrip: /^(galvanised steel flat strip|galvanised steel flat strip \(double\)|galvanised steel flat strip-b|galvanised steel round wire|galvanised steel round wire \(double\))$/i,
        filler: /^filler$/i
      };

      // Find the header row dynamically by finding the row with the maximum matching material headers
      let bestRowIdx = -1;
      let maxMatchCount = 0;
      const maxSearchRow = Math.min(range.e.r, 40);

      for (let r = 0; r <= maxSearchRow; r++) {
        let matchCount = 0;
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[cellRef];
          if (cell && cell.v !== undefined) {
            const valStr = String(cell.v).trim().toLowerCase();
            const matchesAny = Object.values(patterns).some(regex => regex.test(valStr));
            if (matchesAny) {
              matchCount++;
            }
          }
        }
        if (matchCount > maxMatchCount) {
          maxMatchCount = matchCount;
          bestRowIdx = r;
        }
      }

      if (bestRowIdx !== -1 && maxMatchCount > 0) {
        const rowHeaderIdx = bestRowIdx;
        const rowRateIdx = bestRowIdx + 1;

        if (rowRateIdx <= range.e.r) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cellHeaderRef = XLSX.utils.encode_cell({ r: rowHeaderIdx, c });
            const cellRateRef = XLSX.utils.encode_cell({ r: rowRateIdx, c });

            const headerCell = sheet[cellHeaderRef];
            const rateCell = sheet[cellRateRef];

            if (!headerCell) continue;

            const header = String(headerCell.v).trim().toLowerCase();
            const rateVal = rateCell && rateCell.v !== undefined && rateCell.v !== "" ? Number(rateCell.v) : null;

            if (rateVal === null || isNaN(rateVal)) continue;

            if (patterns.aluminium.test(header)) {
              if (prices.aluminium === null || prices.aluminium === 0) prices.aluminium = rateVal;
            } else if (patterns.aluminiumAlloy.test(header)) {
              if (prices.aluminiumAlloy === null || prices.aluminiumAlloy === 0) prices.aluminiumAlloy = rateVal;
            } else if (patterns.copperTape.test(header)) {
              if (prices.copperTape === null || prices.copperTape === 0) prices.copperTape = rateVal;
            } else if (patterns.extrudedSemiconductive.test(header)) {
              if (prices.extrudedSemiconductive === null || prices.extrudedSemiconductive === 0) prices.extrudedSemiconductive = rateVal;
            } else if (patterns.htXlpe.test(header)) {
              if (prices.htXlpe === null || prices.htXlpe === 0) prices.htXlpe = rateVal;
            } else if (patterns.pvcTypeSt2.test(header)) {
              if (prices.pvcTypeSt2 === null || prices.pvcTypeSt2 === 0) prices.pvcTypeSt2 = rateVal;
            } else if (patterns.galvanisedSteelFlatStrip.test(header)) {
              if (prices.galvanisedSteelFlatStrip === null || prices.galvanisedSteelFlatStrip === 0) prices.galvanisedSteelFlatStrip = rateVal;
            } else if (patterns.filler.test(header)) {
              if (prices.filler === null || prices.filler === 0) prices.filler = rateVal;
            }
          }
        }
      }

      // Extract proposed ERP items and quantities
      const erpItems = [];
      const qtyItems = [];
      
      let erpHeaderRowIdx = -1;
      let erpColIdx = -1;
      let qtyColIdx = -1;
      let unitColIdx = -1;
      
      const normalizeCellHeader = (s) => String(s || "").trim().toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

      for (let r = range.s.r; r <= Math.min(range.e.r, 40); r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[cellRef];
          if (cell && cell.v !== undefined) {
            const norm = normalizeCellHeader(cell.v);
            if (norm.includes("PROPOSE ERP ITEM") || norm.includes("PROPOSED ERP ITEM")) {
              erpHeaderRowIdx = r;
              erpColIdx = c;
            } else if (norm === "QTY" || norm.startsWith("QTY ") || norm === "QUANTITY") {
              qtyColIdx = c;
            } else if (norm === "UNIT") {
              unitColIdx = c;
            }
          }
        }
        if (erpHeaderRowIdx !== -1) break;
      }
      
      if (erpHeaderRowIdx !== -1 && erpColIdx !== -1) {
        const seenItems = new Set();
        
        for (let r = erpHeaderRowIdx + 1; r <= range.e.r; r++) {
          // Verify docket cell contains docketNo (normalized, tolerant match)
          const docketCellRef = XLSX.utils.encode_cell({ r, c: 0 });
          const docketCell = sheet[docketCellRef];
          if (!docketCell || docketCell.v === undefined) {
            continue;
          }
          const docketStr = String(docketCell.v).trim();
          const normalizeAlphaNum = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
          const sheetDocketNorm = normalizeAlphaNum(docketStr);
          const paramDocketNorm = normalizeAlphaNum(docketNo);
          if (!paramDocketNorm || (!sheetDocketNorm.includes(paramDocketNorm) && !paramDocketNorm.includes(sheetDocketNorm))) {
            continue;
          }

          const erpCellRef = XLSX.utils.encode_cell({ r, c: erpColIdx });
          const erpCell = sheet[erpCellRef];
          if (erpCell && erpCell.v !== undefined && String(erpCell.v).trim() !== "") {
            const erpVal = String(erpCell.v).trim();
            if (erpVal.toUpperCase().includes("PROPOSE") || erpVal.toLowerCase().includes("total") || erpVal.toLowerCase().includes("sum")) {
              continue;
            }
            
            let qtyVal = "";
            let qtyNum = null;
            if (qtyColIdx !== -1) {
              const qtyCellRef = XLSX.utils.encode_cell({ r, c: qtyColIdx });
              const qtyCell = sheet[qtyCellRef];
              if (qtyCell && qtyCell.v !== undefined) {
                qtyVal = String(qtyCell.v).trim();
                qtyNum = Number(qtyVal.replace(/[^\d.-]/g, ""));
              }
            }
            
            let unitVal = "";
            if (unitColIdx !== -1) {
              const unitCellRef = XLSX.utils.encode_cell({ r, c: unitColIdx });
              const unitCell = sheet[unitCellRef];
              if (unitCell && unitCell.v !== undefined) {
                unitVal = String(unitCell.v).trim();
              }
            }

            // Convert KM/KMS to meters
            if (qtyNum !== null && !isNaN(qtyNum)) {
              if (unitVal.toUpperCase().includes("KM")) {
                qtyVal = String(Math.round(qtyNum * 1000));
              } else {
                qtyVal = String(Math.round(qtyNum));
              }
            }
            
            // Deduplicate matching items with same name and quantity
            const itemKey = `${erpVal}::${qtyVal}`;
            if (!seenItems.has(itemKey)) {
              seenItems.add(itemKey);
              erpItems.push(erpVal);
              qtyItems.push(qtyVal);
            }
          }
        }
      }

      return {
        priceBasis,
        prices,
        proposedErpItemName: erpItems.join("\n"),
        proposedQty: qtyItems.join("\n")
      };

    } catch (err) {
      console.warn(`[Cache] Error parsing Excel for docket "${docketNo}": ${err.message}`);
      try { fs.unlinkSync(localPath); } catch (_) {}
      return null;
    }
  }

  return null;
}

/**
 * Helper to recursively scan and count files inside a directory.
 */
function getFileCount(dirPath) {
  try {
    if (!dirPath || !fs.existsSync(dirPath)) return 0;
    const countFiles = (dir) => {
      let count = 0;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          count += countFiles(fullPath);
        } else if (entry.isFile()) {
          if (!entry.name.startsWith("~$") && !entry.name.endsWith(".tmp")) {
            count++;
          }
        }
      }
      return count;
    };
    return countFiles(dirPath);
  } catch (e) {
    return 0;
  }
}

/**
 * Helper to find boq file recursively inside a directory.
 */
/**
 * Helper to find boq file recursively inside a directory.
 */
function findBoqFile(dir) {
  try {
    if (!dir || !fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findBoqFile(fullPath);
        if (found) return found;
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (lower.includes("boqcomparativechart") || 
            lower.includes("boq_comparative") || 
            lower.includes("boq comparative")) {
          return fullPath;
        }
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Helper to extract competitor names and Tender ID from a BoQ comparative chart file.
 */
function getBoqFileDetails(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const boqSheetName = workbook.SheetNames.find(s => s.toLowerCase().startsWith("boq") || s.toLowerCase().includes("chart"));
    if (!boqSheetName) return null;
    
    const sheet = workbook.Sheets[boqSheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:ZZ100");

    let boqTenderId = "";
    for (let r = 0; r <= Math.min(range.e.r, 15); r++) {
      for (let c = 0; c <= Math.min(range.e.c, 10); c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v !== undefined) {
          const valStr = String(cell.v);
          if (valStr.toLowerCase().includes("tender id")) {
            const parts = valStr.split(/id\s*:/i);
            if (parts.length > 1 && parts[1].trim()) {
              boqTenderId = parts[1].trim();
            } else {
              const nextCell = sheet[XLSX.utils.encode_cell({ r, c: c + 1 })];
              if (nextCell && nextCell.v !== undefined) {
                boqTenderId = String(nextCell.v).trim();
              }
            }
            if (boqTenderId) break;
          }
        }
      }
      if (boqTenderId) break;
    }

    let headerRowIdx = -1;
    for (let r = 0; r <= Math.min(range.e.r, 20); r++) {
      const cell0 = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
      const cell1 = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
      const val0 = cell0 && cell0.v !== undefined ? String(cell0.v).toLowerCase() : "";
      const val1 = cell1 && cell1.v !== undefined ? String(cell1.v).toLowerCase() : "";
      if (val0.includes("description") || val1.includes("description") || val0.includes("sl.no") || val0.includes("sl no")) {
        headerRowIdx = r;
        break;
      }
    }
    
    if (headerRowIdx === -1) return null;
    
    const competitors = [];
    const ignoreList = ["sl.no", "sl no", "sl. no.", "description of work / item(s)", "description", "no.of qty", "qty", "units", "unit", "item code", "code"];
    
    for (let c = 5; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRowIdx, c })];
      if (cell && cell.v !== undefined) {
        const val = String(cell.v).trim();
        if (val && !ignoreList.includes(val.toLowerCase()) && !competitors.includes(val)) {
          if (!val.toLowerCase().includes("rate ") && !val.toLowerCase().includes("total") && val.length > 3) {
            competitors.push(val);
          }
        }
      }
    }

    return {
      tenderId: boqTenderId,
      competitors: competitors.join("\n")
    };
  } catch (err) {
    return null;
  }
}

/**
 * Loads, verifies, and updates the cache of BoQ parsed details from the file index.
 */
function loadBoqCache(dataDir) {
  const cachePath = path.join(dataDir, "boq_cache.json");
  let cache = {};
  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    } catch (e) {
      console.warn("[BOQCache] Failed to parse existing boq_cache.json", e.message);
    }
  }

  const indexDbPath = path.join(dataDir, "file_index.json");
  if (fs.existsSync(indexDbPath)) {
    try {
      const indexDb = JSON.parse(fs.readFileSync(indexDbPath, "utf-8"));
      let updated = false;

      for (const [absPath, meta] of Object.entries(indexDb)) {
        const filename = meta.filename || "";
        const lower = filename.toLowerCase();
        if (lower.includes("boqcomparativechart") || 
            lower.includes("boq_comparative") || 
            lower.includes("boq comparative")) {
          
          const existing = cache[absPath];
          if (!existing || existing.modifiedDate !== meta.modifiedDate) {
            if (fs.existsSync(absPath)) {
              console.log(`[BOQCache] Parsing updated/new BoQ file: ${absPath}`);
              const details = getBoqFileDetails(absPath);
              if (details) {
                cache[absPath] = {
                  modifiedDate: meta.modifiedDate,
                  tenderId: details.tenderId,
                  cleanTenderId: details.tenderId.toLowerCase().replace(/[^a-z0-9]/g, ""),
                  competitors: details.competitors,
                  parentFolderPath: meta.parentFolderPath || path.dirname(absPath)
                };
                updated = true;
              }
            }
          }
        }
      }

      if (updated) {
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf-8");
        console.log(`[BOQCache] Saved updated boq_cache.json with ${Object.keys(cache).length} entries.`);
      }
    } catch (err) {
      console.warn("[BOQCache] Error updating BoQ cache:", err.message);
    }
  }

  return cache;
}

/**
 * Serverless function route handler to fetch, validate, and parse Google Sheets tender data securely.
 */
export default async function handler(req, res) {
  // Enable CORS headers for safety and external access flexibility
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) {
    console.error("❌ SERVERLESS ERROR: Service Account environment variables are missing.");
    return res.status(500).json({
      error: "Service Account credentials are not configured on Vercel. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY."
    });
  }

  try {
    // 1. Authenticate with Google
    let cleanKey = key.trim().replace(/^["']|["']$/g, "");
    cleanKey = cleanKey.replace(/\\n/g, "\n");
    let cleanEmail = email.trim().replace(/^["']|["']$/g, "");

    const accessToken = await getAccessToken(cleanEmail, cleanKey);
    
    // 2. Fetch data from Google Sheets API
    const range = `${WORKSHEET_NAME}!A1:ZZ`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Sheets API returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const rows = data.values || [];

    if (rows.length === 0) {
      return res.status(200).json([]);
    }

    // --- Fetch Costing Sheet Data ---
    let costingRows = [];
    try {
      const COSTING_SPREADSHEET_ID = "1m1ECaxiGYmQrvSPYOBov5YYFq8G-mVNMdPWvGcSfoHs";
      const COSTING_WORKSHEET_NAME = "TENDER COSTING ATTACHMENT";
      const costingRange = `${COSTING_WORKSHEET_NAME}!A1:ZZ`;
      const costingUrl = `https://sheets.googleapis.com/v4/spreadsheets/${COSTING_SPREADSHEET_ID}/values/${encodeURIComponent(costingRange)}`;

      const costingResponse = await fetch(costingUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });

      if (costingResponse.ok) {
        const costingData = await costingResponse.json();
        costingRows = costingData.values || [];
      } else {
        const costingErrorText = await costingResponse.text();
        console.warn(`[WARNING] Failed to fetch costing sheet (status ${costingResponse.status}): ${costingErrorText}`);
      }
    } catch (costingErr) {
      console.warn(`[WARNING] Error fetching costing sheet: ${costingErr.message}`);
    }

    // --- NEW: Fetch Status Category Sheet Data ---
    let statusCategoryRows = [];
    try {
      const STATUS_SPREADSHEET_ID = "1PVujEFMUdA4hqvm357oseASTajgEdIYDZFANm9WF3iE";
      const statusUrl = `https://sheets.googleapis.com/v4/spreadsheets/${STATUS_SPREADSHEET_ID}/values/Sheet1!A1:ZZ`;

      console.log(`[${new Date().toLocaleTimeString()}] Fetching status category sheet data...`);
      const statusResponse = await fetch(statusUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        statusCategoryRows = statusData.values || [];
        console.log(`✓ Fetched ${statusCategoryRows.length} rows from status category sheet.`);
      } else {
        const statusErrorText = await statusResponse.text();
        console.warn(`[WARNING] Failed to fetch status category sheet (status ${statusResponse.status}): ${statusErrorText}`);
      }
    } catch (statusErr) {
      console.warn(`[WARNING] Error fetching status category sheet: ${statusErr.message}`);
    }

    let folderMatches = {};
    try {
      const matchesDbPath = path.resolve(process.cwd(), "data", "tender_folder_matches.json");
      if (fs.existsSync(matchesDbPath)) {
        folderMatches = JSON.parse(fs.readFileSync(matchesDbPath, "utf-8"));
      }
    } catch (err) {
      console.warn("[WARNING] Failed to load tender folder matches:", err.message);
    }

    let boqCache = {};
    try {
      const dataDir = path.resolve(process.cwd(), "data");
      boqCache = loadBoqCache(dataDir);
    } catch (err) {
      console.warn("[WARNING] Failed to load BoQ cache:", err.message);
    }

    // Fetch EMD DETAILS-BG sheet data
    let bgRows = [];
    try {
      const bgRange = `'EMD DETAILS-BG'!A1:ZZ`;
      const bgUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(bgRange)}`;
      console.log(`[${new Date().toLocaleTimeString()}] Fetching EMD DETAILS-BG sheet data...`);
      const bgResponse = await fetch(bgUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });
      if (bgResponse.ok) {
        const bgData = await bgResponse.json();
        bgRows = bgData.values || [];
        console.log(`✓ Fetched ${bgRows.length} rows from EMD DETAILS-BG sheet.`);
      } else {
        const bgErrorText = await bgResponse.text();
        console.warn(`[WARNING] Failed to fetch EMD DETAILS-BG sheet: ${bgErrorText}`);
      }
    } catch (bgErr) {
      console.warn(`[WARNING] Error fetching EMD DETAILS-BG sheet: ${bgErr.message}`);
    }

    const statusCategoryMap = new Map();
    if (statusCategoryRows.length > 1) {
      const cHeaders = statusCategoryRows[0].map(h => h.trim().toLowerCase());
      const tenderIdIdx = cHeaders.indexOf("tenderid");
      const statusCategoryIdx = cHeaders.indexOf("statuscategory");
      if (tenderIdIdx !== -1 && statusCategoryIdx !== -1) {
        for (let i = 1; i < statusCategoryRows.length; i++) {
          const sRow = statusCategoryRows[i];
          if (sRow && sRow[tenderIdIdx] && sRow[statusCategoryIdx]) {
            const rawId = String(sRow[tenderIdIdx]).trim();
            const cleanId = rawId.toLowerCase().replace(/[^a-z0-9]/g, "");
            statusCategoryMap.set(cleanId, String(sRow[statusCategoryIdx]).trim());
          }
        }
      }
    }

    // 3. Validate Header Schema with Robust Normalization
    const normalizeHeader = (h) => {
      if (!h) return "";
      return h.toLowerCase()
        .trim()
        .replace(/\?/g, "")
        .replace(/\s+/g, " ")
        .replace(/decission/g, "decision")
        .replace(/submited/g, "submitted");
    };

    const headers = rows[0].map(h => h.trim());
    const normalizedActualMap = new Map();
    headers.forEach((header, idx) => {
      normalizedActualMap.set(normalizeHeader(header), idx);
    });

    const headerIndexMap = new Map();
    const requiredHeaders = [
      "SL No.", "Docket No", "Tender For", "Type of Tender", "Tender No / NIT No with Date",
      "Name of Work / Item Description", "Total Quantity in Meter", "Name of the Client",
      "Last Date of Submission", "Tender Opening Date", "Cost of Tender / Tender Fee (In Rs)",
      "EMD Amount (In Rs)", "Estimated Cost (In Rs)", "Bid Validity (in Days)",
      "Contract Period in Days", "Management Decision", "Participated", "Tender Prepare By",
      "Current Status", "Tender Submitted Date", "Reverse Auction Applicable", "Reverse Auction Date",
      "EMD Payment Through BG / NEFT", "BG No / UTR No", "EMD Validity", "LOI / PO No & Date",
      "Remarks", "Bid Validity Expired", "Diff % from L1", "Diff % from L2", "Reason", "Final Remarks"
    ];

    // Optional Sheet 1 column: "Docket No-enq" is the enquiry-side docket fallback.
    // We read it if present but do NOT require it (so missing columns won't throw).
    const optionalHeaders = ["Docket No-enq"];
    optionalHeaders.forEach(reqH => {
      const normalizedReq = normalizeHeader(reqH);
      if (normalizedActualMap.has(normalizedReq)) {
        headerIndexMap.set(reqH, normalizedActualMap.get(normalizedReq));
      }
    });

    const missingHeaders = [];
    requiredHeaders.forEach(reqH => {
      const normalizedReq = normalizeHeader(reqH);
      if (normalizedActualMap.has(normalizedReq)) {
        headerIndexMap.set(reqH, normalizedActualMap.get(normalizedReq));
      } else {
        missingHeaders.push(reqH);
      }
    });

    if (missingHeaders.length > 0) {
      throw new Error(`Google Sheet schema mismatch. Missing columns: ${missingHeaders.join(", ")}`);
    }

    const docketIndex = headerIndexMap.get("Docket No");
    const records = [];

    // 4. Process and parse data rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      // Ignore completely empty rows
      if (row.length === 0 || row.every(cell => cell === "")) {
        continue;
      }

      const parsedRecord = parseRow(row, headerIndexMap, i + 1);
      records.push(parsedRecord);
    }

    // --- Perform Left Join in Memory ---
    const cleanStr = (str) => {
      if (!str) return "";
      return str.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    };

      // extractNumericDocket is now a global helper function at the top of the file

    const joinCostingData = (tenders, costing) => {
      if (!tenders || tenders.length === 0) return [];
      if (!costing || costing.length === 0) {
        return tenders.map(t => ({ ...t, attachmentUrl: null }));
      }

      const cHeaders = costing[0].map(h => h.trim());
      const cNormalizeHeader = (h) => h.trim().toLowerCase().replace(/\s+/g, "");

      const refNoIdx = cHeaders.findIndex(h => cNormalizeHeader(h) === "tenderrefno");
      const attachmentUrlIdx = cHeaders.findIndex(h => cNormalizeHeader(h) === "attachmenturl");
      const docketNoIdx = cHeaders.findIndex(h => cNormalizeHeader(h) === "docketno");
      const tenderTypeNameIdx = cHeaders.findIndex(h => cNormalizeHeader(h) === "tendertypename");

      if (refNoIdx === -1 || attachmentUrlIdx === -1) {
        console.warn(`[AttachmentJoin] Warning: Costing Sheet headers mismatch.`);
        return tenders.map(t => ({ ...t, attachmentUrl: null, itemCategory: null }));
      }

      // Reuse the shared extractNumericDocket helper (defined above joinCostingData)

      // Build active list of costing records with cleaned references and extracted dockets
      const costingList = [];
      for (let i = 1; i < costing.length; i++) {
        const cRow = costing[i];
        if (!cRow || cRow.length === 0) continue;

        const rawRefNo = refNoIdx < cRow.length ? cRow[refNoIdx] : "";
        const rawUrl = attachmentUrlIdx < cRow.length ? cRow[attachmentUrlIdx] : "";
        const rawCostingDocket = (docketNoIdx !== -1 && docketNoIdx < cRow.length) ? cRow[docketNoIdx] : "";
        const rawItemCategory = (tenderTypeNameIdx !== -1 && tenderTypeNameIdx < cRow.length) ? cRow[tenderTypeNameIdx] : "";

        if (!rawRefNo || !rawUrl || rawUrl.trim() === "-" || rawUrl.trim() === "") continue;

        let extractedDocket = null;
        if (rawCostingDocket && rawCostingDocket.trim() !== "" && rawCostingDocket.trim() !== "-") {
          extractedDocket = extractNumericDocket(rawCostingDocket);
          if (!extractedDocket) {
            console.warn(`[DocketExtraction] Failed to extract numeric docket number from raw costing value: "${rawCostingDocket}" at row ${i + 1}`);
          }
        }

        const url = rawUrl.trim();
        costingList.push({
          rawRefNo,
          cleanRef: cleanStr(rawRefNo),
          url,
          extractedDocket,
          itemCategory: rawItemCategory ? rawItemCategory.trim() : null
        });
      }

      let matchCount = 0;
      return tenders.map(tender => {
        const tenderNo = tender.tenderNoNitNo || "";
        const cleanTenderNo = cleanStr(tenderNo);
        let attachmentUrl = null;
        let itemCategory = null;

        if (cleanTenderNo !== "") {
          // 1. Try exact match on clean alphanumeric strings
          let match = costingList.find(c => c.cleanRef === cleanTenderNo);
          
          // 2. If no exact match, try substring match (only if cleanTenderNo is at least 6 chars to prevent false positives)
          if (!match && cleanTenderNo.length >= 6) {
            match = costingList.find(c => c.cleanRef.includes(cleanTenderNo) || cleanTenderNo.includes(c.cleanRef));
          }

          let docketNo;
          if (match) {
            // ── Priority 1: Sheet 2 (Costing Attachment sheet) docket ──
            // extractedDocket is already numeric (e.g. "20277") from Sheet 2's Docket No column.
            // If Sheet 2 docket is missing, fall back to extracting numeric part from Sheet 1's docketNoEnq.
            attachmentUrl = match.url;
            docketNo = match.extractedDocket
              || extractNumericDocket(tender.docketNoEnq)
              || "-";
            itemCategory = match.itemCategory;
            matchCount++;
          } else {
            // ── Priority 2: Sheet 1 "Docket No-enq" column fallback ──
            // Extract the numeric portion (e.g. "20277" from "ENQ-20277-25-26")
            // so it matches the local server folder naming convention.
            docketNo = extractNumericDocket(tender.docketNoEnq) || "-";
          }

          return {
            ...tender,
            attachmentUrl,
            docketNo,
            itemCategory
          };
        } else {
          // No tender ref at all — still try extracting numeric part from Sheet 1 enquiry docket
          return {
            ...tender,
            attachmentUrl: null,
            docketNo: extractNumericDocket(tender.docketNoEnq) || "-",
            itemCategory: null
          };
        }
      });
    };

    const rawEnrichedRecords = joinCostingData(records, costingRows);

    // Parse BG Rows
    const bgMap = [];
    if (bgRows.length > 0) {
      // Dynamically find the header row by searching for a row containing "bg no" and "status" (case-insensitive)
      let headerRowIdx = -1;
      let bgNoIdx = -1;
      let remarkIdx = -1;
      let statusIdx = -1;

      for (let i = 0; i < Math.min(bgRows.length, 5); i++) {
        const row = bgRows[i];
        if (row) {
          const normalized = row.map(h => String(h || "").trim().toLowerCase());
          const bgNo = normalized.indexOf("bg no");
          const status = normalized.indexOf("status");
          if (bgNo !== -1 && status !== -1) {
            headerRowIdx = i;
            bgNoIdx = bgNo;
            remarkIdx = normalized.indexOf("remark");
            statusIdx = status;
            break;
          }
        }
      }

      if (headerRowIdx !== -1) {
        for (let i = headerRowIdx + 1; i < bgRows.length; i++) {
          const row = bgRows[i];
          if (row && row.length > Math.max(bgNoIdx, statusIdx)) {
            const bgNo = String(row[bgNoIdx] || "").trim();
            const remark = remarkIdx !== -1 ? String(row[remarkIdx] || "").trim() : "";
            const status = String(row[statusIdx] || "").trim();
            
            bgMap.push({
              bgNo,
              cleanBgNo: bgNo.toLowerCase().replace(/[^a-z0-9]/g, ""),
              remark,
              cleanRemark: remark.toLowerCase().replace(/[^a-z0-9]/g, ""),
              status
            });
          }
        }
      } else {
        console.warn("[WARNING] Could not find header row containing 'bg no' and 'status' in EMD DETAILS-BG sheet.");
      }
    }

    // Fetch Drive access token once for all costing Excel downloads
    let driveAccessToken = null;
    try {
      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
      const key = process.env.GOOGLE_PRIVATE_KEY;
      if (email && key) {
        let cleanKey = key.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
        let cleanEmail = email.trim().replace(/^["']|["']$/g, "");
        driveAccessToken = await getAccessToken(cleanEmail, cleanKey);
      }
    } catch (tokErr) {
      console.warn(`[Handler] Failed to get Drive access token, skipping all Drive costing downloads: ${tokErr.message}`);
    }

    // Probe Drive access with the first available attachment URL
    if (driveAccessToken) {
      const firstDriveTender = rawEnrichedRecords.find(t => t.attachmentUrl && getGoogleDriveFileId(t.attachmentUrl));
      if (firstDriveTender) {
        const fileId = getGoogleDriveFileId(firstDriveTender.attachmentUrl);
        try {
          const probeResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { "Authorization": `Bearer ${driveAccessToken}` }
          });
          if (!probeResponse.ok) {
            console.warn(`[Handler] Drive access probe returned ${probeResponse.status}, skipping all Drive costing downloads`);
            driveAccessToken = null;
          }
        } catch (probeErr) {
          console.warn(`[Handler] Drive access probe failed, skipping all Drive costing downloads: ${probeErr.message}`);
          driveAccessToken = null;
        }
      }
    }

    // 5. Fetch and parse costing Excel details for matched records
    const enrichedRecords = await Promise.all(rawEnrichedRecords.map(async (tender) => {
      const cleanTenderNo = (tender.tenderNoNitNo || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const statusCategory = statusCategoryMap.get(cleanTenderNo) || "";

      // Find match in BoQ cache by Tender ID matching
      let matchedBoq = null;
      if (cleanTenderNo) {
        matchedBoq = Object.values(boqCache).find(b => {
          if (!b.cleanTenderId) return false;
          return cleanTenderNo.includes(b.cleanTenderId) || b.cleanTenderId.includes(cleanTenderNo);
        });
      }

      const match = folderMatches[tender.docketNo];
      const folderPath = (match && match.folderFound) ? match.folderPath : null;

      const competitors = matchedBoq ? matchedBoq.competitors : "";
      const hasBoqChart = !!matchedBoq;
      const fileCount = matchedBoq ? getFileCount(matchedBoq.parentFolderPath) : getFileCount(folderPath);

      // EMD Details BG Match
      let bgStatus = "";
      const rawBgNo = tender.bgNoUtrNo || "";
      const cleanDashBg = rawBgNo.toLowerCase().replace(/[^a-z0-9]/g, "");

      // Extract and match bank guarantee (BG) number cleanly
      const extractedBg = extractBgNumber(rawBgNo);
      const cleanExtractedBg = extractedBg.toLowerCase().replace(/[^a-z0-9]/g, "");

      let bgMatch = null;
      if (cleanExtractedBg) {
        bgMatch = bgMap.find(b => b.cleanBgNo && b.cleanBgNo === cleanExtractedBg);
      }

      // Fallback 1: Substring match on extracted BG
      if (!bgMatch && cleanExtractedBg) {
        bgMatch = bgMap.find(b => b.cleanBgNo && (cleanExtractedBg.includes(b.cleanBgNo) || b.cleanBgNo.includes(cleanExtractedBg)));
      }

      // Fallback 2: Substring match on the entire raw field
      if (!bgMatch && cleanDashBg) {
        bgMatch = bgMap.find(b => b.cleanBgNo && (cleanDashBg.includes(b.cleanBgNo) || b.cleanBgNo.includes(cleanDashBg)));
      }

      // Fallback 3: Search by tender number in BG remarks
      if (!bgMatch && cleanTenderNo) {
        bgMatch = bgMap.find(b => {
          if (!b.cleanRemark) return false;
          return cleanTenderNo.includes(b.cleanRemark) || b.cleanRemark.includes(cleanTenderNo);
        });
      }

      if (bgMatch) {
        bgStatus = bgMatch.status;
      }

      // Fallback Tender Number Remark Lookup (Executed only if primary BG Number lookup fails)
      if (!bgStatus) {
        if (tender.tenderNoNitNo) {
          const rawTenderNo = String(tender.tenderNoNitNo).trim();
          const coreTenderNo = rawTenderNo
            .replace(/^(?:Tender Enquiry No\.|Tender Enquiry No|Tender No|NIT No)\s*[:.-]?\s*/i, "")
            .replace(/[,.]\s*$/, "")
            .trim();

          if (coreTenderNo) {
            const matchedBg = bgMap.find(b => {
              const remark = String(b.remark || "").trim();
              return remark.toLowerCase().includes(coreTenderNo.toLowerCase());
            });
            bgStatus = matchedBg ? (matchedBg.status || null) : null;
          } else {
            bgStatus = null;
          }
        } else {
          bgStatus = null;
        }
      }

      if (tender.attachmentUrl) {
        const details = await getCostingDetails(tender.attachmentUrl, tender.docketNo, driveAccessToken);
        if (details) {
          return {
            ...tender,
            priceBasis: details.priceBasis,
            aluminiumPrice: details.prices.aluminium,
            aluminiumAlloyPrice: details.prices.aluminiumAlloy,
            copperTapePrice: details.prices.copperTape,
            extrudedSemiconductivePrice: details.prices.extrudedSemiconductive,
            htXlpePrice: details.prices.htXlpe,
            pvcTypeSt2Price: details.prices.pvcTypeSt2,
            galvanisedSteelFlatStripPrice: details.prices.galvanisedSteelFlatStrip,
            fillerPrice: details.prices.filler,
            proposedErpItemName: details.proposedErpItemName || "",
            proposedQty: details.proposedQty || "",
            statusCategory,
            itemCategory: tender.itemCategory || null,
            competitors: competitors || "",
            fileCount,
            hasBoqChart,
            bgStatus
          };
        }
      }
      
      // Default / Fallback fields for skipped or missing costings (link is still provided if matched, but rates are null)
      return {
        ...tender,
        priceBasis: "Firm",
        aluminiumPrice: null,
        aluminiumAlloyPrice: null,
        copperTapePrice: null,
        extrudedSemiconductivePrice: null,
        htXlpePrice: null,
        pvcTypeSt2Price: null,
        galvanisedSteelFlatStripPrice: null,
        fillerPrice: null,
        proposedErpItemName: "",
        proposedQty: "",
        statusCategory,
        itemCategory: tender.itemCategory || null,
        competitors: competitors || "",
        fileCount,
        hasBoqChart,
        bgStatus
      };
    }));

    // 1. Fetch current database records to merge enums and get database IDs (takes < 20ms)
    const dbTenders = await DatabaseTenderService.getAllTenders();
    const dbMap = new Map(dbTenders.map(t => [t.tenderNoNitNo, t]));

    // 2. Build the merged dataset prioritizing live Google Sheet rows
    const mergedRecords = enrichedRecords.map(enriched => {
      const dbTender = dbMap.get(enriched.tenderNoNitNo);
      if (dbTender) {
        return {
          ...enriched,
          id: dbTender.id,
          tenderUpdateStatus: dbTender.tenderUpdateStatus || "OPEN",
          nextAction: dbTender.nextAction || null,
          // When the user has manually edited a diff value, serve the DB value
          // so it persists across import refreshes until the user clears it.
          diffPercentFromL1: dbTender.diffL1ManuallyEdited ? dbTender.diffPercentFromL1 : enriched.diffPercentFromL1,
          diffPercentFromL2: dbTender.diffL2ManuallyEdited ? dbTender.diffPercentFromL2 : enriched.diffPercentFromL2,
        };
      }
      return enriched;
    });


    // 3. Append any database-only records (created in the database, not in Google Sheets)
    const sheetTenderNos = new Set(enrichedRecords.map(r => r.tenderNoNitNo));
    dbTenders.forEach(dbTender => {
      if (!sheetTenderNos.has(dbTender.tenderNoNitNo)) {
        mergedRecords.push({
          ...dbTender,
          priceBasis: "Firm",
          aluminiumPrice: null,
          aluminiumAlloyPrice: null,
          copperTapePrice: null,
          extrudedSemiconductivePrice: null,
          htXlpePrice: null,
          pvcTypeSt2Price: null,
          galvanisedSteelFlatStripPrice: null,
          fillerPrice: null,
          proposedErpItemName: "",
          proposedQty: "",
          competitors: "",
          fileCount: 0,
          hasBoqChart: false,
          bgStatus: null
        });
      }
    });

    // 4. Trigger database upsert/comparison in the background concurrently
    DatabaseTenderService.upsertTenders(enrichedRecords).catch(err => {
      console.error("❌ Background database sync failure:", err);
    });

    return res.status(200).json(mergedRecords);

  } catch (err) {
    console.error("❌ ERROR in serverless handler:", err);
    return res.status(500).json({ error: err.stack || err.message });
  }
}

/**
 * Signs a JWT and exchanges it for a Google OAuth2 Access Token.
 */
async function getAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const base64UrlEncode = (obj) => {
    return Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedClaimSet = base64UrlEncode(claimSet);
  const stringToSign = `${encodedHeader}.${encodedClaimSet}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(stringToSign);
  const signature = sign.sign(privateKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const assertion = `${stringToSign}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Parses a single raw row array into a structured JSON record.
 */
function parseRow(row, headerMap, rowNum) {
  const getValue = (columnName) => {
    const index = headerMap.get(columnName);
    if (index === undefined || index >= row.length) {
      return "";
    }
    return row[index].trim();
  };

  const parseNumber = (val) => {
    if (!val || val === "-") return null;
    const num = Number(val.replace(/[^\d.-]/g, ""));
    return isNaN(num) ? null : num;
  };

  const parsePercent = (val) => {
    if (!val || val === "-") return null;
    const hasPercent = val.includes("%");
    const num = Number(val.replace(/[^\d.-]/g, ""));
    if (isNaN(num)) return null;
    return hasPercent ? num / 100 : num;
  };

  const parseBool = (val) => {
    const lower = val.toLowerCase();
    return ["yes", "y", "true", "1", "applicable"].includes(lower);
  };

  const mapStatus = (status) => {
    if (!status || status.trim() === "" || status.trim() === "-") return "";
    return status.trim();
  };

  const parseDate = (val) => {
    if (!val || val === "-") return null;

    const standardDate = new Date(val);
    if (!isNaN(standardDate.getTime())) {
      return standardDate;
    }

    const regex = /^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})$/;
    const match = val.match(regex);
    if (match) {
      const day = parseInt(match[1], 10);
      const monthStr = match[2].toLowerCase();
      const yearStr = match[3];

      const months = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      };

      const month = months[monthStr];
      if (month !== undefined) {
        let year = parseInt(yearStr, 10);
        if (yearStr.length === 2) {
          year = year >= 70 ? 1900 + year : 2000 + year;
        }
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return null;
  };

  const slNoVal = parseNumber(getValue("SL No."));
  const slNo = slNoVal !== null ? slNoVal : rowNum;

  return {
    slNo,
    docketNo: getValue("Docket No"),
    // Fallback docket from Sheet 1 "Docket No-enq" column (enquiry-side docket number).
    // Used when Sheet 2 costing join finds no match for this tender.
    docketNoEnq: getValue("Docket No-enq") || null,
    tenderFor: getValue("Tender For"),
    typeOfTender: getValue("Type of Tender"),
    tenderNoNitNo: getValue("Tender No / NIT No with Date"),
    nameOfWorkDescription: getValue("Name of Work / Item Description"),
    totalQuantityMeter: parseNumber(getValue("Total Quantity in Meter")),
    nameOfTheClient: getValue("Name of the Client"),
    lastDateOfSubmission: parseDate(getValue("Last Date of Submission")),
    tenderOpeningDate: parseDate(getValue("Tender Opening Date")),
    costOfTenderFeeRs: parseNumber(getValue("Cost of Tender / Tender Fee (In Rs)")),
    emdAmountRs: parseNumber(getValue("EMD Amount (In Rs)")),
    estimatedCostRs: parseNumber(getValue("Estimated Cost (In Rs)")),
    bidValidityDays: parseNumber(getValue("Bid Validity (in Days)")),
    contractPeriodDays: parseNumber(getValue("Contract Period in Days")),
    managementDecision: getValue("Management Decision") || "Pending",
    participated: (() => {
      const val = getValue("Participated");
      if (!val || val.trim() === "" || val === "-") return null;
      return parseBool(val);
    })(),
    tenderPrepareBy: getValue("Tender Prepare By"),
    currentStatus: mapStatus(getValue("Current Status")),
    tenderSubmittedDate: parseDate(getValue("Tender Submitted Date")),
    reverseAuctionApplicable: (() => {
      const val = getValue("Reverse Auction Applicable");
      if (!val || val.trim() === "" || val === "-") return null;
      return parseBool(val);
    })(),
    reverseAuctionDate: parseDate(getValue("Reverse Auction Date")),
    emdPaymentMode: getValue("EMD Payment Through BG / NEFT") || "",
    bgNoUtrNo: getValue("BG No / UTR No") || null,
    emdValidity: parseDate(getValue("EMD Validity")),
    loiPoNoAndDate: getValue("LOI / PO No & Date") || null,
    remarks: getValue("Remarks") || null,
    bidValidityExpired: parseBool(getValue("Bid Validity Expired")),
    diffPercentFromL1: parsePercent(getValue("Diff % from L1")),
    diffPercentFromL2: parsePercent(getValue("Diff % from L2")),
    reason: getValue("Reason") || null,
    finalRemarks: getValue("Final Remarks") || null
  };
}

app.listen(PORT, () => {
  console.log("=================================================");
  console.log(`🚀 SECURE BACKEND PROXY SERVER RUNNING ON PORT ${PORT}`);
  console.log(`   Endpoint: http://localhost:${PORT}/api/tenders`);
  console.log("=================================================");
  
  // Start Supply Document Indexer
  startSupplyIndexer();
  
  // Pre-warm Smartsheet cache so the first user request is instant
  setTimeout(() => {
    if (smartsheetCache.data) {
      console.log("[SmartsheetCache] Skipping pre-warm (loaded from disk)");
      return;
    }
    const token = process.env.SMARTSHEET_API_TOKEN;
    const sheetId = process.env.SMARTSHEET_SHEET_ID;
    if (token && token.trim() && sheetId && sheetId.trim()) {
      refreshSmartsheetCache(token.trim(), sheetId.trim()).then(() => {
        console.log("[SmartsheetCache] Pre-warmed at startup ✓");
      }).catch(err => {
        console.warn("[SmartsheetCache] Pre-warm failed:", err.message);
      });
    }
  }, 1000);
});
