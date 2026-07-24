"use client";
import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useSupplyHistory } from "@/hooks/useSupplyHistory";
import { SupplyHistoryRecord } from "@/types/supplyHistory";
import { SupplyAttachmentModal } from "@/components/SupplyAttachmentModal";
import { Package, RefreshCw, Eraser, ExternalLink, FileSpreadsheet, AlertTriangle, Search, ChevronUp, ChevronDown, ArrowUpDown, X, Inbox, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import "@/app/SupplyHistory.css";

type SortField = keyof SupplyHistoryRecord;
type SortDir = "asc" | "desc";

interface ColDef {
  key: SortField;
  label: string;
  width: number;
  align: "left" | "center" | "right";
}

const COLUMNS: ColDef[] = [
  { key: "fy",              label: "FY",                width: 80,  align: "center" },
  { key: "saleBillNumber",  label: "Sale Bill No",      width: 140, align: "left"   },
  { key: "saleBillDate",    label: "Sale Bill Date",    width: 150, align: "center" },
  { key: "partyName",       label: "Party Name",        width: 200, align: "left"   },
  { key: "itemCode",        label: "Item Code",         width: 120, align: "left"   },
  { key: "itemName",        label: "Item Name",         width: 220, align: "left"   },
  { key: "lrNo",            label: "LR No",             width: 140, align: "left"   },
  { key: "partyRefNo",      label: "Party Ref No",      width: 140, align: "left"   },
  { key: "partyRefDate",    label: "Party Ref Date",    width: 150, align: "center" },
  { key: "contractVrNo",    label: "Contract VR No",    width: 140, align: "left"   },
  { key: "rate",            label: "Rate",              width: 110, align: "right"  },
  { key: "invoiceQty",      label: "Invoice Qty",       width: 110, align: "right"  },
  { key: "invoiceAmt",      label: "Invoice Amt",       width: 130, align: "right"  },
  { key: "hasDocuments",    label: "Documents",         width: 140, align: "center" },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

function cmp(
  a: string | number | boolean | null | undefined,
  b: string | number | boolean | null | undefined,
  dir: SortDir
): number {
  const va = a ?? "";
  const vb = b ?? "";
  if (va < vb) return dir === "asc" ? -1 : 1;
  if (va > vb) return dir === "asc" ? 1 : -1;
  return 0;
}

function formatDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function formatNumber(val: number | null): string {
  if (val === null || val === undefined) return "";
  return val.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export const SupplyHistoryDashboard: React.FC = () => {
  const { data, loading, error, refresh } = useSupplyHistory();

  const [search, setSearch]       = useState("");
  const [sortField, setSortField] = useState<SortField>("saleBillDate");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(50);

  const [colSearches, setColSearches] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    COLUMNS.forEach(c => { map[c.key] = ""; });
    return map;
  });

  const [saleBillDateStart, setSaleBillDateStart] = useState("");
  const [saleBillDateEnd, setSaleBillDateEnd] = useState("");
  const [partyRefDateStart, setPartyRefDateStart] = useState("");
  const [partyRefDateEnd, setPartyRefDateEnd] = useState("");
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [selectedParties, setSelectedParties] = useState<string[]>([]);
  const partyDropdownRef = useRef<HTMLDivElement>(null);

  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const itemDropdownRef = useRef<HTMLDivElement>(null);

  const [showPartyRefDropdown, setShowPartyRefDropdown] = useState(false);
  const [selectedPartyRefs, setSelectedPartyRefs] = useState<string[]>([]);
  const partyRefDropdownRef = useRef<HTMLDivElement>(null);

  const [showContractDropdown, setShowContractDropdown] = useState(false);
  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);
  const contractDropdownRef = useRef<HTMLDivElement>(null);

  const [rateMin, setRateMin] = useState("");
  const [rateMax, setRateMax] = useState("");
  const [qtyMin, setQtyMin] = useState("");
  const [qtyMax, setQtyMax] = useState("");
  const [amtMin, setAmtMin] = useState("");
  const [amtMax, setAmtMax] = useState("");
  const [selectedBillNo, setSelectedBillNo] = useState<string | null>(null);
  const [selectedAttachmentUrl, setSelectedAttachmentUrl] = useState<string | null>(null);
  const [indexing, setIndexing] = useState(false);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    COLUMNS.forEach(c => { initial[c.key] = c.width; });
    return initial;
  });

  const resizingColumnRef = useRef<string | null>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  const handleResizeStart = (e: React.MouseEvent, accessor: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColumnRef.current = accessor;
    startXRef.current = e.clientX;
    startWidthRef.current = currentWidth;
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "col-resize";
  };

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingColumnRef.current) return;
    const diff = e.clientX - startXRef.current;
    const newWidth = Math.max(50, startWidthRef.current + diff);
    setColumnWidths(prev => ({ ...prev, [resizingColumnRef.current!]: newWidth }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "";
    resizingColumnRef.current = null;
  }, [handleResizeMove]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (partyDropdownRef.current && !partyDropdownRef.current.contains(event.target as Node)) {
        setShowPartyDropdown(false);
      }
      if (itemDropdownRef.current && !itemDropdownRef.current.contains(event.target as Node)) {
        setShowItemDropdown(false);
      }
      if (partyRefDropdownRef.current && !partyRefDropdownRef.current.contains(event.target as Node)) {
        setShowPartyRefDropdown(false);
      }
      if (contractDropdownRef.current && !contractDropdownRef.current.contains(event.target as Node)) {
        setShowContractDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [handleResizeMove, handleResizeEnd]);

  const handleColSearchChange = (key: string, val: string) => {
    setColSearches(prev => ({ ...prev, [key]: val }));
    setPage(1);
  };

  const handleClearAllFilters = () => {
    setSearch("");
    setSaleBillDateStart("");
    setSaleBillDateEnd("");
    setPartyRefDateStart("");
    setPartyRefDateEnd("");
    setRateMin("");
    setRateMax("");
    setQtyMin("");
    setQtyMax("");
    setAmtMin("");
    setAmtMax("");
    setSelectedParties([]);
    setShowPartyDropdown(false);
    setSelectedItems([]);
    setShowItemDropdown(false);
    setSelectedPartyRefs([]);
    setShowPartyRefDropdown(false);
    setSelectedContracts([]);
    setShowContractDropdown(false);
    const cleared: Record<string, string> = {};
    COLUMNS.forEach(c => { cleared[c.key] = ""; });
    setColSearches(cleared);
    setPage(1);
  };

  const filtered = useMemo<SupplyHistoryRecord[]>(() => {
    let rows = data;

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(row =>
        COLUMNS.some(col => {
          const v = row[col.key];
          return v !== null && v !== undefined && String(v).toLowerCase().includes(q);
        })
      );
    }

    Object.entries(colSearches).forEach(([key, val]) => {
      const sVal = val.trim().toLowerCase();
      if (sVal) {
        rows = rows.filter(row => {
          const v = row[key as keyof SupplyHistoryRecord];
          return v !== null && v !== undefined && String(v).toLowerCase().includes(sVal);
        });
      }
    });

    if (selectedParties.length > 0) {
      rows = rows.filter(row => row.partyName && selectedParties.includes(row.partyName.trim()));
    }

    if (selectedItems.length > 0) {
      rows = rows.filter(row => row.itemName && selectedItems.includes(row.itemName.trim()));
    }

    if (selectedPartyRefs.length > 0) {
      rows = rows.filter(row => row.partyRefNo && selectedPartyRefs.includes(row.partyRefNo.trim()));
    }

    if (selectedContracts.length > 0) {
      rows = rows.filter(row => row.contractVrNo && selectedContracts.includes(row.contractVrNo.trim()));
    }

    if (saleBillDateStart) {
      const start = new Date(saleBillDateStart);
      rows = rows.filter(row => {
        if (!row.saleBillDate) return false;
        return new Date(row.saleBillDate) >= start;
      });
    }
    if (saleBillDateEnd) {
      const end = new Date(saleBillDateEnd);
      end.setHours(23, 59, 59, 999);
      rows = rows.filter(row => {
        if (!row.saleBillDate) return false;
        return new Date(row.saleBillDate) <= end;
      });
    }

    if (partyRefDateStart) {
      const start = new Date(partyRefDateStart);
      rows = rows.filter(row => {
        if (!row.partyRefDate) return false;
        return new Date(row.partyRefDate) >= start;
      });
    }
    if (partyRefDateEnd) {
      const end = new Date(partyRefDateEnd);
      end.setHours(23, 59, 59, 999);
      rows = rows.filter(row => {
        if (!row.partyRefDate) return false;
        return new Date(row.partyRefDate) <= end;
      });
    }

    const rateLo = rateMin.trim() !== "" ? parseFloat(rateMin) : Number.NEGATIVE_INFINITY;
    const rateHi = rateMax.trim() !== "" ? parseFloat(rateMax) : Number.POSITIVE_INFINITY;
    if (isFinite(rateLo) || isFinite(rateHi)) {
      rows = rows.filter(row => row.rate !== null && row.rate !== undefined && row.rate >= rateLo && row.rate <= rateHi);
    }

    const qtyLo = qtyMin.trim() !== "" ? parseFloat(qtyMin) : Number.NEGATIVE_INFINITY;
    const qtyHi = qtyMax.trim() !== "" ? parseFloat(qtyMax) : Number.POSITIVE_INFINITY;
    if (isFinite(qtyLo) || isFinite(qtyHi)) {
      rows = rows.filter(row => row.invoiceQty !== null && row.invoiceQty !== undefined && row.invoiceQty >= qtyLo && row.invoiceQty <= qtyHi);
    }

    const amtLo = amtMin.trim() !== "" ? parseFloat(amtMin) : Number.NEGATIVE_INFINITY;
    const amtHi = amtMax.trim() !== "" ? parseFloat(amtMax) : Number.POSITIVE_INFINITY;
    if (isFinite(amtLo) || isFinite(amtHi)) {
      rows = rows.filter(row => row.invoiceAmt !== null && row.invoiceAmt !== undefined && row.invoiceAmt >= amtLo && row.invoiceAmt <= amtHi);
    }

    return rows;
  }, [
    data, search, colSearches,
    saleBillDateStart, saleBillDateEnd,
    partyRefDateStart, partyRefDateEnd,
    rateMin, rateMax, qtyMin, qtyMax, amtMin, amtMax,
    selectedParties,
    selectedItems,
    selectedPartyRefs,
    selectedContracts,
  ]);

  const partyNamesList = useMemo(() => {
    const set = new Set<string>();
    filtered.forEach(r => { if (r.partyName) set.add(r.partyName.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [filtered]);

  const itemNamesList = useMemo(() => {
    const set = new Set<string>();
    filtered.forEach(r => { if (r.itemName) set.add(r.itemName.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [filtered]);

  const partyRefsList = useMemo(() => {
    const set = new Set<string>();
    filtered.forEach(r => { if (r.partyRefNo) set.add(r.partyRefNo.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [filtered]);

  const contractsList = useMemo(() => {
    const set = new Set<string>();
    filtered.forEach(r => { if (r.contractVrNo) set.add(r.contractVrNo.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [filtered]);

  const sorted = useMemo<SupplyHistoryRecord[]>(() => {
    return [...filtered].sort((a, b) => cmp(a[sortField], b[sortField], sortDir));
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageStart  = (page - 1) * pageSize;
  const paginated  = sorted.slice(pageStart, pageStart + pageSize);

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
    setPage(1);
  };

  const handleRefresh = async () => { setPage(1); await refresh(); };

  const handleScanDocuments = async () => {
    setIndexing(true);
    try {
      const res = await fetch("/api/supply-indexer", { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      await refresh();
      toast.success("Documents scanned successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
      console.error("Index scan failed:", err);
    } finally {
      setIndexing(false);
    }
  };

  const handleExportExcel = () => {
    const tableHeader = COLUMNS.map(c => `<th style="background-color:#0a2540;color:#ffffff;font-weight:bold;padding:8px;border:1px solid #ddd;">${c.label}</th>`).join("");
    const tableRows = sorted.map(rec => {
      const cells = COLUMNS.map(col => {
        const val = rec[col.key];
        if (val === null || val === undefined) return "<td style='border:1px solid #ddd;padding:8px;'></td>";
        return `<td style='border:1px solid #ddd;padding:8px;'>${String(val)}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-type" content="text/html;charset=utf-8" />
        <!--[if gte o4 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Supply History</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
      </head>
      <body>
        <table border="1" style="border-collapse:collapse;">
          <thead><tr>${tableHeader}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([excelHtml], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Supply_History_Data_${new Date().toISOString().split('T')[0]}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const pageNumbers = (): (number | "...")[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const ps: (number | "...")[] = [1];
    if (page > 3) ps.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) ps.push(i);
    if (page < totalPages - 2) ps.push("...");
    ps.push(totalPages);
    return ps;
  };

  const totalRecords  = filtered.length;
  const totalAmt      = filtered.reduce((sum, r) => sum + (r.invoiceAmt || 0), 0);
  const totalQty      = filtered.reduce((sum, r) => sum + (r.invoiceQty || 0), 0);
  const withBillNo    = filtered.filter(r => r.saleBillNumber).length;

  return (
    <div className="supply-layout-container">
      <aside className="supply-sidebar">
        <div className="supply-sidebar-header" style={{ display: "flex", alignItems: "center", gap: "8px" }}><Package size={18} /> Supply History</div>
        <div className="supply-sidebar-body">
          <div className="supply-stat-card">
            <div className="supply-stat-label">Total Records</div>
            <div className="supply-stat-value">{totalRecords.toLocaleString()}</div>
            <div className="supply-stat-sub">from Google Sheet</div>
          </div>
          <div className="supply-stat-card">
            <div className="supply-stat-label">Total Invoice Amt</div>
            <div className="supply-stat-value" style={{ color: "#38ef7d" }}>
              ₹{totalAmt.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="supply-stat-card">
            <div className="supply-stat-label">Total Invoice Qty</div>
            <div className="supply-stat-value" style={{ color: "#69b2ff" }}>
              {totalQty.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="supply-stat-card">
            <div className="supply-stat-label">With Bill No</div>
            <div className="supply-stat-value" style={{ color: "#ff6b6b" }}>
              {withBillNo.toLocaleString()}
            </div>
          </div>

          <div className="supply-filter-section">
            <div className="supply-filter-label">Search</div>
            <input
              className="supply-filter-input"
              type="text"
              placeholder="Search all columns..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <div className="supply-sidebar-footer">
          <button
            className="supply-refresh-sidebar-btn"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? <><RefreshCw size={14} /> Loading...</> : <><RefreshCw size={14} /> Refresh Data</>}
          </button>
          <button
            className="supply-refresh-sidebar-btn"
            onClick={handleScanDocuments}
            disabled={indexing}
            style={{ marginTop: "8px" }}
          >
            {indexing ? <><RefreshCw size={14} /> Scanning...</> : <><FolderOpen size={14} /> Scan Documents</>}
          </button>
        </div>
      </aside>

      <div className="supply-workspace">
        <header className="supply-top-header">
          <div className="supply-header-brand">
            <h1 className="supply-header-title">LASERPOWER <span>SUPPLY</span></h1>
            <div className="supply-header-divider" />
            <span className="supply-header-subtitle">Supply History Dashboard</span>
          </div>
          <div className="supply-header-actions">
            <button className="clear-filters-btn" onClick={handleClearAllFilters} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Eraser size={14} /> Clear Filters
            </button>
            <button className="export-excel-btn" onClick={handleExportExcel} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <FileSpreadsheet size={14} /> Export Excel
            </button>
            <button
              className="clear-filters-btn"
              onClick={() => window.open("https://docs.google.com/spreadsheets/d/1tXiJC9AZNiAAoL8mM_KxKuzrFqzuk-n3n16abJbaam0", "_blank", "noopener,noreferrer")}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <ExternalLink size={14} /> Open Sheet
            </button>
          </div>
        </header>

        <main className="supply-body">
          {loading && (
            <div className="supply-table-container">
              <div className="supply-state-wrapper">
                <div className="supply-spinner" />
                <span className="supply-state-title">Fetching Supply History Data...</span>
                <span className="supply-state-sub">Connecting to Google Sheets API and loading records.</span>
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="supply-table-container">
              <div className="supply-state-wrapper">
                <span className="supply-state-icon" style={{ display: "inline-flex", alignItems: "center" }}><AlertTriangle size={24} /></span>
                <h3 className="supply-error-title">Failed to Load Supply Data</h3>
                <p className="supply-state-sub">{error.message}</p>
                <div className="supply-error-code">{error.message}</div>
                <button className="supply-retry-btn" onClick={handleRefresh}>
                  Retry Connection
                </button>
              </div>
            </div>
          )}

          {!loading && !error && (
            <div className="supply-table-container">
              <div className="supply-toolbar">
                <div className="supply-toolbar-left">
                  <p className="supply-table-title">Supply Records</p>
                  <span className="supply-record-badge">
                    {filtered.length.toLocaleString()} of {data.length.toLocaleString()} Records
                  </span>
                  <div className="supply-search-container">
                    <span className="supply-search-icon" style={{ display: "inline-flex", alignItems: "center" }}><Search size={16} /></span>
                    <input
                      id="supply-global-search"
                      type="text"
                      className="supply-search-input"
                      placeholder="Search all columns..."
                      value={search}
                      onChange={e => { setSearch(e.target.value); setPage(1); }}
                    />
                  </div>
                </div>
              </div>

              <div className="supply-table-wrapper">
                <table className="supply-data-table">
                  <thead>
                    <tr>
                      {COLUMNS.map(col => (
                        <th
                          key={col.key}
                          style={{ width: `${columnWidths[col.key]}px`, minWidth: `${columnWidths[col.key]}px` }}
                        >
                          <div className="supply-th-inner" onClick={() => handleSort(col.key)}>
                            {col.label}
                            <span className="supply-sort-icon">
                              {sortField === col.key
                                ? sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                                : <ArrowUpDown size={12} />}
                            </span>
                          </div>
                          <div className="column-filter-container" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                            {col.key === "saleBillDate" && (
                              <div className="column-date-filter">
                                <input
                                  type="date"
                                  className="date-filter-input"
                                  value={saleBillDateStart}
                                  onChange={e => { setSaleBillDateStart(e.target.value); setPage(1); }}
                                  title="Start Date"
                                />
                                <span className="date-filter-to">to</span>
                                <input
                                  type="date"
                                  className="date-filter-input"
                                  value={saleBillDateEnd}
                                  onChange={e => { setSaleBillDateEnd(e.target.value); setPage(1); }}
                                  title="End Date"
                                />
                                {(saleBillDateStart || saleBillDateEnd) && (
                                  <button
                                    className="date-filter-clear-btn"
                                    onClick={() => { setSaleBillDateStart(""); setSaleBillDateEnd(""); setPage(1); }}
                                    title="Clear date filter"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            )}
                            {col.key === "partyRefDate" && (
                              <div className="column-date-filter">
                                <input
                                  type="date"
                                  className="date-filter-input"
                                  value={partyRefDateStart}
                                  onChange={e => { setPartyRefDateStart(e.target.value); setPage(1); }}
                                  title="Start Date"
                                />
                                <span className="date-filter-to">to</span>
                                <input
                                  type="date"
                                  className="date-filter-input"
                                  value={partyRefDateEnd}
                                  onChange={e => { setPartyRefDateEnd(e.target.value); setPage(1); }}
                                  title="End Date"
                                />
                                {(partyRefDateStart || partyRefDateEnd) && (
                                  <button
                                    className="date-filter-clear-btn"
                                    onClick={() => { setPartyRefDateStart(""); setPartyRefDateEnd(""); setPage(1); }}
                                    title="Clear date filter"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            )}
                            {col.key === "rate" && (
                              <div className="column-numeric-filter">
                                <input
                                  type="number"
                                  placeholder="Min"
                                  className="col-price-filter-input"
                                  value={rateMin}
                                  onChange={e => { setRateMin(e.target.value); setPage(1); }}
                                  title="Rate Min"
                                />
                                <span className="filter-row-dash">-</span>
                                <input
                                  type="number"
                                  placeholder="Max"
                                  className="col-price-filter-input"
                                  value={rateMax}
                                  onChange={e => { setRateMax(e.target.value); setPage(1); }}
                                  title="Rate Max"
                                />
                              </div>
                            )}
                            {col.key === "invoiceQty" && (
                              <div className="column-numeric-filter">
                                <input
                                  type="number"
                                  placeholder="Min"
                                  className="col-price-filter-input"
                                  value={qtyMin}
                                  onChange={e => { setQtyMin(e.target.value); setPage(1); }}
                                  title="Qty Min"
                                />
                                <span className="filter-row-dash">-</span>
                                <input
                                  type="number"
                                  placeholder="Max"
                                  className="col-price-filter-input"
                                  value={qtyMax}
                                  onChange={e => { setQtyMax(e.target.value); setPage(1); }}
                                  title="Qty Max"
                                />
                              </div>
                            )}
                            {col.key === "invoiceAmt" && (
                              <div className="column-numeric-filter">
                                <input
                                  type="number"
                                  placeholder="Min"
                                  className="col-price-filter-input"
                                  value={amtMin}
                                  onChange={e => { setAmtMin(e.target.value); setPage(1); }}
                                  title="Amt Min"
                                />
                                <span className="filter-row-dash">-</span>
                                <input
                                  type="number"
                                  placeholder="Max"
                                  className="col-price-filter-input"
                                  value={amtMax}
                                  onChange={e => { setAmtMax(e.target.value); setPage(1); }}
                                  title="Amt Max"
                                />
                              </div>
                            )}
                            {col.key === "partyName" && (
                                <div className="custom-multiselect-container" ref={partyDropdownRef}>
                                  <button 
                                    className="multiselect-trigger-btn"
                                    onClick={() => setShowPartyDropdown(!showPartyDropdown)}
                                    style={{ marginBottom: "4px" }}
                                  >
                                    {selectedParties.length === 0 ? "All Parties" : `${selectedParties.length} Selected`} <span className="dropdown-arrow" style={{ display: "inline-flex", alignItems: "center" }}><ChevronDown size={12} /></span>
                                  </button>
                                  {showPartyDropdown && (
                                    <div className="multiselect-dropdown-panel" style={{ left: 0, right: "auto", minWidth: "260px", maxWidth: "none" }}>
                                      <div className="multiselect-actions">
                                        <button className="multiselect-action-btn" onClick={() => { setSelectedParties([]); setPage(1); }}>Clear All</button>
                                        <button className="multiselect-action-btn" onClick={() => { setSelectedParties(partyNamesList.filter(p => p !== "All")); setPage(1); }}>Select All</button>
                                      </div>
                                      <div className="multiselect-options-list">
                                        {partyNamesList.filter(p => p !== "All").map(party => (
                                          <label key={party} className="multiselect-option-label">
                                            <input 
                                              type="checkbox"
                                              checked={selectedParties.includes(party)}
                                              onChange={() => {
                                                if (selectedParties.includes(party)) {
                                                  setSelectedParties(selectedParties.filter(p => p !== party));
                                                } else {
                                                  setSelectedParties([...selectedParties, party]);
                                                }
                                                setPage(1);
                                              }}
                                            />
                                            <span>{party}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            {col.key === "itemName" && (
                                <div className="custom-multiselect-container" ref={itemDropdownRef}>
                                  <button 
                                    className="multiselect-trigger-btn"
                                    onClick={() => setShowItemDropdown(!showItemDropdown)}
                                    style={{ marginBottom: "4px" }}
                                  >
                                    {selectedItems.length === 0 ? "All Items" : `${selectedItems.length} Selected`} <span className="dropdown-arrow" style={{ display: "inline-flex", alignItems: "center" }}><ChevronDown size={12} /></span>
                                  </button>
                                  {showItemDropdown && (
                                    <div className="multiselect-dropdown-panel" style={{ left: 0, right: "auto", minWidth: "260px", maxWidth: "none" }}>
                                      <div className="multiselect-actions">
                                        <button className="multiselect-action-btn" onClick={() => { setSelectedItems([]); setPage(1); }}>Clear All</button>
                                        <button className="multiselect-action-btn" onClick={() => { setSelectedItems(itemNamesList.filter(i => i !== "All")); setPage(1); }}>Select All</button>
                                      </div>
                                      <div className="multiselect-options-list">
                                        {itemNamesList.filter(i => i !== "All").map(item => (
                                          <label key={item} className="multiselect-option-label">
                                            <input 
                                              type="checkbox"
                                              checked={selectedItems.includes(item)}
                                              onChange={() => {
                                                if (selectedItems.includes(item)) {
                                                  setSelectedItems(selectedItems.filter(i => i !== item));
                                                } else {
                                                  setSelectedItems([...selectedItems, item]);
                                                }
                                                setPage(1);
                                              }}
                                            />
                                            <span>{item}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            {col.key === "partyRefNo" && (
                                <div className="custom-multiselect-container" ref={partyRefDropdownRef}>
                                  <button 
                                    className="multiselect-trigger-btn"
                                    onClick={() => setShowPartyRefDropdown(!showPartyRefDropdown)}
                                    style={{ marginBottom: "4px" }}
                                  >
                                    {selectedPartyRefs.length === 0 ? "All Party Refs" : `${selectedPartyRefs.length} Selected`} <span className="dropdown-arrow" style={{ display: "inline-flex", alignItems: "center" }}><ChevronDown size={12} /></span>
                                  </button>
                                  {showPartyRefDropdown && (
                                    <div className="multiselect-dropdown-panel" style={{ left: 0, right: "auto", minWidth: "260px", maxWidth: "none" }}>
                                      <div className="multiselect-actions">
                                        <button className="multiselect-action-btn" onClick={() => { setSelectedPartyRefs([]); setPage(1); }}>Clear All</button>
                                        <button className="multiselect-action-btn" onClick={() => { setSelectedPartyRefs(partyRefsList.filter(p => p !== "All")); setPage(1); }}>Select All</button>
                                      </div>
                                      <div className="multiselect-options-list">
                                        {partyRefsList.filter(p => p !== "All").map(refNo => (
                                          <label key={refNo} className="multiselect-option-label">
                                            <input 
                                              type="checkbox"
                                              checked={selectedPartyRefs.includes(refNo)}
                                              onChange={() => {
                                                if (selectedPartyRefs.includes(refNo)) {
                                                  setSelectedPartyRefs(selectedPartyRefs.filter(p => p !== refNo));
                                                } else {
                                                  setSelectedPartyRefs([...selectedPartyRefs, refNo]);
                                                }
                                                setPage(1);
                                              }}
                                            />
                                            <span>{refNo}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            {col.key === "contractVrNo" && (
                                <div className="custom-multiselect-container" ref={contractDropdownRef}>
                                  <button 
                                    className="multiselect-trigger-btn"
                                    onClick={() => setShowContractDropdown(!showContractDropdown)}
                                    style={{ marginBottom: "4px" }}
                                  >
                                    {selectedContracts.length === 0 ? "All Contracts" : `${selectedContracts.length} Selected`} <span className="dropdown-arrow" style={{ display: "inline-flex", alignItems: "center" }}><ChevronDown size={12} /></span>
                                  </button>
                                  {showContractDropdown && (
                                    <div className="multiselect-dropdown-panel" style={{ left: 0, right: "auto", minWidth: "260px", maxWidth: "none" }}>
                                      <div className="multiselect-actions">
                                        <button className="multiselect-action-btn" onClick={() => { setSelectedContracts([]); setPage(1); }}>Clear All</button>
                                        <button className="multiselect-action-btn" onClick={() => { setSelectedContracts(contractsList.filter(c => c !== "All")); setPage(1); }}>Select All</button>
                                      </div>
                                      <div className="multiselect-options-list">
                                        {contractsList.filter(c => c !== "All").map(cNo => (
                                          <label key={cNo} className="multiselect-option-label">
                                            <input 
                                              type="checkbox"
                                              checked={selectedContracts.includes(cNo)}
                                              onChange={() => {
                                                if (selectedContracts.includes(cNo)) {
                                                  setSelectedContracts(selectedContracts.filter(c => c !== cNo));
                                                } else {
                                                  setSelectedContracts([...selectedContracts, cNo]);
                                                }
                                                setPage(1);
                                              }}
                                            />
                                            <span>{cNo}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            {![
                              "saleBillDate", "partyRefDate",
                              "fy", "lrNo",
                            ].includes(col.key) && (
                              <input
                                type="text"
                                className="column-search-input"
                                placeholder="Search..."
                                value={colSearches[col.key] || ""}
                                onChange={e => handleColSearchChange(col.key, e.target.value)}
                              />
                            )}
                          </div>
                          <div
                            className="column-resizer"
                            onMouseDown={(e) => handleResizeStart(e, col.key, columnWidths[col.key])}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.length === 0 ? (
                      <tr>
                        <td
                          colSpan={COLUMNS.length}
                          style={{
                            textAlign: "center",
                            padding: "48px 20px",
                            color: "rgba(0,0,0,0.4)",
                            fontSize: "13px",
                            fontWeight: 500,
                          }}
                        >
                          <Inbox size={16} style={{ verticalAlign: "middle", marginRight: "6px" }} /> No matching records found. Try adjusting your filters.
                        </td>
                      </tr>
                    ) : paginated.map((row, idx) => (
                      <tr key={pageStart + idx} className="supply-row">
                        <td className="col-center">{row.fy ?? <span className="supply-null-cell">—</span>}</td>
                        <td title={row.saleBillNumber ?? undefined}>
                          {row.saleBillNumber ?? <span className="supply-null-cell">—</span>}
                        </td>
                        <td className="col-center">
                          {row.saleBillDate
                            ? <span className="supply-date-badge">{formatDate(row.saleBillDate)}</span>
                            : <span className="supply-null-cell">—</span>}
                        </td>
                        <td title={row.partyName ?? undefined}>
                          {row.partyName ?? <span className="supply-null-cell">—</span>}
                        </td>
                        <td title={row.itemCode ?? undefined}>
                          {row.itemCode ?? <span className="supply-null-cell">—</span>}
                        </td>
                        <td title={row.itemName ?? undefined}>
                          {row.itemName ?? <span className="supply-null-cell">—</span>}
                        </td>
                        <td title={row.lrNo ?? undefined}>
                          {row.lrNo ?? <span className="supply-null-cell">—</span>}
                        </td>
                        <td title={row.partyRefNo ?? undefined}>
                          {row.partyRefNo ?? <span className="supply-null-cell">—</span>}
                        </td>
                        <td className="col-center">
                          {row.partyRefDate
                            ? <span className="supply-date-badge">{formatDate(row.partyRefDate)}</span>
                            : <span className="supply-null-cell">—</span>}
                        </td>
                        <td title={row.contractVrNo ?? undefined}>
                          {row.contractVrNo ?? <span className="supply-null-cell">—</span>}
                        </td>
                        <td className="supply-number-cell">
                          {row.rate !== null && row.rate !== undefined
                            ? formatNumber(row.rate)
                            : <span className="supply-null-cell">—</span>}
                        </td>
                        <td className="supply-number-cell">
                          {row.invoiceQty !== null && row.invoiceQty !== undefined
                            ? formatNumber(row.invoiceQty)
                            : <span className="supply-null-cell">—</span>}
                        </td>
                        <td className="supply-number-cell">
                          {row.invoiceAmt !== null && row.invoiceAmt !== undefined
                            ? formatNumber(row.invoiceAmt)
                            : <span className="supply-null-cell">—</span>}
                        </td>
                        <td className="col-center">
                          {row.hasDocuments || row.attachmentUrl ? (
                            <button
                              className="view-docs-btn"
                              onClick={() => {
                                setSelectedBillNo(row.saleBillNumber);
                                setSelectedAttachmentUrl(row.attachmentUrl ?? null);
                              }}
                              title="View Documents"
                              style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <FolderOpen size={14} /> View Files
                            </button>
                          ) : (
                            <span className="supply-null-cell">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="supply-table-footer">
                <div className="supply-footer-left">
                  <span>Rows per page:</span>
                  <select
                    className="supply-rows-select"
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  >
                    {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="supply-footer-center">
                  {pageStart + 1}–{Math.min(pageStart + pageSize, sorted.length)} of {sorted.length}
                </div>
                <div className="supply-pagination">
                  <button className="supply-page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
                  {pageNumbers().map((p, i) =>
                    p === "..." ? (
                      <span key={`e${i}`} style={{ padding: "0 4px", color: "#5f6368", fontSize: 12 }}>…</span>
                    ) : (
                      <button key={p} className={`supply-page-btn${page === p ? " active" : ""}`} onClick={() => setPage(p as number)}>{p}</button>
                    )
                  )}
                  <button className="supply-page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="supply-status-bar">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#137333" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#34a853", display: "inline-block", animation: "blink 1.5s infinite" }} />
              <span>SHEET LIVE</span>
            </div>
          </div>
          <div style={{ color: "#0a2540", textTransform: "uppercase", fontWeight: 700 }}>
            LASERPOWER SUPPLY PIPELINE
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ backgroundColor: "#e1e6eb", color: "#0a2540", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
              LASERPOWER ERP V2.1 PRO
            </span>
          </div>
        </footer>
      </div>

      <SupplyAttachmentModal
        isOpen={!!selectedBillNo}
        onClose={() => { setSelectedBillNo(null); setSelectedAttachmentUrl(null); }}
        saleBillNumber={selectedBillNo || ""}
        attachmentUrl={selectedAttachmentUrl}
      />
    </div>
  );
};

export default SupplyHistoryDashboard;
