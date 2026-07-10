const SHEET_ID = 5621905471000452;
const TOKEN = "HMRwFDW2aYXmmKIIXmrP9Hq5tQt3S1ytziI8f";

async function main() {
  const url = `https://api.smartsheet.com/2.0/sheets/${SHEET_ID}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const data = await resp.json();
  console.log("=== COLUMNS ===");
  for (const col of data.columns) {
    console.log(JSON.stringify(col.title));
  }
  console.log("\n=== Searching for 'Account Holder' and 'Quotation Date' ===");
  for (const col of data.columns) {
    if (col.title.toLowerCase().includes("account") || col.title.toLowerCase().includes("quotation date")) {
      console.log(JSON.stringify(col.title) + "  id=" + col.id);
    }
  }
}
main().catch(console.error);
