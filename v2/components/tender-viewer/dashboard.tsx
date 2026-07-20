"use client";

import React, {
  useEffect,
  useCallback,
  useMemo,
  useState,
  useRef,
} from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchFiles } from "@/lib/slices/filesSlice";
import {
  fetchTendersIncremental,
  appendTenders,
  updateTenderCell,
  updateTenderAssignments,
  updateWebsiteMapping,
  bulkAssignUtilityMapping,
  saveFeedbackAndReanalyze,
} from "@/lib/slices/tendersSlice";
import { setExclusionFilter } from "@/lib/slices/filtersSlice";
import { toast } from "sonner";
import TenderSidebar from "@/components/tender-viewer/tender-sidebar";
import ConfirmAnalysisDialog from "@/components/tender-viewer/confirm-analysis-dialog";
import AiFeedbackDialog from "@/components/tender-viewer/ai-feedback-dialog";
import DashboardSkeleton from "@/components/tender-viewer/dashboard-skeleton";
import WebsiteEditDialog from "@/components/tender-viewer/website-edit-dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, Pencil, Check } from "lucide-react";
import { getDisplayNameMap } from "@/lib/tender-columns";
import {
  OptimizedTenderTable,
  ColumnDef,
} from "@/components/tender-viewer/optimized-tender-table/OptimizedTenderTable";

function formatColumnName(name: string): string {
  if (name === "t247Id") return "Portal ID";
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

export default function Dashboard() {
  const dispatch = useAppDispatch();
  const selectedDateFrom = useAppSelector((s) => s.files.selectedDateFrom);
  const selectedDateTo = useAppSelector((s) => s.files.selectedDateTo);
  const files = useAppSelector((s) => s.files.items);
  const loadingFiles = useAppSelector((s) => s.files.loading);
  const tenderData = useAppSelector((s) => s.tenders.data);
  const loadingTenders = useAppSelector((s) => s.tenders.loading);
  const totalFiles = useAppSelector((s) => s.tenders.totalFiles);
  const completedFiles = useAppSelector((s) => s.tenders.completedFiles);
  const updatingCells = useAppSelector((s) => s.tenders.updatingCells);
  const uploadResults = useAppSelector((s) => s.upload.results);

  const [displayNameMap, setDisplayNameMap] = useState<Record<string, string>>({});
  const [feedbackRow, setFeedbackRow] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [websiteEditRow, setWebsiteEditRow] = useState<Record<
    string,
    unknown
  > | null>(null);
  const feedbackSaving = useAppSelector((s) => s.tenders.feedbackSaving);

  const prevTenderDataRef = useRef(tenderData);
  const prevOrderedColsRef = useRef<string[]>([]);
  useEffect(() => {
    if (prevTenderDataRef.current !== tenderData) {
      const added = tenderData?.columns.filter(
        (c) => !prevTenderDataRef.current?.columns.includes(c),
      );
      // console.log(
      //   `[tenderData changed] identity=${Object.is(prevTenderDataRef.current, tenderData)}`,
      //   `prevCols=${prevTenderDataRef.current?.columns.length ?? 0}`,
      //   `newCols=${tenderData?.columns.length ?? 0}`,
      //   `added=${added?.length ? JSON.stringify(added) : "none"}`,
      // );
      prevTenderDataRef.current = tenderData;
    }
  });

  const refreshTenders = useCallback(() => {
    if (files.length > 0) {
      dispatch(fetchTendersIncremental(files.map((f) => f.id)));
    }
  }, [files, dispatch]);

  useEffect(() => {
    dispatch(
      fetchFiles({
        from: new Date(selectedDateFrom),
        to: new Date(selectedDateTo),
      }),
    );
  }, [selectedDateFrom, selectedDateTo, dispatch]);

  useEffect(() => {
    if (files.length > 0) {
      dispatch(fetchTendersIncremental(files.map((f) => f.id)));
    } else {
      dispatch(fetchTendersIncremental([]));
    }
  }, [files, dispatch]);

  useEffect(() => {
    if (uploadResults && uploadResults.length > 0) {
      const fileIds = uploadResults.map((r) => r.fileId);
      dispatch(appendTenders(fileIds));
    }
  }, [uploadResults, dispatch]);

  useEffect(() => {
    fetch("/api/column-mappings")
      .then((res) => res.json())
      .then((data) => {
        if (data.mappings) {
          setDisplayNameMap(getDisplayNameMap(data.mappings));
        }
      })
      .catch(() => {});
  }, []);

  const handleAssignmentChange = useCallback(
    (rowIndex: number, type: string, id: string, associationIds: string[]) => {
      if (!tenderData) return;
      const oldValue = tenderData.rows[rowIndex]?.assignedTo ?? "";
      dispatch(
        updateTenderAssignments({
          rowIndex,
          gemTenderId: type === "Gem" ? parseInt(id, 10) : undefined,
          nonGemTenderId: type === "Non-Gem" ? parseInt(id, 10) : undefined,
          associationIds: associationIds.map(Number),
          oldValue,
        }),
      );
    },
    [tenderData, dispatch],
  );

  const handleDecisionClick = useCallback(
    (
      col: string,
      rowIndex: number,
      type: string,
      id: string,
      value: string,
    ) => {
      if (!tenderData) return;
      const oldValue = tenderData.rows[rowIndex]?.[col] ?? "";
      if (oldValue === value) return;
      const toastId = toast.loading(`Updating ${col.toUpperCase()}...`);
      dispatch(
        updateTenderCell({
          rowIndex,
          field: col,
          value,
          type: type as "Gem" | "Non-Gem",
          id: parseInt(id, 10),
          oldValue,
        }),
      )
        .unwrap()
        .then((result) => {
          toast.success(`${col.toUpperCase()} set to ${value}`, {
            id: toastId,
          });
          if (result?.webhookTriggered) {
            const ref = result.referenceNo ?? "";
            if (result.webhookResponse?.message) {
              const toastFn = result.webhookResponse.success ? toast.success : toast.error;
              toastFn(`${ref}: ${result.webhookResponse.message}`);
            }
          }
        })
        .catch((err: Error) => {
          toast.error(`Failed to update: ${err.message}`, { id: toastId });
        });
    },
    [tenderData, dispatch],
  );

  const handleSaveFeedback = useCallback(
    (params: {
      tenderId: number;
      tenderType: string;
      briefText: string;
      originalAi: string;
      correctedAi: string;
      feedbackReason: string;
    }) => {
      const toastId = toast.loading("Saving feedback and re-analyzing...");
      dispatch(saveFeedbackAndReanalyze(params))
        .unwrap()
        .then(() => {
          toast.success("Feedback saved, tender re-analyzed", { id: toastId });
        })
        .catch((err: Error) => {
          const msg =
            err.message === "rate_limit"
              ? "Re-analysis rate limited, try again later"
              : `Failed: ${err.message}`;
          toast.error(msg, { id: toastId });
        })
        .finally(() => {
          setFeedbackRow(null);
        });
    },
    [dispatch],
  );

  const handleWebsiteSave = useCallback(
    (params: {
      tenderId: number;
      tenderType: string;
      website: string;
      oldValue: string;
    }) => {
      const toastId = toast.loading("Saving website...");
      dispatch(
        updateWebsiteMapping({
          type: params.tenderType as "Gem" | "Non-Gem",
          id: params.tenderId,
          website: params.website,
          oldValue: params.oldValue,
        }),
      )
        .unwrap()
        .then((result) => {
          toast.success("Website saved", { id: toastId });
          setWebsiteEditRow(null);
          const type = params.tenderType as "Gem" | "Non-Gem";
          dispatch(
            bulkAssignUtilityMapping({
              organization: result.organization,
              website: params.website,
              utilityMappingId: result.utilityMappingId,
              excludeTenderId: params.tenderId,
              excludeTenderType: type,
            }),
          )
            .unwrap()
            .then((bulkResult) => {
              const total =
                bulkResult.updatedGem.length + bulkResult.updatedNonGem.length;
              if (total > 0) {
                toast.success(
                  `Updated ${total} tender${total > 1 ? "s" : ""} with same organization`,
                );
              }
            })
            .catch((err: Error) => {
              toast.error(`Bulk update failed: ${err.message}`);
            });
        })
        .catch((err: Error) => {
          toast.error(`Failed: ${err.message}`, { id: toastId });
          setWebsiteEditRow(null);
        });
    },
    [dispatch],
  );

  const selectFilterOptions = useMemo(() => {
    if (!tenderData) return {};
    const map: Record<string, { value: string; label: string }[]> = {};
    for (const col of tenderData.columns) {
      const vals = new Set<string>();
      for (const row of tenderData.rows) {
        const v = row[col];
        if (v != null && v !== "") vals.add(String(v));
      }
      if (vals.size > 0) {
        map[col] = Array.from(vals)
          .sort((a, b) => a.localeCompare(b))
          .map((v) => ({ value: v, label: v }));
      }
    }
    return map;
  }, [tenderData]);

  const orderedColumns = useMemo(() => {
    if (!tenderData) return [];
    // console.table(tenderData.columns);
    const skipCols = new Set([
      "sr. no.",
      "sr no",
      "s.no",
      "s. no",
      "serial no",
      "serial no.",
      "sn",
      "sno",
      "s r. n o.",
      "excluded category",
      "excludedcategory",
      "ai relevance",
      "ai relevance valid",
      "ai relevance reason",
      "searchkey",
      "ready",
    ]);
    const seen = new Set<string>();
    const cols = [...tenderData.columns].filter((col) => {
      const normalized = col.toLowerCase().trim().replace(/\s+/g, " ");
      if (skipCols.has(normalized)) return false;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
    const validIdx = cols.indexOf("aiRelevanceValid");
    if (validIdx >= 0) {
      cols.splice(validIdx, 1);
      cols.splice(2, 0, "aiRelevanceValid");
    }
    const reasonIdx = cols.indexOf("aiRelevanceReason");
    if (reasonIdx >= 0) {
      cols.splice(reasonIdx, 1);
      cols.splice(3, 0, "aiRelevanceReason");
    }
    const normalizeMatch = (s: string) =>
      s.toLowerCase().trim().replace(/\s+/g, " ");
    const qtySizeIdx = cols.findIndex(
      (c) => normalizeMatch(c) === "quantity / size",
    );
    if (qtySizeIdx >= 0) {
      const rawName = cols[qtySizeIdx];
      cols.splice(qtySizeIdx, 1);
      const valueIdx = cols.indexOf("value");
      cols.splice(valueIdx >= 0 ? valueIdx + 1 : cols.length, 0, rawName);
    }
    // console.log("[orderedColumns raw names]", JSON.stringify(cols.slice(-10)));
    const prev = prevOrderedColsRef.current;
    if (prev.length !== cols.length || prev.some((c, i) => c !== cols[i])) {
      // console.log(
      //   `[orderedColumns changed] was=${prev.length} now=${cols.length}`,
      //   `added=${cols.filter((c) => !prev.includes(c)).length > 0 ? JSON.stringify(cols.filter((c: string) => !prev.includes(c))) : "none"}`,
      //   `removed=${prev.filter((c: string) => !cols.includes(c)).length > 0 ? JSON.stringify(prev.filter((c: string) => !cols.includes(c))) : "none"}`,
      // );
      prevOrderedColsRef.current = cols;
    }
    return cols;
  }, [tenderData]);

  const [filteredRows, setFilteredRows] = useState<Record<string, unknown>[]>(
    [],
  );
  const handleFilteredRowsChange = useCallback(
    (rows: Record<string, unknown>[]) => {
      setFilteredRows(rows);
    },
    [],
  );

  const [showExclusionDropdown, setShowExclusionDropdown] = useState(false);
  const exclusionFilter = useAppSelector((s) => s.filters.exclusionFilter);

  const excludedRows = useMemo(() => {
    if (!tenderData) return [];
    if (!exclusionFilter) return tenderData.rows;
    return tenderData.rows.filter((row) => {
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
  }, [tenderData, exclusionFilter]);

  const columnDefs = useMemo(() => {
    if (!tenderData) return [];
    return orderedColumns.map((col): ColumnDef<Record<string, unknown>> => {
      const colLower = col.toLowerCase();

      if (col === "app" || col === "aps" || col === "apm") {
        return {
          header: col,
          accessor: col as keyof Record<string, unknown>,
          defaultWidth: 120,
          sortable: false,
          renderCell: (_value: unknown, row: Record<string, unknown>) => {
            const val = String(row[col] ?? "");
            const isYes = val === "YES";
            const isNo = val === "NO";
            const rowIndex = tenderData.rows.findIndex(
              (r) => String(r.id) === String(row.id),
            );
            const rowType = String(row.type ?? "");
            const rowId = String(row.id ?? "");
            const isUpdating = updatingCells[`${rowIndex}-${col}`];

            return (
              <div className="flex gap-1 py-1">
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() =>
                    handleDecisionClick(col, rowIndex, rowType, rowId, "YES")
                  }
                  className={`w-7 h-7 rounded text-xs font-bold border-2 transition-colors cursor-pointer ${
                    isUpdating
                      ? "opacity-50 cursor-not-allowed bg-slate-200 text-slate-400 border-slate-300"
                      : isYes
                        ? "bg-green-500 text-white border-green-600"
                        : "bg-white text-slate-400 border-slate-300 hover:border-slate-400"
                  }`}
                >
                  {isUpdating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "Y"
                  )}
                </button>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() =>
                    handleDecisionClick(col, rowIndex, rowType, rowId, "NO")
                  }
                  className={`w-7 h-7 rounded text-xs font-bold border-2 transition-colors cursor-pointer ${
                    isUpdating
                      ? "opacity-50 cursor-not-allowed bg-slate-200 text-slate-400 border-slate-300"
                      : isNo
                        ? "bg-red-500 text-white border-red-600"
                        : "bg-white text-slate-400 border-slate-300 hover:border-slate-400"
                  }`}
                >
                  {isUpdating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "N"
                  )}
                </button>
              </div>
            );
          },
          filter:
            col === "apm"
              ? {
                  type: "select" as const,
                  options: [
                    { value: "YES", label: "Yes" },
                    { value: "NO", label: "No" },
                  ],
                }
              : undefined,
        };
      }

      if (col.toLowerCase().trim().replace(/\s+/g, " ") === "quantity / size") {
        return {
          header: "Size",
          accessor: col as keyof Record<string, unknown>,
          defaultWidth: 120,
        };
      }

      if (col === "aiRelevanceValid") {
        return {
          header: "AI Relevance",
          accessor: col as keyof Record<string, unknown>,
          defaultWidth: 200,
          sortable: false,
          searchable: false,
          filter: {
            type: "select" as const,
            options: [
              { value: "true", label: "Yes" },
              { value: "false", label: "No" },
              { value: "not_analysed", label: "Not Analysed" },
            ],
          },
          renderCell: (_value: unknown, row: Record<string, unknown>) => {
            const valid = String(row.aiRelevanceValid ?? "");
            const reason = String(row.aiRelevanceReason ?? "");
            if (!valid) return <span className="text-slate-300">-</span>;
            const isYes = valid === "true";
            const hasFeedback = !!row.aiFeedbackCorrected;
            const feedbackKey = `${row.id}-${row.type === "Gem" ? "Gem" : "NonGem"}`;
            const isSaving = feedbackSaving[feedbackKey];
            return (
              <div className="relative group/cell">
                <div className="">
                  <div
                    className="flex flex-col gap-0.5"
                    style={{
                      maxHeight: 70,
                      overflowY: "auto",
                      whiteSpace: "normal",
                    }}
                  >
                    <Badge
                      className={`inline-flex w-fit text-[10px] font-medium ${
                        isYes
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                          : "bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-100"
                      }`}
                    >
                      {isYes ? "YES" : "NO"}
                    </Badge>
                    <span className="text-[11px] text-slate-500 leading-snug">
                      {reason}
                    </span>
                    {hasFeedback && (
                      <Badge className="inline-flex w-fit text-[10px] font-medium bg-red-50 text-red-600 border-red-200">
                        Feedback Given
                      </Badge>
                    )}
                  </div>
                </div>
                {!hasFeedback && (
                  <button
                    className="opacity-0 group-hover/cell:opacity-100 transition-all absolute top-0 right-0 w-8 h-8 rounded-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 p-1 shadow-sm cursor-pointer"
                    title="Provide Feedback"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFeedbackRow(row);
                    }}
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : (
                      <MessageSquare className="w-4 h-4 text-white" />
                    )}
                  </button>
                )}
              </div>
            );
          },
        };
      }

      if (col === "aiRelevanceReason") {
        return {
          header: "AI Reason",
          accessor: col as keyof Record<string, unknown>,
          defaultWidth: 200,
          hidden: true,
          sortable: false,
          searchable: false,
        };
      }

      if (col === "assignedTo") {
        return {
          header: "Assigned To",
          accessor: col as keyof Record<string, unknown>,
          defaultWidth: 200,
          searchable: false,
          filter: {
            type: "select" as const,
            options: tenderData.associations.map((a) => ({
              value: String(a.id),
              label: a.name,
            })),
          },
          sortValue: (value: unknown) => {
            const ids = String(value ?? "")
              .split(",")
              .filter(Boolean);
            return ids
              .map((id) => {
                const a = tenderData.associations.find(
                  (assoc) => assoc.id === parseInt(id),
                );
                return a?.name ?? "";
              })
              .filter(Boolean)
              .sort()
              .join(", ");
          },
          renderCell: (_value: unknown, row: Record<string, unknown>) => {
            const val = String(row[col] ?? "");
            const rowIndex = tenderData.rows.findIndex((r) => r.id === row.id);
            const rowType = String(row.type ?? "");
            const rowId = String(row.id ?? "");
            return (
              <select
                className="assignment-select"
                value={val}
                onChange={(e) => {
                  const ids = e.target.value ? [e.target.value] : [];
                  handleAssignmentChange(rowIndex, rowType, rowId, ids);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="">None</option>
                {tenderData.associations.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
            );
          },
        };
      }

      if (col === "parseStatus") {
        const statusColors: Record<string, string> = {
          COMPLETED:
            "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
          FAILED: "bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-100",
          RATE_LIMITED:
            "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
          PROCESSING:
            "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50",
        };
        return {
          header: "Parse Status",
          accessor: col as keyof Record<string, unknown>,
          defaultWidth: 150,
          filter: {
            type: "select" as const,
            options: [
              { value: "COMPLETED", label: "Completed" },
              { value: "FAILED", label: "Failed" },
              { value: "RATE_LIMITED", label: "Rate Limited" },
              { value: "PROCESSING", label: "Processing" },
            ],
          },
          renderCell: (_value: unknown, row: Record<string, unknown>) => {
            const status = String(row.parseStatus ?? "");
            const error = String(row.parseError ?? "");
            if (!status) return <span className="text-slate-300">-</span>;
            const colorClass =
              statusColors[status] ??
              "bg-slate-50 text-slate-600 border-slate-200";
            return (
              <div className="flex flex-col gap-0.5" title={error}>
                <Badge
                  className={`inline-flex w-fit text-[10px] font-medium ${colorClass}`}
                >
                  {status}
                </Badge>
              </div>
            );
          },
        };
      }

      if (col === "parseError") {
        return {
          header: "Parse Error",
          accessor: col as keyof Record<string, unknown>,
          defaultWidth: 200,
          hidden: true,
          sortable: false,
          searchable: false,
        };
      }

      if (col === "tenderFileUrl") {
        return {
          header: "Tender Document",
          accessor: col as keyof Record<string, unknown>,
          defaultWidth: 300,
          filter: {
            type: "select" as const,
            options: [
              { value: "Available", label: "Available" },
              { value: "Not Available", label: "Not Available" },
            ],
          },
          renderCell: (_value: unknown, row: Record<string, unknown>) => {
            const url = String(row[col] ?? "");
            if (!url) return <span className="text-slate-300">-</span>;
            return (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800 text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                Show Tender Document
              </a>
            );
          },
        };
      }

      if (col === "reportings") {
        return {
          header: "Reporting Officers",
          accessor: col as keyof Record<string, unknown>,
          defaultWidth: 200,
          sortValue: (value: unknown) => {
            if (!value) return "";
            try {
              const entries = JSON.parse(String(value));
              if (Array.isArray(entries) && entries.length > 0) {
                return entries[0]?.officer ?? "";
              }
            } catch {}
            return "";
          },
          renderCell: (_value: unknown, row: Record<string, unknown>) => {
            const raw = String(row[col] ?? "");
            if (!raw) return <span className="text-slate-300">-</span>;
            let entries: {
              officer: string;
              address?: string;
              quantity?: string;
            }[];
            try {
              entries = JSON.parse(raw);
            } catch {
              return <span className="text-slate-300">-</span>;
            }
            if (!entries.length)
              return <span className="text-slate-300">-</span>;
            return (
              <div
                className="flex flex-col gap-1 text-xs"
                style={{
                  maxHeight: 80,
                  overflowY: "auto",
                  whiteSpace: "normal",
                }}
              >
                {entries.map((e, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="font-medium">{e.officer}</span>
                    {e.quantity && (
                      <span className="text-slate-500">qty: {e.quantity}</span>
                    )}
                  </div>
                ))}
              </div>
            );
          },
        };
      }

      if (col === "website") {
        return {
          header: "Website",
          accessor: col as keyof Record<string, unknown>,
          defaultWidth: 200,
          filter: {
            type: "select" as const,
            options: [
              { value: "Available", label: "Available" },
              { value: "Not Available", label: "Not Available" },
            ],
          },
          renderCell: (_value: unknown, row: Record<string, unknown>) => {
            const raw = String(row[col] ?? "");
            const websiteKey = `${row.id}-${row.type === "Gem" ? "Gem" : "NonGem"}-website`;
            const isSaving = updatingCells[websiteKey];
            const urls = raw
              ? raw
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
            return (
              <div className="relative group/cell h-full">
                <div
                  className="h-full"
                  style={{
                    height: 70,
                    maxHeight: 70,
                    overflowY: "auto",
                    whiteSpace: "normal",
                  }}
                >
                  {urls.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {urls.map((url, i) => (
                        <a
                          key={i}
                          href={url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline hover:text-blue-800 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {url}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </div>
                <button
                  className="opacity-0 group-hover/cell:opacity-100 transition-all absolute top-0 right-0 w-8 h-8 rounded-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 p-1 shadow-sm cursor-pointer"
                  title="Edit Website"
                  onClick={(e) => {
                    e.stopPropagation();
                    setWebsiteEditRow(row);
                  }}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  ) : (
                    <Pencil className="w-4 h-4 text-white" />
                  )}
                </button>
              </div>
            );
          },
        };
      }

      if (col === "location") {
        return {
          header: "Location",
          accessor: col as keyof Record<string, unknown>,
          defaultWidth: 200,
          sortValue: (value: unknown, row: Record<string, unknown>) => {
            const reportingsRaw = String(row.reportings ?? "");
            const addresses: string[] = [];
            const origLoc = String(value ?? "").trim();
            if (origLoc) addresses.push(origLoc);
            if (reportingsRaw) {
              try {
                const entries = JSON.parse(reportingsRaw);
                if (Array.isArray(entries)) {
                  entries.forEach((e: { address?: string }) => {
                    if (e.address && !addresses.includes(e.address)) {
                      addresses.push(e.address);
                    }
                  });
                }
              } catch {}
            }
            return addresses.join(" | ");
          },
          renderCell: (_value: unknown, row: Record<string, unknown>) => {
            const reportingsRaw = String(row.reportings ?? "");
            const addresses: string[] = [];
            const origLoc = String(row.location ?? "").trim();
            if (origLoc) addresses.push(origLoc);
            if (reportingsRaw) {
              try {
                const entries = JSON.parse(reportingsRaw);
                if (Array.isArray(entries)) {
                  entries.forEach((e: { address?: string }) => {
                    if (e.address && !addresses.includes(e.address)) {
                      addresses.push(e.address);
                    }
                  });
                }
              } catch {}
            }
            if (addresses.length === 0) {
              return <span className="text-slate-300">-</span>;
            }
            return (
              <div
                style={{
                  maxHeight: 80,
                  overflowY: "auto",
                  whiteSpace: "normal",
                }}
              >
                {addresses.join(" | ")}
              </div>
            );
          },
        };
      }

      let filterType: "text" | "select" | "dateRange" | "boolean" | undefined;

      if (
        colLower.includes("date") ||
        colLower.includes("deadline") ||
        colLower.includes("submission")
      ) {
        filterType = "dateRange";
      } else if (colLower.includes("status")) {
        filterType = "select";
      } else if (colLower.includes("type")) {
        filterType = "select";
      } else if (col === "organization") {
        filterType = "select";
      }

      const options = selectFilterOptions[col];
      return {
        header: displayNameMap[col] ?? formatColumnName(col),
        accessor: col as keyof Record<string, unknown>,
        defaultWidth:
          col === "id"
            ? 80
            : col === "deadline" || col === "reportings"
              ? 300
              : 200,
        searchable:
          col === "deadline" || col === "organization" || col === "type"
            ? false
            : undefined,
        hidden: col === "id" ? true : undefined,
        type: filterType === "dateRange" ? "date" : undefined,
        filter:
          options && filterType === "select"
            ? {
                type: "select" as const,
                options,
                ...(col === "organization"
                  ? { searchable: true as const }
                  : {}),
              }
            : filterType
              ? { type: filterType }
              : undefined,
      };
    });
  }, [
    orderedColumns,
    selectFilterOptions,
    tenderData,
    updatingCells,
    handleDecisionClick,
    handleAssignmentChange,
    displayNameMap,
  ]);

  return (
    <div className="flex flex-1 overflow-hidden bg-[#f4f6f8]">
      <TenderSidebar
        rows={tenderData?.rows ?? []}
        associations={tenderData?.associations ?? []}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex-1 overflow-auto p-6">
          {loadingFiles && (
            <div className="flex items-center justify-center py-12 text-sm text-slate-400">
              <svg
                className="size-5 animate-spin mr-2 text-primary"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading files...
            </div>
          )}

          {loadingTenders && !tenderData && <DashboardSkeleton />}

          {tenderData && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <OptimizedTenderTable
                onFilteredRowsChange={handleFilteredRowsChange}
                onParseComplete={refreshTenders}
                extraToolbarActions={
                  <>
                    <div className="column-picker-container">
                      <button
                        className="export-btn"
                        onClick={() => setShowExclusionDropdown((v) => !v)}
                      >
                        {exclusionFilter
                          ? `Excluding: ${exclusionFilter}`
                          : "Exclusions"}
                      </button>
                      {showExclusionDropdown && (
                        <>
                          <div
                            className="column-picker-overlay"
                            onClick={() => setShowExclusionDropdown(false)}
                          />
                          <div
                            className="column-picker-dropdown"
                            style={{ width: 180 }}
                          >
                            {[
                              { value: "cable", label: "Exclude cables" },
                              {
                                value: "conductors",
                                label: "Exclude conductors",
                              },
                              { value: "both", label: "Exclude both" },
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                className="column-picker-item"
                                style={{
                                  width: "100%",
                                  textAlign: "left",
                                  fontSize: 12,
                                }}
                                onClick={() => {
                                  dispatch(
                                    setExclusionFilter(
                                      exclusionFilter === opt.value
                                        ? null
                                        : opt.value,
                                    ),
                                  );
                                  setShowExclusionDropdown(false);
                                }}
                              >
                                {exclusionFilter === opt.value ? <Check size={12} className="inline mr-1" /> : null}
                                {opt.label}
                              </button>
                            ))}
                            {exclusionFilter && (
                              <button
                                className="column-picker-item"
                                style={{
                                  width: "100%",
                                  textAlign: "left",
                                  fontSize: 12,
                                  borderTop: "1px solid var(--color-border)",
                                  marginTop: 4,
                                  paddingTop: 6,
                                }}
                                onClick={() => {
                                  dispatch(setExclusionFilter(null));
                                  setShowExclusionDropdown(false);
                                }}
                              >
                                Clear filter
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    <ConfirmAnalysisDialog filteredRows={filteredRows} />
                    {feedbackRow && (
                      <AiFeedbackDialog
                        row={feedbackRow}
                        isSaving={
                          feedbackSaving[
                            `${feedbackRow.id}-${feedbackRow.type === "Gem" ? "Gem" : "NonGem"}`
                          ] ?? false
                        }
                        onSave={handleSaveFeedback}
                        onClose={() => setFeedbackRow(null)}
                      />
                    )}
                    {websiteEditRow && (
                      <WebsiteEditDialog
                        row={websiteEditRow}
                        isSaving={
                          updatingCells[
                            `${websiteEditRow.id}-${websiteEditRow.type === "Gem" ? "Gem" : "NonGem"}-website`
                          ] ?? false
                        }
                        onSave={handleWebsiteSave}
                        onClose={() => setWebsiteEditRow(null)}
                      />
                    )}
                  </>
                }
                columns={columnDefs}
                rows={excludedRows as Record<string, unknown>[]}
                associations={tenderData.associations ?? []}
                title="Tender Table"
              />
            </div>
          )}

          {!loadingFiles && files.length > 0 && !tenderData && !loadingTenders && (
            <div className="flex items-center justify-center py-12 text-sm text-slate-400 bg-white rounded-sm border border-slate-200">
              No tender data found
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
