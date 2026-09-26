/**
 * Self-check for the EPC filter -> ColumnFilterState translation. Run it with:
 *
 *   npx tsx lib/epc-table-query.check.ts
 *
 * No database and no React: buildEpcQueryFilters is pure.
 */
import assert from "node:assert/strict";
import { buildCountsQuery, buildEpcQueryFilters } from "@/lib/epc-table-query";
import type { TenderQuery } from "@/lib/tender-query";
import type { EpcTableFilters } from "@/components/TenderTable";

const NOW = new Date("2026-09-24T06:00:00.000Z"); // 11:30 IST, Thu 24 Sep 2026

function tableFilters(patch: Partial<EpcTableFilters> = {}): EpcTableFilters {
  return {
    multiSelectFilters: {},
    columnSearchText: {},
    startDate: "",
    endDate: "",
    datePreset: "",
    raStartFrom: "",
    raStartTo: "",
    raEndFrom: "",
    raEndTo: "",
    remarksTextFilter: "",
    remarksDropdownFilter: "All",
    proposedErpItemTextFilter: "",
    proposedErpItemCategoryFilter: "All",
    ...patch,
  };
}

let checks = 0;
function check(label: string, fn: () => void) {
  fn();
  checks++;
  void label;
}

const deadline = (out: ReturnType<typeof buildEpcQueryFilters>) =>
  out.columnFilters.lastDateOfSubmission;

// ------------------------------------------------------------- date window ---

check("a preset becomes an explicit window, not a select token", () => {
  const out = buildEpcQueryFilters({ table: tableFilters({ datePreset: "thisMonth" }), now: NOW });
  assert.equal(deadline(out).select, undefined);
  assert.deepEqual(deadline(out).dateRange, {
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  });
});

check("a preset still ANDs the page's own window", () => {
  const out = buildEpcQueryFilters({
    table: tableFilters({ datePreset: "thisYear" }),
    deadlineFrom: "2026-03-01",
    deadlineTo: "2026-06-30",
    now: NOW,
  });
  // Later start and earlier end win.
  assert.deepEqual(deadline(out).dateRange, {
    startDate: "2026-03-01",
    endDate: "2026-06-30",
  });
});

check("thisWeek is the IST Monday-Sunday week", () => {
  const out = buildEpcQueryFilters({ table: tableFilters({ datePreset: "thisWeek" }), now: NOW });
  assert.deepEqual(deadline(out).dateRange, {
    startDate: "2026-09-21",
    endDate: "2026-09-27",
  });
});

check("an ISO start date intersects with a YYYY-MM-DD page bound", () => {
  const out = buildEpcQueryFilters({
    table: tableFilters({ startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-10-31T18:29:59.999Z" }),
    deadlineFrom: "2026-01-01",
    now: NOW,
  });
  assert.deepEqual(deadline(out).dateRange, {
    startDate: "2026-10-01T00:00:00.000Z",
    endDate: "2026-10-31T18:29:59.999Z",
  });
});

check("the table's window is not clipped when the page sets no bound", () => {
  const out = buildEpcQueryFilters({
    table: tableFilters({ startDate: "2027-01-01", endDate: "2027-12-31" }),
    now: NOW,
  });
  assert.deepEqual(deadline(out).dateRange, {
    startDate: "2027-01-01",
    endDate: "2027-12-31",
  });
});

check("no dates anywhere leaves the column unfiltered", () => {
  const out = buildEpcQueryFilters({ table: tableFilters(), now: NOW });
  assert.equal(deadline(out), undefined);
});

check("the page window still applies before the table reports its state", () => {
  const out = buildEpcQueryFilters({ table: null, deadlineFrom: "2026-01-01", now: NOW });
  assert.deepEqual(deadline(out).dateRange, { startDate: "2026-01-01", endDate: "" });
});

// ----------------------------------------------------------------- selects ---

check("a multi-select passes its values through", () => {
  const out = buildEpcQueryFilters({
    table: tableFilters({ multiSelectFilters: { tenderType: ["Non-Gem"] } }),
    now: NOW,
  });
  assert.deepEqual(out.columnFilters.tenderType.select, ["Non-Gem"]);
});

check("boolean and blank tokens are normalized for SQL", () => {
  const out = buildEpcQueryFilters({
    table: tableFilters({ multiSelectFilters: { participated: ["Yes", "(Blank)"] } }),
    now: NOW,
  });
  assert.deepEqual(out.columnFilters.participated.select, ["true", "__blank__"]);
});

check("an empty selection is not a filter", () => {
  const out = buildEpcQueryFilters({
    table: tableFilters({ multiSelectFilters: { tenderType: [] } }),
    now: NOW,
  });
  assert.equal(out.columnFilters.tenderType, undefined);
});

// -------------------------------------------------------- text and ranges ---

check("column search text and a select coexist on one column", () => {
  const out = buildEpcQueryFilters({
    table: tableFilters({
      multiSelectFilters: { currentStatus: ["AWARDED"] },
      columnSearchText: { currentStatus: " award " },
    }),
    now: NOW,
  });
  assert.deepEqual(out.columnFilters.currentStatus, {
    select: ["AWARDED"],
    text: "award",
  });
});

check("RA windows land on their own columns", () => {
  const out = buildEpcQueryFilters({
    table: tableFilters({ raStartFrom: "2026-05-01", raEndTo: "2026-05-31" }),
    now: NOW,
  });
  assert.deepEqual(out.columnFilters.reverseAuctionStartDate.dateRange, {
    startDate: "2026-05-01",
    endDate: "",
  });
  assert.deepEqual(out.columnFilters.reverseAuctionEndDate.dateRange, {
    startDate: "",
    endDate: "2026-05-31",
  });
});

check("remarks takes both its text box and its dropdown", () => {
  const out = buildEpcQueryFilters({
    table: tableFilters({ remarksTextFilter: "hold", remarksDropdownFilter: "Follow up" }),
    now: NOW,
  });
  assert.deepEqual(out.columnFilters.remarks, { text: "hold", select: ["Follow up"] });
});

check("the raw-material ranges become one rawMaterials filter", () => {
  const out = buildEpcQueryFilters({
    table: tableFilters(),
    aluminiumMin: "100",
    copperMax: "900",
    now: NOW,
  });
  assert.deepEqual(out.columnFilters.rawMaterials.rawMaterials, {
    aluMin: "100",
    aluMax: "",
    cuMin: "",
    cuMax: "900",
  });
});

// ------------------------------------------------------- All means no filter --

check("All is not a filter, for either dropdown", () => {
  const out = buildEpcQueryFilters({
    table: tableFilters({ proposedErpItemCategoryFilter: "All", remarksDropdownFilter: "All" }),
    priceBasis: "All",
    now: NOW,
  });
  assert.equal(out.erpItemCategory, null);
  assert.equal(out.priceBasis, null);
  assert.equal(out.columnFilters.remarks, undefined);
});

check("a real category and price basis come through", () => {
  const out = buildEpcQueryFilters({
    table: tableFilters({ proposedErpItemCategoryFilter: "XLPE Cable" }),
    priceBasis: "Firm",
    now: NOW,
  });
  assert.equal(out.erpItemCategory, "XLPE Cable");
  assert.equal(out.priceBasis, "Firm");
});

const baseQuery: TenderQuery = {
  scope: "postParticipation",
  groupByDocket: true,
  erpItemCategory: null,
  priceBasis: null,
  columnFilters: {},
  participationFilters: [],
  analyticsFilter: null,
  exclusionFilter: null,
  associationFilter: null,
  fileDateFromIso: null,
  fileDateToIso: null,
  applyDefaultDeadlineFilter: false,
  mergedGroups: [],
  sort: null,
  page: 1,
  pageSize: 50,
};

check("counts query drops participation and table filters", () => {
  const out = buildCountsQuery({
    ...baseQuery,
    participationFilters: ["weL1", "technicalOpen"],
    columnFilters: { organisationName: { text: "NTPC" } },
    erpItemCategory: "XLPE Cable",
    priceBasis: "Firm",
    associationFilter: "7",
    analyticsFilter: "aiYes",
    exclusionFilter: "railways",
    fileDateFromIso: "2026-01-01T00:00:00.000Z",
    fileDateToIso: "2026-09-30T23:59:59.999Z",
  });
  assert.deepEqual(out.participationFilters, []);
  assert.equal(out.columnFilters.organisationName, undefined);
  assert.equal(out.erpItemCategory, null);
  assert.equal(out.priceBasis, null);
  assert.equal(out.associationFilter, null);
  assert.equal(out.analyticsFilter, null);
  assert.equal(out.exclusionFilter, null);
  assert.equal(out.fileDateFromIso, null);
  assert.equal(out.fileDateToIso, null);
});

check("counts query keeps the scope and the sidebar deadline window", () => {
  const out = buildCountsQuery(baseQuery, "2026-04-01", "2026-09-30");
  assert.equal(out.scope, "postParticipation");
  assert.equal(out.groupByDocket, true);
  assert.deepEqual(out.columnFilters.lastDateOfSubmission?.dateRange, {
    startDate: "2026-04-01",
    endDate: "2026-09-30",
  });
});

check("no sidebar window leaves columnFilters empty", () => {
  assert.deepEqual(buildCountsQuery(baseQuery).columnFilters, {});
  assert.deepEqual(buildCountsQuery(baseQuery, "", "  ").columnFilters, {});
});

console.log(`epc-table-query: ${checks} checks passed`);
