/**
 * Self-check for the filter formula. Run it with:
 *
 *   pnpm exec tsx components/v2/data-table/filter-formula.check.ts
 */
import assert from "node:assert/strict";
import { filterRefs, formatFilters, parseFilters } from "./filter-formula";
import type { DataTableColumn } from "./types";

type Row = Record<string, string>;
const noop = () => null;

const tenders: DataTableColumn<Row>[] = [
  { id: "status", header: "Status", filter: { type: "select" }, extraFilters: [{ id: "stage", label: "Stage" }] },
  { id: "bidEnd", header: "Bid End Date", filter: { type: "dateRange", presets: [{ value: "thisWeek", label: "This week" }] } },
  { id: "party", header: "Party" },
  { id: "aiYes", header: "AI Yes", search: false, filter: { type: "boolean" } },
  { id: "amount", header: "Amount", filter: { type: "custom", stateKey: "numberRange", render: noop, summary: noop } },
  { id: "rm", header: "Raw Materials", search: false, filter: { type: "custom", stateKey: "rawMaterials", render: noop, summary: noop } },
  { id: "dupA", header: "Code" },
  { id: "dupB", header: "Code" },
];
const refs = filterRefs(tenders);

const all = {
  status: { select: ["Open", 'He said "hi", AND left', "__blank__"], text: "op" },
  stage: { select: ["Bid"] },
  bidEnd: { dateRange: { startDate: "2026-01-01", endDate: "2026-03-31" } },
  party: { text: "abc ] [x]" },
  aiYes: { boolean: false },
  amount: { numberRange: { min: "", max: "1200.5" } },
  rm: { rawMaterials: { aluMin: "1", aluMax: "", cuMin: "", cuMax: "9" } },
  dupB: { text: "x" },
};

// Round trip.
const text = formatFilters(all, refs);
const back = parseFilters(text, refs);
assert.deepEqual(back.errors, []);
assert.deepEqual(back.filters, all);
assert.match(text, /\[Bid End Date\] BETWEEN 2026-01-01 AND 2026-03-31/);
assert.match(text, /\[dupB\] CONTAINS "x"/);

// Hand-written, loose case and spacing.
const typed = parseFilters('[status]   in ("Open")\n and [Bid End Date] >= 2026-05-01 and [AI YES] = yes', refs);
assert.deepEqual(typed.errors, []);
assert.deepEqual(typed.filters, {
  status: { select: ["Open"] },
  bidEnd: { dateRange: { startDate: "2026-05-01", endDate: "" } },
  aiYes: { boolean: true },
});

// Preset under IN.
assert.deepEqual(parseFilters('[Bid End Date] IN ("thisWeek")', refs).filters, { bidEnd: { select: ["thisWeek"] } });

// A formula from another page: every problem reported, nothing to apply.
const emd = filterRefs<Row>([{ id: "emdNo", header: "EMD No" }, { id: "paid", header: "Paid", filter: { type: "boolean" } }]);
const foreign = parseFilters(text, emd);
assert.ok(foreign.errors.length >= 6, foreign.errors.join("\n"));
assert.ok(foreign.errors.some((e) => e.includes("[Status] is not a column on this page")));

// Wrong operator or value for the column.
const wrong = parseFilters(
  '[Status] BETWEEN 1 AND 2 AND [Party] = YES AND [Bid End Date] <= 2026-02-30 AND [Amount] >= ten AND [AI Yes] CONTAINS "y" AND [Bid End Date] IN ("never")',
  refs,
);
assert.deepEqual(wrong.errors, [
  "[Status] has no date or number range filter",
  "[Party] has no Yes/No filter",
  "[Bid End Date]: 2026-02-30 is not a date (use YYYY-MM-DD)",
  "[Amount]: ten is not a number",
  "[AI Yes] cannot be searched with CONTAINS",
  '[Bid End Date]: unknown preset "never"',
]);

// Syntax.
assert.deepEqual(parseFilters("", refs).errors, ["The formula is empty"]);
assert.match(parseFilters("[Party] CONTAINS", refs).errors[0], /Expected a value at the end/);
assert.match(parseFilters('[Party] CONTAINS "a" [Status] IN ("b")', refs).errors[0], /Expected AND near \[Status\]/);
assert.match(parseFilters('[Party] CONTAINS "a', refs).errors[0], /closing quote/);
assert.match(parseFilters('[Party] CONTAINS "a" AND', refs).errors[0], /Expected a \[column\]/);

console.log("filter-formula: ok");

// A page filter's own check runs after parsing.
const withCheck = [{ id: "up", name: "Uploaded", filter: { type: "dateRange" as const }, search: false, check: (s: { dateRange?: { startDate: string; endDate: string } }) => (s.dateRange?.endDate ? null : "needs both dates") }];
assert.deepEqual(parseFilters("[Uploaded] >= 2026-01-01", withCheck).errors, ["[Uploaded]: needs both dates"]);
assert.deepEqual(parseFilters("[Uploaded] BETWEEN 2026-01-01 AND 2026-01-31", withCheck).errors, []);
console.log("filter-formula page check: ok");

// TODAY resolves to the day the formula is applied.
const day = "2026-10-21";
const range = (startDate: string, endDate: string) => ({ bidEnd: { dateRange: { startDate, endDate } } });
assert.deepEqual(parseFilters("[Bid End Date] = TODAY", refs, day).filters, range(day, day));
assert.deepEqual(parseFilters("[Bid End Date] >= today", refs, day).filters, range(day, ""));
assert.deepEqual(parseFilters("[Bid End Date] BETWEEN 2026-10-01 AND TODAY", refs, day).filters, range("2026-10-01", day));
assert.deepEqual(parseFilters("[Party] = TODAY", refs, day).errors, ["[Party] has no date filter"]);
assert.deepEqual(parseFilters("[Uploaded] = TODAY", withCheck, day).errors, []);
assert.deepEqual(parseFilters("[Bid End Date] BEFORE TODAY", refs, day).filters, range("", "2026-10-20"));
assert.deepEqual(parseFilters("[Bid End Date] AFTER 2026-10-01", refs, day).filters, range("2026-10-02", ""));
assert.deepEqual(parseFilters("[Bid End Date] = YESTERDAY", refs, day).filters, range("2026-10-20", "2026-10-20"));
console.log("filter-formula TODAY: ok");
