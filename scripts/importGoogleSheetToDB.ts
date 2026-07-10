import "dotenv/config";

import { GoogleSheetService } from "../services/googleSheetService";
import { DatabaseTenderService } from "../services/databaseTenderService";

console.log("DATABASE_URL loaded:", process.env.DATABASE_URL ? "Yes (hidden)" : "No");

async function main() {
  console.log("🔄 Fetching live tender records from Google Sheets...");
  const googleSheetService = new GoogleSheetService();
  const records = await googleSheetService.fetchTenderRecords();
  console.log(`Fetched ${records.length} records. Syncing to Neon PostgreSQL database...`);

  await DatabaseTenderService.upsertTenders(records);
  console.log("✅ Database pre-population complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Pre-population script failed:", err);
  process.exit(1);
});
