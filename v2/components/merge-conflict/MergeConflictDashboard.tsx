"use client";

import React, { useMemo, useCallback, useState } from "react";
import { useAppSelector } from "@/lib/hooks";
import {
  OptimizedTenderTable,
  ColumnDef,
} from "@/components/tender-viewer/optimized-tender-table/OptimizedTenderTable";

export default function MergeConflictDashboard() {
  const tenderData = useAppSelector((s) => s.tenders.data);
  const loadingTenders = useAppSelector((s) => s.tenders.loading);

  const [approvedState, setApprovedState] = useState<Record<string, string>>(
    {},
  );

  const docketCountMap = useMemo(() => {
    if (!tenderData) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const row of tenderData.rows) {
      const docket = String(row.docketNo ?? "");
      if (!docket) continue;
      map.set(docket, (map.get(docket) ?? 0) + 1);
    }
    return map;
  }, [tenderData]);

  const enrichedRows = useMemo(() => {
    if (!tenderData) return [];
    return tenderData.rows
      .filter((row) => {
        const docket = String(row.docketNo ?? "").trim();
        return docket.length > 0;
      })
      .map((row) => ({
        ...row,
        _docketTenderCount:
          docketCountMap.get(String(row.docketNo ?? "")) ?? 0,
      }));
  }, [tenderData, docketCountMap]);

  const handleFilteredRowsChange = useCallback(
    (_rows: Record<string, unknown>[]) => {},
    [],
  );

  const handleApprovedClick = useCallback(
    (rowId: string, value: string) => {
      setApprovedState((prev) => {
        const current = prev[rowId] ?? "";
        const newValue = current === value ? "" : value;
        return { ...prev, [rowId]: newValue };
      });
    },
    [],
  );

  const columnDefs = useMemo(
    (): ColumnDef<Record<string, unknown>>[] => [
      {
        header: "Docket No",
        accessor: "docketNo" as keyof Record<string, unknown>,
        defaultWidth: 150,
        sortable: true,
        filter: { type: "text" as const },
      },
      {
        header: "Organization",
        accessor: "organization" as keyof Record<string, unknown>,
        defaultWidth: 250,
        sortable: true,
        filter: { type: "text" as const },
      },
      {
        header: "Reference No",
        accessor: "referenceNo" as keyof Record<string, unknown>,
        defaultWidth: 200,
        sortable: true,
        filter: { type: "text" as const },
      },
      {
        header: "Tender Brief",
        accessor: "tenderBrief" as keyof Record<string, unknown>,
        defaultWidth: 400,
        sortable: true,
        filter: { type: "text" as const },
      },
      {
        header: "Tenders in Docket",
        accessor:
          "_docketTenderCount" as keyof Record<string, unknown>,
        defaultWidth: 150,
        align: "center",
        sortable: true,
        filter: {
          type: "select" as const,
          options: [
            { value: "0", label: "0" },
            { value: "1", label: "1" },
            { value: "2", label: "2" },
            { value: "3", label: "3" },
            { value: "4+", label: "4+" },
            { value: "__blank__", label: "Blank" },
          ],
        },
        renderCell: (value: unknown) => {
          const count = Number(value ?? 0);
          if (count === 0)
            return <span className="text-slate-300">-</span>;
          return (
            <span
              className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                count > 1
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {count}
            </span>
          );
        },
        sortValue: (value: unknown) => Number(value ?? 0),
      },
      {
        header: "Approved",
        accessor: "_approved" as keyof Record<string, unknown>,
        defaultWidth: 130,
        sortable: false,
        filter: {
          type: "select" as const,
          options: [
            { value: "YES", label: "Yes" },
            { value: "NO", label: "No" },
            { value: "__blank__", label: "Blank" },
          ],
        },
        renderCell: (_value: unknown, row: Record<string, unknown>) => {
          const rowId = String(row.id ?? "");
          const val = approvedState[rowId] ?? "";
          const isYes = val === "YES";
          const isNo = val === "NO";
          return (
            <div className="flex gap-1 py-1">
              <button
                type="button"
                onClick={() => handleApprovedClick(rowId, "YES")}
                className={`w-7 h-7 rounded text-xs font-bold border-2 transition-colors cursor-pointer ${
                  isYes
                    ? "bg-green-500 text-white border-green-600"
                    : "bg-white text-slate-400 border-slate-300 hover:border-slate-400"
                }`}
              >
                Y
              </button>
              <button
                type="button"
                onClick={() => handleApprovedClick(rowId, "NO")}
                className={`w-7 h-7 rounded text-xs font-bold border-2 transition-colors cursor-pointer ${
                  isNo
                    ? "bg-red-500 text-white border-red-600"
                    : "bg-white text-slate-400 border-slate-300 hover:border-slate-400"
                }`}
              >
                N
              </button>
            </div>
          );
        },
      },
    ],
    [approvedState, handleApprovedClick],
  );

  if (loadingTenders && !tenderData) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-400">
        Loading...
      </div>
    );
  }

  if (!tenderData) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-400 bg-white rounded-sm border border-slate-200">
        No tender data found. Upload files from the Tenders page first.
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden bg-[#f4f6f8]">
      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex-1 overflow-auto p-6">
          <OptimizedTenderTable
            columns={columnDefs}
            rows={enrichedRows as Record<string, unknown>[]}
            title="Merge Conflict"
            onFilteredRowsChange={handleFilteredRowsChange}
          />
        </main>
      </div>
    </div>
  );
}
