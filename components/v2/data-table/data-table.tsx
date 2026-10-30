"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleCheck,
  Columns3,
  Copy,
  ListFilter,
  SearchX,
  SquareFunction,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button, IconButton } from "@/components/v2/ui/button";
import { Dash, Input, Textarea } from "@/components/v2/ui/field";
import { Menu, MenuCheckItem, Popover, Select } from "@/components/v2/ui/overlay";
import { EmptyState } from "@/components/v2/ui/page";
import { Clamp } from "./cells";
import { ColumnFilterPanel, summarizeFilter } from "./column-filter";
import { filterRefs, formatFilters, parseFilters, resolveRef, type FilterRef } from "./filter-formula";
import { SaveFilterButton, SavedFiltersMenu } from "./saved-filters";
import type { SavedFilterRow } from "@/actions/saved-filters";
import {
  filterIds,
  groupRows,
  isFilterActive,
  leafColumns,
  type ColumnFilterState,
  type ColumnFilterType,
  type DataTableColumn,
  type DataTableProps,
  type FilterChip,
  type FilterOption,
} from "./types";
import { say } from "@/lib/pip-says";
import { fitValues, registerPipTable, showOption } from "@/components/v2/assistant/pip-table";

const DEFAULT_WIDTH = 180;
const MIN_WIDTH = 50;
const MAX_FROZEN_SHARE = 0.5;

/* --------------------------------- Header ---------------------------------- */

function HeaderCellInner<Row>({
  column,
  width,
  left,
  isLastFrozen,
  sortedId,
  sortDirection,
  onSort,
  onResize,
  active,
  filters,
  onFilterChange,
  getFilterOptions,
  onFilterOpen,
}: {
  column: DataTableColumn<Row>;
  width: number;
  left: number | null;
  isLastFrozen: boolean;
  /** The column sorted by: this one, or one of its members. */
  sortedId: string | null;
  sortDirection: "asc" | "desc" | null;
  /** Take the column id, so one function serves every header and stays the same between renders. */
  onSort: (columnId: string) => void;
  onResize: (columnId: string, width: number) => void;
  active: boolean;
} & Pick<
  DataTableProps<Row>,
  "filters" | "onFilterChange" | "getFilterOptions" | "onFilterOpen"
>) {
  const members = column.members;
  // A stacked column's header re-sorts the member already sorted by, else its
  // first sortable one; the filter panel picks any other.
  const sortTarget = members
    ? (sortedId ?? members.find((m) => m.sortable !== false)?.id)
    : column.sortable !== false
      ? column.id
      : undefined;
  const hasFilter = !!members || column.search !== false || !!column.filter;
  const sortedMember = members?.find((m) => m.id === sortedId);
  const badges = sortedMember ? [`by ${sortedMember.header}`] : column.badges;

  // Pointer capture keeps the drag alive when the cursor leaves the handle.
  const onHandleDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    let frame = 0;
    const move = (ev: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        onResize(column.id, Math.max(MIN_WIDTH, width + ev.clientX - startX)),
      );
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  return (
    <th
      scope="col"
      aria-sort={
        sortDirection === "asc"
          ? "ascending"
          : sortDirection === "desc"
            ? "descending"
            : undefined
      }
      style={left != null ? { left } : undefined}
      className={cn(
        "glass sticky top-0 border-b p-0 text-left align-middle font-medium",
        left != null ? "z-(--z-header-pinned)" : "z-(--z-header)",
        isLastFrozen &&
          "group-data-[sx=true]/dt:shadow-[6px_0_8px_-6px_rgb(0_0_0/0.18)]",
      )}
    >
      <div className="flex h-10 items-center gap-0.5 pl-3 pr-1.5">
        <button
          type="button"
          disabled={!sortTarget}
          onClick={() => sortTarget && onSort(sortTarget)}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-xs text-ink-2 disabled:cursor-default"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate" title={column.header}>
              {column.header}
            </span>
            {badges && badges.length > 0 && (
              <span className="truncate text-3xs font-normal leading-tight text-ink-3">
                {badges.join(" · ")}
              </span>
            )}
          </span>
          {sortDirection === "asc" && (
            <ArrowUp className="size-3 shrink-0 text-accent" aria-hidden />
          )}
          {sortDirection === "desc" && (
            <ArrowDown className="size-3 shrink-0 text-accent" aria-hidden />
          )}
        </button>
        {hasFilter && (
          <Popover
            trigger={
              <IconButton
                size="sm"
                label={`Filter ${column.header}`}
                className={cn("relative", active && "bg-accent-soft text-accent")}
              >
                <ListFilter className="size-3.5" />
              </IconButton>
            }
          >
            <ColumnFilterPanel
              column={column}
              sortedId={sortedId}
              sortDirection={sortDirection}
              onSort={onSort}
              filters={filters}
              onFilterChange={onFilterChange}
              getFilterOptions={getFilterOptions}
              onFilterOpen={onFilterOpen}
            />
          </Popover>
        )}
      </div>
      <span
        role="separator"
        aria-orientation="vertical"
        onPointerDown={onHandleDown}
        className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none after:absolute after:inset-y-2.5 after:right-1/2 after:w-px after:bg-line hover:after:inset-y-1 hover:after:w-0.5 hover:after:bg-accent"
      />
    </th>
  );
}

// Memoised: the table re-renders on every store change and on each step of a
// column drag, and sixty header cells are the costly part of that.
const HeaderCell = memo(HeaderCellInner) as typeof HeaderCellInner;

/* ---------------------------------- Rows ----------------------------------- */

interface Placed<Row> {
  column: DataTableColumn<Row>;
  left: number | null;
  isLastFrozen: boolean;
}

function RowInner<Row>({
  row,
  rowIndex,
  placed,
  span,
}: {
  row: Row;
  rowIndex: number;
  placed: Placed<Row>[];
  /** Rows a `spanGroup` cell covers; 0 when an earlier row of the group drew it. */
  span: number;
}) {
  return (
    <tr className="group/row">
      {placed.map(({ column, left, isLastFrozen }) =>
        column.spanGroup && span === 0 ? null : (
          <td
            key={column.id}
            rowSpan={column.spanGroup ? span : undefined}
            style={left != null ? { left } : undefined}
            className={cn(
              // h-px gives the cell a definite height, so a `Clamp lines="fill"` (h-full) can fill the row.
              "h-px border-b bg-surface px-3 py-2 align-top group-hover/row:bg-(--row-hover-bg)",
              left != null && "sticky z-(--z-pinned)",
              isLastFrozen &&
                "group-data-[sx=true]/dt:shadow-[6px_0_8px_-6px_rgb(0_0_0/0.18)]",
            )}
          >
            {column.members ? (
              (column.cell?.(row, { rowIndex }) ?? (
              <dl className="flex flex-col gap-2">
                {column.members.map((member) => (
                  <div key={member.id} className="min-w-0">
                    <dt className="text-3xs leading-tight text-ink-3">{member.header}</dt>
                    <dd>{cellContent(member, row, rowIndex)}</dd>
                  </div>
                ))}
              </dl>
              ))
            ) : (
              cellContent(column, row, rowIndex)
            )}
          </td>
        ),
      )}
    </tr>
  );
}

const RowView = memo(RowInner) as typeof RowInner;

function cellContent<Row>(column: DataTableColumn<Row>, row: Row, rowIndex: number) {
  if (column.cell) return column.cell(row, { rowIndex });
  return (
    <DefaultCell
      text={
        column.text ? column.text(row) : String((row as Record<string, unknown>)[column.id] ?? "")
      }
    />
  );
}

/** Long text is capped at three lines and scrolls inside the cell, scrollbar hidden. */
function DefaultCell({ text }: { text: string }) {
  return text ? <Clamp>{text}</Clamp> : <Dash />;
}

/**
 * Owns the virtualizer, so a scroll re-renders the rows only. Kept out of
 * DataTable: the virtualizer re-renders its host on every row boundary, and
 * re-rendering every header cell there costs tens of milliseconds per step.
 *
 * The virtual item is a row group, one `<tbody>` each, so a `spanGroup` cell
 * is never cut off from the rows it covers.
 */
function BodyInner<Row>({
  rows,
  getRowId,
  groupBy,
  scrollRef,
  placed,
  loading,
}: {
  rows: Row[];
  getRowId: (row: Row) => string;
  groupBy: ((row: Row) => string) | undefined;
  scrollRef: RefObject<HTMLDivElement | null>;
  placed: Placed<Row>[];
  loading: boolean;
}) {
  const groups = useMemo(() => groupRows(rows, groupBy), [rows, groupBy]);
  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => 64 * groups[i].length,
    overscan: 8,
    getItemKey: (i) => getRowId(rows[groups[i].start]),
  });
  const items = virtualizer.getVirtualItems();
  const padTop = items.length ? items[0].start : 0;
  const padBottom = items.length
    ? virtualizer.getTotalSize() - items[items.length - 1].end
    : 0;

  return (
    <>
      {padTop > 0 && (
        <tbody aria-hidden>
          <tr>
            <td colSpan={placed.length} style={{ height: padTop }} />
          </tr>
        </tbody>
      )}
      {items.map((item) => {
        const { start, length } = groups[item.index];
        return (
          <tbody
            key={item.key}
            ref={virtualizer.measureElement}
            data-index={item.index}
            className={cn("transition-opacity duration-(--dur-pop)", loading && "opacity-60")}
          >
            {rows.slice(start, start + length).map((row, i) => (
              <RowView
                key={getRowId(row)}
                row={row}
                rowIndex={start + i}
                placed={placed}
                span={i === 0 ? length : 0}
              />
            ))}
          </tbody>
        );
      })}
      {padBottom > 0 && (
        <tbody aria-hidden>
          <tr>
            <td colSpan={placed.length} style={{ height: padBottom }} />
          </tr>
        </tbody>
      )}
    </>
  );
}

const Body = memo(BodyInner) as typeof BodyInner;

/* ------------------------------- Pagination -------------------------------- */

function pageWindow(page: number, pageCount: number): number[] {
  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  const end = Math.min(pageCount, start + 4);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function Pagination({
  total,
  page,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  noun,
}: Pick<
  DataTableProps<unknown>,
  "total" | "page" | "pageSize" | "onPageChange" | "onPageSizeChange"
> & { pageSizeOptions: number[]; noun: string }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const fmt = (n: number) => n.toLocaleString("en-IN");

  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-2 text-xs text-ink-2">
      <span className="tabular-nums">
        {fmt(from)}–{fmt(to)} of {fmt(total)} {noun}
      </span>
      <div className="flex items-center gap-1.5">
        <span>Rows per page</span>
        <div className="w-18">
          <Select
            size="sm"
            label="Rows per page"
            value={String(pageSize)}
            onChange={(v) => v && onPageSizeChange(Number(v))}
            options={pageSizeOptions.map((n) => ({ value: String(n), label: String(n) }))}
          />
        </div>
      </div>
      <nav aria-label="Pagination" className="ml-auto flex items-center gap-0.5">
        <IconButton size="sm" label="First page" disabled={page <= 1} onClick={() => onPageChange(1)}>
          <ChevronsLeft className="size-3.5" />
        </IconButton>
        <IconButton size="sm" label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-3.5" />
        </IconButton>
        {pageWindow(page, pageCount).map((p) => (
          <button
            key={p}
            type="button"
            aria-current={p === page ? "page" : undefined}
            onClick={() => onPageChange(p)}
            className={cn(
              "press h-6 min-w-6 rounded-md px-1.5 tabular-nums",
              p === page ? "bg-accent-soft font-medium text-accent-ink" : "not-disabled:hover:bg-hover",
            )}
          >
            {p}
          </button>
        ))}
        <IconButton size="sm" label="Next page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="size-3.5" />
        </IconButton>
        <IconButton size="sm" label="Last page" disabled={page >= pageCount} onClick={() => onPageChange(pageCount)}>
          <ChevronsRight className="size-3.5" />
        </IconButton>
      </nav>
    </footer>
  );
}

/* ---------------------------------- Chips ---------------------------------- */

function Chip({ chip }: { chip: FilterChip }) {
  return (
    <span className="transition-[scale,opacity] duration-(--dur-pop) ease-out starting:scale-95 starting:opacity-0 inline-flex h-6 max-w-80 items-center gap-1 rounded-md bg-accent-soft pl-2 pr-1 text-xs text-accent-ink">
      <span className="truncate" title={chip.label}>
        {chip.label}
      </span>
      {chip.onRemove ? (
        <button
          type="button"
          aria-label={`Remove filter: ${chip.label}`}
          onClick={chip.onRemove}
          className="press not-disabled:hover:bg-hover flex size-4 shrink-0 items-center justify-center rounded"
        >
          <X className="size-3" />
        </button>
      ) : (
        <span className="w-1" />
      )}
    </span>
  );
}

function ColumnPicker<Row>({
  columns,
  columnVisibility,
  onColumnVisibilityChange,
}: Pick<DataTableProps<Row>, "columns" | "columnVisibility" | "onColumnVisibilityChange">) {
  const [query, setQuery] = useState("");
  const togglable = columns.filter((c) => !c.hidden);
  const shownCount = togglable.filter((c) => columnVisibility[c.id] !== false).length;
  const q = query.trim().toLowerCase();

  return (
    <Menu
      align="end"
      className="w-64"
      trigger={
        <Button icon={<Columns3 className="size-3.5" />}>
          Columns
          <span className="tabular-nums text-ink-3">
            {shownCount}/{togglable.length}
          </span>
        </Button>
      }
    >
      <div className="p-1 pb-1.5">
        <Input
          aria-label="Search columns"
          placeholder="Search columns"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Typing must reach the input, not the menu's typeahead.
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      {togglable
        .filter((c) => !q || c.header.toLowerCase().includes(q))
        .map((c) => {
          const shown = columnVisibility[c.id] !== false;
          return (
            <MenuCheckItem
              key={c.id}
              checked={shown}
              onCheckedChange={(next) => {
                // At least one column stays.
                if (!next && shownCount <= 1) return;
                const vis = { ...columnVisibility };
                if (next) delete vis[c.id];
                else vis[c.id] = false;
                onColumnVisibilityChange(vis);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{c.header}</span>
            </MenuCheckItem>
          );
        })}
    </Menu>
  );
}

type FormulaProps<Row> = Pick<
  DataTableProps<Row>,
  "columns" | "filters" | "onFilterChange" | "onResetFilters" | "formulaFilters"
>;

/** The table's filters as formula targets, the live formula, and a way to replace them all. */
function useFormula<Row>({ columns, filters, onFilterChange, onResetFilters, formulaFilters = [] }: FormulaProps<Row>) {
  // Page filters first: they sit above the columns on screen too.
  const refs = useMemo(
    () => [
      ...formulaFilters.map((f) => ({ id: f.id, name: f.name, filter: f.filter, search: false, check: f.check })),
      ...filterRefs(columns),
    ],
    [formulaFilters, columns],
  );
  const allFilters = useMemo(() => {
    const out = { ...filters };
    for (const f of formulaFilters) if (f.value) out[f.id] = f.value;
    return out;
  }, [filters, formulaFilters]);
  const current = useMemo(() => formatFilters(allFilters, refs), [allFilters, refs]);

  // Replace, not merge: the formula is the whole filter.
  const replaceFilters = (next: Record<string, ColumnFilterState>) => {
    onResetFilters();
    const page = new Set(formulaFilters.map((f) => f.id));
    for (const f of formulaFilters) f.onChange(next[f.id]);
    for (const [id, state] of Object.entries(next)) {
      if (page.has(id)) continue;
      for (const [type, value] of Object.entries(state)) {
        onFilterChange(id, type as ColumnFilterType, value);
      }
    }
  };

  return { refs, current, replaceFilters };
}

type Formula = ReturnType<typeof useFormula>;

/**
 * Column filters as one editable formula: paste or type one to set every
 * column at once, copy it, or save it. The chips stay the view of what is set.
 */
function FormulaBar({ formula: { refs, current, replaceFilters } }: { formula: Formula }) {
  // null follows the live filters; typing or pasting starts a draft.
  const [draft, setDraft] = useState<string | null>(null);
  // This page's saved filters, loaded when the Saved menu first opens.
  const [saved, setSaved] = useState<SavedFilterRow[] | null>(null);
  const text = draft ?? current;
  const dirty = draft !== null && draft.trim() !== current;
  const parsed = useMemo(
    () => (dirty && draft.trim() ? parseFilters(draft, refs) : null),
    [dirty, draft, refs],
  );
  const ready = !!parsed && parsed.errors.length === 0;
  const valid = !!text.trim() && (!parsed || ready);

  const apply = () => {
    if (!ready) return;
    replaceFilters(parsed.filters);
    setDraft(null);
  };

  const applySaved = (formula: string) => {
    const result = parseFilters(formula, refs);
    if (result.errors.length === 0) {
      replaceFilters(result.filters);
      setDraft(null);
    }
    return result.errors;
  };

  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => toast.success(say.copied("the filter formula")),
      () => toast.error(say.couldNot("copy the filter formula")),
    );

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b bg-sunken px-3 py-2">
      <div className="flex items-start gap-2">
        <Textarea
          aria-label="Filter formula"
          autoFocus
          rows={2}
          spellCheck={false}
          className="min-h-8 flex-1 font-mono text-xs"
          placeholder={'[Status] IN ("Open", "Closed") AND [Party] CONTAINS "abc"'}
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              apply();
            } else if (e.key === "Escape" && draft !== null) {
              e.stopPropagation();
              setDraft(null);
            }
          }}
        />
        <Button variant="primary" disabled={!ready} onClick={apply} title="Apply (Ctrl+Enter)">
          Apply
        </Button>
        <IconButton label="Copy filter formula" disabled={!text.trim()} onClick={copy}>
          <Copy className="size-4" />
        </IconButton>
        <SavedFiltersMenu list={saved} setList={setSaved} onApply={applySaved} />
        <SaveFilterButton list={saved} setList={setSaved} formula={valid ? text.trim() : ""} />
      </div>
      {parsed && !ready && (
        <ul className="flex flex-col gap-1 text-xs text-bad">
          {parsed.errors.map((e, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      )}
      {ready && (
        <p className="flex items-center gap-1.5 text-xs text-ink-2">
          <CircleCheck className="size-3.5 shrink-0 text-good" aria-hidden />
          {Object.keys(parsed.filters).length} column filter(s) ready. Apply or press Ctrl+Enter; Esc discards.
        </p>
      )}
    </div>
  );
}

/** Lets Pip read and set this table's filters while it is on screen. */
function usePipTable(
  formula: Formula,
  getFilterOptions: DataTableProps<unknown>["getFilterOptions"],
  onFilterOpen: DataTableProps<unknown>["onFilterOpen"],
) {
  // Pip calls in later than any render, so it reads the latest of everything.
  const latest = useRef({ formula, getFilterOptions, onFilterOpen });
  useEffect(() => {
    latest.current = { formula, getFilterOptions, onFilterOpen };
  });

  useEffect(() => {
    // A list column's own options, then whatever the page loads for it.
    const options = async (ref: FilterRef): Promise<FilterOption[]> => {
      const own = ref.filter?.type === "select" ? (ref.filter.options ?? []) : [];
      const loaded = () => latest.current.getFilterOptions?.(ref.id).options;
      if (latest.current.getFilterOptions && !loaded()) {
        latest.current.onFilterOpen?.(ref.id);
        // ponytail: polls the latest options for up to 5 s; a promise from getFilterOptions would remove it.
        for (let i = 0; i < 25 && !loaded(); i++) await new Promise((r) => setTimeout(r, 200));
      }
      const seen = new Set<string>();
      return [...own, ...(loaded() ?? [])].filter((o) => !seen.has(o.value) && !!seen.add(o.value));
    };

    return registerPipTable({
      get refs() {
        return latest.current.formula.refs;
      },
      current: () => latest.current.formula.current,
      apply: async (text) => {
        const { refs, replaceFilters } = latest.current.formula;
        if (!text.trim()) {
          replaceFilters({});
          return [];
        }
        const result = parseFilters(text, refs);
        if (result.errors.length) return result.errors;
        // Pip writes values from what people say; hold them to the column's real values.
        const errors: string[] = [];
        for (const [id, state] of Object.entries(result.filters)) {
          const ref = refs.find((r) => r.id === id);
          if (!state.select || ref?.filter?.type !== "select") continue;
          const known = await options(ref);
          const fit = fitValues(state.select, known);
          // A searchable list may hold more values than it lists; only a closed list refuses.
          if (fit.unknown.length && !ref.filter.searchAsText && known.length > 1) {
            errors.push(
              `[${ref.name}]: unknown value ${fit.unknown.map((v) => JSON.stringify(v)).join(", ")}. Use one of: ${known.slice(0, 30).map(showOption).join(", ")}`,
            );
          } else state.select = [...fit.values, ...fit.unknown];
        }
        if (errors.length === 0) replaceFilters(result.filters);
        return errors;
      },
      values: async (column) => {
        const ref = resolveRef(column.replace(/^\[|\]$/g, ""), latest.current.formula.refs);
        return ref?.filter?.type === "select" ? options(ref) : null;
      },
    });
  }, []);
}

/* ---------------------------------- Table ---------------------------------- */

export function DataTable<Row>({
  columns,
  rows,
  getRowId,
  groupBy,
  total,
  page,
  pageSize,
  pageSizeOptions = [10, 25, 50, 100, 500],
  onPageChange,
  onPageSizeChange,
  sort,
  onSortChange,
  filters,
  onFilterChange,
  onResetFilters,
  getFilterOptions,
  onFilterOpen,
  columnVisibility,
  onColumnVisibilityChange,
  loading = false,
  error = null,
  onRetry,
  extraChips = [],
  formulaFilters,
  actions,
  noun = "rows",
}: DataTableProps<Row>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [scrolledX, setScrolledX] = useState(false);

  const visible = useMemo(() => {
    const shown = columns.filter((c) => !c.hidden && columnVisibility[c.id] !== false);
    return [...shown.filter((c) => c.frozen), ...shown.filter((c) => !c.frozen)];
  }, [columns, columnVisibility]);

  const widthOf = useCallback(
    (c: DataTableColumn<Row>) => widths[c.id] ?? c.width ?? DEFAULT_WIDTH,
    [widths],
  );

  // Pinned columns may take at most this share of the viewport; past it the
  // rightmost ones scroll with the rest, so there is always room to scroll.
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewportWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Only a pinned column's width moves a cell, so dragging any other column
  // keeps `placed`, and with it every row, as it was.
  const pinnedWidths = visible
    .filter((c) => c.frozen)
    .map(widthOf)
    .join(" ");
  const placed = useMemo(() => {
    const budget = viewportWidth ? viewportWidth * MAX_FROZEN_SHARE : Infinity;
    let left = 0;
    let full = false;
    const out = visible.map((column): Placed<Row> => {
      const pinned =
        !!column.frozen && !full && (left === 0 || left + widthOf(column) <= budget);
      if (column.frozen && !pinned) full = true;
      const at = pinned ? left : null;
      if (pinned) left += widthOf(column);
      return { column, left: at, isLastFrozen: false };
    });
    const lastFrozen = out.findLastIndex((p) => p.left != null);
    if (lastFrozen >= 0) out[lastFrozen].isLastFrozen = true;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pinnedWidths, viewportWidth]);

  const tableWidth = visible.reduce((sum, c) => sum + widthOf(c), 0);

  // A new page starts at its top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [page, pageSize]);

  const handleSort = useCallback(
    (id: string) =>
      onSortChange({
        column: id,
        direction: sort?.column === id && sort.direction === "desc" ? "asc" : "desc",
      }),
    [sort, onSortChange],
  );

  const handleResize = useCallback(
    (id: string, width: number) => setWidths((prev) => ({ ...prev, [id]: width })),
    [],
  );

  const clearColumn = useCallback(
    (id: string) => {
      const s = filters[id];
      if (!s) return;
      for (const key of Object.keys(s) as ColumnFilterType[]) {
        if (s[key] !== undefined) onFilterChange(id, key, undefined);
      }
    },
    [filters, onFilterChange],
  );

  const chips = useMemo(() => {
    const out: FilterChip[] = [...extraChips];
    for (const c of leafColumns(columns)) {
      if (isFilterActive(filters[c.id])) {
        out.push({
          key: c.id,
          label: `${c.header}: ${summarizeFilter(c, filters[c.id], getFilterOptions?.(c.id).options)}`,
          onRemove: () => clearColumn(c.id),
        });
      }
      for (const e of c.extraFilters ?? []) {
        if (!isFilterActive(filters[e.id])) continue;
        out.push({
          key: e.id,
          label: `${e.label}: ${summarizeFilter({ filter: { type: "select", options: e.options } }, filters[e.id], getFilterOptions?.(e.id).options)}`,
          onRemove: () => clearColumn(e.id),
        });
      }
    }
    return out;
  }, [extraChips, columns, filters, getFilterOptions, clearColumn]);

  const hasColumnFilters = Object.values(filters).some(isFilterActive);

  const [formulaOpen, setFormulaOpen] = useState(false);
  const formula = useFormula({ columns, filters, onFilterChange, onResetFilters, formulaFilters });
  usePipTable(formula, getFilterOptions, onFilterOpen);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface card">
      <div className="flex shrink-0 items-start gap-3 border-b px-3 py-2">
        <div className="flex min-h-8 min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {chips.length === 0 && (
            <span className="text-xs text-ink-3">
              No filters. Use the filter control in any column header.
            </span>
          )}
          {chips.map((chip) => (
            <Chip key={chip.key} chip={chip} />
          ))}
          {hasColumnFilters && (
            <Button size="sm" variant="ghost" onClick={onResetFilters}>
              Reset column filters
            </Button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <Button
            icon={<SquareFunction className="size-3.5" />}
            aria-pressed={formulaOpen}
            className={cn(formulaOpen && "bg-accent-soft text-accent-ink")}
            onClick={() => setFormulaOpen(!formulaOpen)}
          >
            Formula
          </Button>
          <ColumnPicker
            columns={columns}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={onColumnVisibilityChange}
          />
        </div>
      </div>
      {formulaOpen && (
        <FormulaBar formula={formula} />
      )}

      <div className="relative min-h-0 flex-1">
        {loading && (
          <div
            role="progressbar"
            aria-label={`Loading ${noun}`}
            className="pointer-events-none absolute inset-x-0 top-0 z-(--z-progress) h-0.5 overflow-hidden"
          >
            <div className="h-full w-2/5 animate-progress bg-accent motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-50" />
          </div>
        )}

        <div
          ref={scrollRef}
          data-sx={scrolledX}
          onScroll={(e) => {
            const next = e.currentTarget.scrollLeft > 0;
            if (next !== scrolledX) setScrolledX(next);
          }}
          className="group/dt h-full overflow-auto overscroll-contain"
        >
          <table
            aria-busy={loading}
            style={{ width: tableWidth, ["--row-hover-bg" as string]: "color-mix(in srgb, var(--surface), var(--ink) 4%)" }}
            className="table-fixed border-separate border-spacing-0"
          >
            <colgroup>
              {visible.map((c) => (
                <col key={c.id} style={{ width: widthOf(c) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {placed.map(({ column, left, isLastFrozen }) => {
                  const sorted =
                    sort && leafColumns([column]).some((c) => c.id === sort.column) ? sort : null;
                  return (
                    <HeaderCell
                      key={column.id}
                      column={column}
                      width={widthOf(column)}
                      left={left}
                      isLastFrozen={isLastFrozen}
                      sortedId={sorted?.column ?? null}
                      sortDirection={sorted?.direction ?? null}
                      onSort={handleSort}
                      onResize={handleResize}
                      active={filterIds(column).some((id) => isFilterActive(filters[id]))}
                      filters={filters}
                      onFilterChange={onFilterChange}
                      getFilterOptions={getFilterOptions}
                      onFilterOpen={onFilterOpen}
                    />
                  );
                })}
              </tr>
            </thead>
            <Body
              rows={rows}
              getRowId={getRowId}
              groupBy={groupBy}
              scrollRef={scrollRef}
              placed={placed}
              loading={loading}
            />
          </table>
        </div>

        {error ? (
          <div className="absolute inset-x-0 bottom-0 top-10 grid place-items-center bg-surface p-6">
            <EmptyState
              icon={AlertTriangle}
              tone="bad"
              title={`Could not load ${noun}`}
              description={error}
              action={onRetry && <Button onClick={onRetry}>Try again</Button>}
            />
          </div>
        ) : (
          rows.length === 0 &&
          !loading && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 top-10 grid place-items-center p-6">
              <EmptyState
                className="pointer-events-auto"
                icon={SearchX}
                title={`No ${noun} match these filters`}
                action={
                  hasColumnFilters && <Button onClick={onResetFilters}>Reset column filters</Button>
                }
              />
            </div>
          )
        )}
      </div>

      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={pageSizeOptions}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        noun={noun}
      />
    </section>
  );
}
