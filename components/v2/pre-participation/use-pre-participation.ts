"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { buildCountsQuery } from "@/lib/epc-table-query";
import { toISTDateKey } from "@/lib/format-ist";
import type { RootState } from "@/lib/store";
import type { TenderQuery } from "@/lib/tender-query";
import type { ColumnFilterState, ColumnFilterType, FilterOption } from "@/lib/types";
import {
  clearScopeFilters,
  clearStale,
  loadParticipationCounts,
  loadTenderFacet,
  loadTenderPage,
  selectTenderQuery,
  setAssociationFilter,
  setErpItemCategory,
  setPage,
  setPageSize,
  setScopeColumnFilter,
  setSort,
  tenderFilterKey,
  tenderQueryKey,
} from "@/lib/slices/tenderPageSlice";
import { fetchAllBomOptions } from "@/lib/slices/utilitySlice";
import type { TenderCellContext } from "@/components/v2/tenders/use-tenders";
import { ERP_CATEGORY_FILTER } from "./columns";
import { lockedOnceSet, lockedWhenNotParticipated, type ParticipationScope } from "./fields";

export type { ParticipationScope };

// v1 opens not participated on deadlines up to today and post participation on
// deadlines from 2026. Quotation pending follows post participation. Seeded once per session, so a user who clears the filter
// does not get it back on the next visit.
const deadlineSeeded = new Set<ParticipationScope>();

const deadlineSeed = (scope: ParticipationScope) =>
  scope === "notParticipated"
    ? { startDate: "", endDate: toISTDateKey(new Date()) ?? "" }
    : scope === "postParticipation" || scope === "quotationPending"
      ? { startDate: "2026-01-01", endDate: "" }
      : null;

const LOCKS: Record<ParticipationScope, TenderCellContext["isLocked"]> = {
  home: undefined,
  postParticipation: lockedOnceSet,
  notParticipated: lockedWhenNotParticipated,
  quotationPending: lockedOnceSet,
};

/** What the server sorts by until the user picks a column. */
const DEFAULT_SORT = { column: "deadline", direction: "desc" } as const;

/**
 * All Redux wiring for the pre-participation and not-participated pages. Same slice, thunks and
 * selectors as v1, so the data is loaded and patched exactly the same way.
 */
export function usePreParticipation(scope: ParticipationScope) {
  const dispatch = useAppDispatch();
  const page = useAppSelector((s) => s.tenderPage.byScope[scope]);
  const bomLoaded = useAppSelector((s) => s.utility.loaded);
  // Local: filtersSlice.columnVisibility belongs to the tenders page.
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});

  // v2 has no DataLoader; the BOM selects need their options.
  useEffect(() => {
    if (!bomLoaded) dispatch(fetchAllBomOptions());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The route's scope owns the deadline rule, so the tenders default is off.
  // Rows of one docket are one tender, so status and costing read docket-wide.
  const query = useAppSelector(
    (s): TenderQuery => ({ ...selectTenderQuery(s, scope, false), docketRollup: true }),
    (a, b) => tenderQueryKey(a) === tenderQueryKey(b),
  );
  const queryKey = useMemo(() => tenderQueryKey(query), [query]);
  // Per-person and flow counts answer "how many dockets are in this stage", so
  // they ignore the table's filters and never refetch on paging or sorting.
  // Post participation keeps its deadline window, as v1's sidebar did.
  const countsQuery = useMemo(() => {
    const base = buildCountsQuery(query);
    const deadline = scope === "postParticipation" ? query.columnFilters.deadline : undefined;
    return deadline ? { ...base, columnFilters: { deadline } } : base;
  }, [query, scope]);
  const countsKey = useMemo(() => tenderFilterKey(countsQuery), [countsQuery]);

  const hasMetaRef = useRef(false);
  hasMetaRef.current = page.columns.length > 0;

  const reload = useCallback(() => {
    dispatch(loadTenderPage({ scope, query, includeMeta: !hasMetaRef.current }));
    dispatch(loadParticipationCounts({ scope, query: countsQuery }));
  }, [dispatch, scope, query, countsQuery]);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const stableReload = useCallback(() => reloadRef.current(), []);

  const [seeded, setSeeded] = useState(!deadlineSeed(scope) || deadlineSeeded.has(scope));
  useEffect(() => {
    const dateRange = deadlineSeed(scope);
    if (seeded || !dateRange) return;
    deadlineSeeded.add(scope);
    dispatch(setScopeColumnFilter({ scope, column: "deadline", filter: { dateRange } }));
    setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Wait for the seed, or the first request is thrown away.
    if (!seeded) return;
    dispatch(loadTenderPage({ scope, query, includeMeta: !hasMetaRef.current }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, seeded]);

  useEffect(() => {
    dispatch(loadParticipationCounts({ scope, query: countsQuery }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countsKey]);

  // A sync rewrites rows wholesale.
  useEffect(() => {
    if (!page.stale) return;
    dispatch(clearStale({ scope }));
    reloadRef.current();
  }, [page.stale, dispatch, scope]);

  const loadFilterValues = useCallback(
    (columnId: string) => dispatch(loadTenderFacet({ scope, query, column: columnId })),
    [dispatch, scope, query],
  );

  const facetOptions = useMemo(() => {
    const out: Record<string, { options: FilterOption[] | null; loading: boolean }> = {};
    for (const [id, entry] of Object.entries(page.facets)) {
      out[id] = {
        options:
          entry.status === "error" ? null : entry.options.map((v) => ({ value: v, label: v })),
        loading: entry.status === "loading",
      };
    }
    return out;
  }, [page.facets]);

  const getFilterOptions = useCallback(
    (columnId: string) => facetOptions[columnId] ?? NO_OPTIONS,
    [facetOptions],
  );

  const onFilterChange = useCallback(
    (columnId: string, type: ColumnFilterType, value: unknown | undefined) => {
      if (columnId === ERP_CATEGORY_FILTER) {
        // One category at a time: the newest pick replaces the last.
        const category = (value as string[] | undefined)?.at(-1) ?? null;
        dispatch(setErpItemCategory({ scope, category }));
        return;
      }
      // Read at dispatch time: a filter panel can send two changes in one event.
      dispatch((_, getState) => {
        const state = getState() as RootState;
        const next: ColumnFilterState = {
          ...state.tenderPage.byScope[scope].columnFilters[columnId],
          [type]: value,
        };
        if (value === undefined) delete next[type];
        dispatch(
          setScopeColumnFilter({
            scope,
            column: columnId,
            filter: Object.keys(next).length > 0 ? next : null,
          }),
        );
      });
    },
    [dispatch, scope],
  );

  const filters = useMemo(
    () =>
      page.erpItemCategory
        ? { ...page.columnFilters, [ERP_CATEGORY_FILTER]: { select: [page.erpItemCategory] } }
        : page.columnFilters,
    [page.columnFilters, page.erpItemCategory],
  );

  const countsQueryRef = useRef(countsQuery);
  countsQueryRef.current = countsQuery;
  // A saved rank, status or RA date moves the docket to another flow node. The
  // row is patched in place; only the counts are asked for again.
  const reloadCounts = useCallback(() => {
    dispatch(loadParticipationCounts({ scope, query: countsQueryRef.current }));
  }, [dispatch, scope]);

  const cellContext = useMemo<TenderCellContext>(
    () => ({
      associations: page.associations,
      canEditRemarks: false,
      reload: stableReload,
      scope,
      isLocked: LOCKS[scope],
      onFieldSaved: scope === "postParticipation" ? reloadCounts : undefined,
    }),
    [page.associations, stableReload, scope, reloadCounts],
  );

  return {
    query,
    rows: page.rows,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    sort: page.sort ?? DEFAULT_SORT,
    counts: page.participationCounts,
    associations: page.associations,
    associationFilter: page.associationFilter,
    filters,
    columnVisibility,
    onColumnVisibilityChange: setColumnVisibility,
    cellContext,
    /** Nothing to draw yet: the first page has not arrived. */
    initializing: page.columns.length === 0 && page.status !== "error",
    loading: page.status === "loading",
    error: page.status === "error" ? page.error : null,
    reload: stableReload,
    getFilterOptions,
    loadFilterValues,
    onFilterChange,
    onResetFilters: useCallback(() => {
      const associationFilter = page.associationFilter;
      dispatch(clearScopeFilters({ scope }));
      // Column filters only: the assignee has its own chip.
      dispatch(setAssociationFilter({ scope, associationFilter }));
    }, [dispatch, scope, page.associationFilter]),
    onPageChange: useCallback(
      (p: number) => dispatch(setPage({ scope, page: p })),
      [dispatch, scope],
    ),
    onPageSizeChange: useCallback(
      (n: number) => dispatch(setPageSize({ scope, pageSize: n })),
      [dispatch, scope],
    ),
    onSortChange: useCallback(
      (sort: { column: string; direction: "asc" | "desc" }) =>
        dispatch(setSort({ scope, sort })),
      [dispatch, scope],
    ),
    setAssociationFilter: useCallback(
      (value: string | null) =>
        dispatch(setAssociationFilter({ scope, associationFilter: value })),
      [dispatch, scope],
    ),
  };
}

const NO_OPTIONS = { options: null, loading: false } as const;
