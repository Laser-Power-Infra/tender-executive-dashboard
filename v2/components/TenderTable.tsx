"use client";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { EpcTenderRecord, ManagementDecision, EMDExchangeMode } from "@/types/tender";
import { AttachmentModal } from "./AttachmentModal";
import { Search, X, ChevronUp, ChevronDown, ArrowUpDown, ChevronRight, BarChart3, FileSpreadsheet, Download, Paperclip, FileText, Pencil, Check, Circle, AlertTriangle } from "lucide-react";
import "./TenderTable.css";

const filesCache = new Map<string, any[]>();
const filesPromiseCache = new Map<string, Promise<any[]>>();

const fetchDocketFiles = (docketNo: string): Promise<any[]> => {
  if (filesCache.has(docketNo)) {
    return Promise.resolve(filesCache.get(docketNo)!);
  }
  if (filesPromiseCache.has(docketNo)) {
    return filesPromiseCache.get(docketNo)!;
  }
  const promise = fetch(`/api/tenders/${docketNo}/files`, {
    headers: {
      Authorization: "Bearer MOCK_TOKEN_LASERPOWER_SECURE_AUTH_SCOPE"
    }
  })
    .then(res => res.ok ? res.json() : { files: [] })
    .then(data => {
      const files = data.files || [];
      filesCache.set(docketNo, files);
      filesPromiseCache.delete(docketNo);
      return files;
    })
    .catch(() => {
      return [];
    });
  filesPromiseCache.set(docketNo, promise);
  return promise;
};

const matchesErpItemCategory = (itemName: string | undefined | null, category: string): boolean => {
  if (!itemName) return false;
  const lowerName = itemName.toLowerCase();
  const lowerCategory = category.toLowerCase();
  
  if (lowerCategory === "ab cable") {
    return lowerName.includes("ab cable") || lowerName.includes("ab cables");
  }
  if (lowerCategory === "conductor") {
    return lowerName.includes("conductor") || lowerName.includes("acsr") || lowerName.includes("aaac") || lowerName.includes("a.c.s.r.");
  }
  if (lowerCategory === "xlpe cable") {
    return lowerName.includes("xlpe") && !lowerName.includes("ab cable") && !lowerName.includes("ab cables");
  }
  if (lowerCategory === "pvc cable") {
    return lowerName.includes("pvc");
  }
  if (lowerCategory === "control cable") {
    return lowerName.includes("control") || lowerName.includes("instrumentation");
  }
  return false;
};

const FilesCell: React.FC<{
  docketNo: string;
  onOpenModal: (docket: string) => void;
}> = ({ docketNo, onOpenModal }) => {
  const [files, setFiles] = useState<any[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!docketNo || docketNo === "-") return;
    
    let isMounted = true;
    setLoading(true);
    fetchDocketFiles(docketNo).then(data => {
      if (isMounted) {
        setFiles(data);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [docketNo]);

  if (loading || !files || files.length === 0) {
    return null; // Empty
  }

  return (
    <button 
      className="table-attachment-btn" 
      onClick={() => onOpenModal(docketNo)}
      title="View files in folder"
      style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
    >
      <Paperclip size={14} /> {files.length} {files.length === 1 ? "File" : "Files"}
    </button>
  );
};

const BOQChartCell: React.FC<{
  docketNo: string;
}> = ({ docketNo }) => {
  const [boqFile, setBoqFile] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!docketNo || docketNo === "-") return;
    
    let isMounted = true;
    setLoading(true);
    fetchDocketFiles(docketNo).then(files => {
      if (isMounted) {
        const match = files.find(f => {
          const lower = f.filename.toLowerCase();
          return lower.includes("boqcomparativechart") || 
                 lower.includes("boq_comparative") || 
                 lower.includes("boq comparative");
        });
        setBoqFile(match || null);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [docketNo]);

  if (loading || !boqFile) {
    return null; // Empty
  }

  const handleDownload = () => {
    const token = "Bearer MOCK_TOKEN_LASERPOWER_SECURE_AUTH_SCOPE";
    window.open(`/api/files/download/${boqFile.fileId}?auth=${encodeURIComponent(token)}`, "_blank");
  };

  return (
    <button 
      className="table-boq-btn" 
      onClick={handleDownload}
      title={`Download ${boqFile.filename}`}
      style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
    >
      <BarChart3 size={14} /> Comparative Chart
    </button>
  );
};

interface TenderTableProps {
  records: EpcTenderRecord[];
  priceBasisFilter?: string;
  setPriceBasisFilter?: (val: string) => void;
  aluminiumMin?: string;
  setAluminiumMin?: (val: string) => void;
  aluminiumMax?: string;
  setAluminiumMax?: (val: string) => void;
  copperMin?: string;
  setCopperMin?: (val: string) => void;
  copperMax?: string;
  setCopperMax?: (val: string) => void;
  clearTrigger?: number;
}

interface ColumnDef {
  header: string;
  accessor: keyof EpcTenderRecord | "rawMaterials" | "files" | "boqChart";
  defaultWidth: number;
  align: "left" | "right" | "center";
  type: "string" | "number" | "date" | "boolean" | "percentage" | "currency" | "status" | "decision" | "custom";
}

export const TenderTable: React.FC<TenderTableProps> = ({ 
  records,
  priceBasisFilter,
  setPriceBasisFilter,
  aluminiumMin,
  setAluminiumMin,
  aluminiumMax,
  setAluminiumMax,
  copperMin,
  setCopperMin,
  copperMax,
  setCopperMax,
  clearTrigger
}) => {
  // 1. Column Definitions
  const columns: ColumnDef[] = [
    { header: "Docket No", accessor: "docketNo", defaultWidth: 120, align: "left", type: "string" },
    { header: "Last Date of Submission", accessor: "lastDateOfSubmission", defaultWidth: 200, align: "center", type: "date" },
    { header: "Client Name", accessor: "nameOfTheClient", defaultWidth: 200, align: "left", type: "string" },
    { header: "Tender / NIT No", accessor: "tenderNoNitNo", defaultWidth: 180, align: "left", type: "string" },
    { header: "Item Category", accessor: "itemCategory", defaultWidth: 150, align: "left", type: "string" },
    { header: "Proposed ERP Item Name", accessor: "proposedErpItemName", defaultWidth: 250, align: "left", type: "custom" },
    { header: "Proposed Qty", accessor: "proposedQty", defaultWidth: 120, align: "left", type: "custom" },
    { header: "Attachment", accessor: "attachmentUrl", defaultWidth: 115, align: "center", type: "string" },
    { header: "Files", accessor: "files", defaultWidth: 115, align: "center", type: "custom" },
    { header: "Comparative Chart", accessor: "boqChart", defaultWidth: 120, align: "center", type: "custom" },
    { header: "Type", accessor: "typeOfTender", defaultWidth: 100, align: "left", type: "string" },
    { header: "Price", accessor: "priceBasis", defaultWidth: 90, align: "center", type: "string" },
    { header: "Raw Materials", accessor: "rawMaterials", defaultWidth: 220, align: "center", type: "custom" },
    { header: "EMD Payment Mode", accessor: "emdPaymentMode", defaultWidth: 150, align: "center", type: "string" },
    { header: "BG / UTR No", accessor: "bgNoUtrNo", defaultWidth: 150, align: "left", type: "string" },
    { header: "BG Status", accessor: "bgStatus", defaultWidth: 110, align: "center", type: "string" },
    { header: "Current Status", accessor: "currentStatus", defaultWidth: 150, align: "center", type: "status" },
    { header: "Status Category", accessor: "statusCategory", defaultWidth: 150, align: "center", type: "string" },
    { header: "Mgmt Dec.", accessor: "managementDecision", defaultWidth: 100, align: "center", type: "decision" },
    { header: "Participated?", accessor: "participated", defaultWidth: 100, align: "center", type: "boolean" },
    { header: "Prep By", accessor: "tenderPrepareBy", defaultWidth: 120, align: "left", type: "string" },
    { header: "RA?", accessor: "reverseAuctionApplicable", defaultWidth: 60, align: "center", type: "boolean" },
    { header: "LOI / PO No.", accessor: "loiPoNoAndDate", defaultWidth: 150, align: "left", type: "string" },
    { header: "Diff L1 (%)", accessor: "diffPercentFromL1", defaultWidth: 110, align: "right", type: "custom" },
    { header: "Diff L2 (%)", accessor: "diffPercentFromL2", defaultWidth: 110, align: "right", type: "custom" },
    { header: "Competitors", accessor: "competitors", defaultWidth: 250, align: "left", type: "custom" },
    { header: "Remarks", accessor: "remarks", defaultWidth: 200, align: "left", type: "string" },
    { header: "Tender Update Status", accessor: "tenderUpdateStatus", defaultWidth: 150, align: "center", type: "custom" },
    { header: "Next Action", accessor: "nextAction", defaultWidth: 220, align: "left", type: "custom" },
  ];

  // 2. States
  const [overrides, setOverrides] = useState<Record<string, { tenderUpdateStatus?: string; nextAction?: string | null; reverseAuctionApplicable?: boolean | null; diffPercentFromL1?: number | null; diffPercentFromL2?: number | null }>>({});
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: "success" | "error" }>>([]);
  const [editingDiffCell, setEditingDiffCell] = useState<{ recordId: string; field: "diffPercentFromL1" | "diffPercentFromL2" } | null>(null);
  const [editingDiffValue, setEditingDiffValue] = useState<string>("");

  const showToast = (message: string, type: "success" | "error" = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const handleUpdate = async (record: EpcTenderRecord, field: "tenderUpdateStatus" | "nextAction" | "reverseAuctionApplicable", value: any) => {
    if (!record.id) {
      showToast("Database record ID is not found. Please refresh and try again.", "error");
      return;
    }
    const key = `${record.id}::${field}`;
    setSavingKeys(prev => ({ ...prev, [key]: true }));

    const previousValue = overrides[record.id]?.[field] !== undefined 
      ? overrides[record.id]?.[field] 
      : record[field as keyof EpcTenderRecord];

    setOverrides(prev => ({
      ...prev,
      [record.id!]: {
        ...prev[record.id!],
        [field]: value
      }
    }));

    try {
      const currentStatus = field === "tenderUpdateStatus" ? value : (overrides[record.id]?.tenderUpdateStatus ?? record.tenderUpdateStatus ?? "OPEN");
      const currentAction = field === "nextAction" ? value : (overrides[record.id]?.nextAction !== undefined ? overrides[record.id]?.nextAction : (record.nextAction ?? null));
      const currentRa = field === "reverseAuctionApplicable" ? value : (overrides[record.id]?.reverseAuctionApplicable !== undefined ? overrides[record.id]?.reverseAuctionApplicable : (record.reverseAuctionApplicable ?? false));

      const response = await fetch(`/api/tenders/${record.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tenderUpdateStatus: currentStatus,
          nextAction: currentAction,
          reverseAuctionApplicable: currentRa
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update tender");
      }

      showToast(`Tender ${record.docketNo} updated successfully!`, "success");
    } catch (err: any) {
      console.error(err);
      setOverrides(prev => ({
        ...prev,
        [record.id!]: {
          ...prev[record.id!],
          [field]: previousValue
        }
      }));
      showToast(err.message || "Failed to save tender updates. Reverting changes.", "error");
    } finally {
      setSavingKeys(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  /**
   * Saves a manually-entered Diff L1 or Diff L2 value to the database.
   * The user enters values in % units (e.g. "6.5" means 6.5%).
   * Values are stored as decimal fractions (0.065 = 6.5%) to match the import format.
   * Uses optimistic update: applies the change locally immediately, reverts on failure.
   */
  const handleDiffUpdate = async (
    record: EpcTenderRecord,
    field: "diffPercentFromL1" | "diffPercentFromL2",
    rawValue: string
  ) => {
    if (!record.id) {
      showToast("Database record ID not found. Please refresh and try again.", "error");
      return;
    }

    // User enters in % units — convert to decimal fraction for storage (e.g. 6.5 → 0.065)
    // Empty string means clear the value (null)
    const enteredPct = rawValue.trim() === "" ? null : parseFloat(rawValue);
    if (enteredPct !== null && isNaN(enteredPct)) {
      showToast("Please enter a valid number.", "error");
      return;
    }
    const parsedFraction = enteredPct === null ? null : parseFloat((enteredPct / 100).toFixed(6));

    // Retrieve the previous stored fraction value for rollback on failure
    const previousValue = overrides[record.id]?.[field] !== undefined
      ? overrides[record.id]![field]
      : (record[field as keyof EpcTenderRecord] as number | null);

    // Skip no-op saves (compare fractions)
    if (parsedFraction === previousValue) {
      setEditingDiffCell(null);
      return;
    }

    const key = `${record.id}::${field}`;
    setSavingKeys(prev => ({ ...prev, [key]: true }));

    // Optimistic update — store the fraction locally
    setOverrides(prev => ({
      ...prev,
      [record.id!]: { ...prev[record.id!], [field]: parsedFraction }
    }));
    setEditingDiffCell(null);

    const body: Record<string, number | null> = {};
    body[field] = parsedFraction;

    try {
      const response = await fetch(`/api/tenders/${record.id}/diff`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update diff value");
      }

      const label = field === "diffPercentFromL1" ? "Diff L1" : "Diff L2";
      showToast(`${label} for ${record.docketNo} saved!`, "success");
    } catch (err: any) {
      console.error(err);
      // Rollback on failure
      setOverrides(prev => ({
        ...prev,
        [record.id!]: { ...prev[record.id!], [field]: previousValue }
      }));
      showToast(err.message || "Failed to save diff value. Reverting.", "error");
    } finally {
      setSavingKeys(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  const [globalSearch, setGlobalSearch] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<keyof EpcTenderRecord | "rawMaterials" | "files" | "boqChart" | null>("lastDateOfSubmission");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(50);
  
  const [selectedDocketNo, setSelectedDocketNo] = useState<string>("");
  const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState<boolean>(false);
  const [statusHeaderFilter, setStatusHeaderFilter] = useState<string>("All");
  const [decisionHeaderFilter, setDecisionHeaderFilter] = useState<string>("All");
  const [emdPaymentHeaderFilter, setEmdPaymentHeaderFilter] = useState<string>("All");
  const [tenderForHeaderFilter, setTenderForHeaderFilter] = useState<string>("All");
  const [typeHeaderFilter, setTypeHeaderFilter] = useState<string>("All");
  const [prepareByHeaderFilter, setPrepareByHeaderFilter] = useState<string>("All");
  const [raHeaderFilter, setRaHeaderFilter] = useState<string>("All");
  const [participatedHeaderFilter, setParticipatedHeaderFilter] = useState<string>("All");
  const [statusCategoryHeaderFilter, setStatusCategoryHeaderFilter] = useState<string>("All");
  const [itemCategoryHeaderFilter, setItemCategoryHeaderFilter] = useState<string>("All");
  const [bgStatusHeaderFilter, setBgStatusHeaderFilter] = useState<string>("All");
  const [remarksTextFilter, setRemarksTextFilter] = useState<string>("");
  const [remarksDropdownFilter, setRemarksDropdownFilter] = useState<string>("All");
  const [proposedErpItemTextFilter, setProposedErpItemTextFilter] = useState<string>("");
  const [proposedErpItemCategoryFilter, setProposedErpItemCategoryFilter] = useState<string>("All");

  React.useEffect(() => {
    if (clearTrigger) {
      setGlobalSearch("");
      setStartDate("");
      setEndDate("");
      setStatusHeaderFilter("All");
      setDecisionHeaderFilter("All");
      setEmdPaymentHeaderFilter("All");
      setTenderForHeaderFilter("All");
      setTypeHeaderFilter("All");
      setPrepareByHeaderFilter("All");
      setRaHeaderFilter("All");
      setParticipatedHeaderFilter("All");
      setStatusCategoryHeaderFilter("All");
      setItemCategoryHeaderFilter("All");
      setBgStatusHeaderFilter("All");
      setRemarksTextFilter("");
      setRemarksDropdownFilter("All");
      setProposedErpItemTextFilter("");
      setProposedErpItemCategoryFilter("All");
      setCurrentPage(1);
    }
  }, [clearTrigger]);

  // Helper for cascading dependent filters

  // Helper for cascading dependent filters
  const getFilteredRecordsExcept = (excludeAccessor: string | null) => {
    let result = [...records];

    if (globalSearch.trim() !== "") {
      const searchLower = globalSearch.toLowerCase().trim();
      result = result.filter(record => {
        const docNo = record.docketNo || "";
        const client = record.nameOfTheClient || "";
        const nit = record.tenderNoNitNo || "";
        const category = record.itemCategory || "";
        const comps = record.competitors || "";
        return docNo.toLowerCase().includes(searchLower) ||
               client.toLowerCase().includes(searchLower) ||
               nit.toLowerCase().includes(searchLower) ||
               category.toLowerCase().includes(searchLower) ||
               comps.toLowerCase().includes(searchLower);
      });
    }

    if (startDate) {
      result = result.filter(record => record.lastDateOfSubmission && new Date(record.lastDateOfSubmission) >= new Date(startDate));
    }
    if (endDate) {
      result = result.filter(record => record.lastDateOfSubmission && new Date(record.lastDateOfSubmission) <= new Date(endDate));
    }

    if (excludeAccessor !== "currentStatus" && statusHeaderFilter !== "All") {
      result = result.filter(record => record.currentStatus === statusHeaderFilter);
    }
    if (excludeAccessor !== "managementDecision" && decisionHeaderFilter !== "All") {
      result = result.filter(record => record.managementDecision === decisionHeaderFilter);
    }
    if (excludeAccessor !== "emdPaymentMode" && emdPaymentHeaderFilter !== "All") {
      result = result.filter(record => record.emdPaymentMode === emdPaymentHeaderFilter);
    }
    if (excludeAccessor !== "tenderFor" && tenderForHeaderFilter !== "All") {
      result = result.filter(record => record.tenderFor === tenderForHeaderFilter);
    }
    if (excludeAccessor !== "typeOfTender" && typeHeaderFilter !== "All") {
      result = result.filter(record => record.typeOfTender === typeHeaderFilter);
    }
    if (excludeAccessor !== "tenderPrepareBy" && prepareByHeaderFilter !== "All") {
      if (prepareByHeaderFilter === "BLANK") {
        result = result.filter(record => !record.tenderPrepareBy || record.tenderPrepareBy.trim() === "");
      } else {
        result = result.filter(record => record.tenderPrepareBy === prepareByHeaderFilter);
      }
    }
    if (excludeAccessor !== "reverseAuctionApplicable" && raHeaderFilter !== "All") {
      const isRa = raHeaderFilter === "YES";
      result = result.filter(record => record.reverseAuctionApplicable === isRa);
    }
    if (excludeAccessor !== "participated" && participatedHeaderFilter !== "All") {
      if (participatedHeaderFilter === "BLANK") {
        result = result.filter(record => record.participated === null || record.participated === undefined);
      } else {
        const isPart = participatedHeaderFilter === "YES";
        result = result.filter(record => record.participated === isPart);
      }
    }
    if (excludeAccessor !== "statusCategory" && statusCategoryHeaderFilter !== "All") {
      if (statusCategoryHeaderFilter === "BLANK") {
        result = result.filter(record => !record.statusCategory || record.statusCategory.trim() === "");
      } else {
        result = result.filter(record => record.statusCategory === statusCategoryHeaderFilter);
      }
    }
    if (excludeAccessor !== "itemCategory" && itemCategoryHeaderFilter !== "All") {
      result = result.filter(record => record.itemCategory === itemCategoryHeaderFilter);
    }
    if (excludeAccessor !== "remarks" && remarksDropdownFilter !== "All") {
      result = result.filter(record => record.remarks === remarksDropdownFilter);
    }
    if (excludeAccessor !== "bgStatus" && bgStatusHeaderFilter !== "All") {
      if (bgStatusHeaderFilter === "BLANK") {
        result = result.filter(record => !record.bgStatus || record.bgStatus.trim() === "");
      } else {
        result = result.filter(record => record.bgStatus === bgStatusHeaderFilter);
      }
    }
    if (excludeAccessor !== "proposedErpItemName") {
      if (proposedErpItemCategoryFilter !== "All") {
        result = result.filter(record => matchesErpItemCategory(record.proposedErpItemName, proposedErpItemCategoryFilter));
      }
      if (proposedErpItemTextFilter.trim() !== "") {
        const searchLower = proposedErpItemTextFilter.toLowerCase().trim();
        result = result.filter(record => record.proposedErpItemName && record.proposedErpItemName.toLowerCase().includes(searchLower));
      }
    }

    return result;
  };

  const uniqueBgStatuses = useMemo(() => {
    const filtered = getFilteredRecordsExcept("bgStatus");
    const list = filtered
      .map(r => r.bgStatus)
      .filter((s): s is string => !!s && s.trim() !== "");
    return Array.from(new Set(list)).sort();
  }, [records, globalSearch, startDate, endDate, statusHeaderFilter, decisionHeaderFilter, emdPaymentHeaderFilter, tenderForHeaderFilter, typeHeaderFilter, prepareByHeaderFilter, raHeaderFilter, participatedHeaderFilter, statusCategoryHeaderFilter, itemCategoryHeaderFilter, remarksDropdownFilter, proposedErpItemTextFilter, proposedErpItemCategoryFilter]);

  const uniqueRemarks = useMemo(() => {
    const filtered = getFilteredRecordsExcept("remarks");
    const counts: Record<string, number> = {};
    filtered.forEach(r => {
      const val = r.remarks ? r.remarks.trim() : "";
      if (val) {
        counts[val] = (counts[val] || 0) + 1;
      }
    });
    return Object.keys(counts)
      .filter(key => counts[key] > 1)
      .sort();
  }, [records, globalSearch, startDate, endDate, statusHeaderFilter, decisionHeaderFilter, emdPaymentHeaderFilter, tenderForHeaderFilter, typeHeaderFilter, prepareByHeaderFilter, raHeaderFilter, participatedHeaderFilter, statusCategoryHeaderFilter, itemCategoryHeaderFilter, bgStatusHeaderFilter, proposedErpItemTextFilter, proposedErpItemCategoryFilter]);

  const uniqueStatuses = useMemo(() => {
    const filtered = getFilteredRecordsExcept("currentStatus");
    const statuses = filtered
      .map(r => r.currentStatus)
      .filter((s): s is string => !!s && s.trim() !== "");
    return Array.from(new Set(statuses)).sort();
  }, [records, globalSearch, startDate, endDate, decisionHeaderFilter, emdPaymentHeaderFilter, tenderForHeaderFilter, typeHeaderFilter, prepareByHeaderFilter, raHeaderFilter, participatedHeaderFilter, statusCategoryHeaderFilter, itemCategoryHeaderFilter, remarksDropdownFilter, bgStatusHeaderFilter, proposedErpItemTextFilter, proposedErpItemCategoryFilter]);

  const uniqueStatusCategories = useMemo(() => {
    const filtered = getFilteredRecordsExcept("statusCategory");
    const categories = filtered
      .map(r => r.statusCategory)
      .filter((s): s is string => !!s && s.trim() !== "");
    return Array.from(new Set(categories)).sort();
  }, [records, globalSearch, startDate, endDate, statusHeaderFilter, decisionHeaderFilter, emdPaymentHeaderFilter, tenderForHeaderFilter, typeHeaderFilter, prepareByHeaderFilter, raHeaderFilter, participatedHeaderFilter, itemCategoryHeaderFilter, remarksDropdownFilter, bgStatusHeaderFilter, proposedErpItemTextFilter, proposedErpItemCategoryFilter]);

  const uniqueEmdPaymentModes = useMemo(() => {
    const filtered = getFilteredRecordsExcept("emdPaymentMode");
    const modes = filtered
      .map(r => r.emdPaymentMode)
      .filter((m): m is EMDExchangeMode => m !== null && m !== undefined);
    return Array.from(new Set(modes)).sort();
  }, [records, globalSearch, startDate, endDate, statusHeaderFilter, decisionHeaderFilter, tenderForHeaderFilter, typeHeaderFilter, prepareByHeaderFilter, raHeaderFilter, participatedHeaderFilter, statusCategoryHeaderFilter, itemCategoryHeaderFilter, remarksDropdownFilter, bgStatusHeaderFilter, proposedErpItemTextFilter, proposedErpItemCategoryFilter]);

  const uniqueTenderFor = useMemo(() => {
    const filtered = getFilteredRecordsExcept("tenderFor");
    const list = filtered
      .map(r => r.tenderFor)
      .filter((s): s is string => !!s && s.trim() !== "");
    return Array.from(new Set(list)).sort();
  }, [records, globalSearch, startDate, endDate, statusHeaderFilter, decisionHeaderFilter, emdPaymentHeaderFilter, typeHeaderFilter, prepareByHeaderFilter, raHeaderFilter, participatedHeaderFilter, statusCategoryHeaderFilter, itemCategoryHeaderFilter, remarksDropdownFilter, bgStatusHeaderFilter, proposedErpItemTextFilter, proposedErpItemCategoryFilter]);

  const uniqueTypes = useMemo(() => {
    const filtered = getFilteredRecordsExcept("typeOfTender");
    const list = filtered
      .map(r => r.typeOfTender)
      .filter((s): s is string => !!s && s.trim() !== "");
    return Array.from(new Set(list)).sort();
  }, [records, globalSearch, startDate, endDate, statusHeaderFilter, decisionHeaderFilter, emdPaymentHeaderFilter, tenderForHeaderFilter, prepareByHeaderFilter, raHeaderFilter, participatedHeaderFilter, statusCategoryHeaderFilter, itemCategoryHeaderFilter, remarksDropdownFilter, bgStatusHeaderFilter, proposedErpItemTextFilter, proposedErpItemCategoryFilter]);

  const uniqueItemCategories = useMemo(() => {
    const filtered = getFilteredRecordsExcept("itemCategory");
    const list = filtered
      .map(r => r.itemCategory)
      .filter((s): s is string => !!s && s.trim() !== "");
    return Array.from(new Set(list)).sort();
  }, [records, globalSearch, startDate, endDate, statusHeaderFilter, decisionHeaderFilter, emdPaymentHeaderFilter, tenderForHeaderFilter, typeHeaderFilter, prepareByHeaderFilter, raHeaderFilter, participatedHeaderFilter, statusCategoryHeaderFilter, remarksDropdownFilter, bgStatusHeaderFilter, proposedErpItemTextFilter, proposedErpItemCategoryFilter]);

  const uniquePrepareBy = useMemo(() => {
    const filtered = getFilteredRecordsExcept("tenderPrepareBy");
    const list = filtered
      .map(r => r.tenderPrepareBy)
      .filter((s): s is string => !!s && s.trim() !== "");
    return Array.from(new Set(list)).sort();
  }, [records, globalSearch, startDate, endDate, statusHeaderFilter, decisionHeaderFilter, emdPaymentHeaderFilter, tenderForHeaderFilter, typeHeaderFilter, raHeaderFilter, participatedHeaderFilter, statusCategoryHeaderFilter, itemCategoryHeaderFilter, remarksDropdownFilter, bgStatusHeaderFilter, proposedErpItemTextFilter, proposedErpItemCategoryFilter]);

  const handleOpenAttachmentModal = (docketNo: string) => {
    setSelectedDocketNo(docketNo);
    setIsAttachmentModalOpen(true);
  };
  


  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const initialWidths: Record<string, number> = {};
    columns.forEach(col => {
      initialWidths[col.accessor] = col.defaultWidth;
    });
    return initialWidths;
  });

  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  
  // DOM Ref for scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Resize column state refs
  const resizingColumnRef = useRef<string | null>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  // 3. Draggable Column Resizing Handlers
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

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizingColumnRef.current) return;
    const diff = e.clientX - startXRef.current;
    const newWidth = Math.max(50, startWidthRef.current + diff); // Minimum width 50px
    setColumnWidths(prev => ({
      ...prev,
      [resizingColumnRef.current!]: newWidth
    }));
  };

  const handleResizeEnd = () => {
    resizingColumnRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "default";
  };

  // 4. Sorting Handler
  const handleSort = (column: keyof EpcTenderRecord | "rawMaterials" | "files" | "boqChart") => {
    if (column === "rawMaterials") return; // Skip sorting on custom rawMaterials column
    if (sortColumn === column) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  // Toggle Row Expansion
  const toggleRowExpansion = (slNo: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [slNo]: !prev[slNo]
    }));
  };

  // 5. Processing Data (Filtering & Sorting)
  const processedRecords = useMemo(() => {
    let result = [...records];

    // Global Text Search
    if (globalSearch.trim() !== "") {
      const searchLower = globalSearch.toLowerCase().trim();
      result = result.filter(record => {
        return (
          record.docketNo.toLowerCase().includes(searchLower) ||
          record.nameOfTheClient.toLowerCase().includes(searchLower) ||
          record.tenderNoNitNo.toLowerCase().includes(searchLower) ||
          record.tenderFor.toLowerCase().includes(searchLower) ||
          record.tenderPrepareBy.toLowerCase().includes(searchLower) ||
          record.currentStatus.toLowerCase().includes(searchLower) ||
          (record.itemCategory && record.itemCategory.toLowerCase().includes(searchLower)) ||
          (record.remarks && record.remarks.toLowerCase().includes(searchLower)) ||
          (record.competitors && record.competitors.toLowerCase().includes(searchLower)) ||
          (record.nameOfWorkDescription && record.nameOfWorkDescription.toLowerCase().includes(searchLower))
        );
      });
    }

    // Date Range Filter on lastDateOfSubmission
    if (startDate || endDate) {
      result = result.filter(record => {
        if (!record.lastDateOfSubmission) return false;
        const dateVal = record.lastDateOfSubmission;
        
        if (!(dateVal instanceof Date) || isNaN(dateVal.getTime())) {
          return false;
        }
        
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

    // Sorting
    if (sortColumn) {
      result.sort((a, b) => {
        if (sortColumn === "rawMaterials") return 0; // Skip sorting on rawMaterials custom virtual column
        
        let valA: any;
        let valB: any;

        if (sortColumn === "files") {
          valA = a.fileCount !== undefined ? a.fileCount : 0;
          valB = b.fileCount !== undefined ? b.fileCount : 0;
        } else if (sortColumn === "boqChart") {
          valA = a.hasBoqChart ? 1 : 0;
          valB = b.hasBoqChart ? 1 : 0;
        } else {
          valA = a[sortColumn as keyof EpcTenderRecord];
          valB = b[sortColumn as keyof EpcTenderRecord];
        }

        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return sortDirection === "asc" ? -1 : 1;
        if (valB === null || valB === undefined) return sortDirection === "asc" ? 1 : -1;

        if (valA instanceof Date && valB instanceof Date) {
          return sortDirection === "asc"
            ? valA.getTime() - valB.getTime()
            : valB.getTime() - valA.getTime();
        }

        if (typeof valA === "number" && typeof valB === "number") {
          return sortDirection === "asc" ? valA - valB : valB - valA;
        }

        // Default String compare
        return sortDirection === "asc"
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    // Column Status Header Filter
    if (statusHeaderFilter !== "All") {
      result = result.filter(record => record.currentStatus === statusHeaderFilter);
    }

    // Column Management Decision Header Filter
    if (decisionHeaderFilter !== "All") {
      result = result.filter(record => record.managementDecision === decisionHeaderFilter);
    }

    // Column EMD Payment Mode Header Filter
    if (emdPaymentHeaderFilter !== "All") {
      result = result.filter(record => record.emdPaymentMode === emdPaymentHeaderFilter);
    }

    // Column Tender For Header Filter
    if (tenderForHeaderFilter !== "All") {
      result = result.filter(record => record.tenderFor === tenderForHeaderFilter);
    }

    // Column Type Header Filter
    if (typeHeaderFilter !== "All") {
      result = result.filter(record => record.typeOfTender === typeHeaderFilter);
    }

    // Column Prepare By Header Filter
    if (prepareByHeaderFilter !== "All") {
      if (prepareByHeaderFilter === "BLANK") {
        result = result.filter(record => !record.tenderPrepareBy || record.tenderPrepareBy.trim() === "");
      } else {
        result = result.filter(record => record.tenderPrepareBy === prepareByHeaderFilter);
      }
    }

    // Column RA? Header Filter
    if (raHeaderFilter !== "All") {
      if (raHeaderFilter === "BLANK") {
        result = result.filter(record => record.reverseAuctionApplicable === null || record.reverseAuctionApplicable === undefined);
      } else {
        const isRa = raHeaderFilter === "YES";
        result = result.filter(record => record.reverseAuctionApplicable === isRa);
      }
    }

    // Column Participated? Header Filter
    if (participatedHeaderFilter !== "All") {
      if (participatedHeaderFilter === "BLANK") {
        result = result.filter(record => record.participated === null || record.participated === undefined);
      } else {
        const isPart = participatedHeaderFilter === "YES";
        result = result.filter(record => record.participated === isPart);
      }
    }

    // Column Status Category Header Filter
    if (statusCategoryHeaderFilter !== "All") {
      if (statusCategoryHeaderFilter === "BLANK") {
        result = result.filter(record => !record.statusCategory || record.statusCategory.trim() === "");
      } else {
        result = result.filter(record => record.statusCategory === statusCategoryHeaderFilter);
      }
    }

    // Column Item Category Header Filter
    if (itemCategoryHeaderFilter !== "All") {
      result = result.filter(record => record.itemCategory === itemCategoryHeaderFilter);
    }

    // Column BG Status Header Filter
    if (bgStatusHeaderFilter !== "All") {
      if (bgStatusHeaderFilter === "BLANK") {
        result = result.filter(record => !record.bgStatus || record.bgStatus.trim() === "");
      } else {
        result = result.filter(record => record.bgStatus === bgStatusHeaderFilter);
      }
    }

    // Column Remarks Header Filters
    if (remarksDropdownFilter !== "All") {
      result = result.filter(record => record.remarks === remarksDropdownFilter);
    }
    if (remarksTextFilter.trim() !== "") {
      const searchLower = remarksTextFilter.toLowerCase().trim();
      result = result.filter(record => record.remarks && record.remarks.toLowerCase().includes(searchLower));
    }

    // Proposed ERP Item Name Header Filters
    if (proposedErpItemCategoryFilter !== "All") {
      result = result.filter(record => matchesErpItemCategory(record.proposedErpItemName, proposedErpItemCategoryFilter));
    }
    if (proposedErpItemTextFilter.trim() !== "") {
      const searchLower = proposedErpItemTextFilter.toLowerCase().trim();
      result = result.filter(record => record.proposedErpItemName && record.proposedErpItemName.toLowerCase().includes(searchLower));
    }

    return result;
  }, [
    records, globalSearch, sortColumn, sortDirection, startDate, endDate, 
    statusHeaderFilter, decisionHeaderFilter, emdPaymentHeaderFilter,
    tenderForHeaderFilter, typeHeaderFilter, prepareByHeaderFilter, raHeaderFilter, participatedHeaderFilter,
    statusCategoryHeaderFilter, itemCategoryHeaderFilter, remarksTextFilter, remarksDropdownFilter, bgStatusHeaderFilter,
    proposedErpItemTextFilter, proposedErpItemCategoryFilter
  ]);

  // 6. Pagination Calculations
  const totalRecords = processedRecords.length;
  const totalPages = Math.ceil(totalRecords / rowsPerPage) || 1;
  
  // Adjust current page if out of bounds
  const activePage = Math.min(currentPage, totalPages);
  
  const paginatedRecords = useMemo(() => {
    const startIndex = (activePage - 1) * rowsPerPage;
    return processedRecords.slice(startIndex, startIndex + rowsPerPage);
  }, [processedRecords, activePage, rowsPerPage]);

  // Reset page when search, date filters, or row limit changes
  useEffect(() => {
    setCurrentPage(1);
  }, [globalSearch, rowsPerPage, startDate, endDate]);

  // 7. Scrolling is managed natively by the browser's layout engine

  // 8. Export Data Exporters
  const getCSVData = () => {
    const headers = columns.map(c => c.header).join(",");
    const rows = processedRecords.map(rec => {
      return columns.map(col => {
        let val: any;
        if (col.accessor === "rawMaterials") {
          const activeRates = [
            { label: "Alu", price: rec.aluminiumPrice },
            { label: "Al Alloy", price: rec.aluminiumAlloyPrice },
            { label: "Cu", price: rec.copperTapePrice },
            { label: "Semicon", price: rec.extrudedSemiconductivePrice },
            { label: "XLPE", price: rec.htXlpePrice },
            { label: "ST-2", price: rec.pvcTypeSt2Price },
            { label: "Steel", price: rec.galvanisedSteelFlatStripPrice },
            { label: "Filler", price: rec.fillerPrice }
          ].filter(m => m.price !== null && m.price !== undefined && m.price !== 0);
          val = activeRates.map(m => `${m.label}: ₹${m.price}`).join(" | ");
        } else {
          val = rec[col.accessor as keyof EpcTenderRecord];
        }
        if (val === null || val === undefined) return "";
        if (val instanceof Date) return val.toLocaleDateString("en-GB");
        
        // Escape quotes
        let strVal = String(val);
        if (strVal.includes(",") || strVal.includes('"') || strVal.includes("\n")) {
          strVal = `"${strVal.replace(/"/g, '""')}"`;
        }
        return strVal;
      }).join(",");
    });
    return [headers, ...rows].join("\n");
  };

  const handleExportCSV = () => {
    const csvContent = getCSVData();
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Tender_Participation_Data_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    // Generates a well-formed HTML Table formatted spreadsheet that Microsoft Excel parses cleanly
    const tableHeader = columns.map(c => `<th style="background-color:#0a2540;color:#ffffff;font-weight:bold;">${c.header}</th>`).join("");
    const tableRows = processedRecords.map(rec => {
      const cells = columns.map(col => {
        let val: any;
        if (col.accessor === "rawMaterials") {
          const activeRates = [
            { label: "Al", price: rec.aluminiumPrice },
            { label: "Al Alloy", price: rec.aluminiumAlloyPrice },
            { label: "Cu", price: rec.copperTapePrice },
            { label: "Semicon", price: rec.extrudedSemiconductivePrice },
            { label: "XLPE", price: rec.htXlpePrice },
            { label: "ST-2", price: rec.pvcTypeSt2Price },
            { label: "Steel", price: rec.galvanisedSteelFlatStripPrice },
            { label: "Filler", price: rec.fillerPrice }
          ].filter(m => m.price !== null && m.price !== undefined && m.price !== 0);
          val = activeRates.map(m => `${m.label}: ${m.price}`).join(" | ");
        } else {
          val = rec[col.accessor as keyof EpcTenderRecord];
        }
        if (val === null || val === undefined) return "<td></td>";
        if (val instanceof Date) return `<td>${val.toLocaleDateString("en-GB")}</td>`;
        if (col.type === "currency") return `<td style="text-align:right;">${val}</td>`;
        if (col.type === "percentage") return `<td style="text-align:right;">${((val as number) * 100).toFixed(1)}%</td>`;
        return `<td>${String(val)}</td>`;
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
                <x:Name>Tenders</x:Name>
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
        <table border="1">
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
    link.setAttribute("download", `Tender_Participation_Data_${new Date().toISOString().split('T')[0]}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Formatting Helper Utilities
  const formatCurrency = (val: number | null): string => {
    if (val === null) return "-";
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(val);
  };

  const formatDate = (val: Date | null): string => {
    if (!val) return "-";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d = new Date(val);
    const day = String(d.getDate()).padStart(2, "0");
    const month = months[d.getMonth()];
    const year = String(d.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  };

  const formatPercentage = (val: number | null): string => {
    if (val === null) return "-";
    const prefix = val > 0 ? "+" : "";
    return `${prefix}${(val * 100).toFixed(1)}%`;
  };

  const getStatusClass = (status: string): string => {
    if (!status) return "submitted";
    const lower = status.toLowerCase();
    if (
      lower.includes("awarded") || 
      lower.includes("won") || 
      lower.includes("l1") || 
      lower.includes("po received") || 
      lower.includes("loi received")
    ) {
      return "won";
    }
    if (
      lower.includes("not in our favour") || 
      lower.includes("lost") || 
      lower.includes("l2") || 
      lower.includes("l3") ||
      lower.includes("rejected") ||
      lower.includes("not participated")
    ) {
      return "lost";
    }
    if (
      lower.includes("technical bid opened") || 
      lower.includes("financial evaluation") || 
      lower.includes("under evaluation") || 
      lower.includes("not evaluated") ||
      lower.includes("evaluation") ||
      lower.includes("date extended") ||
      lower.includes("submitted") ||
      lower.includes("tender opened")
    ) {
      return "eval";
    }
    if (
      lower.includes("ra pending") || 
      lower.includes("reverse auction") ||
      lower.includes("ra scheduled")
    ) {
      return "loi";
    }
    if (lower.includes("cancelled") || lower.includes("canceled")) {
      return "lost";
    }
    return "submitted"; // Default style
  };



  const getDecisionClass = (decision: ManagementDecision): string => {
    switch (decision) {
      case ManagementDecision.GO: return "go";
      case ManagementDecision.NO_GO: return "nogo";
      default: return "";
    }
  };

  return (
    <div className="tender-table-container">
      {/* 9. Header Toolbar */}
      <div className="tender-table-toolbar">
        <div className="toolbar-left">
          <h2 className="table-title">Master Tender Participation Tracker</h2>
          <span className="record-count-badge">{totalRecords} Records Total</span>
          <div className="global-search-container">
            <span className="search-icon" style={{ display: "inline-flex", alignItems: "center" }}><Search size={16} /></span>
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
          <button className="export-btn" onClick={handleExportCSV} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Download size={14} /> Export CSV
          </button>
          <button className="export-btn" onClick={handleExportExcel} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <FileSpreadsheet size={14} /> Export Excel
          </button>
        </div>
      </div>

      {/* 10. Data Table Grid */}
      <div 
        className="tender-table-wrapper" 
        ref={scrollContainerRef}
      >
        <table className="tender-data-table">
          <thead>
            <tr>
              {[<th key="expand" style={{ width: "40px" }} className="col-center"></th>,
              ...columns.map(col => (
                <th
                  key={col.accessor}
                  style={{ width: `${columnWidths[col.accessor]}px` }}
                >
                  <div className="header-content" onClick={() => handleSort(col.accessor)}>
                    <span>{col.header}</span>
                    {sortColumn === col.accessor && (
                      <span className="sort-indicator" style={{ display: "inline-flex", alignItems: "center" }}>
                        {sortDirection === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </span>
                    )}
                  </div>
                  {col.accessor === "lastDateOfSubmission" && (
                    <div 
                      className="column-date-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="date"
                        className="date-filter-input"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        title="Start Date"
                      />
                      <span className="date-filter-to">to</span>
                      <input
                        type="date"
                        className="date-filter-input"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        title="End Date"
                      />
                      {(startDate || endDate) && (
                        <button
                          className="date-filter-clear-btn"
                          onClick={() => {
                            setStartDate("");
                            setEndDate("");
                          }}
                          title="Clear date filter"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  )}
                  {col.accessor === "priceBasis" && setPriceBasisFilter && (
                    <div 
                      className="column-price-basis-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <select
                        className="price-basis-filter-select"
                        value={priceBasisFilter || "All"}
                        onChange={(e) => setPriceBasisFilter(e.target.value)}
                      >
                        <option value="All">All</option>
                        <option value="Firm">Firm</option>
                        <option value="Variable">Variable</option>
                      </select>
                    </div>
                  )}
                  {col.accessor === "bgStatus" && (
                    <div 
                      className="column-bg-status-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <select
                        className="bg-status-filter-select"
                        value={bgStatusHeaderFilter}
                        onChange={(e) => {
                          setBgStatusHeaderFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      >
                        <option value="All">All</option>
                        <option value="BLANK">(Blank)</option>
                        {uniqueBgStatuses.map(s => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {col.accessor === "currentStatus" && (
                    <div 
                      className="column-status-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <select
                        className="status-filter-select"
                        value={statusHeaderFilter}
                        onChange={(e) => {
                          setStatusHeaderFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      >
                        <option value="All">All Statuses</option>
                        {uniqueStatuses.map(status => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {col.accessor === "statusCategory" && (
                    <div 
                      className="column-status-category-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <select
                        className="status-category-filter-select"
                        value={statusCategoryHeaderFilter}
                        onChange={(e) => {
                          setStatusCategoryHeaderFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      >
                        <option value="All">All Categories</option>
                        <option value="BLANK">(Blank)</option>
                        {uniqueStatusCategories.map(cat => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {col.accessor === "managementDecision" && (
                    <div 
                      className="column-decision-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <select
                        className="decision-filter-select"
                        value={decisionHeaderFilter}
                        onChange={(e) => {
                          setDecisionHeaderFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      >
                        <option value="All">All</option>
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                      </select>
                    </div>
                  )}
                  {col.accessor === "emdPaymentMode" && (
                    <div 
                      className="column-emd-payment-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <select
                        className="emd-payment-filter-select"
                        value={emdPaymentHeaderFilter}
                        onChange={(e) => {
                          setEmdPaymentHeaderFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      >
                        <option value="All">All</option>
                        {uniqueEmdPaymentModes.map(mode => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {col.accessor === "tenderFor" && (
                    <div 
                      className="column-tender-for-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <select
                        className="tender-for-filter-select"
                        value={tenderForHeaderFilter}
                        onChange={(e) => {
                          setTenderForHeaderFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      >
                        <option value="All">All</option>
                        {uniqueTenderFor.map(tf => (
                          <option key={tf} value={tf}>
                            {tf}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {col.accessor === "itemCategory" && (
                    <div 
                      className="column-item-category-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <select
                        className="item-category-filter-select"
                        value={itemCategoryHeaderFilter}
                        onChange={(e) => {
                          setItemCategoryHeaderFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      >
                        <option value="All">All</option>
                        {uniqueItemCategories.map(ic => (
                          <option key={ic} value={ic}>
                            {ic}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {col.accessor === "proposedErpItemName" && (
                    <div 
                      className="column-remarks-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{ marginTop: "4px" }}
                    >
                      <input
                        type="text"
                        className="remarks-search-input"
                        placeholder="Search items..."
                        value={proposedErpItemTextFilter}
                        onChange={(e) => {
                          setProposedErpItemTextFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      />
                      <select
                        className="remarks-filter-select"
                        style={{ marginTop: "4px", width: "100%" }}
                        value={proposedErpItemCategoryFilter}
                        onChange={(e) => {
                          setProposedErpItemCategoryFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      >
                        <option value="All">All Categories</option>
                        <option value="AB Cable">AB Cable</option>
                        <option value="Conductor">Conductor</option>
                        <option value="XLPE Cable">XLPE Cable</option>
                        <option value="PVC Cable">PVC Cable</option>
                        <option value="Control Cable">Control Cable</option>
                      </select>
                    </div>
                  )}
                  {col.accessor === "typeOfTender" && (
                    <div 
                      className="column-type-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <select
                        className="type-filter-select"
                        value={typeHeaderFilter}
                        onChange={(e) => {
                          setTypeHeaderFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      >
                        <option value="All">All</option>
                        {uniqueTypes.map(t => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {col.accessor === "tenderPrepareBy" && (
                    <div 
                      className="column-prepare-by-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <select
                        className="prepare-by-filter-select"
                        value={prepareByHeaderFilter}
                        onChange={(e) => {
                          setPrepareByHeaderFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      >
                        <option value="All">All</option>
                        <option value="BLANK">(Blank)</option>
                        {uniquePrepareBy.map(p => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {col.accessor === "reverseAuctionApplicable" && (
                    <div 
                      className="column-ra-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <select
                        className="ra-filter-select"
                        value={raHeaderFilter}
                        onChange={(e) => {
                          setRaHeaderFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      >
                        <option value="All">All</option>
                        <option value="BLANK">(Blank)</option>
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                      </select>
                    </div>
                  )}
                  {col.accessor === "participated" && (
                    <div 
                      className="column-participated-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <select
                        className="participated-filter-select"
                        value={participatedHeaderFilter}
                        onChange={(e) => {
                          setParticipatedHeaderFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      >
                        <option value="All">All</option>
                        <option value="BLANK">(Blank)</option>
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                      </select>
                    </div>
                  )}
                  {col.accessor === "rawMaterials" && setAluminiumMin && setAluminiumMax && setCopperMin && setCopperMax && (
                    <div 
                      className="column-raw-materials-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div className="filter-row">
                        <span className="filter-row-label">Al:</span>
                        <input
                          type="number"
                          placeholder="Min"
                          className="col-price-filter-input"
                          value={aluminiumMin || ""}
                          onChange={(e) => setAluminiumMin(e.target.value)}
                          title="Aluminium Min"
                        />
                        <span className="filter-row-dash">-</span>
                        <input
                          type="number"
                          placeholder="Max"
                          className="col-price-filter-input"
                          value={aluminiumMax || ""}
                          onChange={(e) => setAluminiumMax(e.target.value)}
                          title="Aluminium Max"
                        />
                      </div>
                      <div className="filter-row" style={{ marginTop: "4px" }}>
                        <span className="filter-row-label">Cu:</span>
                        <input
                          type="number"
                          placeholder="Min"
                          className="col-price-filter-input"
                          value={copperMin || ""}
                          onChange={(e) => setCopperMin(e.target.value)}
                          title="Copper Min"
                        />
                        <span className="filter-row-dash">-</span>
                        <input
                          type="number"
                          placeholder="Max"
                          className="col-price-filter-input"
                          value={copperMax || ""}
                          onChange={(e) => setCopperMax(e.target.value)}
                          title="Copper Max"
                        />
                      </div>
                    </div>
                  )}
                  {col.accessor === "remarks" && (
                    <div 
                      className="column-remarks-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{ marginTop: "4px" }}
                    >
                      <input
                        type="text"
                        className="remarks-search-input"
                        placeholder="Search remarks..."
                        value={remarksTextFilter}
                        onChange={(e) => {
                          setRemarksTextFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      />
                      <select
                        className="remarks-filter-select"
                        style={{ marginTop: "4px", width: "100%" }}
                        value={remarksDropdownFilter}
                        onChange={(e) => {
                          setRemarksDropdownFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                      >
                        <option value="All">All Remarks</option>
                        {uniqueRemarks.map(rem => (
                          <option key={rem} value={rem}>
                            {rem}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div
                    className="column-resizer"
                    onMouseDown={(e) => handleResizeStart(e, col.accessor, columnWidths[col.accessor])}
                  />
                </th>
              ))]}
            </tr>
          </thead>
          <tbody>
            {paginatedRecords.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} style={{ textAlign: "center", padding: "40px", color: "rgba(0,0,0,0.4)" }}>
                  No matching records found.
                </td>
              </tr>
            ) : (
              paginatedRecords.map((record) => {
                const isExpanded = !!expandedRows[record.slNo];
                


                return (
                  <React.Fragment key={record.id ?? record.slNo}>
                    {/* Collapsed Primary Row */}
                    <tr className={`tender-row ${isExpanded ? "expanded-row" : ""}`}>
                      <td className="col-center">
                        <button 
                          className="details-link"
                          onClick={() => toggleRowExpansion(record.slNo)}
                          style={{ display: "inline-flex", alignItems: "center" }}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      
                      {columns.map(col => {
                        let cellVal: any;
                        let cellContent: React.ReactNode = "-";
                        let cellClass = "";

                        if (col.accessor === "rawMaterials") {
                          const activeRates = [
                            { label: "Al", price: record.aluminiumPrice },
                            { label: "Al Alloy", price: record.aluminiumAlloyPrice },
                            { label: "Cu", price: record.copperTapePrice },
                            { label: "Semicon", price: record.extrudedSemiconductivePrice },
                            { label: "XLPE", price: record.htXlpePrice },
                            { label: "ST-2", price: record.pvcTypeSt2Price },
                            { label: "Steel", price: record.galvanisedSteelFlatStripPrice },
                            { label: "Filler", price: record.fillerPrice }
                          ].filter(m => m.price !== null && m.price !== undefined && m.price !== 0);

                          cellContent = activeRates.length > 0 ? (
                            <div className="raw-materials-grid">
                              {activeRates.map(m => (
                                <div className="material-rate-tag" key={m.label} title={`${m.label}: ₹${m.price}/kg`}>
                                  <span className="mat-lbl">{m.label}:</span>
                                  <span className="mat-val">₹{m.price}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="no-rates-placeholder">-</span>
                          );
                          cellClass = "col-raw-materials";
                        } else if (col.accessor === "files") {
                          cellContent = (
                            <FilesCell 
                              docketNo={record.docketNo} 
                              onOpenModal={handleOpenAttachmentModal} 
                            />
                          );
                          cellClass = "col-center";
                        } else if (col.accessor === "boqChart") {
                          cellContent = (
                            <BOQChartCell 
                              docketNo={record.docketNo} 
                            />
                          );
                          cellClass = "col-center";
                        } else if (col.accessor === "proposedErpItemName" || col.accessor === "proposedQty") {
                          const text = (record[col.accessor as keyof EpcTenderRecord] as string) || "";
                          cellContent = text ? (
                            <div className="proposed-items-cell-content">
                              {text}
                            </div>
                          ) : (
                            <span>-</span>
                          );
                          cellClass = "col-left text-pre-line";
                        } else if (col.accessor === "diffPercentFromL1" || col.accessor === "diffPercentFromL2") {
                          const diffField = col.accessor as "diffPercentFromL1" | "diffPercentFromL2";
                          const isSaving = !!savingKeys[`${record.id}::${diffField}`];
                          const isEditing = editingDiffCell?.recordId === record.id && editingDiffCell?.field === diffField;

                          // Resolve current stored fraction (e.g. 0.065 = 6.5%). Normalise undefined → null.
                          const currentVal: number | null = (
                            overrides[record.id!]?.[diffField] !== undefined
                              ? overrides[record.id!]![diffField]
                              : (record[diffField] as number | null)
                          ) ?? null;

                          // Display value in % units — multiply by 100 to match formatPercentage
                          const pctVal = currentVal !== null ? parseFloat((currentVal * 100).toFixed(4)) : null;

                          if (isEditing) {
                            cellContent = (
                              <div className="diff-edit-wrapper">
                                {/* ± toggle button to flip the sign */}
                                <button
                                  type="button"
                                  className="diff-sign-toggle"
                                  title="Toggle positive / negative"
                                  onMouseDown={e => {
                                    // Use mousedown so it fires before input blur
                                    e.preventDefault();
                                    setEditingDiffValue(prev => {
                                      if (prev.trim() === "" || prev.trim() === "-") return prev;
                                      return prev.startsWith("-") ? prev.slice(1) : "-" + prev;
                                    });
                                  }}
                                >
                                  ±
                                </button>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="diff-edit-input"
                                  value={editingDiffValue}
                                  autoFocus
                                  placeholder="e.g. -6.5"
                                  onChange={e => setEditingDiffValue(e.target.value)}
                                  onBlur={() => handleDiffUpdate(record, diffField, editingDiffValue)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleDiffUpdate(record, diffField, editingDiffValue);
                                    } else if (e.key === "Escape") {
                                      setEditingDiffCell(null);
                                    }
                                  }}
                                />
                              </div>
                            );
                          } else {
                            // Format: match formatPercentage — val*100 with 1 decimal place, + prefix for positives
                            const displayVal = pctVal !== null
                              ? `${pctVal >= 0 ? "+" : ""}${pctVal.toFixed(1)}%`
                              : "—";
                            cellContent = (
                              <div
                                className={`diff-cell-display ${isSaving ? "diff-saving" : ""} ${pctVal !== null && pctVal < 0 ? "diff-negative" : pctVal !== null ? "diff-positive" : ""}`}
                                title={!record.id ? "No DB record ID — refresh to enable editing" : `Click to edit (enter value in % e.g. ${pctVal !== null ? pctVal.toFixed(1) : "6.5"})`}
                                onClick={() => {
                                  if (!record.id || isSaving) return;
                                  setEditingDiffCell({ recordId: record.id, field: diffField });
                                  // Seed input in % units, rounded to 4 decimal places to avoid float noise
                                  setEditingDiffValue(pctVal !== null ? String(pctVal) : "");
                                }}
                              >
                                <span className="diff-value-text">{isSaving ? "…" : displayVal}</span>
                                {!isSaving && record.id && <span className="diff-edit-pencil" aria-hidden="true"><Pencil size={12} /></span>}
                              </div>
                            );
                          }
                          cellClass = `col-right col-editable diff-col ${pctVal !== null && pctVal < 0 ? "col-lost" : ""}`;
                        } else if (col.accessor === "competitors") {
                          const text = (record[col.accessor as keyof EpcTenderRecord] as string) || "";
                          cellContent = text ? (
                            <div className="competitors-scroll-cell">
                              {text}
                            </div>
                          ) : (
                            <span>-</span>
                          );
                          cellClass = "col-left";
                        } else if (col.accessor === "remarks") {
                          const text = (record[col.accessor as keyof EpcTenderRecord] as string) || "";
                          cellContent = text ? (
                            <div className="remarks-scroll-cell">
                              {text}
                            </div>
                          ) : (
                            <span>-</span>
                          );
                          cellClass = "col-left";
                        } else if (col.accessor === "tenderUpdateStatus") {
                          const statusValue = overrides[record.id!]?.tenderUpdateStatus ?? record.tenderUpdateStatus ?? "OPEN";
                          const isSaving = !!savingKeys[`${record.id}::tenderUpdateStatus`];
                          cellContent = (
                            <select
                              value={statusValue}
                              disabled={isSaving}
                              onChange={(e) => handleUpdate(record, "tenderUpdateStatus", e.target.value)}
                              className="table-editable-select status-select"
                            >
                              <option value="OPEN">Open</option>
                              <option value="CLOSED">Closed</option>
                            </select>
                          );
                          cellClass = "col-center col-editable";
                        } else if (col.accessor === "nextAction") {
                          const actionValue = overrides[record.id!]?.nextAction !== undefined 
                            ? overrides[record.id!]?.nextAction 
                            : (record.nextAction ?? "");
                          const isSaving = !!savingKeys[`${record.id}::nextAction`];
                          cellContent = (
                            <select
                              value={actionValue || ""}
                              disabled={isSaving}
                              onChange={(e) => handleUpdate(record, "nextAction", e.target.value || null)}
                              className="table-editable-select action-select"
                            >
                              <option value="">None</option>
                              <option value="UPDATE_FROM_AB_LETTER">Update from AB letter</option>
                              <option value="BG_REFUND_LETTER_TO_BE_SENT">BG refund letter to be sent</option>
                              <option value="FOLLOW_UP_FOR_FINANCIAL_STATUS">Follow up for financial status</option>
                              <option value="REVERSE_AUCTION_PENDING">Reverse auction pending</option>
                            </select>
                          );
                          cellClass = "col-left col-editable";
                        } else {
                          cellVal = record[col.accessor as keyof EpcTenderRecord];
                          
                          if (col.accessor === "attachmentUrl") {
                            const url = cellVal as string | null;
                            cellContent = url ? (
                              <a 
                                href={url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="table-attachment-link"
                                title="Click to view costing attachment"
                                style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                              >
                                <FileText size={14} /> Costing
                              </a>
                          ) : "-";
                          cellClass = "col-center";
                        } else if (col.accessor === "priceBasis") {
                            const basis = (cellVal as string) || "Firm";
                            cellContent = (
                              <span className={`price-basis-badge ${basis.toLowerCase().includes("variable") ? "variable" : "firm"}`}>
                                {basis}
                              </span>
                            );
                            cellClass = "col-center";
                          } else if (col.type === "currency") {
                            cellContent = formatCurrency(cellVal as number | null);
                            cellClass = "col-currency";
                          } else if (col.type === "percentage") {
                            cellContent = formatPercentage(cellVal as number | null);
                            cellClass = "col-percentage";
                            if (cellVal !== null) {
                              cellClass += (cellVal as number) < 0 ? " col-lost" : ""; // Optional text highlight
                            }
                          } else if (col.type === "date") {
                            cellContent = formatDate(cellVal as Date | null);
                                               } else if (col.type === "boolean") {
                            if (col.accessor === "reverseAuctionApplicable") {
                              const raVal = overrides[record.id!]?.reverseAuctionApplicable !== undefined
                                ? overrides[record.id!]?.reverseAuctionApplicable
                                : record.reverseAuctionApplicable;
                              const isSaving = !!savingKeys[`${record.id}::reverseAuctionApplicable`];
                              
                              let selectVal = "BLANK";
                              if (raVal === true) selectVal = "YES";
                              else if (raVal === false) selectVal = "NO";

                              cellContent = (
                                <select
                                  value={selectVal}
                                  disabled={isSaving}
                                  onChange={(e) => {
                                    const val = e.target.value === "YES" ? true : e.target.value === "NO" ? false : null;
                                    handleUpdate(record, "reverseAuctionApplicable", val);
                                  }}
                                  className="table-editable-select status-select"
                                  style={{ minWidth: "60px", padding: "2px 4px", fontSize: "11px" }}
                                >
                                  <option value="BLANK">(Blank)</option>
                                  <option value="YES">Yes</option>
                                  <option value="NO">No</option>
                                </select>
                              );
                              cellClass = "col-center col-editable";
                            } else {
                              const isApp = cellVal as boolean | null;
                              cellContent = isApp === null || isApp === undefined ? (
                                <span className="ra-icon not-applicable">-</span>
                              ) : (
                                <span className={`ra-icon ${isApp ? "applicable" : "not-applicable"}`}>
                                  {isApp ? <Check size={14} /> : <Circle size={14} />}
                                </span>
                              );
                              cellClass = "col-center";
                            }
                          } else if (col.type === "status") {
                            const statusVal = (cellVal as string) || "";
                            cellContent = statusVal ? (
                              <span className={`status-badge ${getStatusClass(statusVal)}`}>
                                {statusVal}
                              </span>
                            ) : (
                              <span>-</span>
                            );
                            cellClass = "col-center";
                          } else if (col.type === "decision") {
                            const decVal = cellVal as ManagementDecision;
                            cellContent = (
                              <span className={`decision-badge ${getDecisionClass(decVal)}`}>
                                {decVal}
                              </span>
                            );
                            cellClass = "col-center";
                          } else {
                            if (col.accessor === "bgStatus") {
                              const val = cellVal as string || "";
                              cellContent = val ? (
                                <span className={`bg-status-badge ${val.toLowerCase()}`}>
                                  {val}
                                </span>
                              ) : "-";
                              cellClass = "col-center";
                            } else {
                              cellContent = cellVal !== null && cellVal !== undefined ? String(cellVal) : "-";
                              if (col.accessor === "docketNo") {
                                cellClass = "col-docket";
                              }
                            }
                          }
                        }

                        return (
                          <td 
                            key={col.accessor}
                            className={cellClass}
                            style={{ width: `${columnWidths[col.accessor]}px` }}
                            title={col.accessor !== "rawMaterials" && col.type !== "boolean" && cellVal !== null && cellVal !== undefined ? String(cellVal) : undefined}
                          >
                            {cellContent}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Expandable Details Row */}
                    {isExpanded && (
                      <tr className="details-panel-row">
                        <td colSpan={columns.length + 1}>
                          <div className="details-panel-content">
                            <div className="details-grid">
                              {/* 1. Name of Work / Item Description */}
                              <div className="details-item span-full">
                                <span className="details-label">Name of Work / Item Description</span>
                                <span className="details-value">{record.nameOfWorkDescription}</span>
                              </div>

                              {/* 2. Total Quantity in Meter */}
                              <div className="details-item">
                                <span className="details-label">Total Quantity (in Meters)</span>
                                <span className="details-value">
                                  {record.totalQuantityMeter !== null && record.totalQuantityMeter !== undefined 
                                    ? new Intl.NumberFormat("en-IN").format(record.totalQuantityMeter) 
                                    : "-"}
                                </span>
                              </div>

                              {/* 3. Bid Validity */}
                              <div className="details-item">
                                <span className="details-label">Bid Validity</span>
                                <span className="details-value">
                                  {record.bidValidityDays !== null ? `${record.bidValidityDays} Days` : "-"}
                                </span>
                              </div>

                              {/* 4. Contract Period in Days */}
                              <div className="details-item">
                                <span className="details-label">Contract Period</span>
                                <span className="details-value">
                                  {record.contractPeriodDays !== null ? `${record.contractPeriodDays} Days` : "-"}
                                </span>
                              </div>

                              {/* 5. Cost of Tender / Tender Fee (In Rs) */}
                              <div className="details-item">
                                <span className="details-label">Tender Fee / Cost</span>
                                <span className="details-value">
                                  {record.costOfTenderFeeRs !== null ? `₹ ${formatCurrency(record.costOfTenderFeeRs)}` : "-"}
                                </span>
                              </div>

                              {/* 6. EMD Payment Through BG / NEFT */}
                              <div className="details-item">
                                <span className="details-label">EMD Payment Mode</span>
                                <span className="details-value">{record.emdPaymentMode || "-"}</span>
                              </div>

                              {/* 7. BG No / UTR No */}
                              <div className="details-item">
                                <span className="details-label">BG No / UTR No</span>
                                <span className="details-value">{record.bgNoUtrNo || "-"}</span>
                              </div>

                              {/* 8. EMD Validity */}
                              <div className="details-item">
                                <span className="details-label">EMD Validity Date</span>
                                <span className="details-value">{formatDate(record.emdValidity)}</span>
                              </div>

                              {/* 9. Remarks */}
                              <div className="details-item span-full">
                                <span className="details-label">Remarks</span>
                                <span className="details-value">{record.remarks || "-"}</span>
                              </div>

                              {/* 10. Final Remarks */}
                              <div className="details-item span-full">
                                <span className="details-label">Final Remarks</span>
                                <span className="details-value">{record.finalRemarks || "-"}</span>
                              </div>

                              {/* 11. Costing Attachment Link */}
                              {record.attachmentUrl && (
                                <div className="details-item span-full">
                                  <span className="details-label">Costing Attachment</span>
                                  <span className="details-value" style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start", marginTop: "6px" }}>
                                    <a 
                                      href={record.attachmentUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="costing-attachment-link"
                                      style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                                    >
                                      <FileText size={14} /> View Costing Attachment
                                    </a>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}

            {/* No virtual spacers needed - native scroll enabled */}
          </tbody>
        </table>
      </div>

      {/* 11. Pagination Footer */}
      <div className="tender-table-footer">
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
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={activePage === 1}
          >
            PREV
          </button>
          
          {/* Render abbreviated page numbers */}
          {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
            // Logic to center the current page index in the page range
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
              <span style={{ padding: "0 4px", color: "rgba(0,0,0,0.4)" }}>...</span>
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
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
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
      
      <AttachmentModal 
        isOpen={isAttachmentModalOpen} 
        onClose={() => setIsAttachmentModalOpen(false)} 
        docketNo={selectedDocketNo} 
      />

      {/* Premium Toast Overlay */}
      <div className="premium-toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`premium-toast ${t.type}`}>
            <span className="premium-toast-icon" style={{ display: "inline-flex", alignItems: "center" }}>
              {t.type === "success" ? <Check size={16} /> : <AlertTriangle size={16} />}
            </span>
            <div className="premium-toast-content">{t.message}</div>
                            <button className="premium-toast-close" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} style={{ display: "inline-flex", alignItems: "center" }}>
                              <X size={14} />
                            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
