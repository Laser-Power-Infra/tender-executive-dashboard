import { runIndexer } from "./services/supplyDocumentIndexer.js";

async function main() {
  console.log("Triggering manual index scan...");
  await runIndexer();
  console.log("Manual scan complete.");
}

main().catch(err => {
  console.error("Indexer execution error:", err);
});
