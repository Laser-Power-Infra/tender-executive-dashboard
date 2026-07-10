import fs from "fs";
import path from "path";
import crypto from "crypto";

// Load env
const envPath = path.resolve(".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const regex = /^\s*([\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\n\r]*))/mg;
let match;
while ((match = regex.exec(envContent)) !== null) {
  process.env[match[1]] = (match[2] || match[3] || match[4] || "").trim();
}

const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
const key = process.env.GOOGLE_PRIVATE_KEY;
let cleanKey = key.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
let cleanEmail = email.trim().replace(/^["']|["']$/g, "");

function base64UrlEncode(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: cleanEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };
  const stringToSign = `${base64UrlEncode(header)}.${base64UrlEncode(claimSet)}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(stringToSign);
  const signature = sign.sign(cleanKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${stringToSign}.${signature}`
  });
  const res = await tokenResponse.json();
  return res.access_token;
}

getAccessToken().then(async token => {
  const spreadsheetId = "1FK1t7FeAjQ3v4saIxJUS-5KbE6YlQv-8WFQCBRuaxDQ";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Cost!A1:D30000`;
  console.log("Fetching rows from Google Sheets...");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  
  const rows = data.values || [];
  console.log(`Successfully fetched ${rows.length} rows.`);
  
  const docketsToSearch = ["20275", "20277", "20281", "20283", "20284", "20286", "20287", "20289", "20290", "20291", "20260"];
  console.log("Searching for dockets:", docketsToSearch);
  
  docketsToSearch.forEach(d => {
    let found = false;
    rows.forEach((row, idx) => {
      const rowStr = JSON.stringify(row);
      if (rowStr.includes(d)) {
        found = true;
        console.log(`[FOUND] Docket ${d} at Row ${idx + 1}: ${rowStr}`);
      }
    });
    if (!found) {
      console.log(`[NOT FOUND] Docket ${d}`);
    }
  });
}).catch(e => console.error(e));
