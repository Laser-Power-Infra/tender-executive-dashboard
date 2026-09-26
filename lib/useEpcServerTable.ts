"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  loadParticipationCounts,
  loadTenderFacet,
  loadTenderPage,
  selectTenderQuery,
  setAssociationFilter as setAssociationFilterAction,
  setEpcFilters,
  setPage,
  setPageSize,
  setSort,
  tenderFilterKey,
  tenderQueryKey,
} from "@/lib/slices/tenderPageSlice";
import { fetchAllFilteredTenderRows } from "@/actions/tender-query";
import { mapTenderSliceToEpcRecords } from "@/lib/mapTenderSliceToEpcRecords";
import { buildCountsQuery, buildEpcQueryFilters } from "@/lib/epc-table-query";
// Prisma-free imports only: lib/tender-query pulls the generated client in, so a
// value import from it would drag Prisma into this client bundle.
import type { TenderQuery, TenderScope } from "@/lib/tender-query";
import { epcNeedsFacetQuery } from "@/lib/epc-column-map";
import type { EpcServerMode, EpcTableFilters } from "@/components/TenderTable";
import type { TenderData } from "@/lib/slices/tendersSlice";
import type { EpcTenderRecord } from "@/types/tender";

/**
 * Everything the three EPC dashboards need to render a server-paged table.
 *
 * The table keeps owning its filter widgets and reports them back through
 * onFiltersChange; this hook turns them into a TenderQuery, fetches the page
 * and the sidebar counts, and maps the flat rows into EpcTenderRecords.
 */
export interface EpcSidebarFilters {
  priceBasis?: string;
  aluminiumMin?: string;
  aluminiumMax?: string;
  copperMin?: string;
  copperMax?: string;
  /** Extra deadline window ANDed with the table's own. */
  deadlineFrom?: string;
  deadlineTo?: string;
}

export function useEpcServerTable(
  scope: TenderScope,
  sidebar: EpcSidebarFilters,
) {
  const dispatch = useAppDispatch();
  const page = useAppSelector((s) => s.tenderPage.byScope[scope]);
  const [tableFilters, setTableFilters] = useState<EpcTableFilters | null>(null);

  const {
    priceBasis,
    aluminiumMin,
    aluminiumMax,
    copperMin,
    copperMax,
    deadlineFrom,
    deadlineTo,
  } = sidebar;

  // The table reports its filters on every one of its own state changes; the
  // reducer ignores an unchanged payload, so this cannot loop.
  useEffect(() => {
    const built = buildEpcQueryFilters({
      table: tableFilters,
      priceBasis,
      aluminiumMin,
      aluminiumMax,
      copperMin,
      copperMax,
      deadlineFrom,
      deadlineTo,
    });
    dispatch(setEpcFilters({ scope, ...built }));
  }, [
    dispatch,
    scope,
    tableFilters,
    priceBasis,
    aluminiumMin,
    aluminiumMax,
    copperMin,
    copperMax,
    deadlineFrom,
    deadlineTo,
  ]);

  // One object per distinct filter combination. The equality check keeps the
  // identity stable across unrelated dispatches, so the effect below only fires
  // when something the server cares about actually changed. The route's scope
  // owns the deadline rule, so the /tenders default is off here.
  const query = useAppSelector(
    (s): TenderQuery => selectTenderQuery(s, scope, false),
    (a, b) => tenderQueryKey(a) === tenderQueryKey(b),
  );
  const queryKey = useMemo(() => tenderQueryKey(query), [query]);
  const loadedKeyRef = useRef<string | null>(null);
  const hasMetaRef = useRef(false);
  hasMetaRef.current = page.columns.length > 0;

  useEffect(() => {
    if (loadedKeyRef.current === queryKey) return;
    loadedKeyRef.current = queryKey;
    dispatch(loadTenderPage({ scope, query, includeMeta: !hasMetaRef.current }));
  }, [dispatch, scope, query, queryKey]);

  // The sidebar is a navigation baseline, not a view of the filtered page: its
  // counts answer "how many dockets are in this stage", so they get their own
  // query and their own key. tenderFilterKey zeroes page/pageSize/sort, so
  // paging and sorting never refetch them either.
  const countsQuery = useMemo(
    () => buildCountsQuery(query, deadlineFrom, deadlineTo),
    [query, deadlineFrom, deadlineTo],
  );
  const countsKey = useMemo(() => tenderFilterKey(countsQuery), [countsQuery]);
  const loadedCountsKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadedCountsKeyRef.current === countsKey) return;
    loadedCountsKeyRef.current = countsKey;
    dispatch(loadParticipationCounts({ scope, query: countsQuery }));
  }, [dispatch, scope, countsQuery, countsKey]);

  // A sync rewrites rows wholesale, so that one case still refetches.
  useEffect(() => {
    if (!page.stale) return;
    loadedKeyRef.current = null;
    loadedCountsKeyRef.current = null;
    dispatch(loadTenderPage({ scope, query, includeMeta: false }));
    dispatch(loadParticipationCounts({ scope, query: countsQuery }));
  }, [dispatch, scope, query, countsQuery, page.stale]);

  const records = useMemo<EpcTenderRecord[]>(() => {
    const data = {
      fileName: "",
      columns: page.columns,
      rows: page.rows,
      associations: page.associations,
      totalGem: 0,
      totalNonGem: 0,
    } as unknown as TenderData;
    const mapped = mapTenderSliceToEpcRecords(data);
    // slNo is a running number; the mapper restarts it at 1 on every page.
    const offset = (page.page - 1) * page.pageSize;
    return offset === 0
      ? mapped
      : mapped.map((r, i) => ({ ...r, slNo: offset + i + 1 }));
  }, [page.rows, page.columns, page.associations, page.page, page.pageSize]);

  const getFacetOptions = useCallback(
    (accessor: string): string[] | null => {
      const entry = page.facets[accessor];
      // null means "not loaded"; an empty array would hide every option.
      if (!entry || entry.status !== "ready") return null;
      return entry.options;
    },
    [page.facets],
  );

  const requestFacet = useCallback(
    (accessor: string) => {
      // The server re-checks this; skipping here only avoids a dead round trip.
      if (!epcNeedsFacetQuery(accessor)) return;
      dispatch(loadTenderFacet({ scope, query, column: accessor }));
    },
    [dispatch, scope, query],
  );

  const getAllFilteredRows = useCallback(async (): Promise<EpcTenderRecord[]> => {
    const rows = await fetchAllFilteredTenderRows(query, null);
    return mapTenderSliceToEpcRecords({
      fileName: "",
      columns: page.columns,
      rows,
      associations: page.associations,
      totalGem: 0,
      totalNonGem: 0,
    } as unknown as TenderData);
  }, [query, page.columns, page.associations]);

  const server = useMemo<EpcServerMode>(
    () => ({
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      sort: query.sort,
      loading: page.status === "loading",
      associations: page.associations,
      onPageChange: (p: number) => dispatch(setPage({ scope, page: p })),
      onPageSizeChange: (n: number) => dispatch(setPageSize({ scope, pageSize: n })),
      onSortChange: (sort) => dispatch(setSort({ scope, sort })),
      onFiltersChange: setTableFilters,
      getFacetOptions,
      requestFacet,
      getAllFilteredRows,
    }),
    [
      dispatch,
      scope,
      page.total,
      page.page,
      page.pageSize,
      page.status,
      page.associations,
      query.sort,
      getFacetOptions,
      requestFacet,
      getAllFilteredRows,
    ],
  );

  const setAssociationFilter = useCallback(
    (value: string | null) =>
      dispatch(setAssociationFilterAction({ scope, associationFilter: value })),
    [dispatch, scope],
  );

  return {
    records,
    server,
    /**
     * First load only. Never key this on rows.length: a filter that matches
     * nothing would unmount TenderTable, and its filter widgets are local
     * state - they would come back empty and refetch the unfiltered page.
     * `columns` arrives with includeMeta on the first response and stays.
     */
    loading: page.status === "loading" && page.columns.length === 0,
    counts: page.participationCounts,
    associations: page.associations,
    associationFilter: page.associationFilter,
    setAssociationFilter,
  };
}
