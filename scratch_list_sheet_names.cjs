const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

async function run() {
  try {
    const credsPath = path.resolve('credentials.json');
    if (!fs.existsSync(credsPath)) {
      console.error("Credentials file not found at " + credsPath);
      return;
    }
    const credentials = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1GTwzxMgViohbCimXqfiBZBJsKbCSr7hCgbcHF_En1VE';
    
    const response = await sheets.spreadsheets.get({ spreadsheetId });
    console.log("Sheet names:");
    response.data.sheets.forEach(s => {
      console.log(`- ${s.properties.title}`);
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

run();
