"use client";

import React, { useMemo, useState, useCallback } from "react";
import { useEmdDetailsCash, EmdDetailsCashRecord } from "@/hooks/useEmdDetailsCash";
import {
  OptimizedTenderTable,
  ColumnDef,
} from "@/components/tender-viewer/optimized-tender-table/OptimizedTenderTable";
import { EmdCashSidebar, EmdStatus, EmdStats } from "@/components/emd-cash/EmdCashSidebar";
import { RefreshCw, Eraser, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TENDER_REASON_OPTIONS } from "@/lib/emdReasonOptions";
import "@/app/SupplyHistory.css";

function normalizeStatus(v: string | null | undefined): EmdStatus | null {
  if (!v) return null;
  const u = v.trim().toUpperCase();
  if (u === "REFUNDED") return "REFUNDED";
  if (u === "PENDING") return "PENDING";
  if (u === "WRITTEN OFF" || u === "WRITTENOFF" || u === "WRITTEN-OFF") return "WRITTEN OFF";
  return null;
}

function parseEmdAmt(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/[₹,\s]/g, ""));
  return isNaN(n) ? 0 : n;
}

export default function EmdDetailsCashPage() {
  const { data, loading, error, refresh } = useEmdDetailsCash();
  const [selectedStatus, setSelectedStatus] = useState<EmdStatus | "ALL">("ALL");
  const [localReasonMap, setLocalReasonMap] = useState<Record<string, string | null>>({});
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);

  const mergedData = useMemo(() => {
    if (Object.keys(localReasonMap).length === 0) return data;
    return data.map((r) => (localReasonMap[String(r.id)] !== undefined ? { ...r, reason: localReasonMap[String(r.id)] } : r));
  }, [data, localReasonMap]);

  const sidebarStats: Record<EmdStatus, EmdStats> = useMemo(() => {
    const init = (): EmdStats => ({ count: 0, totalEmd: 0, customerCount: 0 });
    const map: Record<EmdStatus, EmdStats> = {
      REFUNDED: init(),
      PENDING: init(),
      "WRITTEN OFF": init(),
    };
    const customerSets: Record<EmdStatus, Set<string>> = {
      REFUNDED: new Set(),
      PENDING: new Set(),
      "WRITTEN OFF": new Set(),
    } as any;
    for (const r of mergedData) {
      const k = normalizeStatus(r.statusRefundedPending);
      if (!k) continue;
      map[k].count += 1;
      map[k].totalEmd += parseEmdAmt(r.emdAmt);
      if (r.customerName) customerSets[k].add(r.customerName.trim().toLowerCase());
    }
    for (const k of Object.keys(map) as EmdStatus[]) {
      map[k].customerCount = customerSets[k].size;
    }
    return map;
  }, [mergedData]);

  const filteredData = useMemo(() => {
    if (selectedStatus === "ALL") return mergedData;
    return mergedData.filter((r) => normalizeStatus(r.statusRefundedPending) === selectedStatus);
  }, [mergedData, selectedStatus]);

  const handleReasonChange = useCallback(async (id: number, newReason: string) => {
    const prev = (mergedData.find((r) => r.id === id)?.reason ?? null) as string | null;
    setLocalReasonMap((prevMap) => ({ ...prevMap, [String(id)]: newReason || null }));
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/emd-details-cash/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: newReason || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to update reason");
      toast.success("Reason updated");
    } catch (e: any) {
      setLocalReasonMap((prevMap) => ({ ...prevMap, [String(id)]: prev }));
      toast.error(e.message || "Failed to update reason");
    } finally {
      setUpdatingId(null);
    }
  }, [mergedData]);

  const handleSendEmail = useCallback(async (row: EmdDetailsCashRecord) => {
    if (!row.reason) {
      toast.error("Please select Tender Conclusion Reason before sending email");
      return;
    }
    toast.info("Work in progress — EMD Cash email sending will be available soon");
  }, []);

  const columns: ColumnDef<Record<string, unknown>>[] = useMemo(
    () => [
      {
        header: "Customer Name",
        accessor: "customerName",
        defaultWidth: 220,
        filter: { type: "select", placeholder: "Filter customer" },
        sortable: true,
        searchable: true,
      },
      {
        header: "Issue DT",
        accessor: "issueDt",
        type: "date",
        defaultWidth: 140,
        filter: { type: "dateRange" },
        sortable: true,
        sortValue: (v) => (v ? new Date(String(v)).getTime() : 0),
      },
      {
        header: "EMD Amt",
        accessor: "emdAmt",
        defaultWidth: 130,
        align: "right",
        filter: { type: "text", placeholder: "Search amount" },
        sortable: true,
        sortValue: (v) => {
          const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
          return isNaN(n) ? 0 : n;
        },
      },
      {
        header: "Permanent (Y/N)",
        accessor: "permanent",
        defaultWidth: 130,
        align: "center",
        filter: {
          type: "select",
          options: [
            { value: "Y", label: "Y" },
            { value: "N", label: "N" },
            { value: "__blank__", label: "Blank" },
          ],
        },
      },
      {
        header: "Tender No",
        accessor: "tenderNo",
        defaultWidth: 190,
        frozen: true,
        filter: { type: "text", placeholder: "Search tender no" },
        sortable: true,
      },
      {
        header: "CH/DD No",
        accessor: "chDdNo",
        defaultWidth: 150,
        filter: { type: "text", placeholder: "Search CH/DD" },
        sortable: true,
      },
      {
        header: "A/C Holder",
        accessor: "acHolder",
        defaultWidth: 160,
        filter: { type: "select", placeholder: "Filter holder" },
        sortable: true,
      },
      {
        header: "Status As Per Sujib Da & Other",
        accessor: "statusAsPerSujibDaAndOther",
        defaultWidth: 220,
        filter: { type: "select", placeholder: "Filter status" },
      },
      {
        header: "Can Be Refunded (Y/N)",
        accessor: "canBeRefunded",
        defaultWidth: 150,
        align: "center",
        filter: {
          type: "select",
          options: [
            { value: "Y", label: "Y" },
            { value: "N", label: "N" },
            { value: "__blank__", label: "Blank" },
          ],
        },
      },
      {
        header: "TM No.",
        accessor: "tmNo",
        defaultWidth: 120,
        filter: { type: "text", placeholder: "Search TM" },
      },
      {
        header: "Rank",
        accessor: "rank",
        defaultWidth: 90,
        align: "center",
        filter: { type: "select", placeholder: "Filter rank" },
      },
      {
        header: "PO Issue Status",
        accessor: "poIssueStatus",
        defaultWidth: 150,
        filter: { type: "select", placeholder: "Filter PO status" },
      },
      {
        header: "AOC - Award of Contract Status",
        accessor: "aocAwardOfContractStatus",
        defaultWidth: 200,
        filter: { type: "select", placeholder: "Filter AOC" },
      },
      {
        header: "Refundable / Not",
        accessor: "refundableOrNot",
        defaultWidth: 140,
        filter: {
          type: "select",
          options: [
            { value: "REFUNDABLE", label: "Refundable" },
            { value: "NOT REFUNDABLE", label: "Not Refundable" },
            { value: "__blank__", label: "Blank" },
          ],
        },
      },
      {
        header: "Refunded / Pending",
        accessor: "statusRefundedPending",
        defaultWidth: 150,
        filter: {
          type: "select",
          options: [
            { value: "REFUNDED", label: "Refunded" },
            { value: "PENDING", label: "Pending" },
            { value: "WRITTEN OFF", label: "Written Off" },
            { value: "__blank__", label: "Blank" },
          ],
        },
      },
      {
        header: "Expected Refund / Refunded Date",
        accessor: "expectedRefundDateOrRefundedDate",
        type: "date",
        defaultWidth: 170,
        filter: { type: "dateRange" },
        sortable: true,
        sortValue: (v) => (v ? new Date(String(v)).getTime() : 0),
      },
      {
        header: "Status of Tender",
        accessor: "statusOfTender",
        defaultWidth: 160,
        filter: { type: "select", placeholder: "Filter tender status" },
      },
      {
        header: "Conditions for Refund",
        accessor: "conditionsForRefund",
        defaultWidth: 220,
        filter: { type: "text", placeholder: "Search conditions" },
      },
      {
        header: "Remarks",
        accessor: "remarks",
        defaultWidth: 220,
        filter: { type: "text", placeholder: "Search remarks" },
      },
      {
        header: "Certificate By Party",
        accessor: "certificateByParty",
        defaultWidth: 200,
        filter: { type: "select", placeholder: "Filter certificate", searchable: true },
        sortable: true,
        searchable: true,
      },
      {
        header: "Certificate By Utility",
        accessor: "certificateByUtility",
        defaultWidth: 200,
        filter: { type: "select", placeholder: "Filter certificate", searchable: true },
        sortable: true,
        searchable: true,
      },
      {
        header: "Email Draft",
        accessor: "emailDraft",
        defaultWidth: 320,
        filter: { type: "text", placeholder: "Search draft" },
        searchable: true,
        sortable: false,
      },
      {
        header: "Last Email Sent At",
        accessor: "lastEmailSentAt",
        type: "date",
        defaultWidth: 170,
        filter: { type: "dateRange" },
        sortable: true,
        sortValue: (v) => (v ? new Date(String(v)).getTime() : 0),
      },
      {
        header: "Tender Conclusion Reason",
        accessor: "reason",
        defaultWidth: 280,
        filter: {
          type: "select",
          placeholder: "Filter reason",
          options: [...TENDER_REASON_OPTIONS.map((v) => ({ value: v, label: v })), { value: "__blank__", label: "Blank" }],
        },
        sortable: true,
        searchable: true,
        renderCell: (value, row) => {
          const r = row as unknown as EmdDetailsCashRecord;
          const isUpdating = updatingId === r.id;
          return (
            <select
              value={(r.reason as string) ?? ""}
              onChange={(e) => handleReasonChange(r.id, e.target.value)}
              disabled={isUpdating}
              onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #dadce0", fontSize: "12px", background: isUpdating ? "#f1f3f4" : "white" }}
            >
              <option value="">Select reason...</option>
              {TENDER_REASON_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          );
        },
      },
      {
        header: "Action",
        accessor: "action",
        defaultWidth: 140,
        align: "center",
        sortable: false,
        searchable: false,
        renderCell: (_value, row) => {
          const r = row as unknown as EmdDetailsCashRecord;
          const isSending = sendingId === r.id;
          const hasReason = !!r.reason;
          return (
            <button
              onClick={(e) => { e.stopPropagation(); handleSendEmail(r); }}
              disabled={!hasReason || isSending}
              title={!hasReason ? "Select Tender Conclusion Reason first" : "Send email"}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", background: hasReason ? "#0a2540" : "#cbd5e1", color: "white", borderRadius: "6px", fontWeight: 600, fontSize: "12px", border: "none", cursor: hasReason ? "pointer" : "not-allowed", opacity: isSending ? 0.7 : 1 }}
            >
              {isSending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} {isSending ? "Sending..." : "Send Email"}
            </button>
          );
        },
      },
    ],
    [updatingId, sendingId, handleReasonChange, handleSendEmail]
  );

  if (loading) {
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", minHeight: "500px", color: "#0a2540", fontWeight: 700, flexDirection: "column", gap: "15px" }}>
        <div style={{ width: "40px", height: "40px", border: "4px solid #e1e6eb", borderTopColor: "#1a73e8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}></div>
        <span style={{ fontSize: "16px", letterSpacing: "0.5px" }}>Loading EMD Details Cash...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "400px", gap: "12px" }}>
        <p style={{ color: "#c5221f", fontWeight: 600 }}>Failed to load EMD Details Cash: {error.message}</p>
        <button
          onClick={refresh}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#0a2540", color: "white", borderRadius: "6px", fontWeight: 600 }}
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="supply-layout-container" style={{ height: "calc(100vh - 42px)" }}>
      <aside className="supply-sidebar">
        <div className="supply-sidebar-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>EMD Cash</span>
          <span style={{ fontSize: "10px", background: "rgba(255,255,255,0.12)", padding: "2px 6px", borderRadius: "10px" }}>{data.length} rows</span>
        </div>
        <div className="supply-sidebar-body">
          <EmdCashSidebar stats={sidebarStats} selected={selectedStatus} onSelect={setSelectedStatus} totalRows={data.length} />
        </div>
        <div className="supply-sidebar-footer">
          <button className="supply-refresh-sidebar-btn" onClick={refresh}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="supply-refresh-sidebar-btn" onClick={() => setSelectedStatus("ALL")} style={{ marginTop: "8px" }}>
            <Eraser size={14} /> Clear Filter
          </button>
          <button
            className="supply-refresh-sidebar-btn"
            onClick={() => window.open("https://docs.google.com/spreadsheets/d/1GTwzxMgViohbCimXqfiBZBJsKbCSr7hCgbcHF_En1VE", "_blank", "noopener,noreferrer")}
            style={{ marginTop: "8px" }}
          >
            Open Sheet
          </button>
        </div>
      </aside>

      <div className="supply-workspace">
        <header className="supply-top-header">
          <div className="supply-header-brand">
            <h1 className="supply-header-title">EMD DETAILS <span>CASH</span></h1>
            <div className="supply-header-divider" />
            <span className="supply-header-subtitle">{selectedStatus === "ALL" ? "All Statuses" : selectedStatus} — {filteredData.length} of {data.length} records</span>
          </div>
          <div className="supply-header-actions">
            <span className="supply-record-badge" style={{ display: selectedStatus === "ALL" ? "none" : "inline-block" }}>{selectedStatus}</span>
          </div>
        </header>
        <main className="supply-body" style={{ padding: "12px", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <OptimizedTenderTable
              columns={columns}
              rows={filteredData as unknown as Record<string, unknown>[]}
              title={`EMD Details - Cash${selectedStatus !== "ALL" ? ` (${selectedStatus})` : ""}`}
              rowKey="id"
              disableDefaultDeadlineFilter
            />
          </div>
        </main>
      </div>
    </div>
  );
}
