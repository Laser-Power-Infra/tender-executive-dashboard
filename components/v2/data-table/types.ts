import type { ReactNode } from "react";
import type {
  ColumnFilterState,
  ColumnFilterType,
  FilterOption,
} from "@/lib/types";

export type { ColumnFilterState, ColumnFilterType, FilterOption };

export type ColumnFilter =
  | {
      type: "select";
      /** Static options. Server-loaded ones arrive through `getFilterOptions`. */
      options?: FilterOption[];
      /**
       * The option search box also filters rows by "contains", replacing any
       * picked values. For columns with too many distinct values to pick from.
       */
      searchAsText?: boolean;
    }
  | {
      type: "dateRange";
      /** Named ranges, stored under `select`; exclusive with a typed range. */
      presets?: FilterOption[];
    }
  | { type: "boolean" }
  | {
      /** Anything else: the column definition owns the control. */
      type: "custom";
      stateKey: ColumnFilterType;
      render: (props: {
        value: unknown;
        onChange: (value: unknown | undefined) => void;
      }) => ReactNode;
      summary: (value: unknown) => string | null;
    };

export interface CellContext {
  rowIndex: number;
}

/**
 * Everything specific to a page lives here: what a cell shows, which buttons
 * and dialogs it carries, how the column filters. The table itself knows none
 * of it, so any page can reuse it with its own definitions.
 */
export interface DataTableColumn<Row> {
  /** Row key and the id the server filters and sorts by. */
  id: string;
  header: string;
  width?: number;
  /** What the column means in people's words; Pip reads it to pick the right column. */
  hint?: string;
  /** Pinned to the left edge. */
  frozen?: boolean;
  /** Never rendered and not offered in the column picker. */
  hidden?: boolean;
  sortable?: boolean;
  /** Free-text "contains" search on this column. Defaults to true. */
  search?: boolean;
  filter?: ColumnFilter;
  /** Further select filters shown in this column's panel, keyed by their own id. */
  extraFilters?: { id: string; label: string; options?: FilterOption[] }[];
  /** Small tags under the header label. */
  badges?: string[];
  /** One cell for the whole row group, drawn from its first row. Needs `groupBy`. */
  spanGroup?: boolean;
  cell?: (row: Row, ctx: CellContext) => ReactNode;
  /** Plain text for the default cell; defaults to `String(row[id])`. */
  text?: (row: Row) => string;
  /**
   * Several fields stacked in one column. Each member keeps its own id, cell,
   * filter and sort; this column supplies the header, width and position only.
   */
  members?: DataTableColumn<Row>[];
}

/** The columns that hold data: a stacked column counts as its members. */
export const leafColumns = <Row>(columns: DataTableColumn<Row>[]): DataTableColumn<Row>[] =>
  columns.flatMap((c) => c.members ?? [c]);

/** Every filter id a column's panel writes to. */
export const filterIds = <Row>(column: DataTableColumn<Row>): string[] =>
  leafColumns([column]).flatMap((c) => [c.id, ...(c.extraFilters ?? []).map((e) => e.id)]);

export interface ColumnStack<Row = unknown> {
  header: string;
  /** Column ids in the order they stack; the first one present names the column. */
  members: string[];
  width?: number;
  /** Draws the whole cell for a row instead of the members; null keeps the members. */
  cell?: (row: Row) => ReactNode;
}

/**
 * Folds each stack's columns into one, placed where the first of them stood.
 * A stack with fewer than two of its columns present is left as it is.
 */
export function stackColumns<Row>(
  columns: DataTableColumn<Row>[],
  stacks: ColumnStack<Row>[],
): DataTableColumn<Row>[] {
  const out: DataTableColumn<Row>[] = [];
  const done = new Set<ColumnStack<Row>>();
  for (const column of columns) {
    const stack = stacks.find((s) => s.members.includes(column.id));
    const members = stack
      ? stack.members.flatMap((id) => columns.filter((c) => c.id === id))
      : [];
    if (!stack || members.length < 2) {
      out.push(column);
      continue;
    }
    if (done.has(stack)) continue;
    done.add(stack);
    out.push({
      id: members[0].id,
      header: stack.header,
      width: stack.width ?? Math.max(220, ...members.map((m) => m.width ?? 0)),
      frozen: members.some((m) => m.frozen) || undefined,
      cell: stack.cell,
      members,
    });
  }
  return out;
}

export interface SortState {
  column: string;
  direction: "asc" | "desc";
}

export interface FilterChip {
  key: string;
  label: string;
  /** Omit for an informational chip that cannot be dismissed. */
  onRemove?: () => void;
}

/**
 * A page filter that is not a column (a toolbar control), offered to the
 * filter formula under its own name. Its chip stays the page's `extraChips`.
 */
export interface FormulaFilter {
  id: string;
  name: string;
  filter: ColumnFilter;
  value: ColumnFilterState | undefined;
  /** `undefined` clears it. */
  onChange: (value: ColumnFilterState | undefined) => void;
  /** Why a parsed value cannot be applied, if it cannot. */
  check?: (value: ColumnFilterState) => string | null;
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowId: (row: Row) => string;
  /** Consecutive rows with the same key form one group; see `spanGroup`. */
  groupBy?: (row: Row) => string;

  total: number;
  page: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;

  sort: SortState | null;
  onSortChange: (sort: SortState) => void;

  filters: Record<string, ColumnFilterState>;
  /** `undefined` clears that part of the column's filter. */
  onFilterChange: (
    columnId: string,
    type: ColumnFilterType,
    value: unknown | undefined,
  ) => void;
  onResetFilters: () => void;
  /** Options for a select filter beyond its static ones; null while unknown. */
  getFilterOptions?: (columnId: string) => {
    options: FilterOption[] | null;
    loading: boolean;
  };
  /** A filter panel opened: the moment to fetch its options. */
  onFilterOpen?: (columnId: string) => void;

  /** `false` hides a column; anything else shows it. */
  columnVisibility: Record<string, boolean>;
  onColumnVisibilityChange: (visibility: Record<string, boolean>) => void;

  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;

  /** Filters outside the columns that the filter formula also reads and writes. */
  formulaFilters?: FormulaFilter[];
  /** Chips for filters that live outside the columns. */
  extraChips?: FilterChip[];
  /** Controls placed beside the column picker. */
  actions?: ReactNode;
  noun?: string;
}

export function isFilterActive(state: ColumnFilterState | undefined): boolean {
  if (!state) return false;
  if (state.text) return true;
  if (state.select?.length) return true;
  if (state.dateRange?.startDate || state.dateRange?.endDate) return true;
  if (state.boolean != null) return true;
  if (state.rawMaterials && Object.values(state.rawMaterials).some(Boolean)) {
    return true;
  }
  if (state.numberRange?.min || state.numberRange?.max) return true;
  return false;
}

/** The select option that matches rows with no value in the column. */
export const BLANK: FilterOption = { value: "__blank__", label: "Blank" };
export const selectFilter = (...options: FilterOption[]): ColumnFilter => ({
  type: "select",
  options: [...options, BLANK],
});

export interface RowGroup {
  start: number;
  length: number;
}

/** Runs of consecutive rows sharing a key. Without `groupBy` every row stands alone. */
export function groupRows<Row>(
  rows: Row[],
  groupBy?: (row: Row) => string,
): RowGroup[] {
  const groups: RowGroup[] = [];
  let lastKey: string | null = null;
  rows.forEach((row, i) => {
    const key = groupBy ? groupBy(row) : null;
    const last = groups[groups.length - 1];
    if (last && key !== null && key === lastKey) last.length += 1;
    else groups.push({ start: i, length: 1 });
    lastKey = key;
  });
  return groups;
}
