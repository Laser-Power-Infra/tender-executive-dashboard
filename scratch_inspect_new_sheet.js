import crypto from "crypto";
import fs from "fs";
import path from "path";

// Load .env
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const regex = /^\s*([\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\n]*))/mg;
    let match;
    while ((match = regex.exec(envContent)) !== null) {
      const key = match[1];
      const value = match[2] || match[3] || match[4] || "";
      process.env[key] = value.trim();
    }
  }
} catch (e) {}

async function getAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };
  const base64UrlEncode = (obj) => {
    return Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  };
  const encodedHeader = base64UrlEncode(header);
  const encodedClaimSet = base64UrlEncode(claimSet);
  const stringToSign = `${encodedHeader}.${encodedClaimSet}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(stringToSign);
  const signature = sign.sign(privateKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const assertion = `${stringToSign}.${signature}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }
  const data = await response.json();
  return data.access_token;
}

async function inspectNewSheet() {
  const SPREADSHEET_ID = "1PVujEFMUdA4hqvm357oseASTajgEdIYDZFANm9WF3iE";
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;

  try {
    const cleanKey = key.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
    const cleanEmail = email.trim().replace(/^["']|["']$/g, "");
    const token = await getAccessToken(cleanEmail, cleanKey);

    // Let's get spreadsheet details to see sheet names
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
    const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
    const metaData = await metaRes.json();
    console.log("Sheet names in new spreadsheet:", metaData.sheets.map(s => s.properties.title));

    const sheetName = metaData.sheets[0].properties.title;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!A1:Z20`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const sheetData = await res.json();
    const rows = sheetData.values || [];

    console.log(`\n--- First 5 rows of sheet: "${sheetName}" ---`);
    rows.slice(0, 5).forEach((row, i) => {
      console.log(`Row ${i + 1}:`, row);
    });

  } catch (err) {
    console.error("Error inspecting:", err);
  }
}

inspectNewSheet();
