import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import crypto from "crypto";

function dumpDocketExcel() {
  const cacheFile = path.resolve(process.cwd(), "excel_cache", "last_sheet_fetch.json");
  if (!fs.existsSync(cacheFile)) return;
  const data = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
  const record = data.find(r => r.docketNo === "19976");
  if (!record || !record.attachmentUrl) {
    console.log("Docket 19976 or attachment URL not found!");
    return;
  }

  const hash = crypto.createHash("md5").update(record.attachmentUrl).digest("hex");
  const filePath = path.resolve(process.cwd(), "excel_cache", `${hash}.xlsx`);
  console.log(`Excel file path for Docket 19976: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.log("Excel file not found on disk!");
    return;
  }

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets["AUTO CALCULATION SHEET (2)"];
  if (!sheet) {
    console.log("AUTO CALCULATION SHEET (2) not found!");
    return;
  }

  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:ZZ100");
  for (let r = range.s.r; r <= Math.min(range.e.r, 45); r++) {
    const rowCells = [];
    for (let c = range.s.c; c <= Math.min(range.e.c, 15); c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[ref];
      rowCells.push(`${XLSX.utils.encode_col(c)}${r+1}: ${cell && cell.v !== undefined ? String(cell.v).substring(0, 30) : ""}`);
    }
    const nonTrivial = rowCells.filter(x => x.split(": ")[1] !== "");
    if (nonTrivial.length > 0) {
      console.log(`Row ${r+1}:`, nonTrivial.join(" | "));
    }
  }
}

dumpDocketExcel();
