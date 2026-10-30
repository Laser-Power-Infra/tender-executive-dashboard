"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { loadColumnConfig, type ColumnConfig } from "@/lib/columnConfig";
import { getDisplayNameMap } from "@/lib/tender-columns";
import { needsFacetQuery } from "@/lib/tender-filter-meta";
import type { FlatRow } from "@/lib/tender-flatten";
import type { TenderQuery, TenderScope } from "@/lib/tender-query";
import type { ColumnFilterType, FilterOption } from "@/lib/types";
import {
  clearColumnFilter,
  resetColumnFilters,
  setColumnFilter,
  setColumnVisibility,
} from "@/lib/slices/filtersSlice";
import {
  clearStale,
  loadTenderFacet,
  loadTenderPage,
  loadTenderSummary,
  selectTenderQuery,
  setAssociationFilter,
  setMergedGroups,
  setPage,
  setPageSize,
  setSort,
  tenderQueryKey,
  type TenderPageAssociation,
} from "@/lib/slices/tenderPageSlice";

/** This page's slot in the scope-keyed tenderPage slice. */
const SCOPE = "tenders" as const;

export type ColumnIndexRow = NonNullable<ColumnConfig["indices"]>[number];

/** What cells need beyond their own row. */
export interface TenderCellContext {
  associations: TenderPageAssociation[];
  canEditRemarks: boolean;
  reload: () => void;
  /** The tenderPage slot the rows come from, for pages that share cells. */
  scope?: TenderScope;
  /** True when the page does not let this row edit that field. */
  isLocked?: (fieldId: string, row: FlatRow) => boolean;
  /** Called after a registry field saves, for figures the row patch does not reach. */
  onFieldSaved?: () => void;
}

export const TenderCellContext = createContext<TenderCellContext>({
  associations: [],
  canEditRemarks: false,
  reload: () => {},
});

export const useTenderCellContext = () => useContext(TenderCellContext);

/**
 * All Redux wiring for the tenders page. Same slices, thunks and selectors as
 * v1, so the data is loaded and patched exactly the same way.
 */
export function useTenders() {
  const dispatch = useAppDispatch();
  const page = useAppSelector((s) => s.tenderPage.byScope[SCOPE]);
  const columnFilters = useAppSelector((s) => s.filters.columnFilters);
  const columnVisibility = useAppSelector((s) => s.filters.columnVisibility);
  const uploadResults = useAppSelector((s) => s.upload.results);
  const resultUploadVersion = useAppSelector((s) => s.upload.resultUploadVersion);
  const { data: session } = useSession();
  const canEditRemarks =
    session?.user?.role === "admin" || session?.user?.role === "developer";

  const [displayNameMap, setDisplayNameMap] = useState<Record<string, string>>({});
  const [columnIndices, setColumnIndices] = useState<ColumnIndexRow[]>([]);

  useEffect(() => {
    loadColumnConfig()
      .then(({ mappings, groups, indices }) => {
        if (mappings) setDisplayNameMap(getDisplayNameMap(mappings));
        if (groups) {
          dispatch(
            setMergedGroups({
              scope: SCOPE,
              groups: groups.map((g) => ({
                label: g.label,
                separator: g.separator,
                fields: JSON.parse(g.fields) as string[],
              })),
            }),
          );
        }
        if (indices) setColumnIndices(indices);
      })
      .catch(() => {});
  }, [dispatch]);

  // One object per distinct filter combination; the equality check keeps its
  // identity stable across unrelated dispatches.
  const query = useAppSelector(
    (s): TenderQuery =>
      // The deadline floor is a real column filter now, not an implicit rule.
      selectTenderQuery(s, SCOPE, false),
    (a, b) => tenderQueryKey(a) === tenderQueryKey(b),
  );
  const queryKey = useMemo(() => tenderQueryKey(query), [query]);
  const loadedKeyRef = useRef<string | null>(null);
  const hasMetaRef = useRef(false);
  hasMetaRef.current = page.columns.length > 0;

  const reload = useCallback(() => {
    dispatch(loadTenderPage({ scope: SCOPE, query, includeMeta: !hasMetaRef.current }));
    dispatch(loadTenderSummary({ scope: SCOPE, query }));
    loadedKeyRef.current = queryKey;
  }, [dispatch, query, queryKey]);

  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const stableReload = useCallback(() => reloadRef.current(), []);

  useEffect(() => {
    if (loadedKeyRef.current === queryKey) return;
    reloadRef.current();
  }, [queryKey]);

  useEffect(() => {
    if (!page.stale) return;
    dispatch(clearStale({ scope: SCOPE }));
    reloadRef.current();
  }, [page.stale, dispatch]);

  // An upload rewrites rows wholesale.
  useEffect(() => {
    if (uploadResults && uploadResults.length > 0) reloadRef.current();
  }, [uploadResults]);
  useEffect(() => {
    if (resultUploadVersion > 0) reloadRef.current();
  }, [resultUploadVersion]);

  const mergedLabels = useMemo(
    () => page.mergedGroups.map((g) => g.label),
    [page.mergedGroups],
  );

  const onFilterOpen = useCallback(
    (columnId: string) => {
      // Hardcoded-option columns never need a round trip.
      if (!needsFacetQuery(columnId, mergedLabels)) return;
      dispatch(loadTenderFacet({ scope: SCOPE, query, column: columnId }));
    },
    [dispatch, query, mergedLabels],
  );

  const facetOptions = useMemo(() => {
    const out: Record<string, { options: FilterOption[] | null; loading: boolean }> = {};
    for (const [id, entry] of Object.entries(page.facets)) {
      out[id] = {
        options:
          entry.status === "error"
            ? null
            : entry.options.map((v) => ({ value: v, label: v })),
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
    (accessor: string, filterType: ColumnFilterType, value: unknown | undefined) => {
      if (value === undefined) dispatch(clearColumnFilter({ accessor, filterType }));
      else dispatch(setColumnFilter({ accessor, filterType, value }));
      dispatch(setPage({ scope: SCOPE, page: 1 }));
    },
    [dispatch],
  );

  const cellContext = useMemo<TenderCellContext>(
    () => ({ associations: page.associations, canEditRemarks, reload: stableReload }),
    [page.associations, canEditRemarks, stableReload],
  );

  return {
    query,
    rows: page.rows,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    sort: page.sort,
    summary: page.summary,
    associations: page.associations,
    associationFilter: page.associationFilter,
    mergedGroups: page.mergedGroups,
    serverColumns: page.columns,
    displayNameMap,
    columnIndices,
    columnFilters,
    columnVisibility,
    cellContext,
    /** Nothing to draw yet: the column list has not arrived. */
    initializing: page.columns.length === 0 && page.status !== "error",
    loading: page.status === "loading",
    error: page.status === "error" ? page.error : null,
    reload: stableReload,
    getFilterOptions,
    onFilterOpen,
    onFilterChange,
    onResetFilters: useCallback(() => {
      dispatch(resetColumnFilters());
      dispatch(setPage({ scope: SCOPE, page: 1 }));
    }, [dispatch]),
    onColumnVisibilityChange: useCallback(
      (vis: Record<string, boolean>) => dispatch(setColumnVisibility(vis)),
      [dispatch],
    ),
    onPageChange: useCallback(
      (p: number) => dispatch(setPage({ scope: SCOPE, page: p })),
      [dispatch],
    ),
    onPageSizeChange: useCallback(
      (n: number) => dispatch(setPageSize({ scope: SCOPE, pageSize: n })),
      [dispatch],
    ),
    onSortChange: useCallback(
      (sort: { column: string; direction: "asc" | "desc" }) =>
        dispatch(setSort({ scope: SCOPE, sort })),
      [dispatch],
    ),
    setAssociationFilter: useCallback(
      (value: string | null) =>
        dispatch(setAssociationFilter({ scope: SCOPE, associationFilter: value })),
      [dispatch],
    ),
  };
}

const NO_OPTIONS = { options: null, loading: false } as const;
