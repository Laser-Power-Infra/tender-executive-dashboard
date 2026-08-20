/**
 * Script to verify Smartsheet column names exist in the configured sheet.
 *
 * Usage:
 *   cd v2 && npx tsx scripts/checkSmartsheetColumns.ts
 */
import "dotenv/config";
import { fetchSmartsheet } from "../lib/smartsheet";

async function main() {
  console.log("[checkSmartsheetColumns] Fetching Smartsheet metadata...");
  const sheetData = await fetchSmartsheet();

  console.log(`\nSheet Name: "${sheetData.name}"`);
  console.log(`Sheet ID: ${sheetData.id}`);
  console.log(`Total Columns: ${sheetData.columns.length}`);
  console.log(`Total Rows: ${sheetData.rows.length}\n`);

  const targetColumns = [
    "Email Subject Line  (Debosmita Nath)",
    "Enquiry / Tender No. (Marketing Team)",
    "Reference No  (Debosmita Nath)",
    "Docket No  (Debosmita Nath)",
    "Quotation No. (Dipankar)",
    "Quotation DateFORMAT(MM-DD-YY)(Dipankar)",
  ];

  console.log("=== All Column Titles ===");
  for (const col of sheetData.columns) {
    const marker = targetColumns.includes(col.title) ? " <-- TARGET" : "";
    console.log(`  [${col.id}] "${col.title}"${marker}`);
  }

  console.log("\n=== Target Column Check ===");
  const columnTitles = sheetData.columns.map((c) => c.title);
  let allFound = true;

  for (const target of targetColumns) {
    const found = columnTitles.includes(target);
    console.log(`  "${target}" → ${found ? "FOUND" : "NOT FOUND"}`);
    if (!found) allFound = false;
  }

  if (allFound) {
    console.log("\n✓ All target columns exist in the Smartsheet.");
  } else {
    console.log("\n✗ Some target columns are missing. Check the spelling above.");
  }

  // Also show a sample of values from the first 3 rows for each target column
  if (allFound) {
    console.log("\n=== Sample Values (first 3 rows) ===");
    const colIdMap = new Map(
      sheetData.columns.map((c) => [c.title, c.id]),
    );
    for (const target of targetColumns) {
      const colId = colIdMap.get(target);
      console.log(`\n  "${target}" (columnId: ${colId}):`);
      for (let i = 0; i < Math.min(3, sheetData.rows.length); i++) {
        const row = sheetData.rows[i];
        const cell = row.cells.find((c) => c.columnId === colId);
        const val = cell?.displayValue ?? cell?.value ?? "(empty)";
        console.log(`    Row ${row.rowNumber}: "${val}"`);
      }
    }
  }
}

main()
  .catch((err) => {
    console.error("[checkSmartsheetColumns] Failed:", err);
    process.exit(1);
  });
