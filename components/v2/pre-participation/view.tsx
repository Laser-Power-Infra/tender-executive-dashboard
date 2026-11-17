"use client";

import { useCallback, useMemo, useState } from "react";
import { useIsDeveloper } from "@/components/v2/providers";
import { toast } from "sonner";
import { Download, ExternalLink, SlidersHorizontal } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  clearParticipationFilters,
  setAnalyticsFilter,
  setExclusionFilter,
  toggleParticipationFilter,
} from "@/lib/slices/filtersSlice";
import { DataTable } from "@/components/v2/data-table/data-table";
import { leafColumns, type FilterChip } from "@/components/v2/data-table/types";
import { Button } from "@/components/v2/ui/button";
import { describeError } from "@/components/v2/ui/errors";
import { Popover, Select } from "@/components/v2/ui/overlay";
import { Page, PageHeader, Pill, Skeleton } from "@/components/v2/ui/page";
import { ANALYTICS } from "@/components/v2/tenders/tenders-view";
import { EXCLUSION_OPTIONS, UploadWindowControl } from "@/components/v2/tenders/toolbar";
import { BLANK, rawMaterialsFilter } from "@/components/v2/tenders/columns";
import { TenderCellContext } from "@/components/v2/tenders/use-tenders";
import { buildPreParticipationColumns, loadsFilterValues } from "./columns";
import { exportPreParticipation } from "./export";
import { docketKey, type Row } from "./fields";
import { activePath, type FlowFilter } from "./flow";
import { FlowBand } from "./flow-band";
import { usePreParticipation, type ParticipationScope } from "./use-pre-participation";
import { say } from "@/lib/pip-says";

const getRowId = (row: Row) => row.id;

const ANY_PRICE = "__any__";
const PRICE_OPTIONS = [
  { value: ANY_PRICE, label: "Any price basis" },
  { value: "FIRM", label: "Firm" },
  { value: "VARIABLE", label: "Variable" },
];
// A tender with no price set is quoted firm, so "Firm" includes the blanks.
const PRICE_SELECTION: Record<string, string[] | undefined> = {
  FIRM: ["FIRM", BLANK.value],
  VARIABLE: ["VARIABLE"],
};

const TITLES: Record<ParticipationScope, string> = {
  home: "Pre participation",
  postParticipation: "Post participation",
  notParticipated: "Not participated",
  quotationPending: "Quotation pending",
};

const POST_SHEET =
  "https://docs.google.com/spreadsheets/d/1GTwzxMgViohbCimXqfiBZBJsKbCSr7hCgbcHF_En1VE";

function Loading({ title }: { title: string }) {
  return (
    <Page aria-busy aria-label={`Loading ${title.toLowerCase()}`}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-8 w-80" />
      <Skeleton className="min-h-0 flex-1" />
    </Page>
  );
}

export function ParticipationView({ scope }: { scope: ParticipationScope }) {
  const dispatch = useAppDispatch();
  const title = TITLES[scope];
  const developer = useIsDeveloper();
  const t = usePreParticipation(scope);
  const participationFilters = useAppSelector((s) => s.filters.participationFilters);
  const analyticsFilter = useAppSelector((s) => s.filters.analyticsFilter);
  const exclusionFilter = useAppSelector((s) => s.filters.exclusionFilter);
  const [exporting, setExporting] = useState(false);

  const { associations, associationFilter, setAssociationFilter, query, loadFilterValues } = t;
  const { onFilterChange } = t;
  // Both strip controls write the matching column's filter, so the strip and
  // the column header cannot disagree and the chip comes from the column.
  const priceSelect = t.filters.price?.select ?? [];
  const priceBasis = priceSelect.includes("FIRM")
    ? "FIRM"
    : priceSelect.includes("VARIABLE")
      ? "VARIABLE"
      : ANY_PRICE;
  const rawMaterials = t.filters.rawMaterials?.rawMaterials;
  const rawMaterialsSummary =
    rawMaterialsFilter?.type === "custom" ? rawMaterialsFilter.summary(rawMaterials) : null;

  const columns = useMemo(
    () => buildPreParticipationColumns(associations, scope, developer),
    [associations, scope, developer],
  );

  const onFilterOpen = useCallback(
    (columnId: string) => {
      if (loadsFilterValues(leafColumns(columns).find((c) => c.id === columnId))) {
        loadFilterValues(columnId);
      }
    },
    [columns, loadFilterValues],
  );

  // The slice has toggle and clear only. Both run in one event, so the page
  // is asked for once.
  const setFlow = useCallback(
    (next: FlowFilter[]) => {
      dispatch(clearParticipationFilters());
      for (const filter of next) dispatch(toggleParticipationFilter(filter));
    },
    [dispatch],
  );

  const personCounts = useMemo(() => {
    const byId = new Map(t.counts?.personCounts.map((p) => [p.id, p.count]));
    return associations
      .map((a) => ({ ...a, count: byId.get(a.id) ?? 0 }))
      .filter((p) => p.count > 0);
  }, [t.counts, associations]);

  // What narrows the list beyond the column filters. The last three are set on
  // other pages and carry over. The upload window shows on its own control.
  const extraChips = useMemo(() => {
    const chips: FilterChip[] = [];
    const person = associations.find((a) => String(a.id) === associationFilter);
    if (person) {
      chips.push({
        key: "assignee",
        label: `Assigned to: ${person.name}`,
        onRemove: () => setAssociationFilter(null),
      });
    }
    if (participationFilters.length > 0) {
      const path = activePath(participationFilters);
      chips.push({
        key: "participation",
        label:
          path.length > 0
            ? `Flow: ${path.map((n) => n.label).join(" > ")}`
            : `Post participation filter: ${participationFilters.length} active`,
        onRemove: () => dispatch(clearParticipationFilters()),
      });
    }
    const analytics = ANALYTICS.find((a) => a.key === analyticsFilter);
    if (analytics) {
      chips.push({
        key: "analytics",
        label: `${analytics.label}: ${analytics.detail.toLowerCase()}`,
        onRemove: () => dispatch(setAnalyticsFilter(null)),
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
    return chips;
  }, [
    associations,
    associationFilter,
    setAssociationFilter,
    participationFilters,
    analyticsFilter,
    exclusionFilter,
    dispatch,
  ]);

  const handleExport = () => {
    setExporting(true);
    // One sheet column per field, stacked or not.
    const visible = leafColumns(
      columns.filter((c) => !c.hidden && t.columnVisibility[c.id] !== false),
    );
    toast.promise(
      exportPreParticipation(query, visible, title).finally(() => setExporting(false)),
      {
        loading: say.exporting(),
        success: (n) => say.exported(n, "tender"),
        error: async (err) => `${say.couldNot("export them")} ${await describeError(err)}`,
      },
    );
  };

  if (t.initializing) return <Loading title={title} />;

  return (
    <Page>
      <PageHeader
        title={title}
        meta={`${t.total.toLocaleString("en-IN")} dockets`}
        actions={
          <>
            {scope === "postParticipation" && (
              <Button
                icon={<ExternalLink className="size-3.5" />}
                onClick={() => window.open(POST_SHEET, "_blank", "noopener,noreferrer")}
              >
                Open sheet
              </Button>
            )}
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

      {scope === "postParticipation" && (
        <FlowBand
          counts={t.counts?.nodes ?? null}
          active={participationFilters}
          onChange={setFlow}
        />
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-44">
          <Select
            label="Price basis"
            value={priceBasis}
            onChange={(v) => onFilterChange("price", "select", PRICE_SELECTION[v ?? ANY_PRICE])}
            options={PRICE_OPTIONS}
          />
        </div>
        <Popover
          trigger={
            <Button icon={<SlidersHorizontal className="size-3.5" />}>
              Aluminium and copper
              {rawMaterialsSummary && (
                <span className="tabular-nums text-ink-3">{rawMaterialsSummary}</span>
              )}
            </Button>
          }
        >
          <div className="flex w-72 flex-col gap-3">
            <h3 className="font-semibold">Aluminium and copper price</h3>
            {rawMaterialsFilter?.type === "custom" &&
              rawMaterialsFilter.render({
                value: rawMaterials,
                onChange: (value) => onFilterChange("rawMaterials", "rawMaterials", value),
              })}
          </div>
        </Popover>
        <UploadWindowControl />
      </div>

      {personCounts.length > 0 && (
        <div
          className="-my-0.5 flex shrink-0 items-center gap-1.5 overflow-x-auto py-0.5"
          role="group"
          aria-label="Dockets by person"
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
          noun="dockets"
          columns={columns}
          rows={t.rows}
          getRowId={getRowId}
          groupBy={docketKey}
          total={t.total}
          page={t.page}
          pageSize={t.pageSize}
          onPageChange={t.onPageChange}
          onPageSizeChange={t.onPageSizeChange}
          sort={t.sort}
          onSortChange={t.onSortChange}
          filters={t.filters}
          onFilterChange={t.onFilterChange}
          onResetFilters={t.onResetFilters}
          getFilterOptions={t.getFilterOptions}
          onFilterOpen={onFilterOpen}
          columnVisibility={t.columnVisibility}
          onColumnVisibilityChange={t.onColumnVisibilityChange}
          loading={t.loading}
          error={t.error}
          onRetry={t.reload}
          extraChips={extraChips}
        />
      </TenderCellContext>
    </Page>
  );
}
