import fs from "fs";
import path from "path";
import XLSX from "xlsx";

function debugParse() {
  const filePath = path.resolve(process.cwd(), "excel_cache", "3547a535eaf6e3743a8c78744878bb85.xlsx");
  if (!fs.existsSync(filePath)) {
    console.log("File not found!");
    return;
  }

  const docketNo = "19976";
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets["AUTO CALCULATION SHEET (2)"];
  if (!sheet) {
    console.log("Sheet not found!");
    return;
  }

  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:ZZ100");
  
  let erpHeaderRowIdx = -1;
  let erpColIdx = -1;
  let qtyColIdx = -1;
  let unitColIdx = -1;

  for (let r = range.s.r; r <= Math.min(range.e.r, 40); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[cellRef];
      if (cell && cell.v !== undefined) {
        const valStr = String(cell.v).trim().toUpperCase();
        if (valStr === "PROPOSE ERP ITEM NAME") {
          erpHeaderRowIdx = r;
          erpColIdx = c;
        } else if (valStr === "QTY") {
          qtyColIdx = c;
        } else if (valStr === "UNIT") {
          unitColIdx = c;
        }
      }
    }
    if (erpHeaderRowIdx !== -1) break;
  }

  console.log("Found Indexes:");
  console.log("  Header Row Index:", erpHeaderRowIdx);
  console.log("  ERP Col Index:", erpColIdx);
  console.log("  QTY Col Index:", qtyColIdx);
  console.log("  Unit Col Index:", unitColIdx);

  if (erpHeaderRowIdx !== -1 && erpColIdx !== -1) {
    const erpItems = [];
    const qtyItems = [];
    const seenItems = new Set();
    
    for (let r = erpHeaderRowIdx + 1; r <= range.e.r; r++) {
      // Verify docket cell contains docketNo
      const docketCellRef = XLSX.utils.encode_cell({ r, c: 0 });
      const docketCell = sheet[docketCellRef];
      if (!docketCell || docketCell.v === undefined) {
        continue;
      }
      const docketStr = String(docketCell.v).trim();
      if (!docketStr.includes(String(docketNo))) {
        continue;
      }

      const erpCellRef = XLSX.utils.encode_cell({ r, c: erpColIdx });
      const erpCell = sheet[erpCellRef];
      if (erpCell && erpCell.v !== undefined && String(erpCell.v).trim() !== "") {
        const erpVal = String(erpCell.v).trim();
        console.log(`Row ${r+1} ERP Value matches docket: "${erpVal}"`);
        if (erpVal.toUpperCase().includes("PROPOSE") || erpVal.toLowerCase().includes("total") || erpVal.toLowerCase().includes("sum")) {
          continue;
        }
        
        let qtyVal = "";
        let qtyNum = null;
        if (qtyColIdx !== -1) {
          const qtyCellRef = XLSX.utils.encode_cell({ r, c: qtyColIdx });
          const qtyCell = sheet[qtyCellRef];
          if (qtyCell && qtyCell.v !== undefined) {
            qtyVal = String(qtyCell.v).trim();
            qtyNum = Number(qtyVal.replace(/[^\d.-]/g, ""));
          }
        }
        
        let unitVal = "";
        if (unitColIdx !== -1) {
          const unitCellRef = XLSX.utils.encode_cell({ r, c: unitColIdx });
          const unitCell = sheet[unitCellRef];
          if (unitCell && unitCell.v !== undefined) {
            unitVal = String(unitCell.v).trim();
          }
        }
        
        // Convert KM/KMS to meters
        if (qtyNum !== null && !isNaN(qtyNum)) {
          if (unitVal.toUpperCase().includes("KM")) {
            qtyVal = String(Math.round(qtyNum * 1000));
          } else {
            qtyVal = String(Math.round(qtyNum));
          }
        }

        // Deduplicate matching items with same name and quantity
        const itemKey = `${erpVal}::${qtyVal}`;
        if (!seenItems.has(itemKey)) {
          seenItems.add(itemKey);
          erpItems.push(erpVal);
          qtyItems.push(qtyVal);
          console.log(`  Added: ERP="${erpVal}", QTY="${qtyVal}"`);
        } else {
          console.log(`  Skipped duplicate item: ERP="${erpVal}", QTY="${qtyVal}"`);
        }
      }
    }
    console.log("\nFinal results for Docket 19976:");
    console.log("Result ERP:", JSON.stringify(erpItems.join("\n")));
    console.log("Result QTY:", JSON.stringify(qtyItems.join("\n")));
  }
}

debugParse();
