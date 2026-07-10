import fs from "fs";
import path from "path";
import XLSX from "xlsx";

function searchExcelFiles() {
  const cacheDir = path.resolve(process.cwd(), "excel_cache");
  if (!fs.existsSync(cacheDir)) return;

  const files = fs.readdirSync(cacheDir).filter(f => f.endsWith(".xlsx"));
  console.log(`Checking ${files.length} cached files...`);
  
  files.slice(0, 10).forEach(file => {
    const filePath = path.join(cacheDir, file);
    try {
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets["AUTO CALCULATION SHEET (2)"];
      if (sheet) {
        // Headers are at row index 16 (Row 17)
        // Values are at row index 17 (Row 18)
        const cellErpHeader = sheet[XLSX.utils.encode_cell({ r: 16, c: 3 })];
        const cellErpValue = sheet[XLSX.utils.encode_cell({ r: 17, c: 3 })];
        
        const cellQtyHeader = sheet[XLSX.utils.encode_cell({ r: 16, c: 10 })];
        const cellQtyValue = sheet[XLSX.utils.encode_cell({ r: 17, c: 10 })];
        
        console.log(`\nFile: ${file}`);
        console.log(`  ERP Header (${cellErpHeader ? cellErpHeader.v : "N/A"}): "${cellErpValue ? cellErpValue.v : "N/A"}"`);
        console.log(`  QTY Header (${cellQtyHeader ? cellQtyHeader.v : "N/A"}): "${cellQtyValue ? cellQtyValue.v : "N/A"}"`);
      }
    } catch (e) {
      console.log(`Error parsing ${file}:`, e.message);
    }
  });
}

searchExcelFiles();
