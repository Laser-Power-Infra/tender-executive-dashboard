import fs from "fs";
import path from "path";
import crypto from "crypto";
import { indexFolderFiles } from "../services/fileIndexer.js";
import { matchTendersWithFolders } from "../services/tenderFolderMatcher.js";

// Configuration
const CONFIG = {
  encryptionKey: process.env.FILE_CRYPTO_KEY || "8f7c9e1b2a3d4f5e6a7b8c9d0e1f2a3b", // 32-byte key for AES-256
  encryptionIv: process.env.FILE_CRYPTO_IV || "1a2b3c4d5e6f7a8b" // 16-byte IV
};

const ALLOWED_ROOTS = [
  path.resolve("Z:\\COSTING & INVOLVEMENT\\2026-27"),
  path.resolve("\\\\192.168.1.242\\dipankar roy\\COSTING & INVOLVEMENT\\2026-27"),
  path.resolve("\\\\192.168.1.242\\COSTING & INVOLVEMENT\\2026-27"),
  path.resolve("W:\\")
];

if (process.env.INDEXER_NETWORK_PATH) {
  ALLOWED_ROOTS.unshift(path.resolve(process.env.INDEXER_NETWORK_PATH));
}

/**
 * Utility: Encrypts absolute path to generate a secure stateless fileId.
 */
function encryptPath(absolutePath) {
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(CONFIG.encryptionKey), Buffer.from(CONFIG.encryptionIv));
  let encrypted = cipher.update(absolutePath, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

/**
 * Utility: Decrypts fileId back to absolute path. Prevents manipulation or path traversal.
 */
function decryptPath(fileId) {
  try {
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(CONFIG.encryptionKey), Buffer.from(CONFIG.encryptionIv));
    let decrypted = decipher.update(fileId, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return path.resolve(decrypted);
  } catch (err) {
    throw new Error("Invalid or tampered fileId token.");
  }
}

/**
 * Security: Verifies that the decrypted path lies inside the allowed root directory.
 */
function verifyPathSafety(absolutePath) {
  const resolvedPath = path.resolve(absolutePath);
  const isSafe = ALLOWED_ROOTS.some(root => resolvedPath.startsWith(root));
  if (!isSafe) {
    throw new Error("Path traversal violation: Access denied.");
  }
}

/**
 * Controller class managing tender folder and attachment files API routes.
 */
export class TenderAttachmentController {
  
  /**
   * Middleware: Simple role-based access control (mock/extendable)
   */
  static authenticateAccess(req, res, next) {
    let authHeader = req.headers.authorization;
    if (!authHeader && req.query.auth) {
      authHeader = decodeURIComponent(req.query.auth);
    }

    if (!authHeader) {
      return res.status(401).json({ error: "Access denied: Missing authentication token." });
    }
    // Simulate token verification (e.g., Bearer token checks)
    if (authHeader.startsWith("Bearer ") && authHeader.length > 15) {
      next();
    } else {
      return res.status(403).json({ error: "Forbidden: Invalid authorization scope." });
    }
  }

  /**
   * Endpoint: GET /api/tenders/:docketNo/files
   * Retrieves files located in the folder associated with the given docket.
   */
  static async getTenderFiles(req, res) {
    const { docketNo } = req.params;
    
    try {
      // 1. Resolve the docket folder path (fetched from the tender matcher or direct DB lookup)
      // For demonstration, we assume matching database or look up from directory scanner results
      const matchesDbPath = path.resolve(process.cwd(), "data", "tender_folder_matches.json");
      if (!fs.existsSync(matchesDbPath)) {
        return res.status(404).json({ error: "Tender matching indexes not compiled." });
      }

      const matches = JSON.parse(await fs.promises.readFile(matchesDbPath, "utf-8"));
      const match = matches[docketNo];

      if (!match || !match.folderFound || !match.folderPath) {
        return res.status(404).json({ error: `No active directory mapped to docket "${docketNo}".` });
      }

      verifyPathSafety(match.folderPath);

      // 2. Perform index file scan on the resolved folder path
      const scanResults = await indexFolderFiles(match.folderPath);
      
      // 3. Format the response, encrypting the paths to form secure fileIds
      const filesWithSecureIds = scanResults.files.map(f => ({
        fileId: encryptPath(f.absolutePath),
        filename: f.filename,
        extension: f.extension,
        size: f.size,
        lastModified: f.modifiedDate,
        relativePath: f.relativePath
      }));

      res.setHeader("Cache-Control", "private, max-age=60"); // Cache for 60 seconds
      return res.status(200).json({
        docketNo,
        folderPath: match.folderPath,
        files: filesWithSecureIds
      });
    } catch (err) {
      console.error(`[API_ERROR] Failed to retrieve tender files: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Endpoint: GET /api/tenders/:docketNo/folder
   * Retrieves folder details and mapping status for a docket.
   */
  static async getTenderFolderDetails(req, res) {
    const { docketNo } = req.params;

    try {
      const matchesDbPath = path.resolve(process.cwd(), "data", "tender_folder_matches.json");
      if (!fs.existsSync(matchesDbPath)) {
        return res.status(404).json({ error: "Matching index database not found." });
      }

      const matches = JSON.parse(await fs.promises.readFile(matchesDbPath, "utf-8"));
      const match = matches[docketNo];

      if (!match) {
        return res.status(404).json({ error: `Docket "${docketNo}" not found in database.` });
      }

      res.setHeader("Cache-Control", "private, max-age=120"); // Cache for 2 minutes
      return res.status(200).json({
        docketNo,
        folderFound: match.folderFound,
        folderPath: match.folderPath || null,
        folderName: match.folderName || null,
        matchedAt: match.matchedAt ? new Date(match.matchedAt) : null
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Endpoint: GET /api/files/download/:fileId
   * Downloads Office files or other assets.
   */
  static async downloadFile(req, res) {
    const { fileId } = req.params;

    try {
      const absolutePath = decryptPath(fileId);
      verifyPathSafety(absolutePath);

      if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({ error: "Target file does not exist on disk." });
      }

      const stats = await fs.promises.stat(absolutePath);
      const filename = path.basename(absolutePath);

      // Set headers for standard downloads
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", stats.size);
      res.setHeader("Cache-Control", "public, max-age=86400"); // Cache static downloads for 1 day

      // Stream large files
      const stream = fs.createReadStream(absolutePath);
      stream.pipe(res);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  /**
   * Endpoint: GET /api/files/view/:fileId
   * Serves file for preview (e.g. PDF view in-browser) instead of download attachment.
   */
  static async viewFile(req, res) {
    const { fileId } = req.params;

    try {
      const absolutePath = decryptPath(fileId);
      verifyPathSafety(absolutePath);

      if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({ error: "Target file does not exist on disk." });
      }

      const stats = await fs.promises.stat(absolutePath);
      const ext = path.extname(absolutePath).toLowerCase();

      // Resolve content type for previewing
      let contentType = "application/octet-stream";
      if (ext === ".pdf") contentType = "application/pdf";
      else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
      else if (ext === ".png") contentType = "image/png";
      else if (ext === ".txt") contentType = "text/plain";

      // Set headers for inline previewing
      const filename = path.basename(absolutePath);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", stats.size);
      res.setHeader("Cache-Control", "public, max-age=3600"); // Cache previews for 1 hour

      // Stream large files
      const stream = fs.createReadStream(absolutePath);
      stream.pipe(res);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  /**
   * Endpoint: GET /api/supply-history/:saleBillNumber/files
   * Retrieves files located in the folder associated with the given Sale Bill Number.
   */
  static async getSupplyBillFiles(req, res) {
    const { saleBillNumber } = req.params;
    
    try {
      const dbPath = path.resolve(process.cwd(), "data", "supply_document_index.json");
      if (!fs.existsSync(dbPath)) {
        return res.status(200).json({ saleBillNumber, files: [] });
      }

      const index = JSON.parse(await fs.promises.readFile(dbPath, "utf-8"));
      const match = index[saleBillNumber.trim().toUpperCase()];

      if (!match || !match.folderPath) {
        return res.status(200).json({ saleBillNumber, files: [] });
      }

      verifyPathSafety(match.folderPath);

      // Perform file scan on the resolved folder path
      const scanResults = await indexFolderFiles(match.folderPath);
      
      // Format the response, encrypting the paths to form secure fileIds
      const filesWithSecureIds = scanResults.files.map(f => ({
        fileId: encryptPath(f.absolutePath),
        filename: f.filename,
        extension: f.extension,
        size: f.size,
        lastModified: f.modifiedDate,
        relativePath: f.relativePath
      }));

      res.setHeader("Cache-Control", "private, max-age=60"); // Cache for 60 seconds
      return res.status(200).json({
        saleBillNumber,
        folderPath: match.folderPath,
        files: filesWithSecureIds
      });
    } catch (err) {
      console.error(`[API_ERROR] Failed to retrieve supply bill files: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  }
}

/**
 * Express router mapping helper
 */
export function registerAttachmentRoutes(router) {
  router.get("/api/tenders/:docketNo/files", TenderAttachmentController.authenticateAccess, TenderAttachmentController.getTenderFiles);
  router.get("/api/tenders/:docketNo/folder", TenderAttachmentController.authenticateAccess, TenderAttachmentController.getTenderFolderDetails);
  router.get("/api/files/download/:fileId", TenderAttachmentController.authenticateAccess, TenderAttachmentController.downloadFile);
  router.get("/api/files/view/:fileId", TenderAttachmentController.authenticateAccess, TenderAttachmentController.viewFile);
  router.get("/api/supply-history/:saleBillNumber/files", TenderAttachmentController.authenticateAccess, TenderAttachmentController.getSupplyBillFiles);
}
