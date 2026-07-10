import fs from "fs";
import path from "path";

function inspectCache() {
  const filePath = path.resolve(process.cwd(), "excel_cache", "last_sheet_fetch.json");
  if (!fs.existsSync(filePath)) {
    console.log("File not found!");
    return;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  console.log("Total records:", data.length);
  const matched = data.filter(r => r.statusCategory);
  console.log("Records with statusCategory:", matched.length);
  if (matched.length > 0) {
    console.log("Sample matched record:", {
      docketNo: matched[0].docketNo,
      tenderNoNitNo: matched[0].tenderNoNitNo,
      statusCategory: matched[0].statusCategory
    });
  }
}

inspectCache();
