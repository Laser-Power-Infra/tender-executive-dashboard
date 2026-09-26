import type { EpcTableFilters } from "@/components/TenderTable";
import type { ColumnFilterState } from "@/lib/types";
// Type-only: a value import from lib/tender-query drags Prisma into the client bundle.
import type { TenderQuery } from "@/lib/tender-query";
import { normalizeEpcSelectTokens } from "@/lib/epc-column-map";
import {
  getISTMonthRange,
  getISTWeekRange,
  getISTYearRange,
} from "@/lib/format-ist";

/**
 * Turns the filter widgets TenderTable owns into the ColumnFilterState map the
 * SQL layer reads. One copy, shared by the three EPC dashboards, so a filter
 * cannot mean one thing on / and another on /not-participated.
 */

export interface EpcQueryFilterInput {
  table: EpcTableFilters | null;
  /** Sidebar controls, which live outside the table. */
  priceBasis?: string;
  aluminiumMin?: string;
  aluminiumMax?: string;
  copperMin?: string;
  copperMax?: string;
  /** An extra deadline window ANDed with the table's own (participatedDateRange). */
  deadlineFrom?: string;
  deadlineTo?: string;
  /** Injectable for the self-check; defaults to now. */
  now?: Date;
}

export interface EpcQueryFilters {
  columnFilters: Record<string, ColumnFilterState>;
  erpItemCategory: string | null;
  priceBasis: string | null;
}

function nonEmpty(value: string | undefined): string {
  return value?.trim() ?? "";
}

/**
 * A deadline preset as an explicit IST window, the same way the table's own
 * getDateRange() resolves it. Resolving it here means a preset and the page's
 * window can both apply; sending the preset name on alone dropped the latter.
 */
function presetWindow(
  preset: EpcTableFilters["datePreset"],
  now: Date,
): { from: string; to: string } | null {
  if (preset === "thisWeek") {
    const r = getISTWeekRange(now);
    return { from: r.fromKey, to: r.toKey };
  }
  if (preset === "thisMonth") {
    const r = getISTMonthRange(now);
    return { from: r.fromKey, to: r.toKey };
  }
  if (preset === "thisYear") {
    const r = getISTYearRange(now);
    return { from: r.fromKey, to: r.toKey };
  }
  return null;
}

/** Two windows ANDed: the later start and the earlier end win. */
function intersect(a: string, b: string, pick: "max" | "min"): string {
  if (!a) return b;
  if (!b) return a;
  if (pick === "max") return a > b ? a : b;
  return a < b ? a : b;
}

function setDateRange(
  out: Record<string, ColumnFilterState>,
  accessor: string,
  from: string,
  to: string,
) {
  if (!from && !to) return;
  out[accessor] = { ...out[accessor], dateRange: { startDate: from, endDate: to } };
}

export function buildEpcQueryFilters(input: EpcQueryFilterInput): EpcQueryFilters {
  const out: Record<string, ColumnFilterState> = {};
  const t = input.table;

  if (t) {
    for (const [accessor, values] of Object.entries(t.multiSelectFilters)) {
      if (!values || values.length === 0) continue;
      out[accessor] = {
        ...out[accessor],
        select: normalizeEpcSelectTokens(accessor, values),
      };
    }

    for (const [accessor, text] of Object.entries(t.columnSearchText)) {
      const trimmed = nonEmpty(text);
      if (!trimmed) continue;
      out[accessor] = { ...out[accessor], text: trimmed };
    }

    // A preset replaces the table's own start/end, exactly as getDateRange
    // does - but never the page's window, which is ANDed on top either way.
    const preset = presetWindow(t.datePreset, input.now ?? new Date());
    const tableFrom = preset ? preset.from : nonEmpty(t.startDate);
    const tableTo = preset ? preset.to : nonEmpty(t.endDate);
    setDateRange(
      out,
      "lastDateOfSubmission",
      intersect(tableFrom, nonEmpty(input.deadlineFrom), "max"),
      intersect(tableTo, nonEmpty(input.deadlineTo), "min"),
    );

    setDateRange(
      out,
      "reverseAuctionStartDate",
      nonEmpty(t.raStartFrom),
      nonEmpty(t.raStartTo),
    );
    setDateRange(
      out,
      "reverseAuctionEndDate",
      nonEmpty(t.raEndFrom),
      nonEmpty(t.raEndTo),
    );

    if (nonEmpty(t.remarksTextFilter)) {
      out.remarks = { ...out.remarks, text: t.remarksTextFilter.trim() };
    }
    if (t.remarksDropdownFilter && t.remarksDropdownFilter !== "All") {
      out.remarks = { ...out.remarks, select: [t.remarksDropdownFilter] };
    }
    if (nonEmpty(t.proposedErpItemTextFilter)) {
      out.proposedErpItemName = {
        ...out.proposedErpItemName,
        text: t.proposedErpItemTextFilter.trim(),
      };
    }
  } else {
    // Before the table has reported its state, the page's own window still applies.
    setDateRange(
      out,
      "lastDateOfSubmission",
      nonEmpty(input.deadlineFrom),
      nonEmpty(input.deadlineTo),
    );
  }

  const aluMin = nonEmpty(input.aluminiumMin);
  const aluMax = nonEmpty(input.aluminiumMax);
  const cuMin = nonEmpty(input.copperMin);
  const cuMax = nonEmpty(input.copperMax);
  if (aluMin || aluMax || cuMin || cuMax) {
    out.rawMaterials = { rawMaterials: { aluMin, aluMax, cuMin, cuMax } };
  }

  const category = t?.proposedErpItemCategoryFilter;
  const basis = nonEmpty(input.priceBasis);

  return {
    columnFilters: out,
    erpItemCategory: category && category !== "All" ? category : null,
    priceBasis: basis && basis.toLowerCase() !== "all" ? basis : null,
  };
}

/**
 * The sidebar's counts baseline: the scope predicate plus the sidebar's own
 * deadline window, nothing else. Participation filters, every table widget and
 * the sidebar's other controls are stripped, so clicking a flow node cannot
 * change the numbers printed on the flow nodes, and a table filter cannot
 * either. The window has to be rebuilt from the raw sidebar values because
 * buildEpcQueryFilters already intersected it with the table's own.
 */
export function buildCountsQuery(
  query: TenderQuery,
  deadlineFrom?: string,
  deadlineTo?: string,
): TenderQuery {
  const from = nonEmpty(deadlineFrom);
  const to = nonEmpty(deadlineTo);
  return {
    ...query,
    columnFilters:
      from || to
        ? { lastDateOfSubmission: { dateRange: { startDate: from, endDate: to } } }
        : {},
    participationFilters: [],
    analyticsFilter: null,
    exclusionFilter: null,
    associationFilter: null,
    erpItemCategory: null,
    priceBasis: null,
    fileDateFromIso: null,
    fileDateToIso: null,
  };
}
