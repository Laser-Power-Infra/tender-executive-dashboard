import fs from "fs";
import path from "path";

interface UniqueFileEntry {
  filePath: string;
  filename: string;
}

interface SupplyDocumentIndex {
  [billNo: string]: {
    billNo: string;
    folderName: string;
    folderPath: string;
    lastModified: number;
    indexedAt: number;
  };
}

export async function getUniqueSupplyDocuments(
  saleBillNumbers: string[]
): Promise<UniqueFileEntry[]> {
  const dbPath = path.resolve(process.cwd(), "data", "supply_document_index.json");
  if (!fs.existsSync(dbPath)) {
    return [];
  }

  const index: SupplyDocumentIndex = JSON.parse(
    await fs.promises.readFile(dbPath, "utf-8")
  );

  const seenFilenames = new Set<string>();
  const results: UniqueFileEntry[] = [];

  for (const billNo of saleBillNumbers) {
    const entry = index[billNo.trim().toUpperCase()];
    if (!entry?.folderPath) continue;
    if (!fs.existsSync(entry.folderPath)) continue;

    let filenames: string[];
    try {
      filenames = await fs.promises.readdir(entry.folderPath);
    } catch {
      continue;
    }

    for (const filename of filenames) {
      if (filename.startsWith("~$")) continue;
      if (path.extname(filename).toLowerCase() === ".tmp") continue;
      if (seenFilenames.has(filename)) continue;

      const absolutePath = path.join(entry.folderPath, filename);
      try {
        const stat = await fs.promises.stat(absolutePath);
        if (!stat.isFile()) continue;
      } catch {
        continue;
      }

      seenFilenames.add(filename);
      results.push({ filePath: absolutePath, filename });
    }
  }

  return results;
}
