import fs from "fs";
import path from "path";

/**
 * Enterprise File Indexing Service
 * 
 * Recursively scans folders (such as tender/docket folders),
 * extracts file metadata, excludes temporary files, and stores indexes.
 */

const CONFIG = {
  dbFilePath: path.resolve(process.cwd(), "data", "file_index.json")
};

// Ensure data directory exists
const dataDir = path.dirname(CONFIG.dbFilePath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * atomic JSON Database Store for file indexing
 */
class FileDatabase {
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
      console.error(`[DB_ERROR] Failed to load file database: ${err.message}`);
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
      console.error(`[DB_ERROR] Failed to save file database atomically: ${err.message}`);
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (e) {}
      }
      return false;
    }
  }
}

const fileDb = new FileDatabase(CONFIG.dbFilePath);

/**
 * Recursively traverses a folder directory and retrieves metadata for all files.
 * 
 * @param {string} currentDir - Current directory absolute path
 * @param {string} baseDir - Root directory absolute path (for relative path calculations)
 * @param {Array} fileList - Accumulated list of file metadata records
 * @param {Map} filenameMap - Map tracking occurrences of filenames to detect duplicates
 */
async function scanDirectoryRecursive(currentDir, baseDir, fileList = [], filenameMap = new Map()) {
  const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      // Recursively scan subdirectories
      await scanDirectoryRecursive(entryPath, baseDir, fileList, filenameMap);
    } else if (entry.isFile()) {
      const filename = entry.name;
      
      // Exclusion Rule 1: Temporary Microsoft Office lock files starting with ~$
      if (filename.startsWith("~$")) {
        continue;
      }

      // Exclusion Rule 2: Files with .tmp extension
      const extension = path.extname(filename).toLowerCase();
      if (extension === ".tmp") {
        continue;
      }

      // Extract stats
      let size = 0;
      let modifiedDate = Date.now();
      try {
        const stats = await fs.promises.stat(entryPath);
        size = stats.size;
        modifiedDate = stats.mtimeMs;
      } catch (err) {
        console.error(`[Scanner] Failed to read stats for: ${entryPath}`);
      }

      const relativePath = path.relative(baseDir, entryPath);

      const record = {
        filename,
        extension,
        size,
        modifiedDate,
        relativePath,
        absolutePath: entryPath
      };

      // Detect duplicate filenames
      if (filenameMap.has(filename)) {
        const existingPaths = filenameMap.get(filename);
        existingPaths.push(entryPath);
        filenameMap.set(filename, existingPaths);
      } else {
        filenameMap.set(filename, [entryPath]);
      }

      fileList.push(record);
    }
  }

  return { fileList, filenameMap };
}

/**
 * Indexes files in the specified folder directory.
 * 
 * @param {string} rootFolderPath - Path to index
 * @returns {Object} Index execution results
 */
export async function indexFolderFiles(rootFolderPath) {
  if (!rootFolderPath) {
    throw new Error("Root folder path parameter is required.");
  }

  const normalizedRoot = path.resolve(rootFolderPath);
  if (!fs.existsSync(normalizedRoot)) {
    throw new Error(`Directory does not exist: "${normalizedRoot}"`);
  }

  const startTime = Date.now();
  console.log(`[FileIndexer] Scanning directory: ${normalizedRoot}`);

  const { fileList, filenameMap } = await scanDirectoryRecursive(normalizedRoot, normalizedRoot);

  // Log duplicate filenames detected within this scan
  let duplicateCount = 0;
  for (const [filename, paths] of filenameMap.entries()) {
    if (paths.length > 1) {
      duplicateCount++;
      console.warn(
        `[DuplicateFile] Warning: Duplicate file name "${filename}" detected in subfolders:\n` +
        paths.map(p => `  - "${p}"`).join("\n")
      );
    }
  }

  // Store metadata in DB
  const currentDb = await fileDb.load();
  
  for (const file of fileList) {
    // Unique identifier is the absolute path to accommodate duplicate names in nested dirs
    currentDb[file.absolutePath] = {
      filename: file.filename,
      extension: file.extension,
      size: file.size,
      modifiedDate: file.modifiedDate,
      relativePath: file.relativePath,
      parentFolderPath: normalizedRoot,
      indexedAt: Date.now()
    };
  }

  await fileDb.save(currentDb);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `[FileIndexer] Scan complete in ${durationSec}s. ` +
    `Files found: ${fileList.length}, Duplicates detected: ${duplicateCount}`
  );

  return {
    parentFolderPath: normalizedRoot,
    scanDurationSec: durationSec,
    totalFilesIndexed: fileList.length,
    duplicatesDetected: duplicateCount,
    files: fileList
  };
}
