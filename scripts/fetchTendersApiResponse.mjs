async function testAddress(url) {
  console.log(`Testing fetch: ${url}`);
  try {
    const response = await fetch(url);
    console.log(`  Success! Status: ${response.status}`);
    const json = await response.json();
    console.log(`  Records: ${json.data ? json.data.length : 0}`);
    return true;
  } catch (err) {
    console.log(`  Failed: ${err.message}`);
    return false;
  }
}

async function main() {
  const urls = [
    "http://127.0.0.1:3001/api/smartsheet-tenders",
    "http://[::1]:3001/api/smartsheet-tenders",
    "http://localhost:3001/api/smartsheet-tenders"
  ];
  for (const url of urls) {
    const ok = await testAddress(url);
    if (ok) break;
  }
}

main().catch(console.error);
