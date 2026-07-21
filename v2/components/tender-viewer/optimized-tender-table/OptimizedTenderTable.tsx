"use client";

import React, {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import "./OptimizedTenderTable.css";
import {
  DateRangeColumnFilter,
  SelectColumnFilter,
  TextColumnFilter,
  BooleanColumnFilter,
  DeadlineColumnFilter,
} from "./filters";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";
import * as XLSX from "xlsx";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  setColumnFilter,
  clearColumnFilter as clearColumnFilterAction,
  setColumnVisibility,
  resetColumnFilters,
} from "@/lib/slices/filtersSlice";
import {
  Search,
  FileSpreadsheet,
  FileDown,
  FileText,
  Columns3,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Check,
  Circle,
  Loader2,
} from "lucide-react";
import type {
  ColumnFilterType,
  FilterOption,
  ColumnFilterConfig,
  ColumnFilterState,
} from "@/lib/types";

export type {
  ColumnFilterType,
  FilterOption,
  ColumnFilterConfig,
  ColumnFilterState,
};

export interface ColumnDef<T> {
  header: string;
  accessor: keyof T | string;
  defaultWidth?: number;
  align?: "left" | "right" | "center";
  type?:
    | "string"
    | "number"
    | "date"
    | "boolean"
    | "percentage"
    | "currency"
    | "status"
    | "decision"
    | "custom";
  filter?: ColumnFilterConfig;
  sortable?: boolean;
  resizable?: boolean;
  searchable?: boolean;
  hidden?: boolean;
  renderCell?: (value: unknown, row: T) => React.ReactNode;
  renderExpanded?: (row: T) => React.ReactNode;
  sortValue?: (value: unknown, row: T) => string | number | boolean | null;
}

export interface OptimizedTenderTableProps<T extends Record<string, unknown>> {
  columns: ColumnDef<T>[];
  rows: T[];
  title?: string;
  rowKey?: keyof T;
  onRowClick?: (row: T) => void;
  associations?: { id: number; name: string; email: string }[];
  extraToolbarActions?: React.ReactNode;
  onFilteredRowsChange?: (rows: T[]) => void;
  onParseComplete?: () => void;
}

export function OptimizedTenderTable<T extends Record<string, unknown>>({
  columns,
  rows,
  title = "Data Table",
  rowKey = "id" as keyof T,
  onRowClick,
  associations = [],
  extraToolbarActions,
  onFilteredRowsChange,
  onParseComplete,
}: OptimizedTenderTableProps<T>) {
  const [globalSearch, setGlobalSearch] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(50);

  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => {
      const initialWidths: Record<string, number> = {};
      columns.forEach((col) => {
        initialWidths[String(col.accessor)] = col.defaultWidth ?? 150;
      });
      return initialWidths;
    },
  );

  useEffect(() => {
    setColumnWidths((prev) => {
      const updated = { ...prev };
      let changed = false;
      for (const col of columns) {
        const key = String(col.accessor);
        if (!(key in updated)) {
          updated[key] = col.defaultWidth ?? 150;
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
  }, [columns]);

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [isDownloadingPdfs, setIsDownloadingPdfs] = useState(false);
  const [isParsingPdfs, setIsParsingPdfs] = useState(false);

  const dispatch = useAppDispatch();
  const columnFilters = useAppSelector((s) => s.filters.columnFilters);
  const columnVisibility = useAppSelector((s) => s.filters.columnVisibility);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const resizingColumnRef = useRef<string | null>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, accessor: string, currentWidth: number) => {
      e.preventDefault();
      e.stopPropagation();
      resizingColumnRef.current = accessor;
      startXRef.current = e.clientX;
      startWidthRef.current = currentWidth;
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
      document.body.style.cursor = "col-resize";
    },
    [],
  );

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingColumnRef.current) return;
    const diff = e.clientX - startXRef.current;
    const newWidth = Math.max(50, startWidthRef.current + diff);
    setColumnWidths((prev) => ({
      ...prev,
      [resizingColumnRef.current!]: newWidth,
    }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizingColumnRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "default";
  }, [handleResizeMove]);

  const handleSort = useCallback(
    (accessor: string) => {
      const col = columns.find((c) => String(c.accessor) === accessor);
      if (!col || col.filter?.type === "boolean") return;

      if (sortColumn === accessor) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(accessor);
        setSortDirection("desc");
      }
      setCurrentPage(1);
    },
    [sortColumn, columns],
  );

  const toggleRowExpansion = useCallback((keyValue: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [keyValue]: !prev[keyValue],
    }));
  }, []);

  const getRowKey = useCallback(
    (row: T): string => {
      const type = row["type" as keyof T];
      const id = row[rowKey];
      if (id !== undefined) {
        const base =
          type !== undefined ? `${String(type)}-${String(id)}` : String(id);
        const ki = (row as any)._keyIndex;
        return ki !== undefined ? `${base}-${ki}` : base;
      }
      return Math.random().toString();
    },
    [rowKey],
  );

  const processedRows = useMemo(() => {
    let result = rows.map(
      (row, idx) => ({ ...row, _keyIndex: idx }) as unknown as T,
    );

    if (globalSearch.trim() !== "") {
      const searchLower = globalSearch.toLowerCase().trim();
      result = result.filter((row) => {
        return columns.some((col) => {
          if (col.filter?.type === "boolean") return false;
          const val = row[col.accessor as keyof T];
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(searchLower);
        });
      });
    }

    columns.forEach((col) => {
      const accessorStr = String(col.accessor);
      const filterState = columnFilters[accessorStr];
      if (!filterState) return;

      if (accessorStr === "deadline" && filterState.select) {
        const now = new Date();
        let from: Date | null = null;
        let to: Date | null = null;
        const preset = filterState.select;
        if (preset === "thisWeek") {
          from = startOfWeek(now, { weekStartsOn: 1 });
          to = endOfWeek(now, { weekStartsOn: 1 });
        } else if (preset === "thisMonth") {
          from = startOfMonth(now);
          to = endOfMonth(now);
        } else if (preset === "thisYear") {
          from = startOfYear(now);
          to = endOfYear(now);
        }
        if (from) {
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
          result = result.filter((row) => {
            const val = row[col.accessor as keyof T];
            if (
              !(val instanceof Date) &&
              typeof val !== "string" &&
              typeof val !== "number"
            )
              return true;
            const dateVal = val instanceof Date ? val : new Date(String(val));
            if (isNaN(dateVal.getTime())) return true;
            if (dateVal < from) return false;
            if (toEnd && dateVal > toEnd) return false;
            return true;
          });
        }
        return;
      }

      if (col.filter?.type === "dateRange" && filterState.dateRange) {
        const { startDate, endDate } = filterState.dateRange;
        if (startDate || endDate) {
          result = result.filter((row) => {
            const val = row[col.accessor as keyof T];
            if (
              !(val instanceof Date) &&
              typeof val !== "string" &&
              typeof val !== "number"
            )
              return true;

            const dateVal = val instanceof Date ? val : new Date(String(val));
            if (isNaN(dateVal.getTime())) return true;

            if (startDate) {
              const start = new Date(startDate);
              start.setHours(0, 0, 0, 0);
              if (dateVal < start) return false;
            }

            if (endDate) {
              const end = new Date(endDate);
              end.setHours(23, 59, 59, 999);
              if (dateVal > end) return false;
            }

            return true;
          });
        }
      }

      if (col.filter?.type === "select") {
        const selectVal = filterState.select;
        if (selectVal) {
          result = result.filter((row) => {
            const val = String(row[col.accessor as keyof T] ?? "");
            if (accessorStr === "assignedTo") {
              return val
                .split(",")
                .map((s) => s.trim())
                .includes(selectVal);
            }
            if (selectVal === "not_analysed") {
              return val === "";
            }
            if (accessorStr === "tenderFileUrl") {
              if (selectVal === "Available") return val !== "";
              if (selectVal === "Not Available") return val === "";
            }
            if (accessorStr === "website") {
              if (selectVal === "Available") return val !== "";
              if (selectVal === "Not Available") return val === "";
            }
            return val === selectVal;
          });
        }
        if (col.filter.searchable && filterState.text) {
          const textLower = filterState.text.toLowerCase();
          result = result.filter((row) => {
            const val = row[col.accessor as keyof T];
            if (val === null || val === undefined) return false;
            return String(val).toLowerCase().includes(textLower);
          });
        }
      }

      if (filterState.text) {
        const textLower = filterState.text.toLowerCase();
        result = result.filter((row) => {
          const val = row[col.accessor as keyof T];
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(textLower);
        });
      }

      if (
        col.filter?.type === "boolean" &&
        filterState.boolean !== null &&
        filterState.boolean !== undefined
      ) {
        result = result.filter((row) => {
          const val = row[col.accessor as keyof T];
          if (typeof val === "string") {
            return (val === "true") === filterState.boolean;
          }
          return Boolean(val) === filterState.boolean;
        });
      }
    });

    if (sortColumn) {
      const sortColDef = columns.find((c) => String(c.accessor) === sortColumn);
      const getSortValue = sortColDef?.sortValue ?? ((v: unknown) => v);

      result.sort((a, b) => {
        const valA = getSortValue(a[sortColumn as keyof T], a);
        const valB = getSortValue(b[sortColumn as keyof T], b);

        if (valA === null || valA === undefined)
          return sortDirection === "asc" ? -1 : 1;
        if (valB === null || valB === undefined)
          return sortDirection === "asc" ? 1 : -1;

        if (valA instanceof Date && valB instanceof Date) {
          return sortDirection === "asc"
            ? valA.getTime() - valB.getTime()
            : valB.getTime() - valA.getTime();
        }

        if (typeof valA === "number" && typeof valB === "number") {
          return sortDirection === "asc" ? valA - valB : valB - valA;
        }

        if (typeof valA === "boolean" && typeof valB === "boolean") {
          return sortDirection === "asc"
            ? Number(valA) - Number(valB)
            : Number(valB) - Number(valA);
        }

        return sortDirection === "asc"
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    const hasDeadlineFilter =
      columnFilters["deadline"]?.select || columnFilters["deadline"]?.dateRange;
    if (!hasDeadlineFilter) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      result = result.filter((row) => {
        const val = row["deadline" as keyof T];
        if (val == null || val === "") return true;
        if (
          !(val instanceof Date) &&
          typeof val !== "string" &&
          typeof val !== "number"
        )
          return true;
        const dateVal = val instanceof Date ? val : new Date(String(val));
        if (isNaN(dateVal.getTime())) return true;
        return dateVal >= today;
      });
    }

    return result;
  }, [rows, globalSearch, sortColumn, sortDirection, columns, columnFilters]);

  const gemTendersToDownload = useMemo(() => {
    return processedRows
      .filter((row) => {
        const type = row["type" as keyof T];
        const gemId = row["referenceNo" as keyof T];
        const pdfUrl = row["tenderFileUrl" as keyof T];
        return type === "Gem" && !!gemId && !pdfUrl;
      })
      .map((row) => ({
        id: parseInt(String(row["id" as keyof T] ?? "0"), 10),
        gemId: String(row["referenceNo" as keyof T]),
      }));
  }, [processedRows]);

  const tendersToParse = useMemo(() => {
    return processedRows
      .filter((row) => {
        const type = row["type" as keyof T];
        const pdfUrl = row["tenderFileUrl" as keyof T];
        const alreadyParsed = row["itemCategory" as keyof T];
        return type === "Gem" && !!pdfUrl && !alreadyParsed;
      })
      .map((row) => ({
        id: parseInt(String(row["id" as keyof T] ?? "0"), 10),
      }));
  }, [processedRows]);

  const totalRecords = processedRows.length;
  const totalPages = Math.ceil(totalRecords / rowsPerPage) || 1;

  const activePage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    const startIndex = (activePage - 1) * rowsPerPage;
    return processedRows.slice(startIndex, startIndex + rowsPerPage);
  }, [processedRows, activePage, rowsPerPage]);

  const visibleColumns = useMemo(() => {
    const filtered = columns.filter(
      (col) => !col.hidden && columnVisibility[String(col.accessor)] !== false,
    );
    const refIdx = filtered.findIndex(
      (col) => String(col.accessor) === "referenceNo",
    );
    if (refIdx > 0) {
      const [refCol] = filtered.splice(refIdx, 1);
      filtered.unshift(refCol);
    }

    const locIdx = filtered.findIndex(
      (col) => String(col.accessor) === "location",
    );
    const webIdx = filtered.findIndex(
      (col) => String(col.accessor) === "website",
    );
    if (locIdx >= 0 && webIdx >= 0) {
      const [webCol] = filtered.splice(webIdx, 1);
      const newLocIdx = filtered.findIndex(
        (col) => String(col.accessor) === "location",
      );
      filtered.splice(newLocIdx + 1, 0, webCol);
    }

    return filtered;
  }, [columns, columnVisibility]);

  useEffect(() => {
    setCurrentPage(1);
  }, [globalSearch, rowsPerPage, columnFilters]);

  const onFilteredRowsChangeRef = useRef(onFilteredRowsChange);
  onFilteredRowsChangeRef.current = onFilteredRowsChange;
  const onParseCompleteRef = useRef(onParseComplete);
  onParseCompleteRef.current = onParseComplete;

  useEffect(() => {
    onFilteredRowsChangeRef.current?.(processedRows);
  }, [processedRows]);

  const handleExportExcel = useCallback(() => {
    const visibleColumns = columns.filter(
      (c) => !c.hidden && columnVisibility[String(c.accessor)] !== false,
    );
    const exportData = processedRows.map((row) => {
      const obj: Record<string, string> = {};
      for (const col of visibleColumns) {
        const accessor = String(col.accessor);
        const label = col.header;
        let val = String(row[accessor as keyof T] ?? "");
        if (accessor === "assignedTo") {
          const ids = (val || "").split(",").filter(Boolean);
          val = ids
            .map((id) => {
              const a = associations.find((assoc) => assoc.id === parseInt(id));
              return a ? `${a.name}(${a.email})` : "";
            })
            .filter(Boolean)
            .join("\n");
        }
        if (accessor === "app" || accessor === "aps" || accessor === "apm") {
          val = val !== "YES" && val !== "NO" ? "" : val;
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
  }, [columns, processedRows, associations, columnVisibility]);

  const handleDownloadPdfs = useCallback(async () => {
    if (gemTendersToDownload.length === 0) return;
    setIsDownloadingPdfs(true);
    try {
      const res = await fetch("/api/download-pdfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenders: gemTendersToDownload }),
      });
      const data = await res.json();
      const msg =
        data.failed > 0
          ? `Downloaded ${data.success}/${data.total} PDFs (${data.failed} failed)`
          : `Downloaded ${data.success} PDFs successfully`;
      alert(msg);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Download failed");
    } finally {
      setIsDownloadingPdfs(false);
    }
  }, [gemTendersToDownload]);

  const handleParsePdfs = useCallback(async () => {
    if (tendersToParse.length === 0) return;
    setIsParsingPdfs(true);
    try {
      const res = await fetch("/api/parse-pdfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenders: tendersToParse }),
      });
      const data = await res.json();
      const msg =
        data.failed > 0
          ? `Parsed ${data.success}/${data.total} PDFs (${data.failed} failed)`
          : `Parsed ${data.success} PDFs successfully`;
      alert(msg);
      onParseCompleteRef.current?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setIsParsingPdfs(false);
    }
  }, [tendersToParse]);

  const formatCurrency = useCallback(
    (val: number | null | undefined): string => {
      if (val === null || val === undefined) return "-";
      return new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 0,
      }).format(val);
    },
    [],
  );

  const formatDate = useCallback(
    (val: Date | string | number | null | undefined): string => {
      if (!val) return "-";
      const d = new Date(val);
      if (isNaN(d.getTime())) return "-";
      return format(d, "do MMM, yyyy");
    },
    [],
  );

  const formatPercentage = useCallback(
    (val: number | null | undefined): string => {
      if (val === null || val === undefined) return "-";
      const prefix = val > 0 ? "+" : "";
      return `${prefix}${(val * 100).toFixed(1)}%`;
    },
    [],
  );

  const updateColumnFilter = useCallback(
    (accessor: string, filterType: ColumnFilterType, value: unknown) => {
      dispatch(setColumnFilter({ accessor, filterType, value }));
      setCurrentPage(1);
    },
    [dispatch],
  );

  const handleClearColumnFilter = useCallback(
    (accessor: string, filterType: ColumnFilterType) => {
      dispatch(clearColumnFilterAction({ accessor, filterType }));
      setCurrentPage(1);
    },
    [dispatch],
  );

  const renderFilter = useCallback(
    (col: ColumnDef<T>) => {
      const accessorStr = String(col.accessor);
      const filterState = columnFilters[accessorStr];

      if (!col.filter) return null;

      if (accessorStr === "deadline") {
        return (
          <DeadlineColumnFilter
            preset={filterState?.select ?? ""}
            onPresetChange={(v) => {
              if (v) {
                dispatch(
                  clearColumnFilterAction({
                    accessor: accessorStr,
                    filterType: "dateRange",
                  }),
                );
                dispatch(
                  setColumnFilter({
                    accessor: accessorStr,
                    filterType: "select",
                    value: v,
                  }),
                );
              } else {
                dispatch(
                  clearColumnFilterAction({
                    accessor: accessorStr,
                    filterType: "select",
                  }),
                );
              }
              setCurrentPage(1);
            }}
            startDate={filterState?.dateRange?.startDate ?? ""}
            endDate={filterState?.dateRange?.endDate ?? ""}
            onStartDateChange={(v) => {
              dispatch(
                clearColumnFilterAction({
                  accessor: accessorStr,
                  filterType: "select",
                }),
              );
              dispatch(
                setColumnFilter({
                  accessor: accessorStr,
                  filterType: "dateRange",
                  value: {
                    startDate: v,
                    endDate: filterState?.dateRange?.endDate ?? "",
                  },
                }),
              );
              setCurrentPage(1);
            }}
            onEndDateChange={(v) => {
              dispatch(
                clearColumnFilterAction({
                  accessor: accessorStr,
                  filterType: "select",
                }),
              );
              dispatch(
                setColumnFilter({
                  accessor: accessorStr,
                  filterType: "dateRange",
                  value: {
                    startDate: filterState?.dateRange?.startDate ?? "",
                    endDate: v,
                  },
                }),
              );
              setCurrentPage(1);
            }}
            onClearDateRange={() => {
              dispatch(
                clearColumnFilterAction({
                  accessor: accessorStr,
                  filterType: "dateRange",
                }),
              );
              setCurrentPage(1);
            }}
          />
        );
      }

      switch (col.filter.type) {
        case "dateRange":
          return (
            <DateRangeColumnFilter
              startDate={filterState?.dateRange?.startDate ?? ""}
              endDate={filterState?.dateRange?.endDate ?? ""}
              onStartDateChange={(v) =>
                updateColumnFilter(accessorStr, "dateRange", {
                  startDate: v,
                  endDate: filterState?.dateRange?.endDate ?? "",
                })
              }
              onEndDateChange={(v) =>
                updateColumnFilter(accessorStr, "dateRange", {
                  startDate: filterState?.dateRange?.startDate ?? "",
                  endDate: v,
                })
              }
              onClear={() => handleClearColumnFilter(accessorStr, "dateRange")}
            />
          );
        case "select":
          return (
            <SelectColumnFilter
              value={filterState?.select ?? ""}
              onChange={(v) => {
                if (col.filter?.searchable) {
                  dispatch(
                    clearColumnFilterAction({
                      accessor: accessorStr,
                      filterType: "text",
                    }),
                  );
                }
                updateColumnFilter(accessorStr, "select", v);
              }}
              options={col.filter.options ?? []}
              placeholder={col.filter.placeholder}
              searchable={col.filter.searchable}
              onSearchChange={
                col.filter?.searchable
                  ? (text) => {
                      dispatch(
                        clearColumnFilterAction({
                          accessor: accessorStr,
                          filterType: "select",
                        }),
                      );
                      if (text) {
                        dispatch(
                          setColumnFilter({
                            accessor: accessorStr,
                            filterType: "text",
                            value: text,
                          }),
                        );
                      } else {
                        dispatch(
                          clearColumnFilterAction({
                            accessor: accessorStr,
                            filterType: "text",
                          }),
                        );
                      }
                      setCurrentPage(1);
                    }
                  : undefined
              }
            />
          );
        case "text":
          return (
            <TextColumnFilter
              value={filterState?.text ?? ""}
              onChange={(v) => updateColumnFilter(accessorStr, "text", v)}
              placeholder={col.filter.placeholder}
            />
          );
        case "boolean":
          return (
            <BooleanColumnFilter
              value={filterState?.boolean ?? null}
              onChange={(v) => updateColumnFilter(accessorStr, "boolean", v)}
            />
          );
        default:
          return null;
      }
    },
    [columnFilters, updateColumnFilter, handleClearColumnFilter],
  );

  const renderCell = useCallback(
    (col: ColumnDef<T>, row: T): React.ReactNode => {
      const value = row[col.accessor as keyof T];

      if (col.renderCell) {
        return col.renderCell(value, row);
      }

      if (String(col.accessor).toLowerCase() === "quantity") {
        const totalQty = row.totalQuantity as string | null | undefined;
        const qty = value as string | null | undefined;

        if (
          totalQty &&
          totalQty !== "0" &&
          totalQty !== "" &&
          (!qty || qty === "")
        ) {
          return totalQty;
        }
      }

      if (col.type === "currency") {
        return formatCurrency(value as number | null | undefined);
      }

      if (col.type === "percentage") {
        return formatPercentage(value as number | null | undefined);
      }

      if (col.type === "date") {
        return formatDate(value as Date | string | number | null | undefined);
      }

      if (col.type === "boolean") {
        const isTrue = Boolean(value);
        return (
          <span
            className={`ra-icon ${isTrue ? "applicable" : "not-applicable"}`}
          >
            {isTrue ? <Check size={14} /> : <Circle size={14} />}
          </span>
        );
      }

      if (col.type === "status") {
        const statusVal = String(value ?? "").toUpperCase();
        const statusClass =
          statusVal === "WON"
            ? "won"
            : statusVal === "LOST"
              ? "lost"
              : statusVal === "UNDER_EVALUATION" || statusVal === "EVAL"
                ? "eval"
                : statusVal === "SUBMITTED"
                  ? "submitted"
                  : statusVal === "RA_PENDING" || statusVal === "LOI"
                    ? "loi"
                    : "";
        return (
          <span className={`status-badge ${statusClass}`}>
            {value != null ? String(value) : "-"}
          </span>
        );
      }

      if (col.type === "decision") {
        const decVal = String(value ?? "").toUpperCase();
        const decClass =
          decVal === "GO"
            ? "go"
            : decVal === "NO_GO" || decVal === "NOGO"
              ? "nogo"
              : "";
        return (
          <span className={`decision-badge ${decClass}`}>
            {value != null ? String(value) : "-"}
          </span>
        );
      }

      return value !== null && value !== undefined ? String(value) : "-";
    },
    [formatCurrency, formatPercentage, formatDate],
  );

  const getColumnAlignClass = useCallback((col: ColumnDef<T>): string => {
    if (col.align === "right") return "col-currency";
    if (col.align === "center") return "col-center";
    if (col.type === "currency") return "col-currency";
    if (col.type === "percentage") return "col-percentage";
    if (
      col.type === "boolean" ||
      col.type === "status" ||
      col.type === "decision"
    )
      return "col-center";
    return "";
  }, []);

  return (
    <div className="optimized-tender-table-container">
      <div className="optimized-tender-table-toolbar">
        <div className="toolbar-left">
          <h2 className="table-title">{title}</h2>
          <span className="record-count-badge">
            {totalRecords} Records Total
          </span>
          <div className="global-search-container">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="global-search-input"
              placeholder="Search..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="toolbar-right">
          <button className="export-btn" onClick={handleExportExcel}>
            <FileSpreadsheet size={14} /> Export Excel
          </button>
          {/* <button
            className="export-btn"
            onClick={handleDownloadPdfs}
            disabled={isDownloadingPdfs || gemTendersToDownload.length === 0}
          >
            {isDownloadingPdfs
              ? <><Loader2 size={14} className="animate-spin" /> Downloading...</>
              : <><FileDown size={14} /> Download PDFs ({gemTendersToDownload.length})</>}
          </button>
          <button
            className="export-btn"
            onClick={handleParsePdfs}
            disabled={isParsingPdfs || tendersToParse.length === 0}
          >
            {isParsingPdfs
              ? <><Loader2 size={14} className="animate-spin" /> Parsing...</>
              : <><FileText size={14} /> Parse PDFs ({tendersToParse.length})</>}
          </button> */}
          <div className="column-picker-container">
            <button
              className="column-picker-btn"
              onClick={() => setShowColumnPicker((v) => !v)}
            >
              <Columns3 size={14} /> Columns
            </button>
            {showColumnPicker && (
              <>
                <div
                  className="column-picker-overlay"
                  onClick={() => setShowColumnPicker(false)}
                />
                <div className="column-picker-dropdown">
                  <p className="column-picker-header">Toggle Columns</p>
                  {columns
                    .filter((col) => !col.hidden)
                    .map((col) => (
                      <label
                        key={String(col.accessor)}
                        className="column-picker-item"
                      >
                        <input
                          type="checkbox"
                          className="column-picker-checkbox"
                          checked={
                            columnVisibility[String(col.accessor)] !== false
                          }
                          onChange={() =>
                            dispatch(
                              setColumnVisibility({
                                ...columnVisibility,
                                [String(col.accessor)]: !(
                                  columnVisibility[String(col.accessor)] ?? true
                                ),
                              }),
                            )
                          }
                        />
                        {col.header}
                      </label>
                    ))}
                </div>
              </>
            )}
          </div>
          <button
            className="reset-filters-btn"
            onClick={() => {
              setGlobalSearch("");
              dispatch(resetColumnFilters());
              setCurrentPage(1);
            }}
          >
            <RotateCcw size={14} /> Reset Filters
          </button>
          {extraToolbarActions}
        </div>
      </div>

      <div className="optimized-tender-table-wrapper" ref={scrollContainerRef}>
        <table className="optimized-tender-data-table">
          <thead className="w-full">
            <tr>
              <th style={{ width: "40px" }} className="col-center"></th>
              {visibleColumns.map((col, colIdx) => {
                // console.log("Rendering header col", colIdx, ":", col.header);
                return (
                  <th
                    key={String(col.accessor)}
                    className={
                      String(col.accessor) === "referenceNo"
                        ? "sticky-first-column"
                        : ""
                    }
                    style={{ width: `${columnWidths[String(col.accessor)]}px` }}
                  >
                    <div
                      className="header-content"
                      onClick={() =>
                        col.sortable !== false &&
                        handleSort(String(col.accessor))
                      }
                    >
                      <span>{col.header}</span>
                      {sortColumn === String(col.accessor) && (
                        <span className="sort-indicator">
                          {sortDirection === "asc" ? (
                            <ChevronUp size={10} />
                          ) : (
                            <ChevronDown size={10} />
                          )}
                        </span>
                      )}
                    </div>
                    {(() => {
                      try {
                        return renderFilter(col);
                      } catch (e) {
                        console.error("renderFilter error for", col.header, e);
                        return null;
                      }
                    })()}
                    {col.searchable !== false && (
                      <input
                        type="text"
                        className="column-search-input"
                        placeholder={`Search ${col.header}...`}
                        value={columnFilters[String(col.accessor)]?.text ?? ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val) {
                            dispatch(
                              setColumnFilter({
                                accessor: String(col.accessor),
                                filterType: "text",
                                value: val,
                              }),
                            );
                          } else {
                            dispatch(
                              clearColumnFilterAction({
                                accessor: String(col.accessor),
                                filterType: "text",
                              }),
                            );
                          }
                          setCurrentPage(1);
                        }}
                      />
                    )}
                    {col.resizable !== false && (
                      <div
                        className="column-resizer"
                        onMouseDown={(e) =>
                          handleResizeStart(
                            e,
                            String(col.accessor),
                            columnWidths[String(col.accessor)],
                          )
                        }
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  style={{
                    textAlign: "center",
                    padding: "40px",
                    color: "rgba(0,0,0,0.4)",
                  }}
                >
                  No matching records found.
                </td>
              </tr>
            ) : (
              paginatedRows.map((row) => {
                const rowKeyValue = getRowKey(row);
                const isExpanded = !!expandedRows[rowKeyValue];

                return (
                  <React.Fragment key={rowKeyValue}>
                    <tr
                      className={`tender-row ${isExpanded ? "expanded-row" : ""}`}
                    >
                      <td className="col-center">
                        {columns.some((c) => c.renderExpanded) && (
                          <button
                            className="details-link"
                            onClick={() => toggleRowExpansion(rowKeyValue)}
                          >
                            {isExpanded ? (
                              <ChevronDown size={12} />
                            ) : (
                              <ChevronRight size={12} />
                            )}
                          </button>
                        )}
                      </td>

                      {visibleColumns.map((col, colIdx) => {
                        // console.log("Rendering cell col", colIdx, ":", col.header);
                        const cellClass = getColumnAlignClass(col);
                        let cellContent;
                        try {
                          cellContent = renderCell(col, row);
                        } catch (e) {
                          console.error("renderCell error for", col.header, e);
                          cellContent = "ERR";
                        }

                        return (
                          <td
                            key={String(col.accessor)}
                            className={`${cellClass}${String(col.accessor) === "referenceNo" ? " sticky-first-column" : ""}`}
                            style={{
                              width: `${columnWidths[String(col.accessor)]}px`,
                            }}
                            onClick={() => onRowClick?.(row)}
                          >
                            <div
                              style={{
                                maxHeight: 80,
                                overflowY: "auto",
                                whiteSpace: "normal",
                              }}
                            >
                              {cellContent}
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    {isExpanded && columns.some((c) => c.renderExpanded) && (
                      <tr className="details-panel-row">
                        <td colSpan={columns.length + 1}>
                          <div className="details-panel-content">
                            <div className="details-grid">
                              {columns
                                .filter((c) => c.renderExpanded)
                                .map((col) => (
                                  <div
                                    key={String(col.accessor)}
                                    className="details-item span-full"
                                  >
                                    <span className="details-label">
                                      {col.header}
                                    </span>
                                    <span className="details-value">
                                      {col.renderExpanded
                                        ? col.renderExpanded(row)
                                        : "-"}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="optimized-tender-table-footer">
        <div className="footer-left">
          <span>Rows per page:</span>
          <select
            className="rows-per-page-select"
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
          </select>
        </div>

        <div className="footer-center">
          Showing {totalRecords > 0 ? (activePage - 1) * rowsPerPage + 1 : 0} -{" "}
          {Math.min(activePage * rowsPerPage, totalRecords)} of {totalRecords}
        </div>

        <div className="footer-right">
          <button
            className="page-btn"
            onClick={() => setCurrentPage(1)}
            disabled={activePage === 1}
          >
            FIRST
          </button>
          <button
            className="page-btn"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={activePage === 1}
          >
            PREV
          </button>

          {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
            let pageNum = idx + 1;
            if (totalPages > 5 && activePage > 3) {
              pageNum = activePage - 3 + idx;
              if (pageNum + (4 - idx) > totalPages) {
                pageNum = totalPages - 4 + idx;
              }
            }
            return (
              <button
                key={pageNum}
                className={`page-btn ${activePage === pageNum ? "active" : ""}`}
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </button>
            );
          })}

          {totalPages > 5 && activePage < totalPages - 2 && (
            <>
              <span style={{ padding: "0 4px", color: "rgba(0,0,0,0.4)" }}>
                ...
              </span>
              <button
                className={`page-btn ${activePage === totalPages ? "active" : ""}`}
                onClick={() => setCurrentPage(totalPages)}
              >
                {totalPages}
              </button>
            </>
          )}

          <button
            className="page-btn"
            onClick={() =>
              setCurrentPage((prev) => Math.min(totalPages, prev + 1))
            }
            disabled={activePage === totalPages}
          >
            NEXT
          </button>
          <button
            className="page-btn"
            onClick={() => setCurrentPage(totalPages)}
            disabled={activePage === totalPages}
          >
            LAST
          </button>
        </div>
      </div>
    </div>
  );
}
