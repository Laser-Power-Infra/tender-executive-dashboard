"use client";
import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useSupplyHistory } from "@/hooks/useSupplyHistory";
import { SupplyHistoryRecord } from "@/types/supplyHistory";
import { SupplyAttachmentModal } from "@/components/SupplyAttachmentModal";
// import { Package, RefreshCw, Eraser, ExternalLink, FileSpreadsheet, AlertTriangle, Search, ChevronUp, ChevronDown, ArrowUpDown, X, Inbox, FolderOpen } from "lucide-react";
import { Package, RefreshCw, Eraser, FileSpreadsheet, AlertTriangle, Search, ChevronUp, ChevronDown, ArrowUpDown, X, Inbox, FolderOpen, FileText, ExternalLink, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  { key: "quotationNo",     label: "Quotation No",      width: 120, align: "left"   },
  { key: "docketNo",        label: "Docket No",         width: 140, align: "left"   },
  { key: "utility",         label: "Utility",           width: 220, align: "left"   },
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

interface ColumnMultiselectDropdownProps {
  triggerLabel: string;
  selected: string[];
  options: string[];
  show: boolean;
  onToggleShow: () => void;
  onToggleOption: (value: string) => void;
  onClearAll: () => void;
  onSelectAll: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const ColumnMultiselectDropdown: React.FC<ColumnMultiselectDropdownProps> = ({
  triggerLabel,
  selected,
  options,
  show,
  onToggleShow,
  onToggleOption,
  onClearAll,
  onSelectAll,
  containerRef,
}) => {
  return (
    <div className="custom-multiselect-container" ref={containerRef}>
      <button
        className="multiselect-trigger-btn"
        onClick={onToggleShow}
        style={{ marginBottom: "4px" }}
      >
        {selected.length === 0 ? triggerLabel : `${selected.length} Selected`} <span className="dropdown-arrow" style={{ display: "inline-flex", alignItems: "center" }}><ChevronDown size={12} /></span>
      </button>
      {show && (
        <div className="multiselect-dropdown-panel" style={{ left: 0, right: "auto", minWidth: "260px", maxWidth: "none" }}>
          <div className="multiselect-actions">
            <button className="multiselect-action-btn" onClick={onClearAll}>Clear All</button>
            <button className="multiselect-action-btn" onClick={onSelectAll}>Select All</button>
          </div>
          <div className="multiselect-options-list">
            {options.map(option => (
              <label key={option} className="multiselect-option-label">
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() => onToggleOption(option)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

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

  const [showQuotationDropdown, setShowQuotationDropdown] = useState(false);
  const [selectedQuotations, setSelectedQuotations] = useState<string[]>([]);
  const quotationDropdownRef = useRef<HTMLDivElement>(null);

  const [showDocketDropdown, setShowDocketDropdown] = useState(false);
  const [selectedDockets, setSelectedDockets] = useState<string[]>([]);
  const docketDropdownRef = useRef<HTMLDivElement>(null);

  const [showUtilityDropdown, setShowUtilityDropdown] = useState(false);
  const [selectedUtilities, setSelectedUtilities] = useState<string[]>([]);
  const utilityDropdownRef = useRef<HTMLDivElement>(null);

  const [showFyDropdown, setShowFyDropdown] = useState(false);
  const [selectedFy, setSelectedFy] = useState<string[]>([]);
  const fyDropdownRef = useRef<HTMLDivElement>(null);

  const [showBillNoDropdown, setShowBillNoDropdown] = useState(false);
  const [selectedBillNos, setSelectedBillNos] = useState<string[]>([]);
  const billNoDropdownRef = useRef<HTMLDivElement>(null);

  const [showItemCodeDropdown, setShowItemCodeDropdown] = useState(false);
  const [selectedItemCodes, setSelectedItemCodes] = useState<string[]>([]);
  const itemCodeDropdownRef = useRef<HTMLDivElement>(null);

  const [showLrNoDropdown, setShowLrNoDropdown] = useState(false);
  const [selectedLrNos, setSelectedLrNos] = useState<string[]>([]);
  const lrNoDropdownRef = useRef<HTMLDivElement>(null);

  const [showDocsDropdown, setShowDocsDropdown] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const docsDropdownRef = useRef<HTMLDivElement>(null);

  const [rateMin, setRateMin] = useState("");
  const [rateMax, setRateMax] = useState("");
  const [qtyMin, setQtyMin] = useState("");
  const [qtyMax, setQtyMax] = useState("");
  const [amtMin, setAmtMin] = useState("");
  const [amtMax, setAmtMax] = useState("");
  const [selectedBillNo, setSelectedBillNo] = useState<string | null>(null);
  const [selectedAttachmentUrl, setSelectedAttachmentUrl] = useState<string | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [syncingQuotation, setSyncingQuotation] = useState(false);
  const [downloadingDocs, setDownloadingDocs] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);

  type CertState =
    | { status: "idle" }
    | { status: "generating" }
    | { status: "error"; error: string };

  const [certStates, setCertStates] = useState<Record<string, CertState>>({});
  const certGeneratingRef = useRef<Set<string>>(new Set());

  const triggerDownload = useCallback((blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleGenerateCertificate = useCallback(
    async (partyRefNo: string) => {
      if (certGeneratingRef.current.has(partyRefNo)) return;
      certGeneratingRef.current.add(partyRefNo);

      setCertStates((prev) => ({ ...prev, [partyRefNo]: { status: "generating" } }));

      const group = data.filter((r) => r.partyRefNo === partyRefNo);
      const fileName = `Certificate_${partyRefNo || "NAN"}.pdf`;

      try {
        const res = await fetch("/api/supply-history/generate-certificate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: group }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Generation failed" }));
          throw new Error(err.error || "Generation failed");
        }
        const blob = await res.blob();
        triggerDownload(blob, fileName);
        setCertStates((prev) => ({ ...prev, [partyRefNo]: { status: "idle" } }));
      } catch (err: any) {
        setCertStates((prev) => ({
          ...prev,
          [partyRefNo]: { status: "error", error: err.message },
        }));
      } finally {
        certGeneratingRef.current.delete(partyRefNo);
      }
    },
    [data, triggerDownload]
  );

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
      if (quotationDropdownRef.current && !quotationDropdownRef.current.contains(event.target as Node)) {
        setShowQuotationDropdown(false);
      }
      if (docketDropdownRef.current && !docketDropdownRef.current.contains(event.target as Node)) {
        setShowDocketDropdown(false);
      }
      if (utilityDropdownRef.current && !utilityDropdownRef.current.contains(event.target as Node)) {
        setShowUtilityDropdown(false);
      }
      if (fyDropdownRef.current && !fyDropdownRef.current.contains(event.target as Node)) {
        setShowFyDropdown(false);
      }
      if (billNoDropdownRef.current && !billNoDropdownRef.current.contains(event.target as Node)) {
        setShowBillNoDropdown(false);
      }
      if (itemCodeDropdownRef.current && !itemCodeDropdownRef.current.contains(event.target as Node)) {
        setShowItemCodeDropdown(false);
      }
      if (lrNoDropdownRef.current && !lrNoDropdownRef.current.contains(event.target as Node)) {
        setShowLrNoDropdown(false);
      }
      if (docsDropdownRef.current && !docsDropdownRef.current.contains(event.target as Node)) {
        setShowDocsDropdown(false);
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
    setSelectedQuotations([]);
    setShowQuotationDropdown(false);
    setSelectedDockets([]);
    setShowDocketDropdown(false);
    setSelectedUtilities([]);
    setShowUtilityDropdown(false);
    setSelectedFy([]);
    setShowFyDropdown(false);
    setSelectedBillNos([]);
    setShowBillNoDropdown(false);
    setSelectedItemCodes([]);
    setShowItemCodeDropdown(false);
    setSelectedLrNos([]);
    setShowLrNoDropdown(false);
    setSelectedDocs([]);
    setShowDocsDropdown(false);
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

    if (selectedQuotations.length > 0) {
      rows = rows.filter(row => row.quotationNo && selectedQuotations.includes(row.quotationNo.trim()));
    }

    if (selectedDockets.length > 0) {
      rows = rows.filter(row => row.docketNo && selectedDockets.includes(row.docketNo.trim()));
    }

    if (selectedUtilities.length > 0) {
      rows = rows.filter(row => row.utility && selectedUtilities.includes(row.utility.trim()));
    }

    if (selectedFy.length > 0) {
      rows = rows.filter(row => row.fy && selectedFy.includes(row.fy.trim()));
    }

    if (selectedBillNos.length > 0) {
      rows = rows.filter(row => row.saleBillNumber && selectedBillNos.includes(row.saleBillNumber.trim()));
    }

    if (selectedItemCodes.length > 0) {
      rows = rows.filter(row => row.itemCode && selectedItemCodes.includes(row.itemCode.trim()));
    }

    if (selectedLrNos.length > 0) {
      rows = rows.filter(row => row.lrNo && selectedLrNos.includes(row.lrNo.trim()));
    }

    if (selectedDocs.length > 0) {
      rows = rows.filter(row => selectedDocs.includes(row.hasDocuments ? "Yes" : "No"));
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
    selectedQuotations,
    selectedDockets,
    selectedUtilities,
    selectedFy,
    selectedBillNos,
    selectedItemCodes,
    selectedLrNos,
    selectedDocs,
  ]);

  const partyNamesList = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.partyName) set.add(r.partyName.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const itemNamesList = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.itemName) set.add(r.itemName.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const partyRefsList = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.partyRefNo) set.add(r.partyRefNo.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const contractsList = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.contractVrNo) set.add(r.contractVrNo.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const quotationNosList = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.quotationNo) set.add(r.quotationNo.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const docketsList = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.docketNo) set.add(r.docketNo.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const utilitiesList = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.utility) set.add(r.utility.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const fyList = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.fy) set.add(r.fy.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const billNosList = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.saleBillNumber) set.add(r.saleBillNumber.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const itemCodesList = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.itemCode) set.add(r.itemCode.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const lrNosList = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.lrNo) set.add(r.lrNo.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const docsList = useMemo(() => ["All", "Yes", "No"], []);

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

  const handleSyncQuotation = async () => {
    setSyncingQuotation(true);
    try {
      const res = await fetch("/api/supply-history/sync-quotation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer MOCK_TOKEN_LASERPOWER_SECURE_AUTH_SCOPE",
        },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Sync failed");
      const s = json.stats;
      const errCount = s?.errors?.length ?? 0;
      toast.success(
        `Quotation sync done: ${s?.updated ?? 0} records updated (${s?.totalContracts ?? 0} contracts, ${errCount} errors)`
      );
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Quotation sync failed");
      console.error("Quotation sync failed:", err);
    } finally {
      setSyncingQuotation(false);
    }
  };

  const handleDownloadAllDocuments = useCallback(async () => {
    const withDocs = filtered.filter(r => r.hasDocuments && r.saleBillNumber);
    if (withDocs.length === 0) {
      toast.info("No document records found in current view");
      return;
    }

    const driveOnly = filtered.filter(r => !r.hasDocuments && r.attachmentUrl);
    const billNumbers = withDocs.map(r => r.saleBillNumber!).filter(Boolean);

    setDownloadingDocs(true);
    try {
      const res = await fetch("/api/supply-history/download-documents-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer MOCK_TOKEN_LASERPOWER_SECURE_AUTH_SCOPE" },
        body: JSON.stringify({ saleBillNumbers: billNumbers }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Download failed" }));
        throw new Error(err.error || "Download failed");
      }

      const blob = await res.blob();
      const date = new Date().toISOString().split("T")[0];
      triggerDownload(blob, `Supply_Documents_${date}.zip`);

      if (driveOnly.length > 0) {
        toast.info(`${driveOnly.length} record(s) with only Google Drive documents were excluded from the zip`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to download documents");
    } finally {
      setDownloadingDocs(false);
    }
  }, [filtered, triggerDownload]);

  const handleExportAndDownload = useCallback(async () => {
    setExportingAll(true)
    const date = new Date().toISOString().split("T")[0]

    try {
      const exportData = data.map((rec) => {
        const obj: Record<string, string | number | boolean> = {};
        for (const col of COLUMNS) {
          obj[col.label] = rec[col.key] ?? "";
        }
        return obj;
      });
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Supply History");
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const excelBlob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      triggerDownload(excelBlob, `Supply_History_Data_${date}.xlsx`)
    } catch (err) {
      console.error("Excel export failed:", err)
      toast.error("Failed to export Excel")
      setExportingAll(false)
      return
    }

    const withDocs = filtered.filter(r => r.hasDocuments && r.saleBillNumber)
    if (withDocs.length === 0) {
      toast.info("Excel exported. No documents to zip.")
      setExportingAll(false)
      return
    }

    const billNumbers = withDocs.map(r => r.saleBillNumber!).filter(Boolean)

    try {
      const res = await fetch("/api/supply-history/download-documents-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer MOCK_TOKEN_LASERPOWER_SECURE_AUTH_SCOPE" },
        body: JSON.stringify({ saleBillNumbers: billNumbers }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Download failed" }))
        throw new Error(err.error || "Download failed")
      }

      const zipBlob = await res.blob()
      triggerDownload(zipBlob, `Supply_Documents_${date}.zip`)

      const driveOnly = filtered.filter(r => !r.hasDocuments && r.attachmentUrl)
      if (driveOnly.length > 0) {
        toast.info(`${driveOnly.length} record(s) with only Google Drive documents were excluded from the zip`)
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to download documents")
    } finally {
      setExportingAll(false)
    }
  }, [data, filtered, triggerDownload])

  const handleExportExcel = () => {
    const exportData = sorted.map((rec) => {
      const obj: Record<string, string | number | boolean> = {};
      for (const col of COLUMNS) {
        obj[col.label] = rec[col.key] ?? "";
      }
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Supply History");
    const date = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `Supply_History_Data_${date}.xlsx`);
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
          <button
            className="supply-refresh-sidebar-btn"
            onClick={handleSyncQuotation}
            disabled={syncingQuotation}
            style={{ marginTop: "8px" }}
          >
            {syncingQuotation ? <><RefreshCw size={14} /> Syncing...</> : <><RefreshCw size={14} /> Sync Quotation No</>}
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
              className="export-excel-btn"
              onClick={handleDownloadAllDocuments}
              disabled={downloadingDocs}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              {downloadingDocs ? <><RefreshCw size={14} /> Zipping...</> : <><Download size={14} /> Download All Docs</>}
            </button>
            <button
              className="export-excel-btn"
              onClick={handleExportAndDownload}
              disabled={exportingAll}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              {exportingAll ? <><RefreshCw size={14} /> Processing...</> : <><Download size={14} /> Export & Download</>}
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
                              <ColumnMultiselectDropdown
                                triggerLabel="All Parties"
                                selected={selectedParties}
                                options={partyNamesList.filter(p => p !== "All")}
                                show={showPartyDropdown}
                                onToggleShow={() => setShowPartyDropdown(!showPartyDropdown)}
                                onToggleOption={(party) => {
                                  if (selectedParties.includes(party)) {
                                    setSelectedParties(selectedParties.filter(p => p !== party));
                                  } else {
                                    setSelectedParties([...selectedParties, party]);
                                  }
                                  setPage(1);
                                }}
                                onClearAll={() => { setSelectedParties([]); setPage(1); }}
                                onSelectAll={() => { setSelectedParties(partyNamesList.filter(p => p !== "All")); setPage(1); }}
                                containerRef={partyDropdownRef}
                              />
                            )}
                            {col.key === "itemName" && (
                              <ColumnMultiselectDropdown
                                triggerLabel="All Items"
                                selected={selectedItems}
                                options={itemNamesList.filter(i => i !== "All")}
                                show={showItemDropdown}
                                onToggleShow={() => setShowItemDropdown(!showItemDropdown)}
                                onToggleOption={(item) => {
                                  if (selectedItems.includes(item)) {
                                    setSelectedItems(selectedItems.filter(i => i !== item));
                                  } else {
                                    setSelectedItems([...selectedItems, item]);
                                  }
                                  setPage(1);
                                }}
                                onClearAll={() => { setSelectedItems([]); setPage(1); }}
                                onSelectAll={() => { setSelectedItems(itemNamesList.filter(i => i !== "All")); setPage(1); }}
                                containerRef={itemDropdownRef}
                              />
                            )}
                            {col.key === "partyRefNo" && (
                              <ColumnMultiselectDropdown
                                triggerLabel="All Party Refs"
                                selected={selectedPartyRefs}
                                options={partyRefsList.filter(p => p !== "All")}
                                show={showPartyRefDropdown}
                                onToggleShow={() => setShowPartyRefDropdown(!showPartyRefDropdown)}
                                onToggleOption={(refNo) => {
                                  if (selectedPartyRefs.includes(refNo)) {
                                    setSelectedPartyRefs(selectedPartyRefs.filter(p => p !== refNo));
                                  } else {
                                    setSelectedPartyRefs([...selectedPartyRefs, refNo]);
                                  }
                                  setPage(1);
                                }}
                                onClearAll={() => { setSelectedPartyRefs([]); setPage(1); }}
                                onSelectAll={() => { setSelectedPartyRefs(partyRefsList.filter(p => p !== "All")); setPage(1); }}
                                containerRef={partyRefDropdownRef}
                              />
                            )}
                            {col.key === "contractVrNo" && (
                              <ColumnMultiselectDropdown
                                triggerLabel="All Contracts"
                                selected={selectedContracts}
                                options={contractsList.filter(c => c !== "All")}
                                show={showContractDropdown}
                                onToggleShow={() => setShowContractDropdown(!showContractDropdown)}
                                onToggleOption={(cNo) => {
                                  if (selectedContracts.includes(cNo)) {
                                    setSelectedContracts(selectedContracts.filter(c => c !== cNo));
                                  } else {
                                    setSelectedContracts([...selectedContracts, cNo]);
                                  }
                                  setPage(1);
                                }}
                                onClearAll={() => { setSelectedContracts([]); setPage(1); }}
                                onSelectAll={() => { setSelectedContracts(contractsList.filter(c => c !== "All")); setPage(1); }}
                                containerRef={contractDropdownRef}
                              />
                            )}
                            {col.key === "quotationNo" && (
                              <ColumnMultiselectDropdown
                                triggerLabel="All Quotations"
                                selected={selectedQuotations}
                                options={quotationNosList.filter(q => q !== "All")}
                                show={showQuotationDropdown}
                                onToggleShow={() => setShowQuotationDropdown(!showQuotationDropdown)}
                                onToggleOption={(qNo) => {
                                  if (selectedQuotations.includes(qNo)) {
                                    setSelectedQuotations(selectedQuotations.filter(q => q !== qNo));
                                  } else {
                                    setSelectedQuotations([...selectedQuotations, qNo]);
                                  }
                                  setPage(1);
                                }}
                                onClearAll={() => { setSelectedQuotations([]); setPage(1); }}
                                onSelectAll={() => { setSelectedQuotations(quotationNosList.filter(q => q !== "All")); setPage(1); }}
                                containerRef={quotationDropdownRef}
                              />
                            )}
                            {col.key === "docketNo" && (
                              <ColumnMultiselectDropdown
                                triggerLabel="All Docket Nos"
                                selected={selectedDockets}
                                options={docketsList.filter(d => d !== "All")}
                                show={showDocketDropdown}
                                onToggleShow={() => setShowDocketDropdown(!showDocketDropdown)}
                                onToggleOption={(dNo) => {
                                  if (selectedDockets.includes(dNo)) {
                                    setSelectedDockets(selectedDockets.filter(d => d !== dNo));
                                  } else {
                                    setSelectedDockets([...selectedDockets, dNo]);
                                  }
                                  setPage(1);
                                }}
                                onClearAll={() => { setSelectedDockets([]); setPage(1); }}
                                onSelectAll={() => { setSelectedDockets(docketsList.filter(d => d !== "All")); setPage(1); }}
                                containerRef={docketDropdownRef}
                              />
                            )}
                            {col.key === "utility" && (
                              <ColumnMultiselectDropdown
                                triggerLabel="All Utilities"
                                selected={selectedUtilities}
                                options={utilitiesList.filter(u => u !== "All")}
                                show={showUtilityDropdown}
                                onToggleShow={() => setShowUtilityDropdown(!showUtilityDropdown)}
                                onToggleOption={(uVal) => {
                                  if (selectedUtilities.includes(uVal)) {
                                    setSelectedUtilities(selectedUtilities.filter(u => u !== uVal));
                                  } else {
                                    setSelectedUtilities([...selectedUtilities, uVal]);
                                  }
                                  setPage(1);
                                }}
                                onClearAll={() => { setSelectedUtilities([]); setPage(1); }}
                                onSelectAll={() => { setSelectedUtilities(utilitiesList.filter(u => u !== "All")); setPage(1); }}
                                containerRef={utilityDropdownRef}
                              />
                            )}
                            {col.key === "fy" && (
                              <ColumnMultiselectDropdown
                                triggerLabel="All FY"
                                selected={selectedFy}
                                options={fyList.filter(f => f !== "All")}
                                show={showFyDropdown}
                                onToggleShow={() => setShowFyDropdown(!showFyDropdown)}
                                onToggleOption={(fy) => {
                                  if (selectedFy.includes(fy)) {
                                    setSelectedFy(selectedFy.filter(f => f !== fy));
                                  } else {
                                    setSelectedFy([...selectedFy, fy]);
                                  }
                                  setPage(1);
                                }}
                                onClearAll={() => { setSelectedFy([]); setPage(1); }}
                                onSelectAll={() => { setSelectedFy(fyList.filter(f => f !== "All")); setPage(1); }}
                                containerRef={fyDropdownRef}
                              />
                            )}
                            {col.key === "saleBillNumber" && (
                              <ColumnMultiselectDropdown
                                triggerLabel="All Bill Nos"
                                selected={selectedBillNos}
                                options={billNosList.filter(b => b !== "All")}
                                show={showBillNoDropdown}
                                onToggleShow={() => setShowBillNoDropdown(!showBillNoDropdown)}
                                onToggleOption={(bNo) => {
                                  if (selectedBillNos.includes(bNo)) {
                                    setSelectedBillNos(selectedBillNos.filter(b => b !== bNo));
                                  } else {
                                    setSelectedBillNos([...selectedBillNos, bNo]);
                                  }
                                  setPage(1);
                                }}
                                onClearAll={() => { setSelectedBillNos([]); setPage(1); }}
                                onSelectAll={() => { setSelectedBillNos(billNosList.filter(b => b !== "All")); setPage(1); }}
                                containerRef={billNoDropdownRef}
                              />
                            )}
                            {col.key === "itemCode" && (
                              <ColumnMultiselectDropdown
                                triggerLabel="All Item Codes"
                                selected={selectedItemCodes}
                                options={itemCodesList.filter(i => i !== "All")}
                                show={showItemCodeDropdown}
                                onToggleShow={() => setShowItemCodeDropdown(!showItemCodeDropdown)}
                                onToggleOption={(code) => {
                                  if (selectedItemCodes.includes(code)) {
                                    setSelectedItemCodes(selectedItemCodes.filter(c => c !== code));
                                  } else {
                                    setSelectedItemCodes([...selectedItemCodes, code]);
                                  }
                                  setPage(1);
                                }}
                                onClearAll={() => { setSelectedItemCodes([]); setPage(1); }}
                                onSelectAll={() => { setSelectedItemCodes(itemCodesList.filter(i => i !== "All")); setPage(1); }}
                                containerRef={itemCodeDropdownRef}
                              />
                            )}
                            {col.key === "lrNo" && (
                              <ColumnMultiselectDropdown
                                triggerLabel="All LR Nos"
                                selected={selectedLrNos}
                                options={lrNosList.filter(l => l !== "All")}
                                show={showLrNoDropdown}
                                onToggleShow={() => setShowLrNoDropdown(!showLrNoDropdown)}
                                onToggleOption={(lNo) => {
                                  if (selectedLrNos.includes(lNo)) {
                                    setSelectedLrNos(selectedLrNos.filter(l => l !== lNo));
                                  } else {
                                    setSelectedLrNos([...selectedLrNos, lNo]);
                                  }
                                  setPage(1);
                                }}
                                onClearAll={() => { setSelectedLrNos([]); setPage(1); }}
                                onSelectAll={() => { setSelectedLrNos(lrNosList.filter(l => l !== "All")); setPage(1); }}
                                containerRef={lrNoDropdownRef}
                              />
                            )}
                            {col.key === "hasDocuments" && (
                              <ColumnMultiselectDropdown
                                triggerLabel="All"
                                selected={selectedDocs}
                                options={docsList.filter(d => d !== "All")}
                                show={showDocsDropdown}
                                onToggleShow={() => setShowDocsDropdown(!showDocsDropdown)}
                                onToggleOption={(doc) => {
                                  if (selectedDocs.includes(doc)) {
                                    setSelectedDocs(selectedDocs.filter(d => d !== doc));
                                  } else {
                                    setSelectedDocs([...selectedDocs, doc]);
                                  }
                                  setPage(1);
                                }}
                                onClearAll={() => { setSelectedDocs([]); setPage(1); }}
                                onSelectAll={() => { setSelectedDocs(docsList.filter(d => d !== "All")); setPage(1); }}
                                containerRef={docsDropdownRef}
                              />
                            )}
                            {![
                              "saleBillDate", "partyRefDate",
                              "fy", "lrNo",
                              "partyName", "itemName", "partyRefNo",
                              "contractVrNo", "quotationNo", "docketNo", "utility", "saleBillNumber", "itemCode",
                              "hasDocuments",
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
                      <th style={{ width: "150px", minWidth: "150px" }}>
                        <div className="supply-th-inner">Certificate PDF</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.length === 0 ? (
                      <tr>
                        <td
                          colSpan={COLUMNS.length + 1}
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
                        <td title={row.quotationNo ?? undefined}>
                          {row.quotationNo ?? <span className="supply-null-cell">—</span>}
                        </td>
                        <td title={row.docketNo ?? undefined}>
                          {row.docketNo ?? <span className="supply-null-cell">—</span>}
                        </td>
                        <td title={row.utility ?? undefined}>
                          {row.utility ?? <span className="supply-null-cell">—</span>}
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
                        <td className="col-center">
                          {!row.partyRefNo ? (
                            <span className="supply-null-cell">—</span>
                          ) : (() => {
                            const state = certStates[row.partyRefNo] ?? { status: "idle" };
                            if (state.status === "generating") {
                              return <span className="supply-generating"><span className="supply-spinner-sm" /> Generating...</span>;
                            }
                            if (state.status === "error") {
                              return (
                                <button
                                  className="retry-pdf-btn"
                                  onClick={() => handleGenerateCertificate(row.partyRefNo!)}
                                  title={state.error}
                                  style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                                >
                                  <RefreshCw size={14} /> Retry
                                </button>
                              );
                            }
                            return (
                              <button
                                className="generate-pdf-btn"
                                onClick={() => handleGenerateCertificate(row.partyRefNo!)}
                                style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                              >
                                <FileText size={14} /> Generate PDF
                              </button>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="supply-table-footer">
                <div className="supply-footer-left">
                  <span>Rows per page:</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                  >
                    <SelectTrigger size="sm" className="supply-rows-select h-7 w-auto text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
