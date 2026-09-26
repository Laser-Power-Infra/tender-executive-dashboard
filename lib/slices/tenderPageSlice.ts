import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import {
  fetchParticipationCounts,
  fetchTenderFacet,
  fetchTenderSummary,
  fetchTendersPage,
  type TenderSummary,
} from "@/actions/tender-query";
import type { ParticipationCountsResult } from "@/lib/participation-counts";
import type {
  MergedGroup,
  TenderQuery,
  TenderScope,
} from "@/lib/tender-query";
import type { ColumnFilterState } from "@/lib/types";
import type { FlatRow } from "@/lib/tender-flatten";
import type { RootState } from "@/lib/store";

export interface TenderPageAssociation {
  id: number;
  name: string;
  email: string;
}

interface FacetEntry {
  options: string[];
  overLimit: boolean;
  status: "loading" | "ready" | "error";
  /** Query key the options were computed for, so stale caches are refetched. */
  queryKey: string;
}

/**
 * One page's worth of server state.
 *
 * Four routes use this slice (/tenders plus the three EPC dashboards), so the
 * state is keyed by scope: a shared `page`, `facets` cache or row array would
 * make navigating between two of them show the other's data.
 */
interface ScopePageState {
  rows: FlatRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { column: string; direction: "asc" | "desc" } | null;
  associationFilter: string | null;
  /** column_groups, loaded once per mount; the server needs them to filter
   *  and sort merged columns. */
  mergedGroups: MergedGroup[];
  /**
   * Column filters owned by this scope. /tenders keeps using filtersSlice,
   * which its table writes to directly; the EPC pages keep theirs here so the
   * two do not overwrite each other when you navigate between the routes.
   */
  columnFilters: Record<string, ColumnFilterState>;
  erpItemCategory: string | null;
  priceBasis: string | null;
  columns: string[];
  associations: TenderPageAssociation[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  /** requestId of the newest dispatch; older responses are discarded. */
  pendingRequestId: string | null;
  facets: Record<string, FacetEntry>;
  summary: TenderSummary | null;
  participationCounts: ParticipationCountsResult | null;
  /** Set by a bulk sync, which rewrites rows wholesale. */
  stale: boolean;
}

interface TenderPageState {
  byScope: Record<TenderScope, ScopePageState>;
}

const SCOPES: TenderScope[] = [
  "tenders",
  "home",
  "postParticipation",
  "notParticipated",
];

function emptyScopeState(): ScopePageState {
  return {
    rows: [],
    total: 0,
    page: 1,
    pageSize: 50,
    sort: null,
    associationFilter: null,
    mergedGroups: [],
    columnFilters: {},
    erpItemCategory: null,
    priceBasis: null,
    columns: [],
    associations: [],
    status: "idle",
    error: null,
    pendingRequestId: null,
    facets: {},
    summary: null,
    participationCounts: null,
    stale: false,
  };
}

const initialState: TenderPageState = {
  byScope: Object.fromEntries(
    SCOPES.map((s) => [s, emptyScopeState()]),
  ) as Record<TenderScope, ScopePageState>,
};

/**
 * Stable key for a query. Keys are compared to skip redundant fetches and to
 * invalidate cached facet options, so the field order must not vary.
 */
export function tenderQueryKey(query: TenderQuery): string {
  return JSON.stringify({
    scope: query.scope,
    groupByDocket: query.groupByDocket,
    erpItemCategory: query.erpItemCategory,
    priceBasis: query.priceBasis,
    columnFilters: Object.keys(query.columnFilters)
      .sort()
      .map((k) => [k, query.columnFilters[k]]),
    participationFilters: [...query.participationFilters].sort(),
    analyticsFilter: query.analyticsFilter,
    exclusionFilter: query.exclusionFilter,
    associationFilter: query.associationFilter,
    fileDateFromIso: query.fileDateFromIso,
    fileDateToIso: query.fileDateToIso,
    applyDefaultDeadlineFilter: query.applyDefaultDeadlineFilter,
    mergedGroups: query.mergedGroups,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  });
}

/** Facet options only depend on the filters, never on the page or the sort. */
export function tenderFilterKey(query: TenderQuery): string {
  return tenderQueryKey({ ...query, page: 1, pageSize: 0, sort: null });
}

export function selectScopeState(
  state: RootState,
  scope: TenderScope,
): ScopePageState {
  return state.tenderPage.byScope[scope];
}

/**
 * Assembles the server query from the filter state the UI already keeps.
 * The file-date window is resolved to instants here, matching what
 * selectDateFilteredRows did in the browser.
 */
export function selectTenderQuery(
  state: RootState,
  scope: TenderScope,
  applyDefaultDeadlineFilter: boolean,
): TenderQuery {
  const { filters, files } = state;
  const page = state.tenderPage.byScope[scope];

  let fileDateFromIso: string | null = null;
  let fileDateToIso: string | null = null;
  if (files.selectedDateFrom != null && files.selectedDateTo != null) {
    const to = new Date(files.selectedDateTo);
    to.setHours(23, 59, 59, 999);
    fileDateFromIso = new Date(files.selectedDateFrom).toISOString();
    fileDateToIso = to.toISOString();
  }

  return {
    scope,
    // Only the EPC tables page by docket group.
    groupByDocket: scope !== "tenders",
    erpItemCategory: page.erpItemCategory,
    priceBasis: page.priceBasis,
    columnFilters:
      scope === "tenders" ? filters.columnFilters : page.columnFilters,
    participationFilters: filters.participationFilters,
    analyticsFilter: filters.analyticsFilter,
    exclusionFilter: filters.exclusionFilter,
    associationFilter: page.associationFilter,
    fileDateFromIso,
    fileDateToIso,
    applyDefaultDeadlineFilter,
    mergedGroups: page.mergedGroups,
    // The EPC tables sorted by deadline descending before any user click.
    sort:
      page.sort ??
      (scope === "tenders"
        ? null
        : { column: "lastDateOfSubmission", direction: "desc" }),
    page: page.page,
    pageSize: page.pageSize,
  };
}

/** Read-only thunks in the tenders slice; everything else mutates a row. */
const TENDERS_READ_ONLY = new Set([
  "tenders/fetchAllTenders",
  "tenders/fetchTendersIncremental",
  "tenders/appendTenders",
  "tenders/searchByParty",
]);

/** Mutation args that never name a row field. */
const NON_FIELD_ARG_KEYS = new Set([
  "tenderMergedId",
  "rowIndex",
  "oldValue",
  "id",
  "file",
  "fileType",
]);

export const loadTenderPage = createAsyncThunk(
  "tenderPage/load",
  async (args: { scope: TenderScope; query: TenderQuery; includeMeta: boolean }) =>
    fetchTendersPage(args.query, args.includeMeta),
);

export const loadTenderFacet = createAsyncThunk(
  "tenderPage/facet",
  async (args: { scope: TenderScope; query: TenderQuery; column: string }) =>
    fetchTenderFacet(args.query, args.column),
  {
    condition: (args, { getState }) => {
      const state = getState() as RootState;
      const entry = state.tenderPage.byScope[args.scope].facets[args.column];
      if (!entry) return true;
      // Already loading or already correct for this filter combination.
      return !(entry.queryKey === tenderFilterKey(args.query) && entry.status !== "error");
    },
  },
);

export const loadTenderSummary = createAsyncThunk(
  "tenderPage/summary",
  async (args: { scope: TenderScope; query: TenderQuery }) =>
    fetchTenderSummary(args.query),
);

export const loadParticipationCounts = createAsyncThunk(
  "tenderPage/participationCounts",
  async (args: { scope: TenderScope; query: TenderQuery }) =>
    fetchParticipationCounts(args.query),
);

/** A filter change sends the user back to page 1. */
function onFilterChange(scope: ScopePageState) {
  scope.page = 1;
  // Facets are NOT cleared here: each entry records the tenderFilterKey it was
  // computed for, so loadTenderFacet refetches a stale one on its own. Clearing
  // them left an already-open dropdown rendering an empty option list.
}

export const tenderPageSlice = createSlice({
  name: "tenderPage",
  initialState,
  reducers: {
    setPage(state, action: PayloadAction<{ scope: TenderScope; page: number }>) {
      const s = state.byScope[action.payload.scope];
      s.page = Math.max(1, action.payload.page);
    },
    setPageSize(
      state,
      action: PayloadAction<{ scope: TenderScope; pageSize: number }>,
    ) {
      const s = state.byScope[action.payload.scope];
      s.pageSize = action.payload.pageSize;
      s.page = 1;
    },
    setSort(
      state,
      action: PayloadAction<{
        scope: TenderScope;
        sort: { column: string; direction: "asc" | "desc" } | null;
      }>,
    ) {
      const s = state.byScope[action.payload.scope];
      s.sort = action.payload.sort;
      s.page = 1;
    },
    setMergedGroups(
      state,
      action: PayloadAction<{ scope: TenderScope; groups: MergedGroup[] }>,
    ) {
      state.byScope[action.payload.scope].mergedGroups = action.payload.groups;
    },
    setAssociationFilter(
      state,
      action: PayloadAction<{ scope: TenderScope; associationFilter: string | null }>,
    ) {
      const s = state.byScope[action.payload.scope];
      s.associationFilter = action.payload.associationFilter;
      s.page = 1;
    },
    /**
     * Everything buildEpcQueryFilters produces, in one dispatch.
     *
     * The table re-reports its filters on any of its own state changes, so an
     * unchanged payload must not reset the page or drop the facet cache.
     */
    setEpcFilters(
      state,
      action: PayloadAction<{
        scope: TenderScope;
        columnFilters: Record<string, ColumnFilterState>;
        erpItemCategory: string | null;
        priceBasis: string | null;
      }>,
    ) {
      const s = state.byScope[action.payload.scope];
      const next = JSON.stringify([
        action.payload.columnFilters,
        action.payload.erpItemCategory,
        action.payload.priceBasis,
      ]);
      if (next === JSON.stringify([s.columnFilters, s.erpItemCategory, s.priceBasis])) {
        return;
      }
      s.columnFilters = action.payload.columnFilters;
      s.erpItemCategory = action.payload.erpItemCategory;
      s.priceBasis = action.payload.priceBasis;
      onFilterChange(s);
    },
    setScopeColumnFilter(
      state,
      action: PayloadAction<{
        scope: TenderScope;
        column: string;
        filter: ColumnFilterState | null;
      }>,
    ) {
      const s = state.byScope[action.payload.scope];
      if (action.payload.filter) s.columnFilters[action.payload.column] = action.payload.filter;
      else delete s.columnFilters[action.payload.column];
      onFilterChange(s);
    },
    setErpItemCategory(
      state,
      action: PayloadAction<{ scope: TenderScope; category: string | null }>,
    ) {
      const s = state.byScope[action.payload.scope];
      s.erpItemCategory = action.payload.category;
      onFilterChange(s);
    },
    clearScopeFilters(state, action: PayloadAction<{ scope: TenderScope }>) {
      const s = state.byScope[action.payload.scope];
      s.columnFilters = {};
      s.erpItemCategory = null;
      s.priceBasis = null;
      s.associationFilter = null;
      onFilterChange(s);
    },
    resetPagination(state, action: PayloadAction<{ scope: TenderScope }>) {
      onFilterChange(state.byScope[action.payload.scope]);
    },
    clearStale(state, action: PayloadAction<{ scope: TenderScope }>) {
      state.byScope[action.payload.scope].stale = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadTenderPage.pending, (state, action) => {
        const s = state.byScope[action.meta.arg.scope];
        s.status = "loading";
        s.error = null;
        s.pendingRequestId = action.meta.requestId;
      })
      .addCase(loadTenderPage.fulfilled, (state, action) => {
        const s = state.byScope[action.meta.arg.scope];
        // Server actions cannot be aborted, so late responses are dropped here.
        if (action.meta.requestId !== s.pendingRequestId) return;
        s.status = "ready";
        s.rows = action.payload.rows;
        s.total = action.payload.total;
        s.page = action.payload.page;
        s.pageSize = action.payload.pageSize;
        if (action.payload.columns) s.columns = action.payload.columns;
        if (action.payload.associations) s.associations = action.payload.associations;
        s.pendingRequestId = null;
      })
      .addCase(loadTenderPage.rejected, (state, action) => {
        const s = state.byScope[action.meta.arg.scope];
        if (action.meta.requestId !== s.pendingRequestId) return;
        s.status = "error";
        s.error = action.error.message ?? "Failed to load tenders";
        s.pendingRequestId = null;
      })
      .addCase(loadTenderFacet.pending, (state, action) => {
        const { scope, column, query } = action.meta.arg;
        const s = state.byScope[scope];
        s.facets[column] = {
          options: s.facets[column]?.options ?? [],
          overLimit: s.facets[column]?.overLimit ?? false,
          status: "loading",
          queryKey: tenderFilterKey(query),
        };
      })
      .addCase(loadTenderFacet.fulfilled, (state, action) => {
        const { scope, column, query } = action.meta.arg;
        const s = state.byScope[scope];
        const queryKey = tenderFilterKey(query);
        // A newer filter combination already claimed this slot.
        if (s.facets[column] && s.facets[column].queryKey !== queryKey) return;
        s.facets[column] = {
          options: action.payload.options,
          overLimit: action.payload.overLimit,
          status: "ready",
          queryKey,
        };
      })
      .addCase(loadTenderFacet.rejected, (state, action) => {
        const { scope, column, query } = action.meta.arg;
        state.byScope[scope].facets[column] = {
          options: [],
          overLimit: false,
          status: "error",
          queryKey: tenderFilterKey(query),
        };
      })
      .addCase(loadTenderSummary.fulfilled, (state, action) => {
        state.byScope[action.meta.arg.scope].summary = action.payload;
      })
      .addCase(loadParticipationCounts.fulfilled, (state, action) => {
        state.byScope[action.meta.arg.scope].participationCounts = action.payload;
      })
      // A cell edit goes through a tenders/* thunk that has already written to
      // the database. Rather than refetching the page, patch the row in place
      // from the thunk's own arguments - every mutation thunk passes
      // { tenderMergedId, <fieldName>: value }, and the two odd shapes are
      // handled below. Nothing here is optimistic: only `fulfilled` lands.
      .addMatcher(
        (action): action is { type: string; meta: { arg: unknown } } => {
          const type = (action as { type?: unknown }).type;
          if (typeof type !== "string") return false;
          if (!type.startsWith("tenders/") || !type.endsWith("/fulfilled")) return false;
          return !TENDERS_READ_ONLY.has(type.slice(0, type.lastIndexOf("/")));
        },
        (state, action) => {
          const arg = action.meta?.arg as Record<string, unknown> | undefined;
          if (!arg || typeof arg !== "object") return;
          const id = Number(arg.tenderMergedId ?? arg.id);
          if (!Number.isFinite(id) || id <= 0) {
            // A sync or import rewrites rows wholesale; refetch instead.
            for (const scope of SCOPES) state.byScope[scope].stale = true;
            return;
          }

          // updateTenderCell / updateTenderMergedField name the field instead
          // of passing it as a key.
          const patch: Record<string, unknown> = {};
          if (typeof arg.field === "string") {
            patch[arg.field] = arg.value;
          } else {
            for (const [k, v] of Object.entries(arg)) {
              if (NON_FIELD_ARG_KEYS.has(k)) continue;
              if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
                patch[k] = v;
              }
            }
          }
          if (Object.keys(patch).length === 0) return;

          for (const scope of SCOPES) {
            const row = state.byScope[scope].rows.find((r) => Number(r.id) === id);
            if (!row) continue;
            for (const [k, v] of Object.entries(patch)) {
              row[k] = v == null ? "" : String(v);
            }
          }
        },
      );
  },
});

export const {
  setPage,
  setPageSize,
  setSort,
  setMergedGroups,
  setAssociationFilter,
  setEpcFilters,
  setScopeColumnFilter,
  setErpItemCategory,
  clearScopeFilters,
  resetPagination,
  clearStale,
} = tenderPageSlice.actions;

export default tenderPageSlice.reducer;
