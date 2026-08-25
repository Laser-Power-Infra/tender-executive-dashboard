import "dotenv/config";
import { prisma } from "../lib/prisma";

const API_URL =
  process.env.BOM_API_URL ||
  "http://192.168.1.190:4555/api/item-schedule/by-name";

const BOM_API_KEY = process.env.BOM_API_KEY?.trim() || "";

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_CONCURRENCY = 3;
const RETRIES = 2;

type BomApiRecord = {
  itemCode?: string | null;
  itemScheduleName?: string | null;
  itemName?: string | null;
  sheetTotalDiff?: string | null;
  bomType?: string | null;
  bomId?: string | null;
  option2?: string | null;
  option2Diff?: string | null;
  ccvSioplas?: string | null;
  ccvSioplasDiff?: string | null;
  cuTape?: string | null;
  cuTapePlusMinus?: string | null;
  cuTapeDiff?: string | null;
  alCu?: string | null;
  alCuPlusMinus?: string | null;
  alCuDiff?: string | null;
  alloy?: string | null;
  alloyPlusMinus?: string | null;
  alloyDiff?: string | null;
  armour?: string | null;
  armourPlusMinus?: string | null;
  armourDiff?: string | null;
  semicon?: string | null;
  semiconPlusMinus?: string | null;
  semiconDiff?: string | null;
  insulation?: string | null;
  insulationPlusMinus?: string | null;
  insulationDiff?: string | null;
  pvcInner?: string | null;
  pvcInnerPlusMinus?: string | null;
  pvcInnerDiff?: string | null;
  pvcOuter?: string | null;
  pvcOuterPlusMinus?: string | null;
  pvcOuterDiff?: string | null;
  pvcOuterInnerDiff?: string | null;
  filler?: string | null;
  fillerPlusMinus?: string | null;
  fillerDiff?: string | null;
  polyt?: string | null;
  polytPlusMinus?: string | null;
  polytDiff?: string | null;
  rubberCottonTape?: string | null;
  rubberCottonTapePlusMinus?: string | null;
  rubberCottonTapeDiff?: string | null;
  spclConstruction?: string | null;
  spclConstructionPlusMinus?: string | null;
  spclConstructionDiff?: string | null;
  finalOutput?: string | null;
  // ignored: id, createdAt, updatedAt
};

type ApiResponse = {
  success: boolean;
  results: Record<string, BomApiRecord[]>;
};

const BOM_FIELDS: (keyof BomApiRecord)[] = [
  "itemCode",
  "itemScheduleName",
  "itemName",
  "sheetTotalDiff",
  "bomType",
  "bomId",
  "option2",
  "option2Diff",
  "ccvSioplas",
  "ccvSioplasDiff",
  "cuTape",
  "cuTapePlusMinus",
  "cuTapeDiff",
  "alCu",
  "alCuPlusMinus",
  "alCuDiff",
  "alloy",
  "alloyPlusMinus",
  "alloyDiff",
  "armour",
  "armourPlusMinus",
  "armourDiff",
  "semicon",
  "semiconPlusMinus",
  "semiconDiff",
  "insulation",
  "insulationPlusMinus",
  "insulationDiff",
  "pvcInner",
  "pvcInnerPlusMinus",
  "pvcInnerDiff",
  "pvcOuter",
  "pvcOuterPlusMinus",
  "pvcOuterDiff",
  "pvcOuterInnerDiff",
  "filler",
  "fillerPlusMinus",
  "fillerDiff",
  "polyt",
  "polytPlusMinus",
  "polytDiff",
  "rubberCottonTape",
  "rubberCottonTapePlusMinus",
  "rubberCottonTapeDiff",
  "spclConstruction",
  "spclConstructionPlusMinus",
  "spclConstructionDiff",
  "finalOutput",
];

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    verbose: args.includes("--verbose"),
    help: args.includes("--help") || args.includes("-h"),
    limit: (() => {
      const idx = args.indexOf("--limit");
      if (idx !== -1 && args[idx + 1]) return Number(args[idx + 1]);
      return undefined;
    })(),
    batchSize: (() => {
      const idx = args.indexOf("--batch-size");
      if (idx !== -1 && args[idx + 1]) return Number(args[idx + 1]);
      return DEFAULT_BATCH_SIZE;
    })(),
    concurrency: (() => {
      const idx = args.indexOf("--concurrency");
      if (idx !== -1 && args[idx + 1]) return Number(args[idx + 1]);
      return DEFAULT_CONCURRENCY;
    })(),
    apiUrl: (() => {
      const idx = args.indexOf("--api-url");
      if (idx !== -1 && args[idx + 1]) return String(args[idx + 1]);
      return API_URL;
    })(),
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchBatch(
  batch: string[],
  apiUrl: string,
  verbose: boolean
): Promise<ApiResponse | null> {
  const body = batch.map((itemName) => ({ itemName }));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (BOM_API_KEY) headers["externalapikey"] = BOM_API_KEY;
  if (verbose) {
    const masked = BOM_API_KEY ? `${BOM_API_KEY.slice(0, 4)}***` : "(none)";
    console.log(`  -> POST ${apiUrl} batch=${batch.length} externalapikey=${BOM_API_KEY ? masked : "(missing)"}`);
  } else if (!BOM_API_KEY) {
    // will warn once in main; keep quiet per batch
  }
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        console.error(`  API ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
        if (res.status >= 500 && attempt < RETRIES) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        return null;
      }
      const json = JSON.parse(text) as ApiResponse;
      return json;
    } catch (err) {
      console.error(`  fetch batch failed attempt ${attempt + 1}:`, (err as Error).message);
      if (attempt < RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

async function main() {
  const { dryRun, verbose, help, limit, batchSize, apiUrl } = parseArgs();
  if (help) {
    console.log(`
Usage: npx tsx scripts/syncBomFromItemSchedule.ts [options]

Options:
  --dry-run          Parse + call API without DB writes
  --verbose          Log payloads and per-record
  --limit N          Cap unique itemNames for testing
  --batch-size N     Items per API call (default ${DEFAULT_BATCH_SIZE})
  --concurrency N    Reserved, batches are sequential (default ${DEFAULT_CONCURRENCY})
  --api-url URL      Override BOM API URL
  --help, -h         Show help

Source: CostingSheetDetails.proposedErpItemName (distinct, trimmed, non-empty)
Dest: Bom (upsert on @@unique([itemCode,bomId]), ignore API id/createdAt/updatedAt)
API: POST ${API_URL} body [{itemName}]
Response: {success, results: Record<itemName, Bom[] >}
`);
    process.exit(0);
  }

  console.log("=".repeat(70));
  console.log("  Bom Sync — CostingSheetDetails -> Bom via item-schedule/by-name");
  console.log("=".repeat(70));
  console.log(`  API: ${apiUrl}`);
  console.log(`  batchSize=${batchSize} limit=${limit ?? "none"} dryRun=${dryRun} verbose=${verbose}`);
  if (!BOM_API_KEY) {
    console.warn(`  WARN: BOM_API_KEY not set — requests will be sent without externalapikey header`);
  } else if (verbose) {
    console.log(`  BOM_API_KEY: ${BOM_API_KEY.slice(0, 4)}*** (present)`);
  }

  // 1. fetch distinct proposedErpItemName
  const rows = await prisma.costingSheetDetails.findMany({
    select: { proposedErpItemName: true },
  });
  console.log(`  CostingSheetDetails rows: ${rows.length}`);

  const map = new Map<string, string>(); // normalized -> original trimmed
  let empty = 0;
  for (const r of rows) {
    const raw = r.proposedErpItemName;
    if (!raw) {
      empty++;
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      empty++;
      continue;
    }
    const norm = trimmed.toLowerCase().replace(/\s+/g, " ");
    if (!map.has(norm)) map.set(norm, trimmed);
  }
  let uniqueNames = Array.from(map.values());
  console.log(`  Unique non-empty itemNames: ${uniqueNames.length} (empty/null skipped: ${empty})`);
  if (limit && limit > 0) {
    uniqueNames = uniqueNames.slice(0, limit);
    console.log(`  Limited to first ${uniqueNames.length} names`);
  }
  if (uniqueNames.length === 0) {
    console.log("  Nothing to sync.");
    await prisma.$disconnect();
    return;
  }

  const batches = chunk(uniqueNames, batchSize);
  console.log(`  Batches: ${batches.length}`);

  let apiOk = 0;
  let apiFail = 0;
  let recordsReturned = 0;
  let upserted = 0;
  let skippedMissingKey = 0;
  let skippedEmptyResult = 0;
  let failed = 0;
  let wouldUpsert = 0;

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    console.log(`\n[Batch ${bi + 1}/${batches.length}] ${batch.length} names`);
    if (verbose) {
      for (const n of batch) console.log(`    - "${n}"`);
    }

    const json = await fetchBatch(batch, apiUrl, verbose);
    if (!json) {
      apiFail++;
      // fallback: try singleton per name if batch might be too large
      if (batch.length > 1) {
        console.log(`  Batch failed, retrying as singletons...`);
        for (const single of batch) {
          const singleJson = await fetchBatch([single], apiUrl, verbose);
          if (!singleJson || !singleJson.success || !singleJson.results) {
            apiFail++;
            continue;
          }
          apiOk++;
          const arr = singleJson.results[single] ?? [];
          if (arr.length === 0) skippedEmptyResult++;
          recordsReturned += arr.length;
          for (const rec of arr) {
            const itemCode = toStr(rec.itemCode);
            const bomId = toStr(rec.bomId);
            const itemScheduleName = toStr(rec.itemScheduleName);
            if (!itemCode || !bomId || !itemScheduleName) {
              skippedMissingKey++;
              if (verbose) console.log(`    skip missing key: itemCode=${itemCode} bomId=${bomId} itemScheduleName=${itemScheduleName}`);
              continue;
            }
            if (dryRun) {
              wouldUpsert++;
              if (verbose) console.log(`    [dry-run] would upsert ${itemCode} + ${bomId}`);
              continue;
            }
            const data: Record<string, string | null> = {};
            for (const f of BOM_FIELDS) {
              if (f === "itemName") {
                data[f] = toStr(rec.itemName) ?? toStr(single);
              } else {
                data[f] = toStr((rec as Record<string, unknown>)[f]);
              }
            }
            // map option2 -> bomType (use option2 column value for bomType, ignore API bomType)
            data.bomType = toStr(rec.option2);
            // ensure required fields are non-null strings for Prisma
            const createData: Record<string, string | null> & { itemCode: string; bomId: string; itemScheduleName: string } = {
              ...data,
              itemCode: itemCode!,
              bomId: bomId!,
              itemScheduleName: itemScheduleName!,
            };
            try {
              await prisma.bom.upsert({
                where: { itemCode_bomId: { itemCode: itemCode!, bomId: bomId! } },
                update: createData as any,
                create: createData as any,
              });
              upserted++;
            } catch (err) {
              failed++;
              console.error(`    upsert failed ${itemCode}/${bomId}:`, (err as Error).message);
            }
          }
        }
      }
      continue;
    }

    if (!json.success || !json.results) {
      console.error(`  Invalid API response:`, JSON.stringify(json).slice(0, 1000));
      apiFail++;
      continue;
    }
    apiOk++;

    // results is Record<itemName, Bom[]>
    for (const requestedName of batch) {
      const arr = json.results[requestedName] ?? [];
      if (arr.length === 0) {
        skippedEmptyResult++;
        if (verbose) console.log(`    no result for "${requestedName}"`);
        continue;
      }
      recordsReturned += arr.length;
      if (verbose) console.log(`    "${requestedName}" -> ${arr.length} record(s)`);
      for (const rec of arr) {
        const itemCode = toStr(rec.itemCode);
        const bomId = toStr(rec.bomId);
        const itemScheduleName = toStr(rec.itemScheduleName);
        if (!itemCode || !bomId || !itemScheduleName) {
          skippedMissingKey++;
          if (verbose) console.log(`    skip missing key: itemCode=${itemCode} bomId=${bomId} itemScheduleName=${itemScheduleName} for "${requestedName}"`);
          continue;
        }
        if (dryRun) {
          wouldUpsert++;
          if (verbose) console.log(`    [dry-run] would upsert ${itemCode} + ${bomId} (${rec.itemName ?? requestedName})`);
          continue;
        }
        const data: Record<string, string | null> = {};
        for (const f of BOM_FIELDS) {
          if (f === "itemName") {
            data[f] = toStr(rec.itemName) ?? toStr(requestedName);
          } else {
            data[f] = toStr((rec as Record<string, unknown>)[f]);
          }
        }
        // map option2 -> bomType (use option2 column value for bomType, ignore API bomType)
        data.bomType = toStr(rec.option2);
        const createData2: Record<string, string | null> & { itemCode: string; bomId: string; itemScheduleName: string } = {
          ...data,
          itemCode: itemCode!,
          bomId: bomId!,
          itemScheduleName: itemScheduleName!,
        };
        try {
          await prisma.bom.upsert({
            where: { itemCode_bomId: { itemCode: itemCode!, bomId: bomId! } },
            update: createData2 as any,
            create: createData2 as any,
          });
          upserted++;
        } catch (err) {
          // fallback if composite name differs (e.g. Prisma generates Bom_itemCode_bomId_key)
          const msg = (err as Error).message;
          if (msg.includes("Unknown argument") && msg.includes("itemCode_bomId")) {
            try {
              const existing = await prisma.bom.findFirst({ where: { itemCode, bomId } });
              if (existing) {
                await prisma.bom.update({ where: { id: existing.id }, data: createData2 as any });
                upserted++;
              } else {
                await prisma.bom.create({ data: createData2 as any });
                upserted++;
              }
            } catch (err2) {
              failed++;
              console.error(`    fallback upsert failed ${itemCode}/${bomId}:`, (err2 as Error).message);
            }
          } else {
            failed++;
            console.error(`    upsert failed ${itemCode}/${bomId}:`, msg);
          }
        }
      }
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("  Sync Summary");
  console.log("=".repeat(70));
  console.log(`    Unique names from CostingSheetDetails: ${uniqueNames.length}`);
  console.log(`    Batches: ${batches.length} (batchSize ${batchSize})`);
  console.log(`    API ok: ${apiOk}  fail: ${apiFail}`);
  console.log(`    Records returned: ${recordsReturned}`);
  console.log(`    Empty results (no Bom for name): ${skippedEmptyResult}`);
  console.log(`    Skipped missing key (itemCode/bomId/itemScheduleName): ${skippedMissingKey}`);
  if (dryRun) {
    console.log(`    Would upsert (dry-run): ${wouldUpsert}`);
  } else {
    console.log(`    Upserted (create+update): ${upserted}`);
  }
  console.log(`    Failed upserts: ${failed}`);
  console.log("=".repeat(70));

  await prisma.$disconnect();
  if (failed > 0 || apiFail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
