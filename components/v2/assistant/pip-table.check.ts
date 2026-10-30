/**
 * Self-check for how Pip sees a table. Run it with:
 *
 *   pnpm exec tsx components/v2/assistant/pip-table.check.ts
 */
import assert from "node:assert/strict";
import { filterRefs } from "../data-table/filter-formula";
import type { DataTableColumn } from "../data-table/types";
import { describeTable, fitValues, pipTable, registerPipTable, type PipTable } from "./pip-table";

type Row = Record<string, string>;

const many = Array.from({ length: 40 }, (_, i) => ({ value: `v${i}`, label: `V ${i}` }));
const columns: DataTableColumn<Row>[] = [
  { id: "status", header: "Status", filter: { type: "select", options: [{ value: "Open", label: "Open" }] } },
  { id: "org", header: "Org", search: false, filter: { type: "select", options: many } },
  { id: "bidEnd", header: "Bid End Date", search: false, filter: { type: "dateRange" } },
  { id: "aiYes", header: "AI Yes", search: false, filter: { type: "boolean" } },
  { id: "notes", header: "Notes", search: false },
];
const table: PipTable = {
  refs: filterRefs(columns),
  current: () => '[Status] IN ("Open")',
  apply: async () => [],
  values: async () => null,
};

const text = describeTable(table, "2026-10-29");
assert.match(text, /Today is 2026-10-29\./);
assert.match(text, /- \[Status\]: list \(IN; call list_filter_values for its values\); text search \(CONTAINS\)\. Known values: "Open"/);
assert.match(text, /- \[Bid End Date\]: date/);
assert.match(text, /- \[AI Yes\]: yes\/no/);
// Long option lists are cut so the prompt stays small.
assert.match(text, /"v29" \(V 29\), \.\.\./);
assert.doesNotMatch(text, /"v30"/);
// A column that cannot be filtered is left out.
assert.doesNotMatch(text, /\[Notes\]/);
assert.match(text, /Current filter: \[Status\] IN \("Open"\)/);

assert.equal(describeTable(null), "This page has no table to filter.");

// Only the table that registered last can unregister itself.
const off = registerPipTable(table);
const other = { ...table };
const offOther = registerPipTable(other);
off();
assert.equal(pipTable(), other);
offOther();
assert.equal(pipTable(), null);

// Values people say map to the stored ones; a boolean column stores "true" / "false".
const yesNo = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
  { value: "__blank__", label: "Blank" },
];
assert.deepEqual(fitValues(["YES"], yesNo), { values: ["true"], unknown: [] });
assert.deepEqual(fitValues(["true", "no"], yesNo), { values: ["true", "false"], unknown: [] });
assert.deepEqual(fitValues(["maybe"], yesNo), { values: [], unknown: ["maybe"] });
assert.match(describeTable({ ...table, refs: filterRefs([{ id: "p", header: "P", search: false, filter: { type: "select", options: yesNo } }]) }), /"true" \(Yes\)/);

console.log("pip-table: ok");
