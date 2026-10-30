"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { resetSelectedDateRange, setSelectedDateRange } from "@/lib/slices/filesSlice";
import {
  setAnalyticsFilter,
  setShowPastDeadlines,
  setExclusionFilter,
  type AnalyticsFilter,
} from "@/lib/slices/filtersSlice";
import { DataTable } from "@/components/v2/data-table/data-table";
import {
  isFilterActive,
  type FilterChip,
  type FormulaFilter,
} from "@/components/v2/data-table/types";
import { Button } from "@/components/v2/ui/button";
import { describeError } from "@/components/v2/ui/errors";
import { Page, PageHeader, Pill, Skeleton, StatTile } from "@/components/v2/ui/page";
import { buildTenderColumns } from "./columns";
import type { Row } from "./cells";
import { exportTenders } from "./export";
import {
  AiAnalysisButton,
  EXCLUSION_OPTIONS,
  ExclusionsMenu,
  UploadMenu,
  UploadWindowControl,
  formatUploadWindow,
  fromDayInput,
  toDayInput,
} from "./toolbar";
import { TenderCellContext, useTenders } from "./use-tenders";
import { say } from "@/lib/pip-says";

export const ANALYTICS: { key: NonNullable<AnalyticsFilter>; label: string; detail: string }[] = [
  { key: "aiYes", label: "AI relevance yes", detail: "All" },
  { key: "aiYesUnallocated", label: "AI relevance yes", detail: "Unallocated" },
  { key: "apmYesAllocated", label: "APM yes", detail: "Allocated" },
  { key: "apmYesUnallocated", label: "APM yes", detail: "Unallocated" },
];

const getRowId = (row: Row) => `${row.type}-${row.id}`;

function Loading() {
  return (
    <Page aria-busy aria-label="Loading tenders">
      <Skeleton className="h-8 w-48" />
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-40" />
        ))}
      </div>
      <Skeleton className="min-h-0 flex-1" />
    </Page>
  );
}

export function TendersView() {
  const dispatch = useAppDispatch();
  const t = useTenders();
  const analyticsFilter = useAppSelector((s) => s.filters.analyticsFilter);
  const exclusionFilter = useAppSelector((s) => s.filters.exclusionFilter);
  const showPastDeadlines = useAppSelector((s) => s.filters.showPastDeadlines);
  const dateFrom = useAppSelector((s) => s.files.selectedDateFrom);
  const dateTo = useAppSelector((s) => s.files.selectedDateTo);
  const [exporting, setExporting] = useState(false);

  const columns = useMemo(
    () =>
      buildTenderColumns({
        serverColumns: t.serverColumns,
        displayNameMap: t.displayNameMap,
        columnIndices: t.columnIndices,
        mergedGroups: t.mergedGroups,
        associations: t.associations,
      }),
    [t.serverColumns, t.displayNameMap, t.columnIndices, t.mergedGroups, t.associations],
  );

  const personCounts = useMemo(() => {
    if (!t.summary) return [];
    const byId = new Map(t.summary.personCounts.map((p) => [p.id, p.count]));
    return t.associations
      .map((a) => ({ ...a, count: byId.get(a.id) ?? 0 }))
      .filter((p) => p.count > 0);
  }, [t.summary, t.associations]);

  const { associations, associationFilter, setAssociationFilter, query, columnFilters } = t;

  // Filters that live outside the columns, so nothing narrows the list unseen.
  const extraChips = useMemo(() => {
    const chips: FilterChip[] = [];
    const analytics = ANALYTICS.find((a) => a.key === analyticsFilter);
    if (analytics) {
      chips.push({
        key: "analytics",
        label: `${analytics.label}: ${analytics.detail.toLowerCase()}`,
        onRemove: () => dispatch(setAnalyticsFilter(null)),
      });
    }
    const person = associations.find((a) => String(a.id) === associationFilter);
    if (person) {
      chips.push({
        key: "assignee",
        label: `Assigned to: ${person.name}`,
        onRemove: () => setAssociationFilter(null),
      });
    }
    const exclusion = EXCLUSION_OPTIONS.find((o) => o.value === exclusionFilter);
    if (exclusion) {
      chips.push({
        key: "exclusion",
        label: exclusion.label,
        onRemove: () => dispatch(setExclusionFilter(null)),
      });
    }
    const uploadWindow = formatUploadWindow(dateFrom, dateTo);
    if (uploadWindow) {
      chips.push({
        key: "uploaded",
        label: `Uploaded: ${uploadWindow}`,
        onRemove: () => dispatch(resetSelectedDateRange()),
      });
    }
    if (query.applyDefaultDeadlineFilter && !isFilterActive(columnFilters.deadline)) {
      chips.push({
        key: "deadline-default",
        label: "Deadline: today onward or not set",
        onRemove: () => dispatch(setShowPastDeadlines(true)),
      });
    }
    if (showPastDeadlines) {
      chips.push({
        key: "past-deadlines",
        label: "Including past deadlines",
        onRemove: () => dispatch(setShowPastDeadlines(false)),
      });
    }
    return chips;
  }, [
    analyticsFilter,
    associations,
    associationFilter,
    setAssociationFilter,
    exclusionFilter,
    dateFrom,
    dateTo,
    query.applyDefaultDeadlineFilter,
    showPastDeadlines,
    columnFilters.deadline,
    dispatch,
  ]);

  // The upload window is a toolbar control, not a column; the formula still carries it.
  const formulaFilters = useMemo<FormulaFilter[]>(
    () => [
      {
        id: "uploaded",
        name: "Uploaded",
        filter: { type: "dateRange" },
        value:
          dateFrom && dateTo
            ? { dateRange: { startDate: toDayInput(dateFrom), endDate: toDayInput(dateTo) } }
            : undefined,
        onChange: (value) => {
          const r = value?.dateRange;
          if (r?.startDate && r.endDate) {
            dispatch(setSelectedDateRange({ from: fromDayInput(r.startDate), to: fromDayInput(r.endDate) }));
          } else dispatch(resetSelectedDateRange());
        },
        check: (value) =>
          value.dateRange && !(value.dateRange.startDate && value.dateRange.endDate)
            ? "needs both dates: BETWEEN start AND end"
            : null,
      },
      {
        // Off by default: the page hides past deadlines until this is YES.
        id: "pastDeadlines",
        name: "Include past deadlines",
        filter: { type: "boolean" },
        value: showPastDeadlines ? { boolean: true } : undefined,
        onChange: (value) => dispatch(setShowPastDeadlines(!!value?.boolean)),
      },
    ],
    [dateFrom, dateTo, showPastDeadlines, dispatch],
  );

  const handleExport = () => {
    setExporting(true);
    const visible = columns
      .filter((c) => !c.hidden && t.columnVisibility[c.id] !== false)
      .map((c) => ({ id: c.id, header: c.header }));
    toast.promise(
      exportTenders({ query, columns: visible, mergedGroups: t.mergedGroups, associations }).finally(
        () => setExporting(false),
      ),
      {
        loading: say.exporting(),
        success: (n) => say.exported(n, "tender"),
        error: async (err) => `${say.couldNot("export them")} ${await describeError(err)}`,
      },
    );
  };

  if (t.initializing) return <Loading />;

  return (
    <Page>
      <PageHeader
        title="Tenders"
        meta={`${t.total.toLocaleString("en-IN")} matching`}
        actions={
          <>
            <UploadMenu />
            <AiAnalysisButton query={query} total={t.total} />
            <Button
              icon={<Download className="size-3.5" />}
              loading={exporting}
              onClick={handleExport}
            >
              Export
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-stretch gap-2">
        {ANALYTICS.map((a) => {
          const on = analyticsFilter === a.key;
          return (
            <StatTile
              key={a.key}
              label={a.label}
              detail={a.detail}
              value={t.summary ? t.summary[a.key].toLocaleString("en-IN") : null}
              selected={on}
              onClick={() => {
                dispatch(setAnalyticsFilter(on ? null : a.key));
                // These counts span every upload and every assignee.
                dispatch(resetSelectedDateRange());
                setAssociationFilter(null);
              }}
            />
          );
        })}
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <UploadWindowControl />
        </div>
      </div>

      {personCounts.length > 0 && (
        <div
          className="-my-0.5 flex shrink-0 items-center gap-1.5 overflow-x-auto py-0.5"
          role="group"
          aria-label="Assigned tenders by person"
        >
          <span className="shrink-0 text-xs text-ink-3">By person</span>
          {personCounts.map((p) => {
            const on = associationFilter === String(p.id);
            return (
              <Pill
                key={p.id}
                selected={on}
                count={p.count}
                onClick={() => setAssociationFilter(on ? null : String(p.id))}
              >
                {p.name}
              </Pill>
            );
          })}
        </div>
      )}

      <TenderCellContext value={t.cellContext}>
        <DataTable<Row>
          noun="tenders"
          columns={columns}
          rows={t.rows}
          getRowId={getRowId}
          total={t.total}
          page={t.page}
          pageSize={t.pageSize}
          onPageChange={t.onPageChange}
          onPageSizeChange={t.onPageSizeChange}
          sort={t.sort}
          onSortChange={t.onSortChange}
          filters={columnFilters}
          onFilterChange={t.onFilterChange}
          onResetFilters={t.onResetFilters}
          getFilterOptions={t.getFilterOptions}
          onFilterOpen={t.onFilterOpen}
          columnVisibility={t.columnVisibility}
          onColumnVisibilityChange={t.onColumnVisibilityChange}
          loading={t.loading}
          error={t.error}
          onRetry={t.reload}
          extraChips={extraChips}
          formulaFilters={formulaFilters}
          actions={<ExclusionsMenu />}
        />
      </TenderCellContext>
    </Page>
  );
}
