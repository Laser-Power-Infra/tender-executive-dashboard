import fs from "fs";
import path from "path";
import crypto from "crypto";
import { indexFolderFiles } from "@/services/fileIndexer";
import type { FileResponse, DocketFilesResponse, SupplyBillFilesResponse, FolderDetailsResponse, AuthConfig } from "@/types/controller";

const CONFIG: AuthConfig = {
  encryptionKey: process.env.FILE_CRYPTO_KEY || "8f7c9e1b2a3d4f5e6a7b8c9d0e1f2a3b",
  encryptionIv: process.env.FILE_CRYPTO_IV || "1a2b3c4d5e6f7a8b"
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

function encryptPath(absolutePath: string): string {
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(CONFIG.encryptionKey),
    Buffer.from(CONFIG.encryptionIv)
  );
  let encrypted = cipher.update(absolutePath, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

function decryptPath(fileId: string): string {
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(CONFIG.encryptionKey),
      Buffer.from(CONFIG.encryptionIv)
    );
    let decrypted = decipher.update(fileId, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return path.resolve(decrypted);
  } catch {
    throw new Error("Invalid or tampered fileId token.");
  }
}

function verifyPathSafety(absolutePath: string): void {
  const resolvedPath = path.resolve(absolutePath);
  const isSafe = ALLOWED_ROOTS.some(root => resolvedPath.startsWith(root));
  if (!isSafe) {
    throw new Error("Path traversal violation: Access denied.");
  }
}

export class TenderAttachmentController {
  static authenticateAccess(authHeader: string | null | undefined): void {
    if (!authHeader) {
      throw { status: 401, error: "Access denied: Missing authentication token." };
    }
    if (authHeader.startsWith("Bearer ") && authHeader.length > 15) {
      return;
    }
    throw { status: 403, error: "Forbidden: Invalid authorization scope." };
  }

  static async getTenderFiles(docketNo: string, authHeader?: string | null): Promise<DocketFilesResponse> {
    TenderAttachmentController.authenticateAccess(authHeader);

    try {
      const matchesDbPath = path.resolve(process.cwd(), "data", "tender_folder_matches.json");
      if (!fs.existsSync(matchesDbPath)) {
        return { docketNo, folderPath: "", files: [] };
      }

      const matches = JSON.parse(await fs.promises.readFile(matchesDbPath, "utf-8"));
      const match = matches[docketNo];

      if (!match || !match.folderFound || !match.folderPath) {
        return { docketNo, folderPath: "", files: [] };
      }

      verifyPathSafety(match.folderPath);

      const scanResults = await indexFolderFiles(match.folderPath);

      const filesWithSecureIds: FileResponse[] = scanResults.files.map(f => ({
        fileId: encryptPath(f.absolutePath),
        filename: f.filename,
        extension: f.extension,
        size: f.size,
        lastModified: f.modifiedDate,
        relativePath: f.relativePath
      }));

      return {
        docketNo,
        folderPath: match.folderPath,
        files: filesWithSecureIds
      };
    } catch (err) {
      if ((err as { status?: number }).status) throw err;
      console.error(`[API_ERROR] Failed to retrieve tender files: ${(err as Error).message}`);
      throw { status: 500, error: (err as Error).message };
    }
  }

  static async getTenderFolderDetails(docketNo: string, authHeader?: string | null): Promise<FolderDetailsResponse> {
    TenderAttachmentController.authenticateAccess(authHeader);

    try {
      const matchesDbPath = path.resolve(process.cwd(), "data", "tender_folder_matches.json");
      if (!fs.existsSync(matchesDbPath)) {
        return { docketNo, folderFound: false, folderPath: null, folderName: null, matchedAt: null };
      }

      const matches = JSON.parse(await fs.promises.readFile(matchesDbPath, "utf-8"));
      const match = matches[docketNo];

      if (!match) {
        return { docketNo, folderFound: false, folderPath: null, folderName: null, matchedAt: null };
      }

      return {
        docketNo,
        folderFound: match.folderFound,
        folderPath: match.folderPath || null,
        folderName: match.folderName || null,
        matchedAt: match.matchedAt ? new Date(match.matchedAt).toISOString() : null
      };
    } catch (err) {
      if ((err as { status?: number }).status) throw err;
      throw { status: 500, error: (err as Error).message };
    }
  }

  static async downloadFile(fileId: string, authHeader?: string | null): Promise<{ stream: fs.ReadStream; headers: Record<string, string>; stats: fs.Stats }> {
    TenderAttachmentController.authenticateAccess(authHeader);

    try {
      const absolutePath = decryptPath(fileId);
      verifyPathSafety(absolutePath);

      if (!fs.existsSync(absolutePath)) {
        throw { status: 404, error: "Target file does not exist on disk." };
      }

      const stats = await fs.promises.stat(absolutePath);
      const filename = path.basename(absolutePath);

      const stream = fs.createReadStream(absolutePath);
      return {
        stream,
        headers: {
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
          "Content-Type": "application/octet-stream",
          "Content-Length": String(stats.size),
          "Cache-Control": "public, max-age=86400"
        },
        stats
      };
    } catch (err) {
      if ((err as { status?: number }).status) throw err;
      throw { status: 400, error: (err as Error).message };
    }
  }

  static async viewFile(fileId: string, authHeader?: string | null): Promise<{ stream: fs.ReadStream; headers: Record<string, string>; stats: fs.Stats }> {
    TenderAttachmentController.authenticateAccess(authHeader);

    try {
      const absolutePath = decryptPath(fileId);
      verifyPathSafety(absolutePath);

      if (!fs.existsSync(absolutePath)) {
        throw { status: 404, error: "Target file does not exist on disk." };
      }

      const stats = await fs.promises.stat(absolutePath);
      const ext = path.extname(absolutePath).toLowerCase();

      let contentType = "application/octet-stream";
      if (ext === ".pdf") contentType = "application/pdf";
      else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
      else if (ext === ".png") contentType = "image/png";
      else if (ext === ".txt") contentType = "text/plain";

      const filename = path.basename(absolutePath);
      const stream = fs.createReadStream(absolutePath);

      return {
        stream,
        headers: {
          "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
          "Content-Type": contentType,
          "Content-Length": String(stats.size),
          "Cache-Control": "public, max-age=3600"
        },
        stats
      };
    } catch (err) {
      if ((err as { status?: number }).status) throw err;
      throw { status: 400, error: (err as Error).message };
    }
  }

  static async getSupplyBillFiles(saleBillNumber: string, authHeader?: string | null): Promise<SupplyBillFilesResponse> {
    TenderAttachmentController.authenticateAccess(authHeader);

    try {
      const dbPath = path.resolve(process.cwd(), "data", "supply_document_index.json");
      if (!fs.existsSync(dbPath)) {
        return { saleBillNumber, files: [] };
      }

      const index = JSON.parse(await fs.promises.readFile(dbPath, "utf-8"));
      const match = index[saleBillNumber.trim().toUpperCase()];

      if (!match || !match.folderPath) {
        return { saleBillNumber, files: [] };
      }

      verifyPathSafety(match.folderPath);

      const scanResults = await indexFolderFiles(match.folderPath);

      const filesWithSecureIds: FileResponse[] = scanResults.files.map(f => ({
        fileId: encryptPath(f.absolutePath),
        filename: f.filename,
        extension: f.extension,
        size: f.size,
        lastModified: f.modifiedDate,
        relativePath: f.relativePath
      }));

      return {
        saleBillNumber,
        folderPath: match.folderPath,
        files: filesWithSecureIds
      };
    } catch (err) {
      if ((err as { status?: number }).status) throw err;
      console.error(`[API_ERROR] Failed to retrieve supply bill files: ${(err as Error).message}`);
      throw { status: 500, error: (err as Error).message };
    }
  }
}
