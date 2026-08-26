"use client";

import React, { useMemo, useState, useRef, useCallback } from "react";
import { useEmdDetailsBg, EmdDetailsBgRecord } from "@/hooks/useEmdDetailsBg";
import { EmdBgSidebar, EmdBgStatus, EmdBgStats } from "@/components/emd-bg/EmdBgSidebar";
import { RefreshCw, Eraser, Search, Download, FileSpreadsheet, ChevronUp, ChevronDown, RotateCcw, X, Mail, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { TENDER_REASON_OPTIONS } from "@/lib/emdReasonOptions";
import { EmdBgEmailDialog } from "@/components/emd/EmdBgEmailDialog";
import "@/app/SupplyHistory.css";
import "@/components/TenderTable.css";

function normalizeStatus(v: string | null | undefined): EmdBgStatus {
  if (!v) return "OTHER";
  const u = v.trim().toUpperCase();
  if (u.includes("EXPIRED") || u === "EXPIRE") return "EXPIRED";
  if (u.includes("CLAIM")) return "CLAIMED";
  if (u.includes("ACTIVE") || u.includes("VALID") || u.includes("LIVE") || u === "OK" || u === "APPROVED") return "ACTIVE";
  return "OTHER";
}

function parseAmt(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/[₹,\s]/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseDateValue(v: unknown): number {
  if (!v) return 0;
  const s = String(v).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getTime();
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!isNaN(dt.getTime())) return dt.getTime();
  }
  return 0;
}

type BgColumn = {
  header: string;
  accessor: keyof EmdDetailsBgRecord | "action";
  defaultWidth: number;
  align?: "left" | "right" | "center";
  sticky?: boolean;
  sortable?: boolean;
};

const BG_COLUMNS: BgColumn[] = [
  { header: "Tran Type", accessor: "trantype", defaultWidth: 120, align: "center", sortable: true },
  { header: "Bank Name", accessor: "bankName", defaultWidth: 180, align: "left", sortable: true },
  { header: "Party Code", accessor: "partyCode", defaultWidth: 120, align: "left", sortable: true },
  { header: "Party Name", accessor: "partyName", defaultWidth: 210, align: "left", sortable: true },
  { header: "Staff Name", accessor: "staffName", defaultWidth: 160, align: "left", sortable: true },
  { header: "BG No", accessor: "bgNo", defaultWidth: 180, align: "left", sticky: true, sortable: true },
  { header: "BG Date", accessor: "bgDate", defaultWidth: 135, align: "center", sortable: true },
  { header: "BG Amt (Local)", accessor: "bgAmtLocal", defaultWidth: 140, align: "right", sortable: true },
  { header: "BG Amt (FC)", accessor: "bgAmtFc", defaultWidth: 120, align: "right", sortable: true },
  { header: "Expiry Date", accessor: "expiryDate", defaultWidth: 135, align: "center", sortable: true },
  { header: "Claim Date", accessor: "claimDate", defaultWidth: 135, align: "center", sortable: true },
  { header: "Remark", accessor: "remark", defaultWidth: 180, align: "left" },
  { header: "Status", accessor: "status", defaultWidth: 140, align: "center", sortable: true },
  { header: "Remarks", accessor: "remarks", defaultWidth: 200, align: "left" },
  { header: "Contact No", accessor: "contactNo", defaultWidth: 135, align: "left" },
  { header: "Contact Email", accessor: "contactEmailId", defaultWidth: 200, align: "left" },
  { header: "Address", accessor: "address", defaultWidth: 240, align: "left" },
  { header: "Tender No", accessor: "tenderNo", defaultWidth: 180, align: "left", sortable: true },
  { header: "Tender No 1", accessor: "tenderNo1", defaultWidth: 150, align: "left" },
  { header: "Tender No 2", accessor: "tenderNo2", defaultWidth: 150, align: "left" },
  { header: "Match", accessor: "match", defaultWidth: 100, align: "center" },
  { header: "BG Match", accessor: "bgMatch", defaultWidth: 100, align: "center" },
  { header: "Status Price Ass Done", accessor: "statusPriceAssDone", defaultWidth: 160, align: "left" },
  { header: "TM No", accessor: "tmNo", defaultWidth: 115, align: "left" },
  { header: "Docket No", accessor: "docketNo", defaultWidth: 130, align: "left" },
  { header: "Last Email Sent", accessor: "lastEmailSent", defaultWidth: 140, align: "center", sortable: true },
  { header: "Email Draft", accessor: "emailDraft", defaultWidth: 320, align: "left" },
  { header: "Last Email Sent At", accessor: "lastEmailSentAt", defaultWidth: 170, align: "center", sortable: true },
  { header: "Tender Conclusion Reason", accessor: "reason", defaultWidth: 280, align: "left", sortable: true },
  { header: "Action", accessor: "action", defaultWidth: 140, align: "center", sortable: false },
];

export default function EmdDetailsBgPage() {
  const { data, loading, error, refresh } = useEmdDetailsBg();
  const [selectedStatus, setSelectedStatus] = useState<EmdBgStatus | "ALL">("ALL");

  // TenderTable-style states
  const [globalSearch, setGlobalSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<keyof EmdDetailsBgRecord | null>("bgNo");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [columnSearchText, setColumnSearchText] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    BG_COLUMNS.forEach((c) => (m[String(c.accessor)] = c.defaultWidth));
    return m;
  });

  const [localReasonMap, setLocalReasonMap] = useState<Record<string, string | null>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [reasonFilter, setReasonFilter] = useState<string>("");

  const resizingColumnRef = useRef<string | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = (e: React.MouseEvent, accessor: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColumnRef.current = accessor;
    startXRef.current = e.clientX;
    startWidthRef.current = currentWidth;
    const onMove = (ev: MouseEvent) => {
      if (!resizingColumnRef.current) return;
      const diff = ev.clientX - startXRef.current;
      const newWidth = Math.max(60, startWidthRef.current + diff);
      setColumnWidths((prev) => ({ ...prev, [resizingColumnRef.current!]: newWidth }));
    };
    const onUp = () => {
      resizingColumnRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "default";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
  };

  const handleSort = (col: keyof EmdDetailsBgRecord | "action") => {
    if (col === "action") return;
    const cfg = BG_COLUMNS.find((c) => c.accessor === col);
    if (!cfg?.sortable) return;
    if (sortColumn === col) setSortDirection((p) => (p === "asc" ? "desc" : "asc"));
    else {
      setSortColumn(col as keyof EmdDetailsBgRecord);
      setSortDirection("desc");
    }
    setCurrentPage(1);
  };

  const stickyLeftOffsets = useMemo(() => {
    const offsets: Record<string, number> = {};
    let acc = 0;
    for (const col of BG_COLUMNS) {
      if (col.sticky) {
        offsets[String(col.accessor)] = acc;
        acc += columnWidths[String(col.accessor)] ?? col.defaultWidth;
      }
    }
    return offsets;
  }, [columnWidths]);

  const sidebarStats: Record<EmdBgStatus, EmdBgStats> = useMemo(() => {
    const init = (): EmdBgStats => ({ count: 0, totalBgAmt: 0, partyCount: 0 });
    const map: Record<EmdBgStatus, EmdBgStats> = { ACTIVE: init(), EXPIRED: init(), CLAIMED: init(), OTHER: init() };
    const partySets: Record<EmdBgStatus, Set<string>> = { ACTIVE: new Set(), EXPIRED: new Set(), CLAIMED: new Set(), OTHER: new Set() } as any;
    for (const r of data) {
      const k = normalizeStatus(r.status);
      map[k].count += 1;
      map[k].totalBgAmt += parseAmt(r.bgAmtLocal);
      if (r.partyName) partySets[k].add(r.partyName.trim().toLowerCase());
    }
    for (const k of Object.keys(map) as EmdBgStatus[]) map[k].partyCount = partySets[k].size;
    return map;
  }, [data]);

  const mergedData = useMemo(() => {
    return data.map((r) => (localReasonMap[r.id] !== undefined ? { ...r, reason: localReasonMap[r.id] } : r));
  }, [data, localReasonMap]);

  const statusFiltered = useMemo(() => {
    if (selectedStatus === "ALL") return mergedData;
    return mergedData.filter((r) => normalizeStatus(r.status) === selectedStatus);
  }, [mergedData, selectedStatus]);

  const handleReasonChange = useCallback(async (id: string, newReason: string) => {
    const prev = (mergedData.find((r) => r.id === id)?.reason ?? null) as string | null;
    setLocalReasonMap((prevMap) => ({ ...prevMap, [id]: newReason || null }));
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/emd-details-bg/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: newReason || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to update reason");
      toast.success("Reason updated");
    } catch (e: any) {
      setLocalReasonMap((prevMap) => ({ ...prevMap, [id]: prev }));
      toast.error(e.message || "Failed to update reason");
    } finally {
      setUpdatingId(null);
    }
  }, [mergedData]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogRow, setDialogRow] = useState<EmdDetailsBgRecord | null>(null);

  const handleSendEmail = useCallback(async (row: EmdDetailsBgRecord) => {
    if (!row.reason) {
      toast.error("Please select Tender Conclusion Reason before sending email");
      return;
    }
    setDialogRow(row);
    setDialogOpen(true);
  }, []);

  const handleDialogConfirm = useCallback(async (payload: { to: string; subject: string; body: string; html: string }) => {
    if (!dialogRow) return;
    setSendingId(dialogRow.id);
    try {
      const res = await fetch(`/api/emd-details-bg/${dialogRow.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: payload.to, subject: payload.subject, body: payload.body, html: payload.html }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to send email");
      toast.success("Email sent");
      setDialogOpen(false);
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to send email");
      throw e;
    } finally {
      setSendingId(null);
    }
  }, [dialogRow, refresh]);

  const processedRecords = useMemo(() => {
    let result = [...statusFiltered];

    if (globalSearch.trim() !== "") {
      const q = globalSearch.toLowerCase().trim();
      result = result.filter((r) =>
        BG_COLUMNS.some((c) => {
          if (c.accessor === "action") return false;
          const v = (r as any)[c.accessor as keyof EmdDetailsBgRecord];
          if (v == null) return false;
          return String(v).toLowerCase().includes(q);
        })
      );
    }

    for (const [accessor, searchVal] of Object.entries(columnSearchText)) {
      if (!searchVal.trim()) continue;
      const q = searchVal.toLowerCase().trim();
      result = result.filter((r) => {
        if (accessor === "reason" || accessor === "action") return true;
        const v = (r as any)[accessor as keyof EmdDetailsBgRecord];
        if (v == null) return false;
        return String(v).toLowerCase().includes(q);
      });
    }

    if (reasonFilter) {
      if (reasonFilter === "__blank__") {
        result = result.filter((r) => !r.reason || String(r.reason).trim() === "");
      } else {
        result = result.filter((r) => r.reason === reasonFilter);
      }
    }

    if (sortColumn) {
      result.sort((a, b) => {
        const va = (a as any)[sortColumn];
        const vb = (b as any)[sortColumn];
        if (sortColumn === "bgAmtLocal" || sortColumn === "bgAmtFc") {
          const na = parseAmt(va);
          const nb = parseAmt(vb);
          return sortDirection === "asc" ? na - nb : nb - na;
        }
        if (sortColumn === "bgDate" || sortColumn === "expiryDate" || sortColumn === "claimDate" || sortColumn === "lastEmailSent" || sortColumn === "lastEmailSentAt") {
          const da = parseDateValue(va);
          const db = parseDateValue(vb);
          if (da === db) return 0;
          return sortDirection === "asc" ? da - db : db - da;
        }
        if (va == null && vb == null) return 0;
        if (va == null) return sortDirection === "asc" ? -1 : 1;
        if (vb == null) return sortDirection === "asc" ? 1 : -1;
        return sortDirection === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      });
    }

    return result;
  }, [statusFiltered, globalSearch, columnSearchText, reasonFilter, sortColumn, sortDirection]);

  const totalRecords = processedRecords.length;
  const totalPages = Math.ceil(totalRecords / rowsPerPage) || 1;
  const activePage = Math.min(currentPage, totalPages);
  const paginatedRecords = useMemo(() => {
    const s = (activePage - 1) * rowsPerPage;
    return processedRecords.slice(s, s + rowsPerPage);
  }, [processedRecords, activePage, rowsPerPage]);

  const handleExportExcel = useCallback(() => {
    const exportData = processedRecords.map((rec) => {
      const obj: Record<string, string> = {};
      for (const col of BG_COLUMNS) {
        if (col.accessor === "action") continue;
        obj[col.header] = String((rec as any)[col.accessor as keyof EmdDetailsBgRecord] ?? "");
      }
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "EMD BG");
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `EMD_BG_${date}.xlsx`);
  }, [processedRecords]);

  const handleExportCSV = useCallback(() => {
    const exportCols = BG_COLUMNS.filter((c) => c.accessor !== "action");
    const headers = exportCols.map((c) => c.header).join(",");
    const rows = processedRecords.map((rec) =>
      exportCols.map((col) => {
        let v = String((rec as any)[col.accessor as keyof EmdDetailsBgRecord] ?? "");
        if (v.includes(",") || v.includes('"') || v.includes("\n")) v = `"${v.replace(/"/g, '""')}"`;
        return v;
      }).join(",")
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EMD_BG_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [processedRecords]);

  if (loading) {
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", minHeight: "500px", color: "#0a2540", fontWeight: 700, flexDirection: "column", gap: "15px" }}>
        <div style={{ width: "40px", height: "40px", border: "4px solid #e1e6eb", borderTopColor: "#1a73e8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}></div>
        <span style={{ fontSize: "16px", letterSpacing: "0.5px" }}>Loading EMD Details BG...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "400px", gap: "12px" }}>
        <p style={{ color: "#c5221f", fontWeight: 600 }}>Failed to load EMD Details BG: {error.message}</p>
        <button onClick={refresh} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#0a2540", color: "white", borderRadius: "6px", fontWeight: 600 }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="supply-layout-container" style={{ height: "calc(100vh - 42px)" }}>
      <aside className="supply-sidebar">
        <div className="supply-sidebar-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>EMD BG</span>
          <span style={{ fontSize: "10px", background: "rgba(255,255,255,0.12)", padding: "2px 6px", borderRadius: "10px" }}>{data.length} rows</span>
        </div>
        <div className="supply-sidebar-body">
          <EmdBgSidebar stats={sidebarStats} selected={selectedStatus} onSelect={setSelectedStatus} totalRows={data.length} />
        </div>
        <div className="supply-sidebar-footer">
          <button className="supply-refresh-sidebar-btn" onClick={refresh}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="supply-refresh-sidebar-btn" onClick={() => { setSelectedStatus("ALL"); setGlobalSearch(""); setColumnSearchText({}); setReasonFilter(""); setCurrentPage(1); }} style={{ marginTop: "8px" }}>
            <Eraser size={14} /> Clear Filter
          </button>
        </div>
      </aside>

      <div className="supply-workspace">
        <header className="supply-top-header">
          <div className="supply-header-brand">
            <h1 className="supply-header-title">EMD DETAILS <span>BG</span></h1>
            <div className="supply-header-divider" />
            <span className="supply-header-subtitle">{selectedStatus === "ALL" ? "All Statuses" : selectedStatus} — {processedRecords.length} of {data.length} records</span>
          </div>
          <div className="supply-header-actions">
            <span className="supply-record-badge" style={{ display: selectedStatus === "ALL" ? "none" : "inline-block" }}>{selectedStatus}</span>
          </div>
        </header>

        <main className="supply-body" style={{ padding: "12px", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {/* TenderTable-style container */}
            <div className="tender-table-container" style={{ flex: 1, minHeight: 0 }}>
              <div className="tender-table-toolbar">
                <div className="toolbar-left">
                  <h2 className="table-title">EMD DETAILS — BG {selectedStatus !== "ALL" ? `(${selectedStatus})` : ""}</h2>
                  <span className="record-count-badge">{totalRecords} Records</span>
                  <div className="global-search-container">
                    <span className="search-icon" style={{ display: "inline-flex", alignItems: "center" }}><Search size={14} /></span>
                    <input type="text" className="global-search-input" placeholder="Search..." value={globalSearch} onChange={(e) => { setGlobalSearch(e.target.value); setCurrentPage(1); }} />
                  </div>
                </div>
                <div className="toolbar-right">
                  {sortColumn && (
                    <button className="export-btn" onClick={() => { setSortColumn(null); setSortDirection("desc"); }}>
                      <RotateCcw size={14} /> Clear Sort
                    </button>
                  )}
                  <button className="export-btn" onClick={handleExportCSV} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <Download size={14} /> Export CSV
                  </button>
                  <button className="export-btn" onClick={handleExportExcel} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <FileSpreadsheet size={14} /> Export Excel
                  </button>
                </div>
              </div>

              <div className="tender-table-wrapper" ref={scrollContainerRef}>
                <table className="tender-data-table">
                  <thead>
                    <tr>
                      {BG_COLUMNS.map((col) => (
                        <th
                          key={String(col.accessor)}
                          className={col.sticky ? "sticky-col" : undefined}
                          style={{
                            width: `${columnWidths[String(col.accessor)]}px`,
                            minWidth: `${columnWidths[String(col.accessor)]}px`,
                            ...(col.sticky ? { left: stickyLeftOffsets[String(col.accessor)], zIndex: 3 } : {}),
                          }}
                        >
                          <div className="header-content" onClick={() => handleSort(col.accessor as any)} style={{ cursor: col.sortable ? "pointer" : "default" }}>
                            <span>{col.header}</span>
                            {sortColumn === col.accessor && (
                              <span className="sort-indicator" style={{ display: "inline-flex", alignItems: "center" }}>
                                {sortDirection === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </span>
                            )}
                          </div>
                          {col.accessor === "reason" ? (
                            <select
                              className="column-search-input"
                              value={reasonFilter}
                              onChange={(e) => { setReasonFilter(e.target.value); setCurrentPage(1); }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="">All Reasons</option>
                              {TENDER_REASON_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                              <option value="__blank__">Blank</option>
                            </select>
                          ) : col.accessor === "action" ? null : (
                            <input
                              type="text"
                              className="column-search-input"
                              placeholder={`Search ${col.header}...`}
                              value={columnSearchText[String(col.accessor)] ?? ""}
                              onChange={(e) => { setColumnSearchText((prev) => ({ ...prev, [String(col.accessor)]: e.target.value })); setCurrentPage(1); }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          <div className="column-resizer" onMouseDown={(e) => handleResizeStart(e, String(col.accessor), columnWidths[String(col.accessor)])} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecords.length === 0 ? (
                      <tr>
                        <td colSpan={BG_COLUMNS.length} style={{ textAlign: "center", padding: "40px", color: "rgba(0,0,0,0.4)" }}>
                          No matching records found.
                        </td>
                      </tr>
                    ) : (
                      paginatedRecords.map((row) => (
                        <tr key={String(row.id)} className="tender-row">
                          {BG_COLUMNS.map((col) => {
                            if (col.accessor === "action") {
                              const isSending = sendingId === row.id;
                              const hasReason = !!row.reason;
                              return (
                                <td key={String(col.accessor)} className="col-center" style={{ background: "#fff" }}>
                                  <button
                                    onClick={() => handleSendEmail(row)}
                                    disabled={!hasReason || isSending}
                                    title={!hasReason ? "Select Tender Conclusion Reason first" : "Send email"}
                                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", background: hasReason ? "#0a2540" : "#cbd5e1", color: "white", borderRadius: "6px", fontWeight: 600, fontSize: "12px", border: "none", cursor: hasReason ? "pointer" : "not-allowed", opacity: isSending ? 0.7 : 1 }}
                                  >
                                    {isSending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} {isSending ? "Sending..." : "Send Email"}
                                  </button>
                                </td>
                              );
                            }
                            if (col.accessor === "reason") {
                              const isUpdating = updatingId === row.id;
                              return (
                                <td key={String(col.accessor)} className={`${col.sticky ? "sticky-col" : ""}`} style={col.sticky ? { left: stickyLeftOffsets[String(col.accessor)], background: "#fff" } : {}}>
                                  <select
                                    value={row.reason ?? ""}
                                    onChange={(e) => handleReasonChange(row.id, e.target.value)}
                                    disabled={isUpdating}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #dadce0", fontSize: "12px", background: isUpdating ? "#f1f3f4" : "white" }}
                                  >
                                    <option value="">Select reason...</option>
                                    {TENDER_REASON_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                </td>
                              );
                            }
                            const raw = (row as any)[col.accessor as keyof EmdDetailsBgRecord];
                            const display = raw == null || String(raw).trim() === "" ? "-" : String(raw);
                            const alignClass = col.align === "right" ? "col-currency" : col.align === "center" ? "col-center" : "";
                            return (
                              <td
                                key={String(col.accessor)}
                                className={`${alignClass} ${col.sticky ? "sticky-col" : ""}`}
                                style={col.sticky ? { left: stickyLeftOffsets[String(col.accessor)], background: "#fff" } : {}}
                                title={display}
                              >
                                <div className="cell-scroll-wrap" style={{ height: "auto", maxHeight: "96px" }}>
                                  {col.accessor === "status" ? (
                                    <span className={`status-badge ${String(raw ?? "").toLowerCase().includes("active") ? "won" : String(raw ?? "").toLowerCase().includes("expired") ? "lost" : String(raw ?? "").toLowerCase().includes("claim") ? "loi" : "submitted"}`}>
                                      {display}
                                    </span>
                                  ) : display === "-" ? (
                                    <span style={{ color: "#b0b8c1" }}>{display}</span>
                                  ) : (
                                    display
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="tender-table-footer">
                <div className="footer-left">
                  <span>Rows per page:</span>
                  <select className="rows-per-page-select" value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
                <div className="footer-center">
                  {totalRecords === 0 ? "No records" : `${(activePage - 1) * rowsPerPage + 1}–${Math.min(activePage * rowsPerPage, totalRecords)} of ${totalRecords}`}
                </div>
                <div className="footer-right">
                  <button className="page-btn" disabled={activePage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>Prev</button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) pageNum = i + 1;
                    else if (activePage <= 4) pageNum = i + 1;
                    else if (activePage >= totalPages - 3) pageNum = totalPages - 6 + i;
                    else pageNum = activePage - 3 + i;
                    return (
                      <button key={pageNum} className={`page-btn ${activePage === pageNum ? "active" : ""}`} onClick={() => setCurrentPage(pageNum)}>
                        {pageNum}
                      </button>
                    );
                  })}
                  <button className="page-btn" disabled={activePage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>Next</button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
      <EmdBgEmailDialog open={dialogOpen} onOpenChange={setDialogOpen} row={dialogRow} onConfirm={handleDialogConfirm} />
    </div>
  );
}
