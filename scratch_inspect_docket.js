import fs from "fs";
import path from "path";

function checkDocket() {
  const filePath = path.resolve(process.cwd(), "excel_cache", "last_sheet_fetch.json");
  if (!fs.existsSync(filePath)) {
    console.log("File not found!");
    return;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const record = data.find(r => r.docketNo === "19976");
  if (record) {
    console.log("Record 19976 found in last_sheet_fetch.json:");
    console.log("  proposedErpItemName:", JSON.stringify(record.proposedErpItemName));
    console.log("  proposedQty:", JSON.stringify(record.proposedQty));
  } else {
    console.log("Record 19976 not found in cache!");
  }

  const dataFile = path.resolve(process.cwd(), "data", "tender_cache.json");
  if (fs.existsSync(dataFile)) {
    const dataRecords = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
    const record2 = dataRecords.find(r => r.docketNo === "19976");
    if (record2) {
      console.log("Record 19976 found in data/tender_cache.json:");
      console.log("  proposedErpItemName:", JSON.stringify(record2.proposedErpItemName));
      console.log("  proposedQty:", JSON.stringify(record2.proposedQty));
    }
  }
}

checkDocket();
