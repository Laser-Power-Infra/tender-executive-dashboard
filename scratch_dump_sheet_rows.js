import fs from "fs";
import path from "path";
import XLSX from "xlsx";

function dumpRows() {
  const cacheDir = path.resolve(process.cwd(), "excel_cache");
  const files = fs.readdirSync(cacheDir).filter(f => f.endsWith(".xlsx"));
  if (files.length === 0) return;

  const file = files[0];
  const filePath = path.join(cacheDir, file);
  console.log(`Dumping rows for file: ${file}`);
  
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets["AUTO CALCULATION SHEET (2)"];
  if (!sheet) {
    console.log("AUTO CALCULATION SHEET (2) not found!");
    return;
  }

  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:ZZ100");
  for (let r = range.s.r; r <= Math.min(range.e.r, 30); r++) {
    const rowCells = [];
    for (let c = range.s.c; c <= Math.min(range.e.c, 15); c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[ref];
      rowCells.push(`${XLSX.utils.encode_col(c)}${r+1}: ${cell && cell.v !== undefined ? String(cell.v).substring(0, 30) : ""}`);
    }
    console.log(`Row ${r+1}:`, rowCells.filter(x => x.split(": ")[1] !== "").join(" | "));
  }
}

dumpRows();
