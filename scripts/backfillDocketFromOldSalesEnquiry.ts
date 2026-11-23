/**
 * One-time backfill: fill blank TenderMerged.docketNo from Smartsheet
 * "Sales Enquiry 3", "Sales Enquiry 2", "Sales Enquiry" (in that order).
 * Same match rule as services/smartsheetDocketSync.ts (referenceNo contained in
 * email subject, else in enquiry/tender no.), restricted to apm = YES and
 * participated = true. Disposable — delete after running.
 *
 * Skips: referenceNo shorter than 6 chars (false-match risk), and refs that
 * match rows with different docket numbers (ambiguous).
 *
 * Usage:
 *   pnpm exec tsx scripts/backfillDocketFromOldSalesEnquiry.ts          # dry run
 *   pnpm exec tsx scripts/backfillDocketFromOldSalesEnquiry.ts --apply  # write
 */
import "dotenv/config";
import { fetchSmartsheetById } from "../lib/smartsheet";
import { prisma } from "../lib/prisma";

const SHEETS: [string, string][] = [
  ["Sales Enquiry 3", "5621905471000452"],
  ["Sales Enquiry 2", "5185255758948228"],
  ["Sales Enquiry", "611531051296644"],
];
const EMAIL = "Email Subject Line  (Debosmita Nath)";
const ENQUIRY = "Enquiry / Tender No. (Marketing Team)";
const DOCKET = "Docket No  (Debosmita Nath)";
const PARTY = ["Party Name (Debosmita Nath)", "Party Name  (Debosmita Nath)"];
const MIN_REF_LEN = 6;
const APPLY = process.argv.includes("--apply");

type Row = { email: string; enquiry: string; docket: string; party: string };

async function loadSheet(id: string): Promise<Row[]> {
  const s = await fetchSmartsheetById(id);
  const col = (t: string) => s.columns.find((c) => c.title === t)?.id;
  const [e, q, d] = [col(EMAIL), col(ENQUIRY), col(DOCKET)];
  const p = PARTY.map(col).find(Boolean);
  if (!d) throw new Error(`Docket column missing in sheet ${s.name}`);
  const val = (cells: typeof s.rows[number]["cells"], id?: number) => {
    const c = cells.find((x) => x.columnId === id);
    return String(c?.displayValue ?? c?.value ?? "").trim();
  };
  return s.rows
    .map((r) => ({
      email: val(r.cells, e).toLowerCase(),
      enquiry: val(r.cells, q).toLowerCase(),
      docket: val(r.cells, d),
      party: val(r.cells, p),
    }))
    .filter((r) => r.docket);
}

// First sheet with a hit wins; within a sheet, email subject beats enquiry no.
function findMatch(sheets: [string, Row[]][], ref: string) {
  for (const [name, rows] of sheets) {
    for (const field of ["email", "enquiry"] as const) {
      const hits = rows.filter((r) => r[field] && r[field].includes(ref));
      if (!hits.length) continue;
      const dockets = new Set(hits.map((h) => h.docket));
      if (dockets.size > 1) return { ambiguous: [...dockets] };
      return { sheet: name, field, row: hits[0] };
    }
  }
  return null;
}

async function main() {
  const sheets: [string, Row[]][] = [];
  for (const [name, id] of SHEETS) sheets.push([name, await loadSheet(id)]);

  const blanks = await prisma.tenderMerged.findMany({
    where: { OR: [{ docketNo: null }, { docketNo: "" }], apm: "YES", participated: true },
    select: { id: true, referenceNo: true, erpPartyName: true },
  });

  let skippedShort = 0, notFound = 0, updated = 0;
  const ambiguous: string[] = [];
  const bySheet: Record<string, number> = {};

  for (const t of blanks) {
    const ref = (t.referenceNo ?? "").toLowerCase().trim();
    if (ref.length < MIN_REF_LEN) { skippedShort++; continue; }
    const m = findMatch(sheets, ref);
    if (!m) { notFound++; continue; }
    if ("ambiguous" in m) { ambiguous.push(`${t.referenceNo} -> ${m.ambiguous!.join(", ")}`); continue; }

    bySheet[m.sheet] = (bySheet[m.sheet] ?? 0) + 1;
    console.log(`${t.referenceNo} -> ${m.row.docket}  [${m.sheet} / ${m.field}]`);
    if (!APPLY) continue;

    const data: { docketNo: string; erpPartyName?: string } = { docketNo: m.row.docket };
    if (m.row.party && !t.erpPartyName?.trim()) data.erpPartyName = m.row.party;
    // Re-check blank at write time so a concurrent sync's docket is never overwritten.
    const res = await prisma.tenderMerged.updateMany({
      where: { id: t.id, OR: [{ docketNo: null }, { docketNo: "" }] },
      data,
    });
    updated += res.count;
  }

  console.log(JSON.stringify({
    mode: APPLY ? "APPLY" : "DRY RUN",
    blankApmYesParticipated: blanks.length,
    skippedShortRef: skippedShort,
    ambiguousSkipped: ambiguous.length,
    notFound,
    matchedBySheet: bySheet,
    updated,
  }, null, 2));
  if (ambiguous.length) console.log("Ambiguous:\n" + ambiguous.join("\n"));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
