"use client";

import React, { useState, useCallback, useRef, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnSizingState,
  type VisibilityState,
  type Header,
} from "@tanstack/react-table";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  setDeadlinePreset,
  setDeadlineDateRange,
  clearDeadlineFilter,
  setGlobalFilter,
  setSorting,
  setColumnVisibility,
  setColumnSizing,
  toggleFilterTray,
} from "@/lib/slices/filtersSlice";
import { analyzeTenderValidity, saveAiRelevance } from "@/actions/ai-analysis";
import {
  updateTenderCell,
  updateTenderAssignments,
} from "@/lib/slices/tendersSlice";
import {
  Combobox,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxValue,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxEmpty,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import * as XLSX from "xlsx";
import {
  Loader2,
  Zap,
  Square,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Columns3,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ListFilter,
  SlidersHorizontal,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";
import FilterTray from "./filter-tray";

interface TenderTableProps {
  columns: string[];
  rows: Record<string, string>[];
  associations: { id: number; name: string; email: string }[];
  fileName: string;
  loadingTenders?: boolean;
  totalFiles?: number;
  completedFiles?: number;
  onRefresh?: () => void;
}

function formatHeader(col: string): string {
  if (col === "AI relevance") return "AI RELEVANCE";
  if (col === "type") return "Type";
  if (col === "id") return "ID";
  if (col.toLowerCase() === "t247id") return "Portal ID";
  return col
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

const ALWAYS_VISIBLE = new Set(["type", "referenceNo", "assignedTo"]);

const PAGE_SIZES = [20, 50, 100];

function SortIndicator({
  header,
}: {
  header: Header<Record<string, string>, unknown>;
}) {
  const sorted = header.column.getIsSorted();
  if (sorted === "asc") return <ChevronUp className="size-3" />;
  if (sorted === "desc") return <ChevronDown className="size-3" />;
  if (header.column.getCanSort())
    return <ChevronsUpDown className="size-3 text-white/30" />;
  return null;
}

const AssignedToCell = React.memo(function AssignedToCell({
  value,
  rowIndex,
  rowType,
  rowId,
  associations,
  onAssignmentChange,
}: {
  value: string;
  rowIndex: number;
  rowType: string;
  rowId: string;
  associations: { id: number; name: string; email: string }[];
  onAssignmentChange: (
    rowIndex: number,
    type: string,
    id: string,
    associationIds: string[],
  ) => void;
}) {
  const selectedIds = (value || "").split(",").filter(Boolean);
  const anchor = useComboboxAnchor();

  return (
    <div className="w-full">
      <Combobox
        multiple
        autoHighlight
        value={selectedIds}
        onValueChange={(ids: string[]) =>
          onAssignmentChange(rowIndex, rowType, rowId, ids)
        }
      >
        <ComboboxChips ref={anchor} className="w-full rounded-sm">
          <ComboboxValue>
            {(values: string[]) => (
              <>
                {values.map((id: string) => (
                  <ComboboxChip key={id}>
                    {associations.find((a) => a.id === parseInt(id))?.name ??
                      id}
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent
          anchor={anchor}
          className={`rounded-sm py-2 px-2 w-64`}
        >
          {/* <ComboboxEmpty>No associations found</ComboboxEmpty> */}
          <ComboboxList>
            {associations.map((a) => (
              <ComboboxItem key={String(a.id)} value={String(a.id)}>
                {a.name}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
});

export default function TenderTable({
  columns,
  rows,
  associations,
  fileName,
  loadingTenders,
  totalFiles,
  completedFiles,
  onRefresh,
}: TenderTableProps) {
  const [analysisResults, setAnalysisResults] = useState<
    Record<number, { valid: boolean; reason: string }>
  >({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const abortRef = useRef(false);

  const dispatch = useAppDispatch();
  const sorting = useAppSelector((s) => s.filters.sorting);
  const globalFilter = useAppSelector((s) => s.filters.globalFilter);
  const columnSizing = useAppSelector((s) => s.filters.columnSizing);
  const columnVisibility = useAppSelector((s) => s.filters.columnVisibility);
  const exclusionFilter = useAppSelector((s) => s.filters.exclusionFilter);
  const deadlinePreset = useAppSelector((s) => s.filters.deadlinePreset);
  const deadlineDateFrom = useAppSelector((s) => s.filters.deadlineDateFrom);
  const deadlineDateTo = useAppSelector((s) => s.filters.deadlineDateTo);
  const typeFilter = useAppSelector((s) => s.filters.typeFilter);
  const aiRelevanceFilter = useAppSelector((s) => s.filters.aiRelevanceFilter);
  const showFilterTray = useAppSelector((s) => s.filters.showFilterTray);

  const sortingRef = useRef(sorting);
  sortingRef.current = sorting;
  const globalFilterRef = useRef(globalFilter);
  globalFilterRef.current = globalFilter;
  const columnSizingRef = useRef(columnSizing);
  columnSizingRef.current = columnSizing;
  const columnVisibilityRef = useRef(columnVisibility);
  columnVisibilityRef.current = columnVisibility;

  const handleSortingChange = useCallback(
    (updater: any) =>
      dispatch(
        setSorting(
          typeof updater === "function" ? updater(sortingRef.current) : updater,
        ),
      ),
    [dispatch],
  );
  const handleGlobalFilterChange = useCallback(
    (updater: any) =>
      dispatch(
        setGlobalFilter(
          typeof updater === "function"
            ? updater(globalFilterRef.current)
            : updater,
        ),
      ),
    [dispatch],
  );
  const handleColumnSizingChange = useCallback(
    (updater: any) =>
      dispatch(
        setColumnSizing(
          typeof updater === "function"
            ? updater(columnSizingRef.current)
            : updater,
        ),
      ),
    [dispatch],
  );
  const handleColumnVisibilityChange = useCallback(
    (updater: any) =>
      dispatch(
        setColumnVisibility(
          typeof updater === "function"
            ? updater(columnVisibilityRef.current)
            : updater,
        ),
      ),
    [dispatch],
  );

  const handleDecisionClick = useCallback(
    (
      col: string,
      rowIndex: number,
      type: string,
      id: string,
      value: string,
    ) => {
      const oldValue = rows[rowIndex]?.[col] ?? "";
      if (oldValue === value) return;
      dispatch(
        updateTenderCell({
          rowIndex,
          field: col,
          value,
          tenderMergedId: parseInt(id, 10),
          oldValue,
        }),
      );
    },
    [rows, dispatch],
  );

  const handleAssignmentChange = useCallback(
    (rowIndex: number, type: string, id: string, associationIds: string[]) => {
      const oldValue = rows[rowIndex]?.assignedTo ?? "";
      const numericIds = associationIds.map(Number);
      dispatch(
        updateTenderAssignments({
          rowIndex,
          tenderMergedId: parseInt(id, 10),
          associationIds: numericIds,
          oldValue,
        }),
      );
    },
    [rows, dispatch],
  );

  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [deadlinePickerPos, setDeadlinePickerPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const dbResults = useMemo(() => {
    const map: Record<number, { valid: boolean; reason: string }> = {};
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i]?.aiRelevanceValid;
      const r = rows[i]?.aiRelevanceReason;
      if (v && r) {
        map[i] = { valid: v === "true", reason: r };
      }
    }
    return map;
  }, [rows]);

  const hasDbResults = useMemo(
    () => Object.keys(dbResults).length > 0,
    [dbResults],
  );

  const combinedResults = useMemo(
    () => ({ ...dbResults, ...analysisResults }),
    [dbResults, analysisResults],
  );

  const resultsCount = Object.keys(combinedResults).length;
  const validCount = Object.values(combinedResults).filter(
    (r) => r.valid,
  ).length;

  const showAiColumn = isAnalyzing || hasDbResults || resultsCount > 0;

  const tableData = useMemo(() => {
    let from: Date | null = null;
    let to: Date | null = null;
    const now = new Date();

    if (deadlinePreset === "thisWeek") {
      from = startOfWeek(now, { weekStartsOn: 1 });
      to = endOfWeek(now, { weekStartsOn: 1 });
    } else if (deadlinePreset === "thisMonth") {
      from = startOfMonth(now);
      to = endOfMonth(now);
    } else if (deadlinePreset === "thisYear") {
      from = startOfYear(now);
      to = endOfYear(now);
    } else if (deadlineDateFrom) {
      from = new Date(deadlineDateFrom);
      to = deadlineDateTo ? new Date(deadlineDateTo) : null;
    }

    let filtered = rows.map((row, i) => ({ row, _originalIndex: i }));

    if (from || to) {
      const toEnd = to
        ? new Date(
            to.getFullYear(),
            to.getMonth(),
            to.getDate(),
            23,
            59,
            59,
            999,
          )
        : null;
      filtered = filtered.filter(({ row }) => {
        if (!row.deadline) return false;
        const d = new Date(row.deadline);
        if (from && d < from) return false;
        if (toEnd && d > toEnd) return false;
        return true;
      });
    }

    if (exclusionFilter) {
      filtered = filtered.filter(({ row }) => {
        const cat = row.excludedCategory;
        if (!cat) return true;
        if (exclusionFilter === "cable" && cat.includes("cable")) return false;
        if (exclusionFilter === "conductors" && cat.includes("conductors"))
          return false;
        if (
          exclusionFilter === "both" &&
          (cat.includes("cable") || cat.includes("conductors"))
        )
          return false;
        return true;
      });
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter(({ row }) => row.type === typeFilter);
    }

    if (aiRelevanceFilter !== "all") {
      filtered = filtered.filter(({ _originalIndex }) => {
        const result = combinedResults[_originalIndex];
        if (aiRelevanceFilter === "not_analysed") return !result;
        if (!result) return false;
        return aiRelevanceFilter === "yes" ? result.valid : !result.valid;
      });
    }

    return filtered.map(({ row, _originalIndex }) => ({
      ...row,
      _rowIndex: String(_originalIndex),
    }));
  }, [
    rows,
    exclusionFilter,
    deadlinePreset,
    deadlineDateFrom,
    deadlineDateTo,
    typeFilter,
    aiRelevanceFilter,
    combinedResults,
  ]);

  const columnDefs = useMemo<ColumnDef<Record<string, string>>[]>(() => {
    const defs: ColumnDef<Record<string, string>>[] = [];

    for (const col of columns) {
      if (col === "AI relevance") continue;

      defs.push({
        id: col,
        accessorFn: (row) => row[col],
        header: formatHeader(col),
        enableResizing: col !== "type",
        enableHiding: !ALWAYS_VISIBLE.has(col),
        size:
          col === "type"
            ? 100
            : col === "referenceNo"
              ? 170
              : col === "id"
                ? 80
                : undefined,
        cell: ({ getValue, row: tanRow }) => {
          const val = getValue() as string | undefined;
          const rowIndex = parseInt(tanRow.original._rowIndex, 10);
          const rowType = tanRow.original.type;
          const rowId = tanRow.original.id;

          if (col === "type") {
            return (
              <Badge
                variant={val === "Gem" ? "default" : "secondary"}
                className={cn(
                  "text-[10px] font-medium",
                  val === "Gem"
                    ? "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200"
                    : "bg-slate-100 text-slate-600 border-slate-200",
                )}
              >
                {val}
              </Badge>
            );
          }

          if (col === "app" || col === "aps" || col === "apm") {
            const isYes = val === "YES";
            const isNo = val === "NO";

            return (
              <div className="flex gap-1 py-1">
                <button
                  type="button"
                  onClick={() =>
                    handleDecisionClick(col, rowIndex, rowType, rowId, "YES")
                  }
                  className={cn(
                    "w-7 h-7 rounded text-xs font-bold border transition-colors",
                    isYes
                      ? "bg-green-500 text-white border-green-600"
                      : "bg-white text-slate-400 border-slate-300 hover:border-slate-400",
                  )}
                >
                  Y
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleDecisionClick(col, rowIndex, rowType, rowId, "NO")
                  }
                  className={cn(
                    "w-7 h-7 rounded text-xs font-bold border transition-colors",
                    isNo
                      ? "bg-red-500 text-white border-red-600"
                      : "bg-white text-slate-400 border-slate-300 hover:border-slate-400",
                  )}
                >
                  N
                </button>
              </div>
            );
          }

          if (col === "assignedTo") {
            return (
              <AssignedToCell
                value={val ?? ""}
                rowIndex={rowIndex}
                rowType={rowType ?? ""}
                rowId={rowId ?? ""}
                associations={associations}
                onAssignmentChange={handleAssignmentChange}
              />
            );
          }

          if (col === "deadline") {
            return (
              <div className="max-h-[100px] overflow-y-auto py-1.5 whitespace-normal break-words">
                {val ? formatDate(val) : "-"}
              </div>
            );
          }

          return (
            <div className="max-h-[100px] overflow-y-auto py-1.5 whitespace-normal break-words">
              {val || "-"}
            </div>
          );
        },
      });
    }

    if (showAiColumn) {
      defs.splice(2, 0, {
        id: "AI relevance",
        header: "AI RELEVANCE",
        enableResizing: true,
        enableHiding: true,
        size: 200,
        cell: ({ row: tanRow }) => {
          const i = parseInt(tanRow.original._rowIndex, 10);
          const result = analysisResults[i] ?? dbResults[i];
          const isCurrent = isAnalyzing && currentIndex === i;
          const isPending =
            isAnalyzing && currentIndex !== null && i > currentIndex;
          const brief = tanRow.original?.tenderBrief;
          const skip = !brief || brief === "\u2014";

          if (skip) return <span className="text-slate-300">-</span>;
          if (isCurrent)
            return (
              <span className="flex items-center gap-1.5 text-primary/80">
                <Loader2 className="size-3 animate-spin" />
                <span className="text-[11px]">Analyzing...</span>
              </span>
            );
          if (isPending)
            return <span className="text-slate-300 text-[11px]">Pending</span>;
          if (result)
            return (
              <div className="flex flex-col gap-0.5">
                <Badge
                  className={cn(
                    "inline-flex w-fit text-[10px] font-medium",
                    result.valid
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                      : "bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-100",
                  )}
                >
                  {result.valid ? "YES" : "NO"}
                </Badge>
                <span className="text-[11px] text-slate-500 leading-snug">
                  {result.reason}
                </span>
              </div>
            );
          return <span className="text-slate-300">-</span>;
        },
      });
    }

    return defs;
  }, [
    columns,
    showAiColumn,
    analysisResults,
    dbResults,
    isAnalyzing,
    currentIndex,
  ]);

  const table = useReactTable({
    data: tableData,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: handleGlobalFilterChange,
    onColumnSizingChange: handleColumnSizingChange,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    state: {
      sorting,
      globalFilter,
      columnSizing,
      columnVisibility,
    },
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    defaultColumn: {
      minSize: 60,
      maxSize: 800,
    },
    initialState: {
      pagination: { pageSize: 50 },
    },
    globalFilterFn: "includesString",
  });

  const isResizing = !!table.getState().columnSizingInfo.isResizingColumn;

  const exportToExcel = useCallback(() => {
    const visibleColumns = table
      .getVisibleLeafColumns()
      .map((c) => c.id)
      .filter((id) => id !== "_rowIndex");
    const exportData = table.getPrePaginationRowModel().rows.map((row) => {
      const obj: Record<string, string> = {};
      for (const colId of visibleColumns) {
        const label = formatHeader(colId);
        let val = row.original[colId] ?? "";
        if (colId === "AI relevance") {
          const valid = row.original.aiRelevanceValid;
          const reason = row.original.aiRelevanceReason;
          val =
            valid && reason
              ? `${valid === "true" ? "Yes" : "No"} Reason:${reason}`
              : "";
        }
        if (colId === "app" || colId === "aps" || colId === "apm") {
          val = val !== "YES" && val !== "NO" ? "" : val;
        }
        if (colId === "assignedTo") {
          const ids = (val || "").split(",").filter(Boolean);
          val = ids
            .map((id) => {
              const a = associations.find((assoc) => assoc.id === parseInt(id));
              return a ? `${a.name}(${a.email})` : "";
            })
            .filter(Boolean)
            .join("\n");
        }
        obj[label] = val.length > 32767 ? val.slice(0, 32767) : val;
      }
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tenders");
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `tenders-${date}.xlsx`);
  }, [table, associations]);

  const runAnalysis = useCallback(async () => {
    abortRef.current = false;
    setIsAnalyzing(true);
    setAnalysisResults({});

    for (let i = 0; i < rows.length; i++) {
      if (abortRef.current) break;
      setCurrentIndex(i);

      const brief = rows[i]?.tenderBrief;
      if (!brief || brief === "\u2014") continue;
      if (dbResults[i]) continue;

      try {
        const result = await analyzeTenderValidity(brief);
        if (!result.success) {
          if (result.error === "rate_limit") {
            abortRef.current = true;
            break;
          }
          continue;
        }
        const currentRow = rows[i];
        if (currentRow) {
          try {
            await saveAiRelevance({
              tenderMergedId: Number(currentRow.id),
              valid: result.data.valid,
              reason: result.data.reason,
            });
          } catch {
            console.error(`Failed to save AI relevance for row ${i}`);
          }

          if (result.data.valid) {
            if (currentRow.type === "Gem") {
              const gemId = currentRow.referenceNo as string | undefined;
              if (gemId) {
                const dlRes = await fetch("/api/download-pdfs", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tenders: [{ id: Number(currentRow.id), type: "Gem", gemId }] }),
                });
                const dlData = await dlRes.json();
                if (dlData.success > 0) {
                  await fetch("/api/parse-pdfs", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tenders: [{ id: Number(currentRow.id) }] }),
                  });
                }
              }
            } else if (currentRow.type === "Non-Gem") {
              const referenceNo = currentRow.referenceNo as string | undefined;
              const website = currentRow.website as string | undefined;
              console.log(`[Non-GEM] Trying search for row ${i}: ref="${referenceNo}" website="${website}"`);
              if (referenceNo && website) {
                try {
                  const res = await fetch("http://localhost:8000/api/search-tender/", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ website, reference_no: referenceNo }),
                  });
                  const data = await res.json();
                  console.log(`[Non-GEM] Django API result for ${referenceNo}:`, data);
                } catch (e) {
                  console.error(`[Non-GEM] Django API call failed for ${referenceNo}:`, e);
                }
              } else {
                console.warn(`[Non-GEM] Skipping row ${i} — missing referenceNo or website`);
              }
            }
          }
        }

        setAnalysisResults((prev) => ({
          ...prev,
          [i]: result.data,
        }));
      } catch {
        console.error(`Analysis failed for row ${i}`);
      }
    }

    setIsAnalyzing(false);
    setCurrentIndex(null);
  }, [rows, dbResults]);

  const stopAnalysis = useCallback(() => {
    abortRef.current = true;
  }, []);

  if (!rows.length && !loadingTenders) {
    return (
      <div className="flex items-center justify-center rounded-sm border border-slate-200 bg-white p-12 text-sm text-slate-400">
        No tenders found for {fileName}
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-white px-5 py-3 text-primary flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-6 h-6 rounded-sm bg-white/10 shrink-0">
            <svg
              className="size-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12c-.621 0-1.125.504-1.125 1.125M12 12c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125M12 15.375c-.621 0-1.125-.504-1.125-1.125v-1.5"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary tracking-wide truncate">
              {fileName}
            </p>
            <p className="text-[11px]">
              {table.getPrePaginationRowModel().rows.length} tender
              {table.getPrePaginationRowModel().rows.length !== 1
                ? "s"
                : ""}{" "}
              found
              {loadingTenders && totalFiles && completedFiles !== undefined && (
                <span className="text-blue-500 ml-1.5">
                  (loading {completedFiles}/{totalFiles})
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
            <input
              value={globalFilter ?? ""}
              onChange={(e) => dispatch(setGlobalFilter(e.target.value))}
              placeholder="Search..."
              className="h-8 w-44 rounded-lg border border-input bg-transparent pl-7 pr-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <Button
            size="xs"
            variant={showFilterTray ? "default" : "outline"}
            onClick={() => dispatch(toggleFilterTray())}
            className={cn(
              "text-xs",
              showFilterTray && "bg-blue-100 text-blue-800 hover:bg-blue-200",
            )}
          >
            <SlidersHorizontal className="size-3" />
            Filters
          </Button>

          <div className="relative">
            <Button
              size="xs"
              variant="outline"
              onClick={() => setShowColumnPicker((v) => !v)}
              className="text-xs"
            >
              <Columns3 className="size-3" />
              Columns
            </Button>
            {showColumnPicker && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowColumnPicker(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-sm bg-white shadow-md ring-1 ring-slate-200 p-2 max-h-80 overflow-y-auto">
                  <p className="text-[11px] font-medium text-slate-500 px-1 py-1.5 uppercase tracking-wider">
                    Toggle Columns
                  </p>
                  {table
                    .getAllLeafColumns()
                    .filter((c) => c.getCanHide())
                    .map((column) => (
                      <label
                        key={column.id}
                        className="flex items-center gap-2 py-1.5 px-1.5 hover:bg-slate-50 rounded cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={column.getIsVisible()}
                          onChange={column.getToggleVisibilityHandler()}
                          className="size-3.5 accent-primary"
                        />
                        {formatHeader(column.id)}
                      </label>
                    ))}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            {resultsCount > 0 && !isAnalyzing && (
              <Badge
                className={cn(
                  "text-[10px]",
                  validCount === resultsCount
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-blue-100 text-blue-800 border-blue-300",
                )}
              >
                {validCount} valid
              </Badge>
            )}
            <Badge className="bg-white/10 border-white/20 text-[10px] hover:bg-white/20 text-slate-600 border-slate-200">
              {rows.length} Records
            </Badge>
            {!isAnalyzing ? (
              <Button size="xs" onClick={runAnalysis}>
                <Zap className="size-3" />
                {hasDbResults
                  ? "Analyze remaining"
                  : resultsCount > 0
                    ? "Re-run AI Analysis"
                    : "Run AI Analysis"}
              </Button>
            ) : (
              <Button size="xs" variant="destructive" onClick={stopAnalysis}>
                <Square className="size-3 fill-current" />
                Stop ({Object.keys(analysisResults).length}/{rows.length})
              </Button>
            )}
            <Button
              size="xs"
              variant="outline"
              onClick={exportToExcel}
              className="text-xs"
            >
              <svg
                className="size-3"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              Export Excel
            </Button>
          </div>
        </div>
      </div>

      {showFilterTray && <FilterTray />}

      {/* Outer: horizontal scroll on parent */}
      <div
        className={cn(
          "overflow-auto max-h-[65vh]",
          isResizing && "select-none",
        )}
      >
        <table
          className="border-collapse w-full"
          style={{ tableLayout: "fixed", minWidth: "max-content" }}
        >
          <colgroup>
            {table.getAllLeafColumns().map((column) => (
              <col key={column.id} style={{ width: column.getSize() }} />
            ))}
          </colgroup>
          <TableHeader className="sticky top-0 z-20">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="h-10">
                {headerGroup.headers.map((header) => {
                  const colId = header.column.id;
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className={cn(
                        "bg-[#0f2847] h-10 text-white text-[11px] font-semibold overflow-hidden uppercase tracking-wider",
                        "px-3 py-2 text-left border-b border-r border-[#1a3a63] last:border-r-0",
                        "truncate relative group",
                        colId === "type" && "bg-[#0f2847]",
                        header.column.getCanSort() &&
                          "cursor-pointer select-none",
                      )}
                      style={{
                        width: header.getSize(),
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1.5">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                        {header.column.getCanSort() && (
                          <SortIndicator header={header} />
                        )}
                        {colId === "deadline" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = (
                                e.currentTarget as HTMLElement
                              ).getBoundingClientRect();
                              setDeadlinePickerPos({
                                top: rect.bottom + 4,
                                left: Math.max(8, rect.left - 120),
                              });
                              setShowDeadlinePicker((v) => !v);
                            }}
                            className={cn(
                              "size-3.5 flex items-center justify-center rounded cursor-pointer",
                              deadlinePreset || deadlineDateFrom
                                ? "text-primary/80"
                                : "text-white/60 hover:text-white/80",
                            )}
                          >
                            <ListFilter className="size-3" />
                          </button>
                        )}
                      </div>

                      {header.column.getCanResize() && (
                        <div
                          onDoubleClick={() => header.column.resetSize()}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={cn(
                            "absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize rounded-full",
                            "group-hover:bg-primary/20 active:bg-primary/30",
                          )}
                        />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllLeafColumns().length}
                  className="h-24 text-center text-sm text-slate-400"
                >
                  No results match your search.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    "transition-colors h-[52px]",
                    "hover:bg-slate-100/50",
                    "bg-white",
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const colId = cell.column.id;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "px-3 py-0 text-xs text-slate-600 border-b border-r border-slate-200 last:border-r-0",
                          "whitespace-normal break-words leading-relaxed overflow-hidden h-[52px]",
                        )}
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </table>
      </div>

      <div className="flex items-center justify-between px-5 py-2.5 border-t border-slate-200 bg-white">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>
            Showing{" "}
            {table.getState().pagination.pageIndex *
              table.getState().pagination.pageSize +
              1}{" "}
            \u2013{" "}
            {Math.min(
              (table.getState().pagination.pageIndex + 1) *
                table.getState().pagination.pageSize,
              table.getPrePaginationRowModel().rows.length,
            )}{" "}
            of {table.getPrePaginationRowModel().rows.length}
          </span>
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="ml-2 h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="outline"
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
            className="size-7 p-0"
          >
            <ChevronsLeft className="size-3" />
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="size-7 p-0"
          >
            <ChevronLeft className="size-3" />
          </Button>
          <span className="text-xs text-slate-500 px-2 min-w-[80px] text-center">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <Button
            size="xs"
            variant="outline"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="size-7 p-0"
          >
            <ChevronRight className="size-3" />
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => table.lastPage()}
            disabled={!table.getCanNextPage()}
            className="size-7 p-0"
          >
            <ChevronsRight className="size-3" />
          </Button>
        </div>
      </div>

      {showDeadlinePicker && deadlinePickerPos && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setShowDeadlinePicker(false);
              setDeadlinePickerPos(null);
            }}
          />
          <div
            className="fixed z-50 rounded-sm bg-white shadow-md ring-1 ring-slate-200 p-3"
            style={{ top: deadlinePickerPos.top, left: deadlinePickerPos.left }}
          >
            <p className="text-[11px] font-medium text-slate-500 mb-2 uppercase tracking-wider">
              Quick Select
            </p>
            <div className="flex gap-1 mb-3">
              {(["thisWeek", "thisMonth", "thisYear"] as const).map(
                (preset) => (
                  <Button
                    key={preset}
                    size="xs"
                    variant={deadlinePreset === preset ? "default" : "outline"}
                    onClick={() => {
                      dispatch(
                        setDeadlinePreset(
                          deadlinePreset === preset ? null : preset,
                        ),
                      );
                      setShowDeadlinePicker(false);
                    }}
                    className="flex-1 text-xs"
                  >
                    {preset === "thisWeek"
                      ? "Week"
                      : preset === "thisMonth"
                        ? "Month"
                        : "Year"}
                  </Button>
                ),
              )}
            </div>
            <p className="text-[11px] font-medium text-slate-500 mb-2 uppercase tracking-wider">
              Custom Range
            </p>
            <Calendar
              mode="range"
              defaultMonth={new Date()}
              selected={
                deadlineDateFrom
                  ? {
                      from: new Date(deadlineDateFrom),
                      to: deadlineDateTo ? new Date(deadlineDateTo) : undefined,
                    }
                  : undefined
              }
              onSelect={(range) => {
                if (range?.from && range?.to) {
                  dispatch(
                    setDeadlineDateRange({
                      from: range.from.toISOString(),
                      to: range.to.toISOString(),
                    }),
                  );
                }
              }}
              numberOfMonths={2}
            />
            {(deadlinePreset || deadlineDateFrom) && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  dispatch(clearDeadlineFilter());
                  setDeadlinePickerPos(null);
                  setShowDeadlinePicker(false);
                }}
                className="mt-2 w-full text-xs"
              >
                Clear Filter
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
