import fs from "fs";
import path from "path";

// Load environment variables from .env file
try {
  let envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    envPath = path.resolve(process.cwd(), "..", ".env");
  }
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
  console.error("Warning: could not load .env file", e);
}

// Import prisma client wrapper
import { prisma } from "../prisma/prismaClient.js";

async function main() {
  console.log("🔍 Fetching all tender records from the Tender table...");
  const allTenders = await prisma.tender.findMany();
  console.log(`📊 Found ${allTenders.length} total records in the database.`);

  // Group by tenderNoNitNo
  const groups = new Map();
  allTenders.forEach(t => {
    const key = t.tenderNoNitNo ? t.tenderNoNitNo.trim() : "";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(t);
  });

  const duplicateKeys = [];
  groups.forEach((tenders, key) => {
    if (tenders.length > 1) {
      duplicateKeys.push({ key, tenders });
    }
  });

  if (duplicateKeys.length === 0) {
    console.log("✅ No duplicate entries found in the Tender table.");
    process.exit(0);
  }

  console.log(`⚠️ Found ${duplicateKeys.length} tender numbers with duplicate entries.`);
  let totalDeleted = 0;

  for (const item of duplicateKeys) {
    const { key, tenders } = item;
    
    // Sort logic to determine which one to KEEP:
    // 1. Prioritize records that have been modified or edited by the application (tenderUpdateStatus !== 'OPEN' or nextAction !== null)
    // 2. Keep the oldest created record (oldest createdAt or first database row)
    tenders.sort((a, b) => {
      const aIsModified = a.tenderUpdateStatus !== "OPEN" || a.nextAction !== null;
      const bIsModified = b.tenderUpdateStatus !== "OPEN" || b.nextAction !== null;
      
      if (aIsModified && !bIsModified) return -1;
      if (!aIsModified && bIsModified) return 1;
      
      const t1 = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const t2 = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return t1 - t2; // older first
    });

    const recordToKeep = tenders[0];
    const recordsToDelete = tenders.slice(1);
    const deleteIds = recordsToDelete.map(t => t.id);

    console.log(`   Tender No: "${key || '(empty)'}" has ${tenders.length} copies. Keeping ID: ${recordToKeep.id}`);
    
    await prisma.tender.deleteMany({
      where: {
        id: { in: deleteIds }
      }
    });

    totalDeleted += deleteIds.length;
  }

  console.log(`\n🎉 Done! Successfully deleted ${totalDeleted} duplicate records from the database.`);
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Error running removeDuplicates script:", err);
  process.exit(1);
});
