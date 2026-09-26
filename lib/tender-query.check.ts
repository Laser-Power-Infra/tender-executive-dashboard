/**
 * Self-check for the filter -> SQL translator. Run it with:
 *
 *   npx tsx lib/tender-query.check.ts
 *
 * No database is touched: buildWhereSql is pure, so the assertions look at the
 * SQL text and the bound parameters it produces.
 */
import assert from "node:assert/strict";
import type { Prisma } from "@/generated/prisma/client";
import {
  buildOrderBySql,
  buildWhereSql,
  DOCKET_KEY_SQL,
  emptyTenderQuery,
  istDateKeyToUtcRange,
  needsFacetQuery,
  PARTICIPATION_FILTERS,
  participationChainSql,
  participationSql,
  TENDER_COLUMNS,
  type TenderQuery,
} from "@/lib/tender-query";
import type { ParticipationFilter } from "@/lib/slices/filtersSlice";
import { PARTICIPATION_CHAINS } from "@/components/participation-flow/tree";

const NOW = new Date("2026-09-22T06:00:00.000Z"); // 11:30 IST on 22 Sep 2026

function where(patch: Partial<TenderQuery>, skipColumn?: string): Prisma.Sql {
  return buildWhereSql({ ...emptyTenderQuery(), ...patch }, { now: NOW, skipColumn });
}

function text(sql: Prisma.Sql): string {
  return sql.text.replace(/\s+/g, " ").trim();
}

let checks = 0;
function check(label: string, fn: () => void) {
  fn();
  checks++;
  void label;
}

// ------------------------------------------------------------------ dates ---

check("IST day maps to a UTC half-open range", () => {
  const r = istDateKeyToUtcRange("2026-09-22");
  assert.equal(r.start.toISOString(), "2026-09-21T18:30:00.000Z");
  assert.equal(r.endExclusive.toISOString(), "2026-09-22T18:30:00.000Z");
});

check("no filters still hides past deadlines", () => {
  const sql = where({});
  assert.match(text(sql), /t\."deadline" IS NULL OR t\."deadline" >= \$1/);
  assert.equal(
    (sql.values[0] as Date).toISOString(),
    "2026-09-21T18:30:00.000Z",
  );
});

check("an explicit deadline filter replaces the implicit one", () => {
  const sql = where({
    columnFilters: { deadline: { dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" } } },
  });
  const t = text(sql);
  assert.equal(t.includes("IS NULL OR t.\"deadline\" >= $1 AND"), false);
  assert.equal(sql.values.length, 2);
  assert.equal((sql.values[0] as Date).toISOString(), "2025-12-31T18:30:00.000Z");
  // end of 31 Jan IST, exclusive
  assert.equal((sql.values[1] as Date).toISOString(), "2026-01-31T18:30:00.000Z");
});

check("deadline presets resolve against the supplied clock", () => {
  const sql = where({ columnFilters: { deadline: { select: ["thisMonth"] } } });
  assert.equal((sql.values[0] as Date).toISOString(), "2026-08-31T18:30:00.000Z");
  assert.equal((sql.values[1] as Date).toISOString(), "2026-09-30T18:30:00.000Z");
});

check("string date columns compare on the leading key and keep unparseable rows", () => {
  const sql = where({
    columnFilters: { bgDate: { dateRange: { startDate: "2026-01-01", endDate: "" } } },
  });
  const t = text(sql);
  assert.match(t, /left\(btrim\(t\."bgDate"::text\), 10\)/);
  assert.match(t, /!~ \$\d/);
  assert.deepEqual(sql.values.slice(0, 2), [
    "^\\s*[0-9]{4}-[0-9]{2}-[0-9]{2}",
    "2026-01-01",
  ]);
});

// ---------------------------------------------------------------- selects ---

check("plain select compares as text", () => {
  const sql = where({ columnFilters: { organization: { select: ["A", "B"] } } });
  assert.match(text(sql), /t\."organization"::text IN \(\$1,\s?\$2\)/);
  assert.deepEqual(sql.values.slice(0, 2), ["A", "B"]);
});

check("__blank__ also matches NOT_DECIDED", () => {
  const t = text(where({ columnFilters: { apm: { select: ["__blank__"] } } }));
  assert.match(t, /t\."apm"::text IS NULL/);
  assert.match(t, /t\."apm"::text = 'NOT_DECIDED'/);
});

check("not_analysed matches null or empty only", () => {
  const t = text(where({ columnFilters: { parseStatus: { select: ["not_analysed"] } } }));
  assert.match(t, /t\."parseStatus"::text IS NULL OR t\."parseStatus"::text = ''/);
  assert.equal(t.includes("NOT_DECIDED"), false);
});

check("assignedTo selects become a relation EXISTS", () => {
  const sql = where({ columnFilters: { assignedTo: { select: ["3", "7"] } } });
  const t = text(sql);
  assert.match(t, /EXISTS \(SELECT 1 FROM "tender_associations" ta/);
  assert.match(t, /ta\."associationId" IN \(\$1,\s?\$2\)/);
  assert.deepEqual(sql.values.slice(0, 2), [3, 7]);
});

check("assignedTo blank means no association at all", () => {
  const t = text(where({ columnFilters: { assignedTo: { select: ["__blank__"] } } }));
  assert.match(t, /NOT EXISTS \(SELECT 1 FROM "tender_associations"/);
});

check("tenderFileUrl reads the tagged tender_files row, not the scalar", () => {
  const sql = where({ columnFilters: { tenderFileUrl: { select: ["Available"] } } });
  const t = text(sql);
  assert.match(t, /FROM "tender_files" tf/);
  assert.match(t, /\$\d+ = ANY\(tf\."tags"\)/);
  assert.ok(sql.values.includes("tenderDocument"));
  // The stale scalar must not appear anywhere in the predicate.
  assert.equal(t.includes('t."tenderFileUrl"'), false);

  const not = text(where({ columnFilters: { tenderFileUrl: { select: ["Not Available"] } } }));
  assert.match(not, /IS NULL OR .* = ''/);
});

check("Available on any other column is just a value", () => {
  const sql = where({ columnFilters: { source: { select: ["Available"] } } });
  assert.match(text(sql), /t\."source"::text IN \(\$1\)/);
  assert.equal(sql.values[0], "Available");
});

// ------------------------------------------------------------ text/boolean ---

check("text filters are case-insensitive contains", () => {
  const sql = where({ columnFilters: { organization: { text: "rail" } } });
  assert.match(text(sql), /t\."organization"::text ILIKE \$1/);
  assert.equal(sql.values[0], "%rail%");
});

check("boolean false also matches null, like the client did", () => {
  assert.match(
    text(where({ columnFilters: { participated: { boolean: true } } })),
    /t\."participated"::text = 'true'/,
  );
  assert.match(
    text(where({ columnFilters: { participated: { boolean: false } } })),
    /t\."participated"::text IS DISTINCT FROM 'true'/,
  );
});

// ----------------------------------------------------------- raw materials ---

check("raw materials range walks the JSON blob safely", () => {
  const sql = where({
    columnFilters: {
      rawMaterials: {
        rawMaterials: { aluMin: "100", aluMax: "500", cuMin: "", cuMax: "" },
      },
    },
  });
  const t = text(sql);
  assert.match(t, /jsonb_each_text\(CASE WHEN t\."rawMaterials" ~ \$\d/);
  assert.match(t, /ELSE '\{\}'::jsonb END\)/);
  assert.match(t, /lower\(btrim\(kv\.k\)\) !~ \$\d/); // the isAlu "alloy" veto
  assert.ok(sql.values.includes("^(al$|alumi(ni|n|mi)um)"));
  assert.ok(sql.values.includes("alloy"));
  assert.ok(sql.values.includes(100));
  assert.ok(sql.values.includes(500));
});

check("copper has no alloy veto", () => {
  const sql = where({
    columnFilters: {
      rawMaterials: { rawMaterials: { aluMin: "", aluMax: "", cuMin: "1", cuMax: "" } },
    },
  });
  assert.ok(sql.values.includes("(^cu$|copper)"));
  assert.equal(sql.values.includes("alloy"), false);
});

check("an empty raw materials range is not a filter", () => {
  const sql = where({
    columnFilters: {
      rawMaterials: { rawMaterials: { aluMin: "", aluMax: "", cuMin: "", cuMax: "" } },
    },
  });
  assert.equal(text(sql).includes("jsonb_each_text"), false);
});

// ---------------------------------------------------------- participation ---

const ALL_PARTICIPATION: ParticipationFilter[] = [
  "participated",
  "notParticipated",
  "upcomingRa",
  "participatedWithRa",
  "participatedWithoutRa",
  "yetToOpenRa",
  "bidOpeningPendingExclRa",
  "participatedTotal",
  "raDone",
  "raPending",
  "technicalOpen",
  "technicalNotOpen",
  "weL1",
  "weLost",
  "expRaDate",
  "contractReceived",
  "contractPending",
  "financialOpen",
  "financialNotOpen",
  "financialWeL1",
  "financialWeLost",
  "financialContractReceived",
  "financialContractPending",
];

check("every participation filter produces SQL", () => {
  for (const f of ALL_PARTICIPATION) {
    const t = text(participationSql(f, NOW));
    assert.ok(t.length > 0, `${f} produced empty SQL`);
    assert.ok(t.startsWith("("), `${f} is not parenthesised: ${t}`);
  }
});

check("participation filters AND together", () => {
  const t = text(where({ participationFilters: ["weL1", "technicalOpen"] }));
  assert.match(t, /upper\(btrim\(coalesce\(t\."ourRank", ''\)\)\) IN \('1', 'L1'\)/);
  assert.match(t, /upper\(btrim\(coalesce\(t\."currentStatus", ''\)\)\) IN/);
});

check("notParticipated means undecided, not false", () => {
  assert.match(text(participationSql("notParticipated", NOW)), /t\."participated" IS NULL/);
});

check("weLost keeps rows with no rank", () => {
  assert.match(
    text(participationSql("weLost", NOW)),
    /NOT upper\(btrim\(coalesce\(t\."ourRank", ''\)\)\) IN \('1', 'L1'\)/,
  );
});

// ------------------------------------------------- analytics and exclusion ---

check("analytics filters use the association relation", () => {
  assert.match(
    text(where({ analyticsFilter: "apmYesUnallocated" })),
    /t\."apm"::text = 'YES' AND NOT EXISTS/,
  );
  assert.match(text(where({ analyticsFilter: "aiYes" })), /t\."aiRelevanceValid" IS TRUE/);
});

check("exclusion keeps rows with no category", () => {
  const sql = where({ exclusionFilter: "both" });
  const t = text(sql);
  assert.match(t, /t\."excludedCategory" IS NULL OR t\."excludedCategory" = '' OR NOT/);
  assert.ok(sql.values.includes("%cable%"));
  assert.ok(sql.values.includes("%conductors%"));
});

check("file date window filters through the files relation", () => {
  const sql = where({
    fileDateFromIso: "2026-01-01T00:00:00.000Z",
    fileDateToIso: "2026-09-22T23:59:59.999Z",
  });
  assert.match(text(sql), /EXISTS \(SELECT 1 FROM "files" f WHERE f\."id" = t\."fileId"/);
});

// ------------------------------------------------------------ safety/sort ---

check("unknown accessors are ignored, not interpolated", () => {
  const t = text(
    where({ columnFilters: { "id; DROP TABLE tender_merged": { text: "x" } } }),
  );
  assert.equal(t.includes("DROP TABLE"), false);
});

check("skipColumn drops that column's own filters", () => {
  const patch: Partial<TenderQuery> = {
    columnFilters: { organization: { select: ["A"] }, source: { select: ["B"] } },
  };
  assert.equal(text(where(patch, "organization")).includes('t."organization"'), false);
  assert.match(text(where(patch, "organization")), /t\."source"::text IN/);
});

check("sort is always id-tiebroken", () => {
  const base = emptyTenderQuery();
  assert.equal(text(buildOrderBySql(base)), 't."id" DESC');
  assert.equal(
    text(buildOrderBySql({ ...base, sort: { column: "deadline", direction: "asc" } })),
    't."deadline" ASC NULLS FIRST, t."id" ASC',
  );
  assert.equal(
    text(buildOrderBySql({ ...base, sort: { column: "nope", direction: "asc" } })),
    't."id" DESC',
  );
  assert.match(
    text(buildOrderBySql({ ...base, sort: { column: "rawMaterials", direction: "desc" } })),
    /SELECT count\(\*\) FROM jsonb_each_text/,
  );
});

check("the column allow-list came from the generated client", () => {
  assert.ok(TENDER_COLUMNS.has("referenceNo"));
  assert.ok(TENDER_COLUMNS.has("reverseAuctionStartDate"));
  assert.equal(TENDER_COLUMNS.has("assignedTo"), true); // a real column too
  assert.equal(TENDER_COLUMNS.has("itemSchedules"), false); // derived only
});


// ----------------------------------------------- derived / merged columns ---

const GROUP_ORG = {
  label: "Org @ Dept",
  separator: " @ ",
  fields: ["organization", "departmentName"],
};

check("type maps to the tenderType enum, not a column", () => {
  const t = text(where({ columnFilters: { type: { select: ["Gem"] } } }));
  assert.match(t, /CASE WHEN t\."tenderType"::text = 'GEM' THEN 'Gem' ELSE 'Non-Gem' END/);
});

check("costing-derived columns read CostingSheetDetails, not the scalar", () => {
  const t = text(where({ columnFilters: { cva: { select: ["__blank__"] } } }));
  assert.match(t, /FROM "CostingSheetDetails" csd/);
  assert.equal(t.includes('t."cva"'), false);
});

check("proposedErpQuantity keys off the item name, like flattenTender", () => {
  const t = text(where({ columnFilters: { proposedErpQuantity: { select: ["__blank__"] } } }));
  assert.match(t, /csd\."proposedErpItemName"/);
  assert.equal(t.includes('t."proposedErpQuantity"'), false);
});

check("relation-dump columns only answer blank vs not blank", () => {
  const t = text(where({ columnFilters: { reportings: { select: ["__blank__"] } } }));
  assert.match(t, /EXISTS \(SELECT 1 FROM "reportings" r WHERE r\."tenderMergedId" = t\."id"\)/);
});

check("assignedDate is the earliest assignment in IST", () => {
  const t = text(
    where({ columnFilters: { assignedDate: { dateRange: { startDate: "2026-01-01", endDate: "" } } } }),
  );
  assert.match(t, /min\(ta\."createdAt"\)/);
  assert.match(t, /interval '5 hours 30 minutes'/);
});

check("a merged column concatenates its fields", () => {
  const sql = where({
    mergedGroups: [GROUP_ORG],
    columnFilters: { "Org @ Dept": { select: ["A @ B"] } },
  });
  const t = text(sql);
  assert.match(t, /concat_ws\(\$\d+, NULLIF\(t\."organization"::text, ''\), NULLIF\(t\."departmentName"::text, ''\)\)/);
  assert.ok(sql.values.includes(" @ "));
  assert.ok(sql.values.includes("A @ B"));
});

check("a blank separator means the first field verbatim", () => {
  const t = text(
    where({
      mergedGroups: [{ label: "Size", separator: "", fields: ["size", "quantity"] }],
      columnFilters: { Size: { text: "x" } },
    }),
  );
  assert.match(t, /t\."size"::text ILIKE/);
  assert.equal(t.includes("concat_ws"), false);
  assert.equal(t.includes('t."quantity"'), false);
});

check("a merged field that is itself derived nests correctly", () => {
  const t = text(
    where({
      mergedGroups: [{ label: "Doc", separator: " / ", fields: ["tenderFileUrl", "website"] }],
      columnFilters: { Doc: { text: "pdf" } },
    }),
  );
  assert.match(t, /FROM "tender_files" tf/);
  assert.match(t, /t\."website"::text/);
});

check("an unknown merged field contributes an empty string", () => {
  const t = text(
    where({
      mergedGroups: [{ label: "Mix", separator: " @ ", fields: ["organization", "someExcelHeader"] }],
      columnFilters: { Mix: { text: "x" } },
    }),
  );
  assert.match(t, /NULLIF\(''\, ''\)|NULLIF\('', ''\)/);
});

check("a merged column sorts by its concatenation", () => {
  const q: TenderQuery = {
    ...emptyTenderQuery(),
    mergedGroups: [GROUP_ORG],
    sort: { column: "Org @ Dept", direction: "asc" },
  };
  const t = text(buildOrderBySql(q));
  assert.match(t, /concat_ws/);
  assert.match(t, /ASC NULLS FIRST, t\."id" ASC/);
});

check("unknown sort columns still fall back to id", () => {
  const q: TenderQuery = { ...emptyTenderQuery(), sort: { column: "nope", direction: "asc" } };
  assert.equal(text(buildOrderBySql(q)), 't."id" DESC');
});

// ------------------------------------------------------------------ facets ---

check("only columns without hardcoded options hit the database", () => {
  const q: TenderQuery = { ...emptyTenderQuery(), mergedGroups: [GROUP_ORG] };
  for (const c of ["tenderFileUrl", "website", "assignedTo", "apm", "price", "cva", "deadline", "reportings"]) {
    assert.equal(needsFacetQuery(c, q), false, `${c} should not query`);
  }
  for (const c of ["organization", "currentStatus", "Org @ Dept", "type"]) {
    assert.equal(needsFacetQuery(c, q), true, `${c} should query`);
  }
  assert.equal(needsFacetQuery("someExcelHeader", q), false);
});


// ------------------------------------------------------ scopes and EPC SQL ---

function epc(scope: TenderQuery["scope"], patch: Partial<TenderQuery> = {}): string {
  return text(where({ scope, groupByDocket: true, applyDefaultDeadlineFilter: false, ...patch }));
}

check("/tenders adds no scope predicate", () => {
  assert.equal(text(where({ applyDefaultDeadlineFilter: false })), "TRUE");
});

check("home is APM yes, undecided, deadline still ahead", () => {
  const t = epc("home");
  assert.match(t, /t\."apm"::text = 'YES'/);
  assert.match(t, /t\."participated" IS NULL/);
  assert.match(t, /t\."deadline" IS NOT NULL/);
  assert.match(t, /t\."deadline" >= \$/);
});

check("post participation is APM yes and participated, with no deadline rule", () => {
  const t = epc("postParticipation");
  assert.match(t, /t\."participated" IS TRUE/);
  assert.equal(/deadline/.test(t), false);
});

check("not participated keeps explicit noes regardless of deadline", () => {
  const t = epc("notParticipated");
  assert.match(t, /t\."participated" IS FALSE OR/);
  assert.match(t, /t\."deadline" < \$/);
});

check("EPC accessors resolve to their real columns", () => {
  const t = epc("home", { columnFilters: { nameOfTheClient: { select: ["NTPC"] } } });
  assert.match(t, /t\."organization"::text IN \(\$/);
  assert.equal(/nameOfTheClient/.test(t), false);
});

check("lastDateOfSubmission ranges compare deadline as an instant", () => {
  const t = epc("home", {
    columnFilters: {
      lastDateOfSubmission: { dateRange: { startDate: "2026-09-01", endDate: "2026-09-30" } },
    },
  });
  assert.match(t, /t\."deadline" >= \$/);
  assert.match(t, /t\."deadline" < \$/);
});

check("a deadline preset still works through the EPC accessor", () => {
  const t = epc("home", { columnFilters: { lastDateOfSubmission: { select: ["thisMonth"] } } });
  assert.match(t, /t\."deadline" >= \$/);
});

check("reverseAuctionApplicable follows raQualificationRule on the EPC pages", () => {
  const t = epc("postParticipation", {
    columnFilters: { reverseAuctionApplicable: { boolean: true } },
  });
  assert.match(t, /raQualificationRule/);
});

check("/tenders keeps the raw reverseAuctionApplicable column", () => {
  const t = text(
    where({
      applyDefaultDeadlineFilter: false,
      columnFilters: { reverseAuctionApplicable: { boolean: true } },
    }),
  );
  assert.match(t, /t\."reverseAuctionApplicable"::text = 'true'/);
  assert.equal(/raQualificationRule/.test(t), false);
});

check("participationSql still reads the raw RA column, like the flow chart", () => {
  const t = text(participationSql("raDone", NOW));
  assert.match(t, /t\."reverseAuctionApplicable" IS TRUE/);
  assert.equal(/raQualificationRule/.test(t), false);
});

check("an empty tenderUpdateStatus reads as OPEN", () => {
  const t = epc("postParticipation", { columnFilters: { tenderUpdateStatus: { select: ["OPEN"] } } });
  assert.match(t, /coalesce\(nullif\(btrim\(t\."tenderUpdateStatus"\), ''\), 'OPEN'\)/);
});

check("tenderPrepareBy filters on association names", () => {
  const t = epc("home", { columnFilters: { tenderPrepareBy: { text: "ravi" } } });
  assert.match(t, /string_agg\(a\."name"/);
});

check("an unfilterable EPC accessor is skipped", () => {
  const t = epc("home", { columnFilters: { attachmentUrl: { text: "x" } } });
  assert.equal(/attachmentUrl/.test(t), false);
});

check("the XLPE ERP category excludes AB cable", () => {
  const sql = where({
    scope: "home",
    groupByDocket: true,
    applyDefaultDeadlineFilter: false,
    erpItemCategory: "XLPE Cable",
  });
  assert.match(text(sql), /FROM "CostingSheetDetails" csd/);
  assert.match(text(sql), /NOT LIKE \$/);
  assert.equal(sql.values.includes("%ab cable%"), true);
});

check("an unknown ERP category filters nothing", () => {
  assert.equal(/CostingSheetDetails/.test(epc("home", { erpItemCategory: "nope" })), false);
});

check("price basis treats a blank column as Firm", () => {
  const sql = where({
    scope: "home",
    groupByDocket: true,
    applyDefaultDeadlineFilter: false,
    priceBasis: "Firm",
  });
  assert.match(text(sql), /coalesce\(nullif\(btrim\(t\."price"\), ''\), 'firm'\)/);
  assert.equal(sql.values.includes("firm"), true);
});

check("All means no price filter", () => {
  assert.equal(/price/.test(epc("home", { priceBasis: "All" })), false);
});

check("the association filter can be skipped for person counts", () => {
  const q: TenderQuery = { ...emptyTenderQuery(), scope: "home", associationFilter: "7" };
  assert.match(text(buildWhereSql(q, { now: NOW })), /tender_associations/);
  assert.equal(
    /tender_associations/.test(text(buildWhereSql(q, { now: NOW, skipAssociationFilter: true }))),
    false,
  );
});

check("the docket key uppercases and falls back to the row id", () => {
  const t = text(DOCKET_KEY_SQL);
  assert.match(t, /upper\(btrim\(t\."docketNo"\)\)/);
  assert.match(t, /'__row_' \|\| t\."id"::text/);
});

check("every participation filter has a runtime entry", () => {
  assert.equal(PARTICIPATION_FILTERS.length, 23);
  for (const f of PARTICIPATION_FILTERS) {
    assert.ok(text(participationSql(f, NOW)).length > 0);
  }
});

check("EPC sorting uses the real column, not the accessor", () => {
  const q: TenderQuery = {
    ...emptyTenderQuery(),
    scope: "home",
    sort: { column: "lastDateOfSubmission", direction: "desc" },
  };
  assert.match(text(buildOrderBySql(q)), /t\."deadline" DESC NULLS LAST/);
});

check("EPC dropdowns only query for columns that can offer values", () => {
  const q: TenderQuery = { ...emptyTenderQuery(), scope: "home" };
  for (const c of ["lastDateOfSubmission", "rawMaterials", "remarks", "participated", "attachmentUrl", "files"]) {
    assert.equal(needsFacetQuery(c, q), false, `${c} should not query`);
  }
  for (const c of ["nameOfTheClient", "currentStatus", "tenderPrepareBy"]) {
    assert.equal(needsFacetQuery(c, q), true, `${c} should query`);
  }
});


check("an EPC deadline window drops undated rows", () => {
  const t = epc("postParticipation", {
    columnFilters: { lastDateOfSubmission: { dateRange: { startDate: "2026-01-01", endDate: "" } } },
  });
  assert.match(t, /t\."deadline" IS NOT NULL AND/);
});

check("a /tenders deadline window keeps undated rows", () => {
  const t = text(
    where({
      applyDefaultDeadlineFilter: false,
      columnFilters: { deadline: { dateRange: { startDate: "2026-01-01", endDate: "" } } },
    }),
  );
  assert.match(t, /t\."deadline" IS NULL OR/);
});

check("a flow node's chain is its ancestors then itself", () => {
  assert.deepEqual(PARTICIPATION_CHAINS.weLost, [
    "participatedWithRa",
    "raDone",
    "weLost",
  ]);
  assert.deepEqual(PARTICIPATION_CHAINS.financialContractPending, [
    "participatedWithoutRa",
    "technicalOpen",
    "financialOpen",
    "financialWeL1",
    "financialContractPending",
  ]);
  // Keyed by filter, not node id: the branch roots' ids differ from their filters.
  assert.ok(!("withRa" in PARTICIPATION_CHAINS));
  assert.ok("participatedWithRa" in PARTICIPATION_CHAINS);
});

check("the chain ANDs the branch a node does not carry itself", () => {
  // weLost alone is "participated and not rank 1" - it would outcount raDone.
  assert.doesNotMatch(text(participationSql("weLost", NOW)), /reverseAuctionApplicable/);
  const chained = text(participationChainSql("weLost", NOW));
  assert.match(chained, /reverseAuctionApplicable" IS TRUE/);
  assert.match(chained, /reverseAuctionStartDate" IS NOT NULL/);
});

check("a filter that is not a flow node is left alone", () => {
  for (const f of ["participated", "notParticipated", "upcomingRa"] as ParticipationFilter[]) {
    assert.equal(text(participationChainSql(f, NOW)), text(participationSql(f, NOW)));
  }
});

check("every flow node's chain is at least as narrow as its parent's", () => {
  for (const [filter, chain] of Object.entries(PARTICIPATION_CHAINS)) {
    const parent = chain!.slice(0, -1);
    if (parent.length === 0) continue;
    const parentText = text(
      participationChainSql(parent[parent.length - 1] as ParticipationFilter, NOW),
    );
    // The child's chain is the parent's chain plus one more conjunct.
    assert.ok(
      text(participationChainSql(filter as ParticipationFilter, NOW)).startsWith(parentText),
      `${filter} does not extend its parent's chain`,
    );
  }
});

check("rank 1 is recorded as either 1 or L1", () => {
  const t = text(participationSql("weL1", NOW));
  assert.match(t, /IN \('1', 'L1'\)/);
  assert.match(text(participationSql("weLost", NOW)), /NOT .*IN \('1', 'L1'\)/);
});

check("a deadline window with no start keeps the implicit floor", () => {
  // End-only used to emit (deadline < $1) with nothing below it, and suppress
  // the implicit floor as well: 36,646 of 36,953 rows, oldest deadline 0224-07-30.
  const sql = where({
    columnFilters: { deadline: { dateRange: { startDate: "", endDate: "2026-09-29" } } },
  });
  const t = text(sql);
  assert.match(t, /t\."deadline" >= \$/); // the implicit floor
  assert.match(t, /t\."deadline" < \$/); // the user's own ceiling
  // Column filters are emitted before the implicit rule, so the floor is last.
  assert.deepEqual(
    (sql.values as Date[]).map((v) => v.toISOString()),
    ["2026-09-29T18:30:00.000Z", "2026-09-21T18:30:00.000Z"],
  );
});

check("a cleared deadline range does not degrade the whole WHERE to TRUE", () => {
  const t = text(where({ columnFilters: { deadline: { dateRange: { startDate: "", endDate: "" } } } }));
  assert.notEqual(t, "TRUE");
  assert.match(t, /t\."deadline" IS NULL OR t\."deadline" >= \$1/);
});

check("a start bound is the user's own floor, never doubled", () => {
  const t = text(
    where({ columnFilters: { deadline: { dateRange: { startDate: "2026-09-25", endDate: "" } } } }),
  );
  assert.equal(t.match(/t\."deadline" >= \$/g)?.length, 1);
});

check("a recognised preset still replaces the implicit floor", () => {
  const sql = where({ columnFilters: { deadline: { select: ["thisMonth"] } } });
  assert.equal(sql.values.length, 2); // no third param from the implicit rule
  assert.equal((sql.values[0] as Date).toISOString(), "2026-08-31T18:30:00.000Z");
});

check("an unrecognised preset token does not swallow the typed window", () => {
  const t = text(
    where({
      columnFilters: {
        deadline: {
          select: ["Gem"],
          dateRange: { startDate: "2026-09-25", endDate: "2026-09-29" },
        },
      },
    }),
  );
  assert.match(t, /t\."deadline" >= \$/);
  assert.match(t, /t\."deadline" < \$/);
  assert.notEqual(t, "TRUE");
  // The token is ignored, not matched as a literal deadline value - doing that
  // ANDed in `t."deadline"::text IN ('Gem')` and returned zero rows.
  assert.equal(/Gem/.test(t), false);
  assert.equal(t.includes("::text IN"), false);
});

console.log(`tender-query: ${checks} checks passed`);
