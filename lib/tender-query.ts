import { Prisma } from "@/generated/prisma/client";
import type { ColumnFilterState } from "@/lib/types";
import type {
  AnalyticsFilter,
  DeadlinePreset,
  ParticipationFilter,
} from "@/lib/slices/filtersSlice";
import {
  getISTMonthRange,
  getISTWeekRange,
  getISTYearRange,
  toISTDateKey,
} from "@/lib/format-ist";
import {
  ALU_KEY_SQL_EXCLUDE,
  ALU_KEY_SQL_PATTERN,
  CU_KEY_SQL_PATTERN,
} from "@/lib/rawMaterials";
import { needsFacetQuery as needsFacetQueryMeta } from "@/lib/tender-filter-meta";
// Pure tree data, no React - the flow chart's ancestry is the one source of truth.
import { PARTICIPATION_CHAINS } from "@/components/participation-flow/tree";
import {
  EPC_TO_FLAT,
  EPC_UNFILTERABLE,
  epcNeedsFacetQuery,
} from "@/lib/epc-column-map";

/**
 * Which dashboard route a query belongs to.
 *
 * "tenders" is the /tenders page and adds no predicate of its own. The other
 * three mirror the row filters that lived in lib/selectors/tenderSelectors.ts,
 * and they are ANDed unconditionally so a user cannot clear them away with the
 * Reset Filters button.
 */
export type TenderScope =
  | "tenders"
  | "home"
  | "postParticipation"
  | "notParticipated";

/** A user-defined merged column: one header stitched from several fields. */
export interface MergedGroup {
  label: string;
  separator: string;
  fields: string[];
}

/**
 * Serialized filter state for the /tenders page.
 *
 * Mirrors what the client used to evaluate in memory over all ~34k rows:
 * filtersSlice.columnFilters plus the participation / analytics / exclusion
 * filters and the file-date window that lived in the reselect chain.
 */
export interface TenderQuery {
  scope: TenderScope;
  /**
   * Page over distinct docket keys instead of rows - TenderTable renders one
   * rowSpan'd docketNo cell per group, so the page unit has to be the group.
   */
  groupByDocket: boolean;
  /** One of the five hardcoded proposedErpItemName rule sets, or null. */
  erpItemCategory: string | null;
  /** "Firm" / "Variable" from the sidebar; null or "All" means no filter. */
  priceBasis: string | null;
  columnFilters: Record<string, ColumnFilterState>;
  participationFilters: ParticipationFilter[];
  analyticsFilter: AnalyticsFilter;
  exclusionFilter: string | null;
  associationFilter: string | null;
  /**
   * Already-resolved instants (ISO). Computed client-side so the window does
   * not shift with the server's timezone. See selectDateFilteredRows.
   */
  fileDateFromIso: string | null;
  fileDateToIso: string | null;
  /** The implicit "hide past deadlines" rule in OptimizedTenderTable. */
  applyDefaultDeadlineFilter: boolean;
  /** column_groups rows, so merged columns can be filtered and sorted. */
  mergedGroups: MergedGroup[];
  sort: { column: string; direction: "asc" | "desc" } | null;
  page: number;
  pageSize: number;
}

export function emptyTenderQuery(): TenderQuery {
  return {
    scope: "tenders",
    groupByDocket: false,
    erpItemCategory: null,
    priceBasis: null,
    columnFilters: {},
    participationFilters: [],
    analyticsFilter: null,
    exclusionFilter: null,
    associationFilter: null,
    fileDateFromIso: null,
    fileDateToIso: null,
    applyDefaultDeadlineFilter: true,
    mergedGroups: [],
    sort: null,
    page: 1,
    pageSize: 50,
  };
}

// ---------------------------------------------------------------- columns ---

/** Every real column on tender_merged, straight from the generated client. */
export const TENDER_COLUMNS: ReadonlySet<string> = new Set(
  Object.keys(Prisma.TenderMergedScalarFieldEnum),
);

/** Columns Prisma maps to a real DateTime. Everything else compares as text. */
const DATETIME_COLUMNS: ReadonlySet<string> = new Set([
  "deadline",
  "tenderOpeningDate",
  "reverseAuctionDate",
  "reverseAuctionStartDate",
  "reverseAuctionEndDate",
  "emdValidity",
  "publishedDate",
  "baseDate",
  "createdAt",
  "updatedAt",
]);


/**
 * The docket a row belongs to, as dedupeByDocketNo sees it (lib/docket.ts:12).
 *
 * A blank docketNo is its own group, so every count using this expression
 * agrees with countUniqueDockets and with TenderTable's getDocketGroupKey.
 */
export const DOCKET_KEY_SQL = Prisma.sql`coalesce(nullif(upper(btrim(t."docketNo")), ''), '__row_' || t."id"::text)`;

/** Quoted column reference. Never call with unvalidated input. */
function col(name: string): Prisma.Sql {
  if (!TENDER_COLUMNS.has(name)) {
    throw new Error(`tender-query: unknown column ${JSON.stringify(name)}`);
  }
  return Prisma.raw(`t."${name}"`);
}

// ------------------------------------------------------ derived value SQL ---

const EMPTY_TEXT = Prisma.sql`''`;

/** flattenTender writes tenderFiles tagged like this into their own columns. */
function taggedFileUrlSql(tag: string): Prisma.Sql {
  return Prisma.sql`coalesce((SELECT tf."url" FROM "tender_files" tf WHERE tf."tenderMergedId" = t."id" AND ${tag} = ANY(tf."tags") ORDER BY tf."id" ASC LIMIT 1), '')`;
}

/** costingFileUrl rewrites non-sheet sources to an internal viewer link. */
const COSTING_FILE_URL_SQL = Prisma.sql`coalesce((SELECT CASE WHEN tf."source" IS NOT NULL AND tf."source" <> 'SHEET_SYNC' THEN '/api/executive-files/view/' || tf."source" ELSE tf."url" END FROM "tender_files" tf WHERE tf."tenderMergedId" = t."id" AND 'costingAttachment' = ANY(tf."tags") ORDER BY tf."id" ASC LIMIT 1), '')`;

/**
 * Distinct non-empty values of one CostingSheetDetails field, comma-joined.
 *
 * ponytail: the cell actually holds a JSON array, so this is not string-equal
 * to what the user sees. These columns are in UNIQUE_OPTION_SKIP and have
 * never offered dropdown values, so only Blank and "contains" matter, and
 * joined text serves both better than a JSON blob would. Filter the child
 * table directly if exact per-item matching is ever needed.
 */
function costingAggSql(field: string): Prisma.Sql {
  const ref = Prisma.raw(`csd."${field}"`);
  return Prisma.sql`coalesce((SELECT string_agg(DISTINCT btrim(${ref}), ', ') FROM "CostingSheetDetails" csd WHERE csd."tenderMergedId" = t."id" AND btrim(coalesce(${ref}, '')) <> ''), '')`;
}

const TYPE_TESTS_SQL = Prisma.sql`coalesce((SELECT string_agg(DISTINCT tt."testCertificateNo", ', ') FROM "CostingSheetDetails" csd JOIN "type_tests" tt ON upper(btrim(tt."itemCode")) = upper(btrim(csd."itemCode")) WHERE csd."tenderMergedId" = t."id"), '')`;

/** Blank vs not-blank for a column that renders a JSON dump of a relation. */
function relationPresentSql(table: string): Prisma.Sql {
  const ref = Prisma.raw(`"${table}"`);
  return Prisma.sql`CASE WHEN EXISTS (SELECT 1 FROM ${ref} r WHERE r."tenderMergedId" = t."id") THEN '1' ELSE '' END`;
}

const ASSIGNED_TO_SQL = Prisma.sql`coalesce((SELECT string_agg(ta."associationId"::text, ',' ORDER BY ta."id") FROM "tender_associations" ta WHERE ta."tenderMergedId" = t."id"), '')`;

/** Earliest assignment date as an IST calendar key, matching flattenTender. */
const ASSIGNED_DATE_SQL = Prisma.sql`coalesce(to_char((SELECT min(ta."createdAt") FROM "tender_associations" ta WHERE ta."tenderMergedId" = t."id") + interval '5 hours 30 minutes', 'YYYY-MM-DD'), '')`;

const TENDER_TYPE_SQL = Prisma.sql`CASE WHEN t."tenderType"::text = 'GEM' THEN 'Gem' ELSE 'Non-Gem' END`;

const DERIVED_VALUE_SQL: Record<string, Prisma.Sql> = {
  type: TENDER_TYPE_SQL,
  assignedTo: ASSIGNED_TO_SQL,
  assignedDate: ASSIGNED_DATE_SQL,
  tenderFileUrl: taggedFileUrlSql("tenderDocument"),
  costingFileUrl: COSTING_FILE_URL_SQL,
  itemSchedules: costingAggSql("itemSchedule"),
  cva: costingAggSql("cva"),
  proposedErpItemName: costingAggSql("proposedErpItemName"),
  // flattenTender gates the quantity string on proposedErpItemName being set.
  proposedErpQuantity: costingAggSql("proposedErpItemName"),
  typeTests: TYPE_TESTS_SQL,
  typetest: TYPE_TESTS_SQL,
  tenderFiles: relationPresentSql("tender_files"),
  reportings: relationPresentSql("reportings"),
  evaluations: relationPresentSql("evaluations"),
  costingDetails: relationPresentSql("CostingSheetDetails"),
};

/**
 * Expressions that hold only for the EPC pages, because
 * mapTenderSliceToEpcRecords derives the displayed value instead of copying the
 * scalar. They are NOT applied to /tenders, which renders the raw flat row -
 * overriding them there would silently change that page's filters.
 */
const EPC_DERIVED_VALUE_SQL: Record<string, Prisma.Sql> = {
  // mapTenderSliceToEpcRecords:73-79 - a non-empty raQualificationRule forces
  // true, otherwise the stored tri-state.
  reverseAuctionApplicable: Prisma.sql`CASE WHEN btrim(coalesce(t."raQualificationRule", '')) <> '' THEN 'true' ELSE coalesce(t."reverseAuctionApplicable"::text, '') END`,
  // mapTenderSliceToEpcRecords:134 - an empty column displays as OPEN.
  tenderUpdateStatus: Prisma.sql`coalesce(nullif(btrim(t."tenderUpdateStatus"), ''), 'OPEN')`,
  // mapTenderSliceToEpcRecords:70 - the cell shows names, not ids.
  tenderPrepareBy: Prisma.sql`coalesce((SELECT string_agg(a."name", ', ' ORDER BY ta."id") FROM "tender_associations" ta JOIN "associations" a ON a."id" = ta."associationId" WHERE ta."tenderMergedId" = t."id"), '')`,
  merged_office_consignees: Prisma.sql`concat_ws(' ', NULLIF(t."officeName", ''), NULLIF(t."consigneesReportingOfficer", ''))`,
};

const MAX_MERGE_DEPTH = 3;

function mergedGroupSql(
  group: MergedGroup,
  q: TenderQuery,
  depth: number,
): Prisma.Sql {
  const exprs = group.fields.map(
    (f) => columnValueSql(f, q, depth + 1) ?? EMPTY_TEXT,
  );
  if (exprs.length === 0) return EMPTY_TEXT;

  // A blank separator means "show the first field verbatim", not "join".
  if (group.separator.trim().length === 0) return exprs[0];

  // concat_ws skips NULLs, which is what the client's .filter(Boolean) does.
  const parts = exprs.map((e) => Prisma.sql`NULLIF(${e}, '')`);
  return Prisma.sql`concat_ws(${group.separator}, ${Prisma.join(parts, ", ")})`;
}

/**
 * SQL producing exactly the text flattenTender puts in this cell.
 *
 * Returns null when the accessor is not something the database can produce -
 * an extra field, a gem-only column, an unknown name. Callers skip those
 * filters rather than guessing at a same-named scalar, which is what made
 * tenderFileUrl and the costing columns filter on stale values.
 */
export function columnValueSql(
  accessor: string,
  q: TenderQuery,
  depth = 0,
): Prisma.Sql | null {
  if (depth > MAX_MERGE_DEPTH) return null;

  const group = q.mergedGroups?.find((g) => g.label === accessor);
  if (group) return mergedGroupSql(group, q, depth);

  if (q.scope !== "tenders") {
    if (EPC_UNFILTERABLE.has(accessor)) return null;
    const epcDerived = EPC_DERIVED_VALUE_SQL[accessor];
    if (epcDerived) return epcDerived;
    const renamed = EPC_TO_FLAT[accessor];
    if (renamed) accessor = renamed;
  }

  const derived = DERIVED_VALUE_SQL[accessor];
  if (derived) return derived;

  if (TENDER_COLUMNS.has(accessor)) {
    // flattenTender stringifies every value before the client compares it, so
    // ::text is the faithful translation for enums, booleans and numbers.
    return Prisma.sql`${col(accessor)}::text`;
  }
  return null;
}

export function isQueryableColumn(accessor: string, q: TenderQuery): boolean {
  return columnValueSql(accessor, q) !== null;
}

/**
 * Whether a dropdown should hit the database for its values.
 *
 * False for every column whose options are hardcoded (Available / Not
 * Available, Yes / No, the association list) and for every column that has
 * never offered values at all. Shared with the client so no wasted round
 * trip is made on open.
 */
export function needsFacetQuery(accessor: string, q: TenderQuery): boolean {
  if (q.scope !== "tenders") {
    if (!epcNeedsFacetQuery(accessor)) return false;
    return columnValueSql(accessor, q) !== null;
  }
  return needsFacetQueryMeta(
    accessor,
    (q.mergedGroups ?? []).map((g) => g.label),
    (a) => TENDER_COLUMNS.has(a),
  );
}

// ------------------------------------------------------------------ dates ---

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** IST calendar day (YYYY-MM-DD) as a half-open instant range. */
export function istDateKeyToUtcRange(key: string): {
  start: Date;
  endExclusive: Date;
} {
  const [y, m, d] = key.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
  return { start, endExclusive: new Date(start.getTime() + DAY_MS) };
}

export function todayISTKey(now: Date = new Date()): string {
  return toISTDateKey(now) as string;
}

function todayStart(now: Date): Date {
  return istDateKeyToUtcRange(todayISTKey(now)).start;
}

/** Accepts a YYYY-MM-DD from <input type="date"> or any parseable instant. */
function normalizeKey(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (trimmed === "") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return toISTDateKey(trimmed);
}

const ISO_DATE_PREFIX = "^\\s*[0-9]{4}-[0-9]{2}-[0-9]{2}";

/**
 * IST date-key range on a column.
 *
 * Real DateTime columns compare against instants, so no timezone-dependent
 * expression appears in the predicate. Text columns (bgDate, assignedDate,
 * expectedRaDate ...) compare the leading YYYY-MM-DD instead, and keep the
 * client's behaviour of passing rows whose value does not parse.
 *
 * ponytail: the text branch reads the stored value as already-IST. A stored
 * instant carrying a timezone offset can land a day off. Make the column a
 * real DateTime if that ever matters.
 */
function dateKeyRangeSql(
  accessor: string,
  expr: Prisma.Sql,
  fromKey: string | null,
  toKey: string | null,
  dropNulls = false,
): Prisma.Sql | null {
  if (!fromKey && !toKey) return null;

  if (DATETIME_COLUMNS.has(accessor)) {
    const parts: Prisma.Sql[] = [];
    if (fromKey) {
      parts.push(Prisma.sql`${col(accessor)} >= ${istDateKeyToUtcRange(fromKey).start}`);
    }
    if (toKey) {
      parts.push(Prisma.sql`${col(accessor)} < ${istDateKeyToUtcRange(toKey).endExclusive}`);
    }
    const bounded = Prisma.sql`(${Prisma.join(parts, " AND ")})`;
    // The two tables disagree on undated rows: OptimizedTenderTable keeps them,
    // TenderTable drops them (`if (!record.lastDateOfSubmission) return false`).
    if (dropNulls) {
      return Prisma.sql`(${col(accessor)} IS NOT NULL AND ${bounded})`;
    }
    return Prisma.sql`(${col(accessor)} IS NULL OR ${bounded})`;
  }

  const key = Prisma.sql`left(btrim(${expr}), 10)`;
  const parts: Prisma.Sql[] = [];
  if (fromKey) parts.push(Prisma.sql`${key} >= ${fromKey}`);
  if (toKey) parts.push(Prisma.sql`${key} <= ${toKey}`);
  return Prisma.sql`(${expr} !~ ${ISO_DATE_PREFIX} OR (${Prisma.join(parts, " AND ")}))`;
}

export const DEADLINE_PRESETS: readonly DeadlinePreset[] = [
  "thisWeek",
  "thisMonth",
  "thisYear",
];

function presetRange(
  preset: string,
  now: Date,
): { fromKey: string; toKey: string } | null {
  if (preset === "thisWeek") return getISTWeekRange(now);
  if (preset === "thisMonth") return getISTMonthRange(now);
  if (preset === "thisYear") return getISTYearRange(now);
  return null;
}

// -------------------------------------------------------------- relations ---

function hasAssociationSql(ids: number[]): Prisma.Sql {
  return Prisma.sql`EXISTS (SELECT 1 FROM "tender_associations" ta WHERE ta."tenderMergedId" = t."id" AND ta."associationId" IN (${Prisma.join(ids)}))`;
}

export const HAS_ANY_ASSOCIATION = Prisma.sql`EXISTS (SELECT 1 FROM "tender_associations" ta WHERE ta."tenderMergedId" = t."id")`;

// ------------------------------------------------------ column predicates ---

const BLANK_TOKEN = "__blank__";
const NOT_ANALYSED_TOKEN = "not_analysed";

function blankSql(expr: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(${expr} IS NULL OR ${expr} = '' OR ${expr} = 'NOT_DECIDED')`;
}

function emptySql(expr: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(${expr} IS NULL OR ${expr} = '')`;
}

/** Columns rendered as Available / Not Available rather than as their value. */
const AVAILABILITY_COLUMNS: ReadonlySet<string> = new Set([
  "tenderFileUrl",
  "website",
  "costingFileUrl",
]);

function selectSql(
  accessor: string,
  expr: Prisma.Sql,
  selected: string[],
): Prisma.Sql | null {
  if (selected.length === 0) return null;

  // assignedTo is a CSV of association ids; matching ids through the relation
  // is both cheaper and immune to the ordering of the aggregated string.
  if (accessor === "assignedTo") {
    const branches: Prisma.Sql[] = [];
    const ids = selected.filter((s) => /^\d+$/.test(s)).map(Number);
    if (ids.length > 0) branches.push(hasAssociationSql(ids));
    if (selected.includes(BLANK_TOKEN) || selected.includes(NOT_ANALYSED_TOKEN)) {
      branches.push(Prisma.sql`NOT ${HAS_ANY_ASSOCIATION}`);
    }
    if (branches.length === 0) return Prisma.sql`FALSE`;
    return Prisma.sql`(${Prisma.join(branches, " OR ")})`;
  }

  const branches: Prisma.Sql[] = [];
  const isAvailability = AVAILABILITY_COLUMNS.has(accessor);
  const plain = selected.filter(
    (v) =>
      v !== BLANK_TOKEN &&
      v !== NOT_ANALYSED_TOKEN &&
      !(isAvailability && (v === "Available" || v === "Not Available")),
  );

  if (selected.includes(BLANK_TOKEN)) branches.push(blankSql(expr));
  if (selected.includes(NOT_ANALYSED_TOKEN)) branches.push(emptySql(expr));

  if (isAvailability) {
    if (selected.includes("Available")) {
      branches.push(Prisma.sql`(${expr} IS NOT NULL AND ${expr} <> '')`);
    }
    if (selected.includes("Not Available")) branches.push(emptySql(expr));
  }

  if (plain.length > 0) {
    branches.push(Prisma.sql`${expr} IN (${Prisma.join(plain)})`);
    if (plain.includes("")) branches.push(Prisma.sql`${expr} IS NULL`);
  }

  if (branches.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`(${Prisma.join(branches, " OR ")})`;
}

function textSql(expr: Prisma.Sql, text: string): Prisma.Sql | null {
  if (!text) return null;
  return Prisma.sql`${expr} ILIKE ${`%${text}%`}`;
}

function booleanSql(expr: Prisma.Sql, value: boolean): Prisma.Sql {
  // The client compares the stringified value to "true", so null counts false.
  return value
    ? Prisma.sql`${expr} = 'true'`
    : Prisma.sql`${expr} IS DISTINCT FROM 'true'`;
}

// ---------------------------------------------------------- raw materials ---

const NUMERIC_TEXT = "^-?[0-9]+(\\.[0-9]+)?$";
const JSON_OBJECT_PREFIX = "^\\s*\\{";

/**
 * jsonb_each_text over the rawMaterials JSON blob. The CASE keeps the ::jsonb
 * cast away from non-JSON values; a sibling AND guard would rely on an
 * evaluation order Postgres does not promise.
 */
const RAW_MATERIALS_JSON = Prisma.sql`CASE WHEN t."rawMaterials" ~ ${JSON_OBJECT_PREFIX} THEN t."rawMaterials"::jsonb ELSE '{}'::jsonb END`;

function rawMaterialRangeSql(
  pattern: string,
  exclude: string | null,
  min: number | null,
  max: number | null,
): Prisma.Sql {
  const bounds: Prisma.Sql[] = [];
  if (min !== null) bounds.push(Prisma.sql`btrim(kv.v)::numeric >= ${min}`);
  if (max !== null) bounds.push(Prisma.sql`btrim(kv.v)::numeric <= ${max}`);
  const bound =
    bounds.length > 0 ? Prisma.sql` AND ${Prisma.join(bounds, " AND ")}` : Prisma.empty;
  // Postgres POSIX regex has no lookahead, so isAlu's "alloy" veto is a
  // separate negative match rather than part of the pattern.
  const veto = exclude
    ? Prisma.sql` AND lower(btrim(kv.k)) !~ ${exclude}`
    : Prisma.empty;
  return Prisma.sql`EXISTS (SELECT 1 FROM jsonb_each_text(${RAW_MATERIALS_JSON}) AS kv(k, v) WHERE lower(btrim(kv.k)) ~ ${pattern}${veto} AND btrim(kv.v) ~ ${NUMERIC_TEXT}${bound})`;
}

function num(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

function rawMaterialsSql(
  state: NonNullable<ColumnFilterState["rawMaterials"]>,
): Prisma.Sql | null {
  const parts: Prisma.Sql[] = [];
  if (state.aluMin.trim() !== "" || state.aluMax.trim() !== "") {
    parts.push(
      rawMaterialRangeSql(
        ALU_KEY_SQL_PATTERN,
        ALU_KEY_SQL_EXCLUDE,
        num(state.aluMin),
        num(state.aluMax),
      ),
    );
  }
  if (state.cuMin.trim() !== "" || state.cuMax.trim() !== "") {
    parts.push(
      rawMaterialRangeSql(CU_KEY_SQL_PATTERN, null, num(state.cuMin), num(state.cuMax)),
    );
  }
  if (parts.length === 0) return null;
  return Prisma.sql`(${Prisma.join(parts, " AND ")})`;
}

// ------------------------------------------------- participation predicates --

const TECHNICAL_OPEN_STATUSES = [
  "AWARDED",
  "FINANCIAL EVALUATION",
  "TENDER CANCELLED",
  "TECHNICAL BID OPENED",
  "DISQUALIFIED",
];
const FINANCIAL_OPEN_STATUSES = [
  "AWARDED",
  "FINANCIAL EVALUATION",
  "TENDER CANCELLED",
];

const PARTICIPATED = Prisma.sql`t."participated" IS TRUE`;
const RA_APPLICABLE = Prisma.sql`t."reverseAuctionApplicable" IS TRUE`;
const RA_NOT_APPLICABLE = Prisma.sql`t."reverseAuctionApplicable" IS NOT TRUE`;
const RA_INCOMPLETE = Prisma.sql`(t."reverseAuctionStartDate" IS NULL OR t."reverseAuctionEndDate" IS NULL)`;
export const APM_YES = Prisma.sql`t."apm"::text = 'YES'`;
export const AI_YES = Prisma.sql`t."aiRelevanceValid" IS TRUE`;
const STATUS = Prisma.sql`upper(btrim(coalesce(t."currentStatus", '')))`;
// Free-text field: the sheet records a first place as either "1" or "L1".
const RANK_1 = Prisma.sql`upper(btrim(coalesce(t."ourRank", ''))) IN ('1', 'L1')`;
const HAS_CONTRACT = Prisma.sql`btrim(coalesce(t."contractNo", '')) <> ''`;

function statusIn(list: string[]): Prisma.Sql {
  return Prisma.sql`${STATUS} IN (${Prisma.join(list)})`;
}

const FINANCIAL_BRANCH = Prisma.sql`(${PARTICIPATED} AND ${RA_NOT_APPLICABLE} AND ${statusIn(FINANCIAL_OPEN_STATUSES)})`;

/**
 * Every ParticipationFilter as a runtime list. `satisfies` makes a forgotten
 * member a compile error, the same guarantee the predicate map below gives.
 */
const PARTICIPATION_FILTER_KEYS = {
  participated: true,
  participatedTotal: true,
  notParticipated: true,
  upcomingRa: true,
  participatedWithRa: true,
  participatedWithoutRa: true,
  yetToOpenRa: true,
  bidOpeningPendingExclRa: true,
  raDone: true,
  raPending: true,
  technicalOpen: true,
  technicalNotOpen: true,
  weL1: true,
  weLost: true,
  expRaDate: true,
  contractReceived: true,
  contractPending: true,
  financialOpen: true,
  financialNotOpen: true,
  financialWeL1: true,
  financialWeLost: true,
  financialContractReceived: true,
  financialContractPending: true,
} satisfies Record<ParticipationFilter, true>;

export const PARTICIPATION_FILTERS = Object.keys(
  PARTICIPATION_FILTER_KEYS,
) as ParticipationFilter[];

/**
 * Exhaustive map, so adding a ParticipationFilter member is a compile error
 * until it is handled here - same guarantee the predicate map on the client
 * was written to give.
 *
 * ponytail: "today" is the IST calendar day. The client used the browser's
 * local midnight; IST is the intent everywhere else here and is the only
 * choice that behaves identically on the server.
 */
export function participationSql(
  filter: ParticipationFilter,
  now: Date = new Date(),
): Prisma.Sql {
  const today = todayStart(now);
  const tomorrow = new Date(today.getTime() + DAY_MS);

  const map: Record<ParticipationFilter, () => Prisma.Sql> = {
    participated: () => Prisma.sql`(${APM_YES} AND ${PARTICIPATED})`,
    participatedTotal: () => Prisma.sql`(${APM_YES} AND ${PARTICIPATED})`,
    notParticipated: () => Prisma.sql`(${APM_YES} AND t."participated" IS NULL)`,
    upcomingRa: () =>
      Prisma.sql`(${RA_APPLICABLE} AND t."reverseAuctionStartDate" >= ${today})`,
    participatedWithRa: () => Prisma.sql`(${APM_YES} AND ${PARTICIPATED} AND ${RA_APPLICABLE})`,
    participatedWithoutRa: () => Prisma.sql`(${APM_YES} AND ${PARTICIPATED} AND ${RA_NOT_APPLICABLE})`,
    yetToOpenRa: () =>
      Prisma.sql`(${PARTICIPATED} AND ${RA_APPLICABLE} AND t."reverseAuctionStartDate" >= ${tomorrow})`,
    bidOpeningPendingExclRa: () =>
      Prisma.sql`(${PARTICIPATED} AND ${RA_NOT_APPLICABLE} AND ${STATUS} NOT IN ('AWARDED', 'FINANCIAL EVALUATION'))`,
    raDone: () =>
      Prisma.sql`(${PARTICIPATED} AND ${RA_APPLICABLE} AND t."reverseAuctionStartDate" IS NOT NULL AND t."reverseAuctionEndDate" IS NOT NULL)`,
    raPending: () =>
      Prisma.sql`(${PARTICIPATED} AND ${RA_APPLICABLE} AND ${RA_INCOMPLETE})`,
    technicalOpen: () =>
      Prisma.sql`(${PARTICIPATED} AND ${statusIn(TECHNICAL_OPEN_STATUSES)})`,
    technicalNotOpen: () =>
      Prisma.sql`(${PARTICIPATED} AND (${STATUS} = '' OR ${STATUS} = 'NOT EVALUATED'))`,
    weL1: () => Prisma.sql`(${PARTICIPATED} AND ${RANK_1})`,
    weLost: () => Prisma.sql`(${PARTICIPATED} AND NOT ${RANK_1})`,
    expRaDate: () =>
      Prisma.sql`(${PARTICIPATED} AND ${RA_APPLICABLE} AND ${RA_INCOMPLETE} AND btrim(coalesce(t."expectedRaDate", '')) <> '')`,
    contractReceived: () =>
      Prisma.sql`(${PARTICIPATED} AND ${RANK_1} AND ${HAS_CONTRACT})`,
    contractPending: () =>
      Prisma.sql`(${PARTICIPATED} AND ${RANK_1} AND NOT ${HAS_CONTRACT})`,
    financialOpen: () =>
      Prisma.sql`(${PARTICIPATED} AND ${statusIn(FINANCIAL_OPEN_STATUSES)})`,
    financialNotOpen: () =>
      Prisma.sql`(${PARTICIPATED} AND ${RA_NOT_APPLICABLE} AND ${statusIn(TECHNICAL_OPEN_STATUSES)} AND ${STATUS} NOT IN (${Prisma.join(FINANCIAL_OPEN_STATUSES)}))`,
    financialWeL1: () => Prisma.sql`(${FINANCIAL_BRANCH} AND ${RANK_1})`,
    financialWeLost: () => Prisma.sql`(${FINANCIAL_BRANCH} AND NOT ${RANK_1})`,
    financialContractReceived: () =>
      Prisma.sql`(${FINANCIAL_BRANCH} AND ${RANK_1} AND ${HAS_CONTRACT})`,
    financialContractPending: () =>
      Prisma.sql`(${FINANCIAL_BRANCH} AND ${RANK_1} AND NOT ${HAS_CONTRACT})`,
  };

  return map[filter]();
}

/**
 * A flow node's predicate ANDed with its ancestors'. The sidebar counts each
 * node this way so a child can never outcount its parent: weLost and
 * technicalOpen carry no branch of their own, so counted alone they answer for
 * both subtrees. Filters that are not flow nodes (the cards' participated /
 * notParticipated / upcomingRa ...) have no chain and stand alone.
 *
 * buildWhereSql deliberately does NOT use this: the table already receives the
 * whole chain from handleSelect, one dispatched filter per ancestor.
 */
export function participationChainSql(
  filter: ParticipationFilter,
  now?: Date,
): Prisma.Sql {
  const chain = PARTICIPATION_CHAINS[filter] ?? [filter];
  return Prisma.join(
    chain.map((f) => participationSql(f, now)),
    " AND ",
  );
}

// ------------------------------------------------------------------ scope ---

/**
 * The route's own dataset, mirroring lib/selectors/tenderSelectors.ts.
 *
 * ponytail: "today" is the IST calendar day. The selectors used the browser's
 * local midnight; IST is the intent everywhere else here and is the only choice
 * that behaves identically on the server.
 */
export function scopeSql(scope: TenderScope, now: Date): Prisma.Sql | null {
  const today = todayStart(now);
  const HAS_DEADLINE = Prisma.sql`t."deadline" IS NOT NULL`;

  switch (scope) {
    case "tenders":
      return null;
    // APM yes, participation undecided, deadline not yet passed.
    case "home":
      return Prisma.sql`(${APM_YES} AND t."participated" IS NULL AND ${HAS_DEADLINE} AND t."deadline" >= ${today})`;
    // APM yes and participated. No deadline condition.
    case "postParticipation":
      return Prisma.sql`(${APM_YES} AND t."participated" IS TRUE)`;
    // Explicitly not participated, or undecided with the deadline gone by.
    case "notParticipated":
      return Prisma.sql`(${APM_YES} AND (t."participated" IS FALSE OR (t."participated" IS NULL AND ${HAS_DEADLINE} AND t."deadline" < ${today})))`;
  }
}

// --------------------------------------------------------- ERP categories ---

/**
 * The five hardcoded proposedErpItemName rule sets from TenderTable's
 * matchesErpItemCategory, as substring matches over CostingSheetDetails.
 */
const ERP_CATEGORY_RULES: Record<
  string,
  { include: string[]; exclude: string[] }
> = {
  "ab cable": { include: ["ab cable", "ab cables"], exclude: [] },
  conductor: {
    include: ["conductor", "acsr", "aaac", "a.c.s.r."],
    exclude: [],
  },
  "xlpe cable": { include: ["xlpe"], exclude: ["ab cable", "ab cables"] },
  "pvc cable": { include: ["pvc"], exclude: [] },
  "control cable": { include: ["control", "instrumentation"], exclude: [] },
};

/**
 * The sidebar's price basis. The client compared `record.price || "Firm"`
 * case-insensitively, so an empty column counts as Firm here too.
 */
function priceBasisSql(basis: string): Prisma.Sql | null {
  const wanted = basis.trim();
  if (wanted === "" || wanted.toLowerCase() === "all") return null;
  return Prisma.sql`lower(coalesce(nullif(btrim(t."price"), ''), 'firm')) = ${wanted.toLowerCase()}`;
}

function erpCategorySql(category: string): Prisma.Sql | null {
  const rule = ERP_CATEGORY_RULES[category.trim().toLowerCase()];
  if (!rule) return null;

  const name = Prisma.sql`lower(coalesce(csd."proposedErpItemName", ''))`;
  const hits = rule.include.map((w) => Prisma.sql`${name} LIKE ${`%${w}%`}`);
  const misses = rule.exclude.map((w) => Prisma.sql`${name} NOT LIKE ${`%${w}%`}`);
  const parts = [Prisma.sql`(${Prisma.join(hits, " OR ")})`, ...misses];

  return Prisma.sql`EXISTS (SELECT 1 FROM "CostingSheetDetails" csd WHERE csd."tenderMergedId" = t."id" AND ${Prisma.join(parts, " AND ")})`;
}

// -------------------------------------------------------------- analytics ---

function analyticsSql(filter: NonNullable<AnalyticsFilter>): Prisma.Sql {
  switch (filter) {
    case "aiYes":
      return AI_YES;
    case "aiYesUnallocated":
      return Prisma.sql`(${AI_YES} AND NOT ${HAS_ANY_ASSOCIATION})`;
    case "apmYesAllocated":
      return Prisma.sql`(${APM_YES} AND ${HAS_ANY_ASSOCIATION})`;
    case "apmYesUnallocated":
      return Prisma.sql`(${APM_YES} AND NOT ${HAS_ANY_ASSOCIATION})`;
  }
}

function exclusionSql(filter: string): Prisma.Sql | null {
  const words =
    filter === "cable"
      ? ["cable"]
      : filter === "conductors"
        ? ["conductors"]
        : filter === "both"
          ? ["cable", "conductors"]
          : [];
  if (words.length === 0) return null;
  const hits = words.map((w) => Prisma.sql`t."excludedCategory" LIKE ${`%${w}%`}`);
  return Prisma.sql`(t."excludedCategory" IS NULL OR t."excludedCategory" = '' OR NOT (${Prisma.join(hits, " OR ")}))`;
}

// ----------------------------------------------------------------- public ---

export interface BuildOptions {
  /** Drop this column's own filters - this is what makes facets cascade. */
  skipColumn?: string;
  /**
   * Drop the association filter, so per-person counts stay stable while one
   * person is selected - what the client got by counting baseFiltered rather
   * than activeDataset.
   */
  skipAssociationFilter?: boolean;
  now?: Date;
}

/** WHERE body for `FROM tender_merged t`, without the WHERE keyword. */
export function buildWhereSql(q: TenderQuery, opts: BuildOptions = {}): Prisma.Sql {
  const now = opts.now ?? new Date();
  const parts: Prisma.Sql[] = [];

  const scope = scopeSql(q.scope ?? "tenders", now);
  if (scope) parts.push(scope);

  for (const [accessor, state] of Object.entries(q.columnFilters ?? {})) {
    if (!state || accessor === opts.skipColumn) continue;
    const expr = columnValueSql(accessor, q);
    if (!expr) continue;

    // Date and availability handling keys off the real column, so an EPC
    // accessor has to be resolved before those branches see it.
    const flatAccessor =
      q.scope !== "tenders" ? (EPC_TO_FLAT[accessor] ?? accessor) : accessor;

    // TenderTable drops rows with no date once a window is set; the /tenders
    // table keeps them. Both behaviours are preserved.
    const dropUndated = q.scope !== "tenders";

    // deadline's `select` carries a preset token, never a column value.
    let ignoreSelect = false;
    if (flatAccessor === "deadline" && state.select?.length) {
      const range = presetRange(state.select[0], now);
      if (range) {
        const sql = dateKeyRangeSql("deadline", expr, range.fromKey, range.toKey, dropUndated);
        if (sql) parts.push(sql);
        // A real preset replaces the typed window, by design.
        continue;
      }
      // An unrecognised token is neither a preset nor a deadline value. Ignore
      // just the token and let a typed window still apply: continuing here left
      // the column unconstrained, and matching it as a literal matches nothing.
      ignoreSelect = true;
    }

    if (state.dateRange) {
      const sql = dateKeyRangeSql(
        flatAccessor,
        expr,
        normalizeKey(state.dateRange.startDate),
        normalizeKey(state.dateRange.endDate),
        dropUndated,
      );
      if (sql) parts.push(sql);
    }

    if (state.select?.length && !ignoreSelect) {
      const sql = selectSql(flatAccessor, expr, state.select);
      if (sql) parts.push(sql);
    }

    if (state.text) {
      const sql = textSql(expr, state.text);
      if (sql) parts.push(sql);
    }

    if (state.boolean != null) {
      parts.push(booleanSql(expr, state.boolean));
    }

    if (state.rawMaterials) {
      const sql = rawMaterialsSql(state.rawMaterials);
      if (sql) parts.push(sql);
    }
  }

  // The implicit "hide past deadlines" rule, dropped only once the user gives a
  // lower bound of their own. Testing mere presence of a dateRange object let
  // "up to 29 Sep" and a cleared { startDate: "", endDate: "" } both mean "all
  // history": such a window has no floor, and dropping the implicit one left
  // nothing bounding it below.
  //
  // EPC scopes send this column as lastDateOfSubmission. They all pass
  // applyDefaultDeadlineFilter: false today, so the second lookup only guards
  // against a future caller that does not.
  const deadlineFilter =
    q.columnFilters?.deadline ?? q.columnFilters?.lastDateOfSubmission;
  const presetFloor = deadlineFilter?.select?.length
    ? !!presetRange(deadlineFilter.select[0], now)
    : false;
  const hasDeadlineFloor =
    presetFloor || !!normalizeKey(deadlineFilter?.dateRange?.startDate);
  if (q.applyDefaultDeadlineFilter && !hasDeadlineFloor && opts.skipColumn !== "deadline") {
    parts.push(Prisma.sql`(t."deadline" IS NULL OR t."deadline" >= ${todayStart(now)})`);
  }

  if (q.fileDateFromIso && q.fileDateToIso) {
    parts.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "files" f WHERE f."id" = t."fileId" AND f."updatedAt" >= ${new Date(q.fileDateFromIso)} AND f."updatedAt" <= ${new Date(q.fileDateToIso)})`,
    );
  }

  if (q.exclusionFilter) {
    const sql = exclusionSql(q.exclusionFilter);
    if (sql) parts.push(sql);
  }

  for (const filter of q.participationFilters ?? []) {
    parts.push(participationSql(filter, now));
  }

  if (q.erpItemCategory) {
    const sql = erpCategorySql(q.erpItemCategory);
    if (sql) parts.push(sql);
  }

  if (q.priceBasis) {
    const sql = priceBasisSql(q.priceBasis);
    if (sql) parts.push(sql);
  }

  if (
    !opts.skipAssociationFilter &&
    q.associationFilter &&
    /^\d+$/.test(q.associationFilter)
  ) {
    parts.push(hasAssociationSql([Number(q.associationFilter)]));
  }

  if (q.analyticsFilter) parts.push(analyticsSql(q.analyticsFilter));

  if (parts.length === 0) return Prisma.sql`TRUE`;
  return Prisma.join(parts, " AND ");
}

/** ORDER BY body, without the ORDER BY keyword. Always id-tiebroken. */
export function buildOrderBySql(q: TenderQuery): Prisma.Sql {
  const sort = q.sort;
  if (!sort) return Prisma.sql`t."id" DESC`;

  const dir = Prisma.raw(sort.direction === "asc" ? "ASC" : "DESC");

  if (sort.column === "rawMaterials") {
    // The client sorts by how many materials are listed, not by their values.
    return Prisma.sql`(SELECT count(*) FROM jsonb_each_text(${RAW_MATERIALS_JSON}) AS kv(k, v) WHERE btrim(kv.v) <> '') ${dir}, t."id" ASC`;
  }

  const expr = columnValueSql(sort.column, q);
  if (!expr) return Prisma.sql`t."id" DESC`;

  const flatColumn =
    q.scope !== "tenders"
      ? (EPC_TO_FLAT[sort.column] ?? sort.column)
      : sort.column;

  // Real dates sort as instants; everything else sorts as the displayed text.
  const sortExpr = DATETIME_COLUMNS.has(flatColumn) ? col(flatColumn) : expr;

  // The client sorts nulls first ascending, last descending.
  const nulls = Prisma.raw(sort.direction === "asc" ? "NULLS FIRST" : "NULLS LAST");
  return Prisma.sql`${sortExpr} ${dir} ${nulls}, t."id" ASC`;
}
