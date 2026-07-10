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
  const data = await response.json();
  return data.access_token;
}

async function testMatch() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  const cleanKey = key.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
  const cleanEmail = email.trim().replace(/^["']|["']$/g, "");
  const token = await getAccessToken(cleanEmail, cleanKey);

  // 1. Fetch main sheet rows
  const mainUrl = `https://sheets.googleapis.com/v4/spreadsheets/1GTwzxMgViohbCimXqfiBZBJsKbCSr7hCgbcHF_En1VE/values/LASER_Master_Tender_List!A1:ZZ`;
  const mainRes = await fetch(mainUrl, { headers: { Authorization: `Bearer ${token}` } });
  const mainData = await mainRes.json();
  const mainRows = mainData.values || [];

  // Find Tender No / NIT No with Date column index (usually index 4)
  const mainHeaders = mainRows[0].map(h => h.trim().toLowerCase());
  const tenderNoIdx = mainHeaders.findIndex(h => h.includes("tender no") || h.includes("nit no"));
  console.log("Main Sheet Tender No column index:", tenderNoIdx, `("${mainRows[0][tenderNoIdx]}")`);

  // 2. Fetch new AOC sheet rows
  const aocUrl = `https://sheets.googleapis.com/v4/spreadsheets/1PVujEFMUdA4hqvm357oseASTajgEdIYDZFANm9WF3iE/values/Sheet1!A1:ZZ`;
  const aocRes = await fetch(aocUrl, { headers: { Authorization: `Bearer ${token}` } });
  const aocData = await aocRes.json();
  const aocRows = aocData.values || [];

  const aocHeaders = aocRows[0].map(h => h.trim().toLowerCase());
  const tenderIdIdx = aocHeaders.indexOf("tenderid");
  const statusCategoryIdx = aocHeaders.indexOf("statuscategory");

  const aocMap = new Map();
  for (let i = 1; i < aocRows.length; i++) {
    const row = aocRows[i];
    if (row && row[tenderIdIdx] && row[statusCategoryIdx]) {
      const cleanId = String(row[tenderIdIdx]).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      aocMap.set(cleanId, String(row[statusCategoryIdx]).trim());
    }
  }
  console.log(`AOC Map built with ${aocMap.size} entries.`);

  // 3. Test matches
  let matches = [];
  for (let i = 1; i < mainRows.length; i++) {
    const row = mainRows[i];
    if (row && row[tenderNoIdx]) {
      const rawNo = String(row[tenderNoIdx]).trim();
      const cleanNo = rawNo.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (aocMap.has(cleanNo)) {
        matches.push({
          row: i + 1,
          rawNo,
          cleanNo,
          category: aocMap.get(cleanNo)
        });
      }
    }
  }

  console.log(`Matched records count: ${matches.length}`);
  if (matches.length > 0) {
    console.log("Sample matches:");
    console.log(matches.slice(0, 5));
  }
}

testMatch();
