"use client";
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  EpcTenderRecord,
  ManagementDecision,
  EMDExchangeMode,
} from "@/types/tender";
import { AttachmentModal } from "./AttachmentModal";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { updateTenderDocketNo, updateTenderBgNoUtrNo, updateTenderRemarks, updateTenderBeneficiaryBankDetails, updateTenderReason, updateTenderLoiPoNoAndDate, updateTenderCompetitors, updateTenderDiffPercentFromL1, updateTenderDiffPercentFromL2, updateTenderCell } from "@/lib/slices/tendersSlice";
import { toast } from "sonner";
import {
  Search,
  X,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  ChevronRight,
  BarChart3,
  FileSpreadsheet,
  Download,
  Paperclip,
  FileText,
  Pencil,
  Check,
  Circle,
  AlertTriangle,
  Loader2,
  RotateCcw,
} from "lucide-react";
import "./TenderTable.css";

const filesCache = new Map<string, any[]>();
const filesPromiseCache = new Map<string, Promise<any[]>>();

const fetchDocketFiles = (docketNo: string): Promise<any[]> => {
  if (filesCache.has(docketNo)) {
    console.log(`[DEBUG fetchDocketFiles] CACHE HIT for ${docketNo}:`, filesCache.get(docketNo));
    return Promise.resolve(filesCache.get(docketNo)!);
  }
  if (filesPromiseCache.has(docketNo)) {
    console.log(`[DEBUG fetchDocketFiles] IN-FLIGHT HIT for ${docketNo}`);
    return filesPromiseCache.get(docketNo)!;
  }
  console.log(`[DEBUG fetchDocketFiles] FETCHING for ${docketNo}`);
  const promise = fetch(`/api/executive-tenders/${docketNo}/files`, {
    headers: {
      Authorization: "Bearer MOCK_TOKEN_LASERPOWER_SECURE_AUTH_SCOPE",
    },
  })
    .then((res) => {
      console.log(`[DEBUG fetchDocketFiles] ${docketNo} response status:`, res.status, res.statusText);
      return res.ok ? res.json() : { files: [] };
    })
    .then((data) => {
      console.log(`[DEBUG fetchDocketFiles] ${docketNo} response data:`, JSON.stringify(data).slice(0, 500));
      const files = data.files || [];
      filesCache.set(docketNo, files);
      filesPromiseCache.delete(docketNo);
      return files;
    })
    .catch((err) => {
      console.warn(`[DEBUG fetchDocketFiles] ${docketNo} fetch error:`, err);
      return [];
    });
  filesPromiseCache.set(docketNo, promise);
  return promise;
};

const matchesErpItemCategory = (
  itemName: string | undefined | null,
  category: string,
): boolean => {
  if (!itemName) return false;
  const lowerName = itemName.toLowerCase();
  const lowerCategory = category.toLowerCase();

  if (lowerCategory === "ab cable") {
    return lowerName.includes("ab cable") || lowerName.includes("ab cables");
  }
  if (lowerCategory === "conductor") {
    return (
      lowerName.includes("conductor") ||
      lowerName.includes("acsr") ||
      lowerName.includes("aaac") ||
      lowerName.includes("a.c.s.r.")
    );
  }
  if (lowerCategory === "xlpe cable") {
    return (
      lowerName.includes("xlpe") &&
      !lowerName.includes("ab cable") &&
      !lowerName.includes("ab cables")
    );
  }
  if (lowerCategory === "pvc cable") {
    return lowerName.includes("pvc");
  }
  if (lowerCategory === "control cable") {
    return (
      lowerName.includes("control") || lowerName.includes("instrumentation")
    );
  }
  return false;
};

const FilesCell: React.FC<{
  tenderFilesJson: string;
  onOpenModal: (files: any[]) => void;
}> = ({ tenderFilesJson, onOpenModal }) => {
  let files: any[] = [];
  try {
    files = JSON.parse(tenderFilesJson || "[]");
  } catch {}

  if (files.length === 0) return null;

  return (
    <button
      className="table-attachment-btn"
      onClick={() => onOpenModal(files)}
      title="View files"
      style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
    >
      <Paperclip size={14} /> {files.length}{" "}
      {files.length === 1 ? "File" : "Files"}
    </button>
  );
};

const BOQChartCell: React.FC<{
  docketNo: string;
  boqFileId?: string | null;
  tenderFilesJson?: string;
}> = ({ docketNo, boqFileId, tenderFilesJson }) => {
  const [boqFile, setBoqFile] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const tenderFilesSource = useMemo(() => {
    if (!tenderFilesJson) return null;
    try {
      const files = JSON.parse(tenderFilesJson);
      const boqFileEntry = files.find(
        (f: any) => f.tags?.includes("boqComparativeChart"),
      );
      return boqFileEntry?.source || null;
    } catch {
      return null;
    }
  }, [tenderFilesJson]);

  useEffect(() => {
    if (boqFileId || tenderFilesSource) return;
    if (!docketNo || docketNo === "-") return;

    let isMounted = true;
    setLoading(true);
    fetchDocketFiles(docketNo).then((files) => {
      if (isMounted) {
        const match = files.find((f) => {
          const lower = f.filename.toLowerCase();
          return (
            lower.includes("boqcomparativechart") ||
            lower.includes("boq_comparative") ||
            lower.includes("boq comparative")
          );
        });
        setBoqFile(match || null);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [docketNo, boqFileId, tenderFilesSource]);

  if (loading) return null;

  const effectiveFileId = boqFileId || tenderFilesSource || boqFile?.fileId;
  if (!effectiveFileId) return null;

  const handleDownload = () => {
    const token = "Bearer MOCK_TOKEN_LASERPOWER_SECURE_AUTH_SCOPE";
    window.open(
      `/api/executive-files/download/${effectiveFileId}?auth=${encodeURIComponent(token)}`,
      "_blank",
    );
  };

  return (
    <button
      className="table-boq-btn"
      onClick={handleDownload}
      title={`Download Comparative Chart`}
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
  readOnly?: boolean;
  showPostParticipationColumns?: boolean;
  editableColumns?: string[];
}

interface ColumnDef {
  header: string;
  accessor: keyof EpcTenderRecord | "rawMaterials" | "files" | "boqChart";
  defaultWidth: number;
  align: "left" | "right" | "center";
  type:
    | "string"
    | "number"
    | "date"
    | "boolean"
    | "percentage"
    | "currency"
    | "status"
    | "decision"
    | "custom";
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
  clearTrigger,
  readOnly = false,
  showPostParticipationColumns = false,
  editableColumns = [],
}) => {
  // 1. Column Definitions
  const columns: ColumnDef[] = [
    {
      header: "Docket No",
      accessor: "docketNo",
      defaultWidth: 120,
      align: "left",
      type: "string",
    },
    {
      header: "Last Date of Submission",
      accessor: "lastDateOfSubmission",
      defaultWidth: 200,
      align: "center",
      type: "date",
    },
    {
      header: "Client Name",
      accessor: "nameOfTheClient",
      defaultWidth: 200,
      align: "left",
      type: "string",
    },
    {
      header: "Tender / NIT No",
      accessor: "tenderNoNitNo",
      defaultWidth: 180,
      align: "left",
      type: "string",
    },
    {
      header: "Item Category",
      accessor: "itemCategory",
      defaultWidth: 150,
      align: "left",
      type: "string",
    },
    {
      header: "Proposed ERP Item Name",
      accessor: "proposedErpItemName",
      defaultWidth: 250,
      align: "left",
      type: "custom",
    },
    {
      header: "Proposed Qty",
      accessor: "proposedQty",
      defaultWidth: 120,
      align: "left",
      type: "custom",
    },
    {
      header: "Costing File",
      accessor: "attachmentUrl",
      defaultWidth: 115,
      align: "center",
      type: "custom",
    },
    {
      header: "Files",
      accessor: "files",
      defaultWidth: 115,
      align: "center",
      type: "custom",
    },
    {
      header: "Comparative Chart",
      accessor: "boqChart",
      defaultWidth: 120,
      align: "center",
      type: "custom",
    },
    {
      header: "Type",
      accessor: "typeOfTender",
      defaultWidth: 100,
      align: "left",
      type: "string",
    },
    {
      header: "Price",
      accessor: "priceBasis",
      defaultWidth: 90,
      align: "center",
      type: "string",
    },
    {
      header: "Raw Materials",
      accessor: "rawMaterials",
      defaultWidth: 220,
      align: "center",
      type: "custom",
    },
    {
      header: "EMD Payment Mode",
      accessor: "emdPaymentMode",
      defaultWidth: 150,
      align: "center",
      type: "string",
    },
    {
      header: "BG / UTR No",
      accessor: "bgNoUtrNo",
      defaultWidth: 150,
      align: "left",
      type: "string",
    },
    {
      header: "BG Status",
      accessor: "bgStatus",
      defaultWidth: 110,
      align: "center",
      type: "string",
    },
    {
      header: "Beneficiary Bank Details",
      accessor: "beneficiaryBankDetails",
      defaultWidth: 180,
      align: "left",
      type: "string",
    },
    {
      header: "Current Status",
      accessor: "currentStatus",
      defaultWidth: 150,
      align: "center",
      type: "status",
    },
    {
      header: "Status Category",
      accessor: "statusCategory",
      defaultWidth: 150,
      align: "center",
      type: "string",
    },
    {
      header: "Mgmt Dec.",
      accessor: "managementDecision",
      defaultWidth: 100,
      align: "center",
      type: "decision",
    },
    {
      header: "Participated?",
      accessor: "participated",
      defaultWidth: 100,
      align: "center",
      type: "boolean",
    },
    {
      header: "Reason for not participation",
      accessor: "reason",
      defaultWidth: 250,
      align: "left",
      type: "string",
    },
    {
      header: "Prep By",
      accessor: "tenderPrepareBy",
      defaultWidth: 120,
      align: "left",
      type: "string",
    },
    {
      header: "RA?",
      accessor: "reverseAuctionApplicable",
      defaultWidth: 60,
      align: "center",
      type: "boolean",
    },
    {
      header: "LOI / PO No.",
      accessor: "loiPoNoAndDate",
      defaultWidth: 150,
      align: "left",
      type: "string",
    },
    {
      header: "Diff L1 (%)",
      accessor: "diffPercentFromL1",
      defaultWidth: 110,
      align: "right",
      type: "custom",
    },
    {
      header: "Diff L2 (%)",
      accessor: "diffPercentFromL2",
      defaultWidth: 110,
      align: "right",
      type: "custom",
    },
    {
      header: "Competitors",
      accessor: "competitors",
      defaultWidth: 250,
      align: "left",
      type: "custom",
    },
    {
      header: "Remarks",
      accessor: "remarks",
      defaultWidth: 200,
      align: "left",
      type: "string",
    },
    {
      header: "Tender Update Status",
      accessor: "tenderUpdateStatus",
      defaultWidth: 150,
      align: "center",
      type: "custom",
    },
    {
      header: "Next Action",
      accessor: "nextAction",
      defaultWidth: 220,
      align: "left",
      type: "custom",
    },
    {
      header: "CVA",
      accessor: "cva",
      defaultWidth: 120,
      align: "center",
      type: "string",
    },
  ];

  const postParticipationAccessors = new Set([
    "bgNoUtrNo", "remarks", "loiPoNoAndDate",
    "competitors", "diffPercentFromL1", "diffPercentFromL2",
    "nextAction",
  ]);
  const visibleColumns = showPostParticipationColumns
    ? columns
    : columns.filter((col) => !postParticipationAccessors.has(col.accessor));

  // 2. States
  const [overrides, setOverrides] = useState<
    Record<
      string,
      {
        tenderUpdateStatus?: string;
        nextAction?: string | null;
        reverseAuctionApplicable?: boolean | null;
      }
    >
  >({});
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
  const [editingDocketId, setEditingDocketId] = useState<string | null>(null);
  const [docketEditValue, setDocketEditValue] = useState<string>("");
  const [editingBgUtrId, setEditingBgUtrId] = useState<string | null>(null);
  const [bgUtrEditValue, setBgUtrEditValue] = useState<string>("");
  const [editingRemarksId, setEditingRemarksId] = useState<string | null>(null);
  const [remarksEditValue, setRemarksEditValue] = useState<string>("");
  const [editingDiffL1Id, setEditingDiffL1Id] = useState<string | null>(null);
  const [diffL1EditValue, setDiffL1EditValue] = useState<string>("");
  const [editingDiffL2Id, setEditingDiffL2Id] = useState<string | null>(null);
  const [diffL2EditValue, setDiffL2EditValue] = useState<string>("");
  const [editingLoiPoId, setEditingLoiPoId] = useState<string | null>(null);
  const [loiPoEditValue, setLoiPoEditValue] = useState<string>("");
  const [editingCompetitorsId, setEditingCompetitorsId] = useState<string | null>(null);
  const [competitorsEditValue, setCompetitorsEditValue] = useState<string>("");
  const [editingReasonId, setEditingReasonId] = useState<string | null>(null);
  const [reasonEditValue, setReasonEditValue] = useState<string>("");
  const [editingBankDetailsId, setEditingBankDetailsId] = useState<string | null>(null);
  const [bankDetailsEditValue, setBankDetailsEditValue] = useState<string>("");

  const dispatch = useAppDispatch();
  const tenderData = useAppSelector((s) => s.tenders.data);
  const updatingCells = useAppSelector((s) => s.tenders.updatingCells);

  const handleDocketSave = useCallback(
    (record: EpcTenderRecord) => {
      if (!record.id) {
        toast.error("Database record ID not found. Please refresh.");
        return;
      }
      const newVal = docketEditValue.trim();
      const oldVal = record.docketNo;
      if (newVal === oldVal) {
        setEditingDocketId(null);
        return;
      }
      const key = `${record.id}-docket`;
      setSavingKeys((prev) => ({ ...prev, [key]: true }));
      console.log(`[save:docket] dispatching: id=${record.id} newVal="${newVal}" oldVal="${oldVal}"`);
      dispatch(
        updateTenderDocketNo({
          tenderMergedId: Number(record.id),
          docketNo: newVal,
          oldDocketNo: oldVal,
        }),
      )
        .unwrap()
        .then(() => {
          toast.success(`Docket ${newVal} updated successfully!`);
        })
        .catch((err) => {
          toast.error(err?.message || "Failed to update docket number.");
        })
        .finally(() => {
          setEditingDocketId(null);
          setSavingKeys((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
          });
        });
    },
    [dispatch, docketEditValue],
  );

  const handleBgUtrSave = useCallback(
    (record: EpcTenderRecord) => {
      if (!record.id) {
        toast.error("Database record ID not found. Please refresh.");
        return;
      }
      const newVal = bgUtrEditValue.trim();
      const oldVal = record.bgNoUtrNo ?? "";
      if (newVal === oldVal) {
        setEditingBgUtrId(null);
        return;
      }
      const key = `${record.id}-bgUtr`;
      setSavingKeys((prev) => ({ ...prev, [key]: true }));
      console.log(`[save:bgUtr] dispatching: id=${record.id} newVal="${newVal}" oldVal="${oldVal}"`);
      dispatch(
        updateTenderBgNoUtrNo({
          tenderMergedId: Number(record.id),
          bgNoUtrNo: newVal,
          oldBgNoUtrNo: oldVal,
        }),
      )
        .unwrap()
        .then(() => {
          toast.success(`BG/UTR No updated successfully!`);
        })
        .catch((err) => {
          toast.error(err?.message || "Failed to update BG/UTR number.");
        })
        .finally(() => {
          setEditingBgUtrId(null);
          setSavingKeys((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
          });
        });
    },
    [dispatch, bgUtrEditValue],
  );

  const handleRemarksSave = useCallback(
    (record: EpcTenderRecord) => {
      if (!record.id) {
        toast.error("Database record ID not found. Please refresh.");
        return;
      }
      const newVal = remarksEditValue.trim();
      const oldVal = record.remarks ?? "";
      if (newVal === oldVal) {
        setEditingRemarksId(null);
        return;
      }
      const key = `${record.id}-remarks`;
      setSavingKeys((prev) => ({ ...prev, [key]: true }));
      console.log(`[save:remarks] dispatching: id=${record.id} newVal="${newVal}" oldVal="${oldVal}"`);
      dispatch(
        updateTenderRemarks({
          tenderMergedId: Number(record.id),
          remarks: newVal,
          oldRemarks: oldVal,
        }),
      )
        .unwrap()
        .then(() => {
          toast.success(`Remarks updated successfully!`);
        })
        .catch((err: any) => {
          toast.error(err?.message || "Failed to update remarks.");
        })
        .finally(() => {
          setEditingRemarksId(null);
          setSavingKeys((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
          });
        });
    },
    [dispatch, remarksEditValue],
  );

  const handleBankDetailsSave = useCallback(
    (record: EpcTenderRecord) => {
      if (!record.id) {
        toast.error("Database record ID not found. Please refresh.");
        return;
      }
      const newVal = bankDetailsEditValue.trim();
      const oldVal = record.beneficiaryBankDetails ?? "";
      if (newVal === oldVal) {
        setEditingBankDetailsId(null);
        return;
      }
      const key = `${record.id}-bankDetails`;
      setSavingKeys((prev) => ({ ...prev, [key]: true }));
      console.log(`[save:bankDetails] dispatching: id=${record.id} newVal="${newVal}" oldVal="${oldVal}"`);
      dispatch(
        updateTenderBeneficiaryBankDetails({
          tenderMergedId: Number(record.id),
          beneficiaryBankDetails: newVal,
          oldBeneficiaryBankDetails: oldVal,
        }),
      )
        .unwrap()
        .then(() => {
          toast.success("Bank details updated!");
        })
        .catch((err: any) => {
          toast.error(err?.message || "Failed to update bank details.");
        })
        .finally(() => {
          setEditingBankDetailsId(null);
          setSavingKeys((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
          });
        });
    },
    [dispatch, bankDetailsEditValue],
  );

  const handleDiffSave = async (
    record: EpcTenderRecord,
    field: "diffPercentFromL1" | "diffPercentFromL2",
    rawValue: string,
    setEditingId: (id: string | null) => void,
    setEditValue: (v: string) => void,
  ) => {
    if (!record.id) {
      toast.error("Database record ID not found. Please refresh.");
      return;
    }
    const trimmed = rawValue.trim();
    const parsedNum = trimmed === "" ? null : parseFloat(trimmed);
    if (parsedNum !== null && isNaN(parsedNum)) {
      toast.error("Please enter a valid number.");
      return;
    }
    const oldVal = (record[field] as number | null) ?? null;
    const storedVal = parsedNum !== null ? parseFloat((parsedNum / 100).toFixed(6)) : null;
    if (storedVal === oldVal) {
      setEditingId(null);
      return;
    }
    const key = `${record.id}-${field === "diffPercentFromL1" ? "diffL1" : "diffL2"}`;
    setSavingKeys((prev) => ({ ...prev, [key]: true }));
    console.log(`[save:diff] dispatching: id=${record.id} field=${field} storedVal=${storedVal}`);
    const dispatchAction = field === "diffPercentFromL1"
      ? dispatch(updateTenderDiffPercentFromL1({
          tenderMergedId: Number(record.id),
          diffPercentFromL1: storedVal,
          oldDiffPercentFromL1: String(oldVal ?? ""),
        }))
      : dispatch(updateTenderDiffPercentFromL2({
          tenderMergedId: Number(record.id),
          diffPercentFromL2: storedVal,
          oldDiffPercentFromL2: String(oldVal ?? ""),
        }));
    dispatchAction
      .unwrap()
      .then(() => {
        const label = field === "diffPercentFromL1" ? "Diff L1" : "Diff L2";
        toast.success(`${label} saved!`);
      })
      .catch((err: any) => {
        toast.error(err?.message || "Failed to save diff value.");
      })
      .finally(() => {
        setEditingId(null);
        setEditValue("");
        setSavingKeys((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      });
  };

  const handleLoiPoSave = useCallback(
    (record: EpcTenderRecord) => {
      if (!record.id) {
        toast.error("Database record ID not found. Please refresh.");
        return;
      }
      const newVal = loiPoEditValue.trim();
      const oldVal = record.loiPoNoAndDate ?? "";
      if (newVal === oldVal) {
        setEditingLoiPoId(null);
        return;
      }
      const key = `${record.id}-loiPo`;
      setSavingKeys((prev) => ({ ...prev, [key]: true }));
      console.log(`[save:loiPo] dispatching: id=${record.id} newVal="${newVal}" oldVal="${oldVal}"`);
      dispatch(
        updateTenderLoiPoNoAndDate({
          tenderMergedId: Number(record.id),
          loiPoNoAndDate: newVal,
          oldLoiPoNoAndDate: oldVal,
        }),
      )
        .unwrap()
        .then(() => {
          toast.success("LOI/PO No updated!");
        })
        .catch((err: any) => {
          toast.error(err?.message || "Failed to update LOI/PO No.");
        })
        .finally(() => {
          setEditingLoiPoId(null);
          setSavingKeys((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
          });
        });
    },
    [dispatch, loiPoEditValue],
  );

  const handleCompetitorsSave = useCallback(
    (record: EpcTenderRecord) => {
      if (!record.id) {
        toast.error("Database record ID not found. Please refresh.");
        return;
      }
      const newVal = competitorsEditValue.trim();
      const oldVal = record.competitors ?? "";
      if (newVal === oldVal) {
        setEditingCompetitorsId(null);
        return;
      }
      const key = `${record.id}-competitors`;
      setSavingKeys((prev) => ({ ...prev, [key]: true }));
      console.log(`[save:competitors] dispatching: id=${record.id} newVal="${newVal}" oldVal="${oldVal}"`);
      dispatch(
        updateTenderCompetitors({
          tenderMergedId: Number(record.id),
          competitors: newVal,
          oldCompetitors: oldVal,
        }),
      )
        .unwrap()
        .then(() => {
          toast.success("Competitors updated!");
        })
        .catch((err: any) => {
          toast.error(err?.message || "Failed to update competitors.");
        })
        .finally(() => {
          setEditingCompetitorsId(null);
          setSavingKeys((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
          });
        });
    },
    [dispatch, competitorsEditValue],
  );

  const handleReasonSave = useCallback(
    (record: EpcTenderRecord) => {
      if (!record.id) {
        toast.error("Database record ID not found. Please refresh.");
        return;
      }
      const newVal = reasonEditValue.trim();
      const oldVal = record.reason ?? "";
      if (newVal === oldVal) {
        setEditingReasonId(null);
        return;
      }
      const key = `${record.id}-reason`;
      setSavingKeys((prev) => ({ ...prev, [key]: true }));
      dispatch(
        updateTenderReason({
          tenderMergedId: Number(record.id),
          reason: newVal,
          oldReason: oldVal,
        }),
      )
        .unwrap()
        .then(() => {
          toast.success("Reason updated!");
        })
        .catch((err: any) => {
          toast.error(err?.message || "Failed to update reason.");
        })
        .finally(() => {
          setEditingReasonId(null);
          setSavingKeys((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
          });
        });
    },
    [dispatch, reasonEditValue],
  );

  const handleUpdate = async (
    record: EpcTenderRecord,
    field: "tenderUpdateStatus" | "nextAction" | "reverseAuctionApplicable",
    value: any,
  ) => {
    if (!record.id) {
      toast.error("Database record ID is not found. Please refresh and try again.");
      return;
    }
    const key = `${record.id}::${field}`;
    setSavingKeys((prev) => ({ ...prev, [key]: true }));

    const previousValue =
      overrides[record.id]?.[field] !== undefined
        ? overrides[record.id]?.[field]
        : record[field as keyof EpcTenderRecord];

    setOverrides((prev) => ({
      ...prev,
      [record.id!]: {
        ...prev[record.id!],
        [field]: value,
      },
    }));

    try {
      const currentStatus =
        field === "tenderUpdateStatus"
          ? value
          : (overrides[record.id]?.tenderUpdateStatus ??
            record.tenderUpdateStatus ??
            "OPEN");
      const currentAction =
        field === "nextAction"
          ? value
          : overrides[record.id]?.nextAction !== undefined
            ? overrides[record.id]?.nextAction
            : (record.nextAction ?? null);
      const currentRa =
        field === "reverseAuctionApplicable"
          ? value
          : overrides[record.id]?.reverseAuctionApplicable !== undefined
            ? overrides[record.id]?.reverseAuctionApplicable
            : (record.reverseAuctionApplicable ?? false);

      const response = await fetch(`/api/executive-tenders/${record.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenderUpdateStatus: currentStatus,
          nextAction: currentAction,
          reverseAuctionApplicable: currentRa,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update tender");
      }

      toast.success(`Tender ${record.docketNo} updated successfully!`);
    } catch (err: any) {
      console.error(err);
      setOverrides((prev) => ({
        ...prev,
        [record.id!]: {
          ...prev[record.id!],
          [field]: previousValue,
        },
      }));
      toast.error(err.message || "Failed to save tender updates. Reverting changes.");
    } finally {
      setSavingKeys((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  const [globalSearch, setGlobalSearch] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<
    keyof EpcTenderRecord | "rawMaterials" | "files" | "boqChart" | null
  >("lastDateOfSubmission");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(50);

  const [selectedFiles, setSelectedFiles] = useState<any[]>([]);
  const [isAttachmentModalOpen, setIsAttachmentModalOpen] =
    useState<boolean>(false);
  const BOOLEAN_COLUMNS = new Set(["participated", "reverseAuctionApplicable"]);
  const SKIP_FILTER_COLUMNS = new Set([
    "lastDateOfSubmission", "attachmentUrl", "files", "boqChart",
    "rawMaterials", "diffPercentFromL1", "diffPercentFromL2",
    "proposedErpItemName", "remarks", "tenderUpdateStatus", "nextAction",
    "itemCategory",
  ]);

  const [multiSelectFilters, setMultiSelectFilters] = useState<
    Record<string, string[]>
  >({});
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [columnSearchText, setColumnSearchText] = useState<
    Record<string, string>
  >({});
  const [remarksTextFilter, setRemarksTextFilter] = useState<string>("");
  const [remarksDropdownFilter, setRemarksDropdownFilter] =
    useState<string>("All");
  const [proposedErpItemTextFilter, setProposedErpItemTextFilter] =
    useState<string>("");
  const [proposedErpItemCategoryFilter, setProposedErpItemCategoryFilter] =
    useState<string>("All");

  const toggleFilter = (accessor: string, value: string) => {
    setMultiSelectFilters((prev) => {
      const current = prev[accessor] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [accessor]: next };
    });
    setCurrentPage(1);
  };

  const selectAllFilter = (accessor: string) => {
    const all = [...(uniqueValueCache[accessor] ?? [])];
    if (BOOLEAN_COLUMNS.has(accessor)) {
      all.push("Yes", "No");
    }
    all.push("(Blank)");
    setMultiSelectFilters((prev) => ({ ...prev, [accessor]: all }));
    setCurrentPage(1);
  };

  const clearFilter = (accessor: string) => {
    setMultiSelectFilters((prev) => {
      const next = { ...prev };
      delete next[accessor];
      return next;
    });
    setCurrentPage(1);
  };

  useEffect(() => {
    if (!openDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const el = dropdownRefs.current[openDropdown];
      if (el && !el.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdown]);

  React.useEffect(() => {
    if (clearTrigger) {
      setGlobalSearch("");
      setStartDate("");
      setEndDate("");
      setMultiSelectFilters({});
      setOpenDropdown(null);
      setColumnSearchText({});
      setRemarksTextFilter("");
      setRemarksDropdownFilter("All");
      setProposedErpItemTextFilter("");
      setProposedErpItemCategoryFilter("All");
      setCurrentPage(1);
    }
  }, [clearTrigger]);

  // Helper for cascading dependent filters
  const getFilteredRecordsExcept = (excludeAccessor: string | null) => {
    let result = [...records];

    if (globalSearch.trim() !== "") {
      const searchLower = globalSearch.toLowerCase().trim();
      result = result.filter((record) => {
        const docNo = record.docketNo || "";
        const client = record.nameOfTheClient || "";
        const nit = record.tenderNoNitNo || "";
        const category = record.itemCategory || "";
        const comps = record.competitors || "";
        return (
          docNo.toLowerCase().includes(searchLower) ||
          client.toLowerCase().includes(searchLower) ||
          nit.toLowerCase().includes(searchLower) ||
          category.toLowerCase().includes(searchLower) ||
          comps.toLowerCase().includes(searchLower)
        );
      });
    }

    if (startDate) {
      result = result.filter(
        (record) =>
          record.lastDateOfSubmission &&
          new Date(record.lastDateOfSubmission) >= new Date(startDate),
      );
    }
    if (endDate) {
      result = result.filter(
        (record) =>
          record.lastDateOfSubmission &&
          new Date(record.lastDateOfSubmission) <= new Date(endDate),
      );
    }

    for (const [accessor, selected] of Object.entries(multiSelectFilters)) {
      if (accessor === excludeAccessor || selected.length === 0) continue;
      result = result.filter((r) => {
        if (BOOLEAN_COLUMNS.has(accessor)) {
          const val = r[accessor as keyof EpcTenderRecord];
          if (selected.includes("Yes") && val === true) return true;
          if (selected.includes("No") && val === false) return true;
          if (selected.includes("(Blank)") && (val == null)) return true;
          return false;
        }
        const cellStr = String(r[accessor as keyof EpcTenderRecord] ?? "");
        if (!cellStr.trim()) return selected.includes("(Blank)");
        return selected.includes(cellStr);
      });
    }

    for (const [accessor, searchVal] of Object.entries(columnSearchText)) {
      if (accessor === excludeAccessor || !searchVal.trim()) continue;
      const searchLower = searchVal.toLowerCase().trim();
      result = result.filter((r) => {
        const cellVal = String(
          r[accessor as keyof EpcTenderRecord] ?? "",
        ).toLowerCase();
        return cellVal.includes(searchLower);
      });
    }

    if (excludeAccessor !== "remarks" && remarksDropdownFilter !== "All") {
      result = result.filter(
        (record) => record.remarks === remarksDropdownFilter,
      );
    }
    if (excludeAccessor !== "proposedErpItemName") {
      if (proposedErpItemCategoryFilter !== "All") {
        result = result.filter((record) =>
          matchesErpItemCategory(
            record.proposedErpItemName,
            proposedErpItemCategoryFilter,
          ),
        );
      }
      if (proposedErpItemTextFilter.trim() !== "") {
        const searchLower = proposedErpItemTextFilter.toLowerCase().trim();
        result = result.filter(
          (record) =>
            record.proposedErpItemName &&
            record.proposedErpItemName.toLowerCase().includes(searchLower),
        );
      }
    }

    return result;
  };

  const uniqueValueCache = useMemo(() => {
    const cache: Record<string, string[]> = {};
    for (const col of columns) {
      if (SKIP_FILTER_COLUMNS.has(col.accessor)) continue;
      const filtered = getFilteredRecordsExcept(col.accessor);
      const values = filtered
        .map((r) => String(r[col.accessor as keyof EpcTenderRecord] ?? ""))
        .filter((v) => v.trim() !== "");
      cache[col.accessor] = Array.from(new Set(values)).sort();
    }
    return cache;
  }, [
    records,
    globalSearch,
    startDate,
    endDate,
    multiSelectFilters,
    columnSearchText,
    remarksDropdownFilter,
    proposedErpItemTextFilter,
    proposedErpItemCategoryFilter,
  ]);

  const uniqueRemarks = useMemo(() => {
    const filtered = getFilteredRecordsExcept("remarks");
    const counts: Record<string, number> = {};
    filtered.forEach((r) => {
      const val = r.remarks ? r.remarks.trim() : "";
      if (val) {
        counts[val] = (counts[val] || 0) + 1;
      }
    });
    return Object.keys(counts)
      .filter((key) => counts[key] > 1)
      .sort();
  }, [
    records,
    globalSearch,
    startDate,
    endDate,
    multiSelectFilters,
    columnSearchText,
    remarksDropdownFilter,
    proposedErpItemTextFilter,
    proposedErpItemCategoryFilter,
  ]);

  const handleOpenAttachmentModal = (files: any[]) => {
    setSelectedFiles(files);
    setIsAttachmentModalOpen(true);
  };

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => {
      const initialWidths: Record<string, number> = {};
      visibleColumns.forEach((col) => {
        initialWidths[col.accessor] = col.defaultWidth;
      });
      return initialWidths;
    },
  );

  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  // DOM Ref for scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Resize column state refs
  const resizingColumnRef = useRef<string | null>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  // 3. Draggable Column Resizing Handlers
  const handleResizeStart = (
    e: React.MouseEvent,
    accessor: string,
    currentWidth: number,
  ) => {
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
    setColumnWidths((prev) => ({
      ...prev,
      [resizingColumnRef.current!]: newWidth,
    }));
  };

  const handleResizeEnd = () => {
    resizingColumnRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "default";
  };

  // 4. Sorting Handler
  const handleSort = (
    column: keyof EpcTenderRecord | "rawMaterials" | "files" | "boqChart",
  ) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  const handleClearSort = () => {
    setSortColumn(null);
    setSortDirection("desc");
    setCurrentPage(1);
  };

  // Toggle Row Expansion
  const toggleRowExpansion = (slNo: number) => {
    setExpandedRows((prev) => ({
      ...prev,
      [slNo]: !prev[slNo],
    }));
  };

  // 5. Processing Data (Filtering & Sorting)
  const processedRecords = useMemo(() => {
    let result = [...records];

    // Global Text Search
    if (globalSearch.trim() !== "") {
      const searchLower = globalSearch.toLowerCase().trim();
      result = result.filter((record) => {
        return (
          record.docketNo.toLowerCase().includes(searchLower) ||
          record.nameOfTheClient.toLowerCase().includes(searchLower) ||
          record.tenderNoNitNo.toLowerCase().includes(searchLower) ||
          record.tenderFor.toLowerCase().includes(searchLower) ||
          record.tenderPrepareBy.toLowerCase().includes(searchLower) ||
          record.currentStatus.toLowerCase().includes(searchLower) ||
          (record.itemCategory &&
            record.itemCategory.toLowerCase().includes(searchLower)) ||
          (record.remarks &&
            record.remarks.toLowerCase().includes(searchLower)) ||
          (record.competitors &&
            record.competitors.toLowerCase().includes(searchLower)) ||
          (record.nameOfWorkDescription &&
            record.nameOfWorkDescription.toLowerCase().includes(searchLower))
        );
      });
    }

    // Date Range Filter on lastDateOfSubmission
    if (startDate || endDate) {
      result = result.filter((record) => {
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

    // Column Header Filters (multi-select)
    for (const [accessor, selected] of Object.entries(multiSelectFilters)) {
      if (selected.length === 0) continue;
      result = result.filter((r) => {
        if (BOOLEAN_COLUMNS.has(accessor)) {
          const val = r[accessor as keyof EpcTenderRecord];
          if (selected.includes("Yes") && val === true) return true;
          if (selected.includes("No") && val === false) return true;
          if (selected.includes("(Blank)") && (val == null)) return true;
          return false;
        }
        const cellStr = String(r[accessor as keyof EpcTenderRecord] ?? "");
        if (!cellStr.trim()) return selected.includes("(Blank)");
        return selected.includes(cellStr);
      });
    }

    // Column Search Text Filters
    for (const [accessor, searchVal] of Object.entries(columnSearchText)) {
      if (!searchVal.trim()) continue;
      const searchLower = searchVal.toLowerCase().trim();
      result = result.filter((r) => {
        const cellVal = String(
          r[accessor as keyof EpcTenderRecord] ?? "",
        ).toLowerCase();
        return cellVal.includes(searchLower);
      });
    }

    // Column Remarks Header Filters
    if (remarksDropdownFilter !== "All") {
      result = result.filter(
        (record) => record.remarks === remarksDropdownFilter,
      );
    }
    if (remarksTextFilter.trim() !== "") {
      const searchLower = remarksTextFilter.toLowerCase().trim();
      result = result.filter(
        (record) =>
          record.remarks && record.remarks.toLowerCase().includes(searchLower),
      );
    }

    // Proposed ERP Item Name Header Filters
    if (proposedErpItemCategoryFilter !== "All") {
      result = result.filter((record) =>
        matchesErpItemCategory(
          record.proposedErpItemName,
          proposedErpItemCategoryFilter,
        ),
      );
    }
    if (proposedErpItemTextFilter.trim() !== "") {
      const searchLower = proposedErpItemTextFilter.toLowerCase().trim();
      result = result.filter(
        (record) =>
          record.proposedErpItemName &&
          record.proposedErpItemName.toLowerCase().includes(searchLower),
      );
    }

    // Sorting — applied last on the fully filtered set so order is definitive
    if (sortColumn) {
      result.sort((a, b) => {
        let valA: any;
        let valB: any;

        if (sortColumn === "rawMaterials") {
          const materialFields = [
            "aluminiumPrice", "aluminiumAlloyPrice", "copperTapePrice",
            "extrudedSemiconductivePrice", "htXlpePrice", "pvcTypeSt2Price",
            "galvanisedSteelFlatStripPrice", "fillerPrice",
          ] as const;
          valA = materialFields.reduce(
            (sum, f) => sum + (typeof a[f as keyof EpcTenderRecord] === "number" ? (a[f as keyof EpcTenderRecord] as number) : 0), 0,
          );
          valB = materialFields.reduce(
            (sum, f) => sum + (typeof b[f as keyof EpcTenderRecord] === "number" ? (b[f as keyof EpcTenderRecord] as number) : 0), 0,
          );
        } else if (sortColumn === "files") {
          const getFileCount = (r: EpcTenderRecord) => {
            if (!r.tenderFiles) return 0;
            try {
              const files = JSON.parse(r.tenderFiles);
              return Array.isArray(files) ? files.length : 0;
            } catch { return 0; }
          };
          valA = getFileCount(a);
          valB = getFileCount(b);
        } else if (sortColumn === "boqChart") {
          const getHasBoq = (r: EpcTenderRecord) => {
            if (r.boqFileId) return 1;
            if (!r.tenderFiles) return 0;
            try {
              const files: Array<{ name: string; tags: string[] }> = JSON.parse(r.tenderFiles);
              return files.some((f) => {
                const lower = (f.name || "").toLowerCase();
                return lower.includes("boqcomparativechart") ||
                       lower.includes("boq_comparative") ||
                       lower.includes("boq comparative") ||
                       f.tags?.includes("boqComparativeChart");
              }) ? 1 : 0;
            } catch { return 0; }
          };
          valA = getHasBoq(a);
          valB = getHasBoq(b);
        } else if (sortColumn === "attachmentUrl") {
          const getHasCosting = (r: EpcTenderRecord) => {
            if (!r.tenderFiles) return 0;
            try {
              const files: Array<{ tags: string[] }> = JSON.parse(r.tenderFiles);
              return files.some((f) => f.tags?.includes("costingAttachment")) ? 1 : 0;
            } catch { return 0; }
          };
          valA = getHasCosting(a);
          valB = getHasCosting(b);
        } else {
          valA = a[sortColumn as keyof EpcTenderRecord];
          valB = b[sortColumn as keyof EpcTenderRecord];
        }

        if (valA === valB) return 0;
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

        return sortDirection === "asc"
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return result;
  }, [
    records,
    globalSearch,
    sortColumn,
    sortDirection,
    startDate,
    endDate,
    multiSelectFilters,
    columnSearchText,
    remarksTextFilter,
    remarksDropdownFilter,
    proposedErpItemTextFilter,
    proposedErpItemCategoryFilter,
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

  // Reset page when search, sort, date filters, or row limit changes
  useEffect(() => {
    setCurrentPage(1);
  }, [globalSearch, sortColumn, sortDirection, rowsPerPage, startDate, endDate]);

  // 7. Scrolling is managed natively by the browser's layout engine

  // 8. Export Data Exporters
  const getCSVData = () => {
    const headers = visibleColumns.map((c) => c.header).join(",");
    const rows = processedRecords.map((rec) => {
      return visibleColumns
        .map((col) => {
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
              { label: "Filler", price: rec.fillerPrice },
            ].filter(
              (m) => m.price !== null && m.price !== undefined && m.price !== 0,
            );
            val = activeRates.map((m) => `${m.label}: ₹${m.price}`).join(" | ");
          } else {
            val = rec[col.accessor as keyof EpcTenderRecord];
          }
          if (val === null || val === undefined) return "";
          if (val instanceof Date) return val.toLocaleDateString("en-GB");

          // Escape quotes
          let strVal = String(val);
          if (
            strVal.includes(",") ||
            strVal.includes('"') ||
            strVal.includes("\n")
          ) {
            strVal = `"${strVal.replace(/"/g, '""')}"`;
          }
          return strVal;
        })
        .join(",");
    });
    return [headers, ...rows].join("\n");
  };

  const handleExportCSV = () => {
    const csvContent = getCSVData();
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `Tender_Participation_Data_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    // Generates a well-formed HTML Table formatted spreadsheet that Microsoft Excel parses cleanly
    const tableHeader = visibleColumns
      .map(
        (c) =>
          `<th style="background-color:#0a2540;color:#ffffff;font-weight:bold;">${c.header}</th>`,
      )
      .join("");
    const tableRows = processedRecords
      .map((rec) => {
        const cells = visibleColumns
          .map((col) => {
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
                { label: "Filler", price: rec.fillerPrice },
              ].filter(
                (m) =>
                  m.price !== null && m.price !== undefined && m.price !== 0,
              );
              val = activeRates
                .map((m) => `${m.label}: ${m.price}`)
                .join(" | ");
            } else {
              val = rec[col.accessor as keyof EpcTenderRecord];
            }
            if (val === null || val === undefined) return "<td></td>";
            if (val instanceof Date)
              return `<td>${val.toLocaleDateString("en-GB")}</td>`;
            if (col.type === "currency")
              return `<td style="text-align:right;">${val}</td>`;
            if (col.type === "percentage")
              return `<td style="text-align:right;">${((val as number) * 100).toFixed(1)}%</td>`;
            return `<td>${String(val)}</td>`;
          })
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

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
    link.setAttribute(
      "download",
      `Tender_Participation_Data_${new Date().toISOString().split("T")[0]}.xls`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Formatting Helper Utilities
  const formatCurrency = (val: number | null): string => {
    if (val === null) return "-";
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
      val,
    );
  };

  const formatDate = (val: Date | null): string => {
    if (!val) return "-";
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
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
      case ManagementDecision.GO:
        return "go";
      case ManagementDecision.NO_GO:
        return "nogo";
      default:
        return "";
    }
  };

  return (
    <div className="tender-table-container">
      {/* 9. Header Toolbar */}
      <div className="tender-table-toolbar">
        <div className="toolbar-left">
          <h2 className="table-title">Master Tender Participation Tracker</h2>
          <span className="record-count-badge">
            {totalRecords} Records Total
          </span>
          <div className="global-search-container">
            <span
              className="search-icon"
              style={{ display: "inline-flex", alignItems: "center" }}
            >
              <Search size={16} />
            </span>
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
          {sortColumn && (
            <button
              className="export-btn"
              onClick={handleClearSort}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <RotateCcw size={14} /> Clear Sort
            </button>
          )}
          <button
            className="export-btn"
            onClick={handleExportCSV}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            className="export-btn"
            onClick={handleExportExcel}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <FileSpreadsheet size={14} /> Export Excel
          </button>
        </div>
      </div>

      {/* 10. Data Table Grid */}
      <div className="tender-table-wrapper" ref={scrollContainerRef}>
        <table className="tender-data-table">
          <thead>
            <tr>
              {[
                <th
                  key="expand"
                  style={{ width: "40px" }}
                  className="col-center"
                ></th>,
                ...visibleColumns.map((col) => (
                  <th
                    key={col.accessor}
                    style={{
                      width: `${columnWidths[col.accessor]}px`,
                      ...(openDropdown === col.accessor
                        ? { zIndex: 100 }
                        : {}),
                    }}
                  >
                    <div
                      className="header-content"
                      onClick={() => handleSort(col.accessor)}
                    >
                      <span>{col.header}</span>
                      {sortColumn === col.accessor && (
                        <span
                          className="sort-indicator"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          {sortDirection === "asc" ? (
                            <ChevronUp size={12} />
                          ) : (
                            <ChevronDown size={12} />
                          )}
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
                    {!SKIP_FILTER_COLUMNS.has(col.accessor) && (
                      <div
                        className="custom-multiselect-container"
                        ref={(el) => {
                          dropdownRefs.current[col.accessor] = el;
                        }}
                      >
                        <button
                          className="multiselect-trigger-btn"
                          onClick={() =>
                            setOpenDropdown(
                              openDropdown === col.accessor ? null : col.accessor,
                            )
                          }
                        >
                          {(!multiSelectFilters[col.accessor] ||
                            multiSelectFilters[col.accessor].length === 0)
                            ? `All ${col.header}`
                            : `${multiSelectFilters[col.accessor].length} Selected`}
                          <span
                            className="dropdown-arrow"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                          >
                            <ChevronDown size={12} />
                          </span>
                        </button>
                        {openDropdown === col.accessor && (
                          <div className="multiselect-dropdown-panel">
                            <div className="multiselect-actions">
                              <button
                                className="multiselect-action-btn"
                                onClick={() => clearFilter(col.accessor)}
                              >
                                Clear All
                              </button>
                              <button
                                className="multiselect-action-btn"
                                onClick={() => selectAllFilter(col.accessor)}
                              >
                                Select All
                              </button>
                            </div>
                            <div className="multiselect-options-list">
                              {BOOLEAN_COLUMNS.has(col.accessor) ? (
                                <>
                                  {["Yes", "No"].map((opt) => (
                                    <label
                                      key={opt}
                                      className="multiselect-option-label"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={
                                          multiSelectFilters[col.accessor]?.includes(
                                            opt,
                                          ) ?? false
                                        }
                                        onChange={() =>
                                          toggleFilter(col.accessor, opt)
                                        }
                                      />
                                      <span>{opt}</span>
                                    </label>
                                  ))}
                                </>
                              ) : (
                                (uniqueValueCache[col.accessor] ?? []).map(
                                  (val) => (
                                    <label
                                      key={val}
                                      className="multiselect-option-label"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={
                                          multiSelectFilters[col.accessor]?.includes(
                                            val,
                                          ) ?? false
                                        }
                                        onChange={() =>
                                          toggleFilter(col.accessor, val)
                                        }
                                      />
                                      <span>{val}</span>
                                    </label>
                                  ),
                                )
                              )}
                              <label className="multiselect-option-label">
                                <input
                                  type="checkbox"
                                  checked={
                                    multiSelectFilters[col.accessor]?.includes(
                                      "(Blank)",
                                    ) ?? false
                                  }
                                  onChange={() =>
                                    toggleFilter(col.accessor, "(Blank)")
                                  }
                                />
                                <span>(Blank)</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {col.accessor !== "lastDateOfSubmission" && col.accessor !== "rawMaterials" && col.accessor !== "proposedErpItemName" && col.accessor !== "remarks" && (
                      <input
                        type="text"
                        className="column-search-input"
                        placeholder={`Search ${col.header}...`}
                        value={columnSearchText[col.accessor] ?? ""}
                        onChange={(e) => {
                          setColumnSearchText((prev) => ({
                            ...prev,
                            [col.accessor]: e.target.value,
                          }));
                          setCurrentPage(1);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
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
                    {col.accessor === "rawMaterials" &&
                      setAluminiumMin &&
                      setAluminiumMax &&
                      setCopperMin &&
                      setCopperMax && (
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
                          <div
                            className="filter-row"
                            style={{ marginTop: "4px" }}
                          >
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
                          {uniqueRemarks.map((rem) => (
                            <option key={rem} value={rem}>
                              {rem}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div
                      className="column-resizer"
                      onMouseDown={(e) =>
                        handleResizeStart(
                          e,
                          col.accessor,
                          columnWidths[col.accessor],
                        )
                      }
                    />
                  </th>
                )),
              ]}
            </tr>
          </thead>
          <tbody>
            {paginatedRecords.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + 1}
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
              paginatedRecords.map((record) => {
                const isExpanded = !!expandedRows[record.slNo];

                return (
                  <React.Fragment key={record.id ?? record.slNo}>
                    {/* Collapsed Primary Row */}
                    <tr
                      className={`tender-row ${isExpanded ? "expanded-row" : ""}`}
                    >
                      <td className="col-center">
                        <button
                          className="details-link"
                          onClick={() => toggleRowExpansion(record.slNo)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                        </button>
                      </td>

                      {visibleColumns.map((col) => {
                        let cellVal: any;
                        let cellContent: React.ReactNode = "-";
                        let cellClass = "";
                        let canEditDocket = false;

                        if (col.accessor === "rawMaterials") {
                          const activeRates = [
                            { label: "Al", price: record.aluminiumPrice },
                            {
                              label: "Al Alloy",
                              price: record.aluminiumAlloyPrice,
                            },
                            { label: "Cu", price: record.copperTapePrice },
                            {
                              label: "Semicon",
                              price: record.extrudedSemiconductivePrice,
                            },
                            { label: "XLPE", price: record.htXlpePrice },
                            { label: "ST-2", price: record.pvcTypeSt2Price },
                            {
                              label: "Steel",
                              price: record.galvanisedSteelFlatStripPrice,
                            },
                            { label: "Filler", price: record.fillerPrice },
                          ].filter(
                            (m) =>
                              m.price !== null &&
                              m.price !== undefined &&
                              m.price !== 0,
                          );

                          cellContent =
                            activeRates.length > 0 ? (
                              <div className="raw-materials-grid">
                                {activeRates.map((m) => (
                                  <div
                                    className="material-rate-tag"
                                    key={m.label}
                                    title={`${m.label}: ₹${m.price}/kg`}
                                  >
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
                              tenderFilesJson={record.tenderFiles || ""}
                              onOpenModal={handleOpenAttachmentModal}
                            />
                          );
                          cellClass = "col-center";
                        } else if (col.accessor === "boqChart") {
                          cellContent = (
                            <BOQChartCell docketNo={record.docketNo} boqFileId={record.boqFileId} tenderFilesJson={record.tenderFiles} />
                          );
                          cellClass = "col-center";
                        } else if (
                          col.accessor === "proposedErpItemName" ||
                          col.accessor === "proposedQty"
                        ) {
                          const text =
                            (record[
                              col.accessor as keyof EpcTenderRecord
                            ] as string) || "";
                          cellContent = text ? (
                            <div className="proposed-items-cell-content">
                              {text}
                            </div>
                          ) : (
                            <span>-</span>
                          );
                          cellClass = "col-left text-pre-line";
                        } else if (
                          col.accessor === "diffPercentFromL1"
                        ) {
                          const isEditing = editingDiffL1Id === record.id;
                          const isSaving = !!savingKeys[`${record.id}-diffL1`];
                          const storedVal = record.diffPercentFromL1 as number | null;
                          const pctVal = storedVal !== null ? parseFloat((storedVal * 100).toFixed(4)) : null;
                          if (isEditing) {
                            cellContent = (
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <input
                                  type="number"
                                  step="any"
                                  className="docket-edit-input"
                                  value={diffL1EditValue}
                                  autoFocus
                                  placeholder="e.g. -6.5"
                                  onChange={(e) => setDiffL1EditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleDiffSave(record, "diffPercentFromL1", diffL1EditValue, setEditingDiffL1Id, setDiffL1EditValue);
                                    } else if (e.key === "Escape") {
                                      setEditingDiffL1Id(null);
                                    }
                                  }}
                                />
                                <button
                                  onClick={() => handleDiffSave(record, "diffPercentFromL1", diffL1EditValue, setEditingDiffL1Id, setDiffL1EditValue)}
                                  disabled={isSaving}
                                  className="docket-save-btn"
                                  title="Save"
                                >
                                  <Check size={14} />
                                </button>
                              </div>
                            );
                            cellClass = "col-right col-editable diff-col";
                          } else {
                            const displayVal = pctVal !== null ? `${pctVal >= 0 ? "+" : ""}${pctVal.toFixed(1)}%` : "—";
                            cellContent = (
                              <span className="docket-display">
                                {displayVal}
                                {isSaving && <Loader2 size={12} className="spin" style={{ marginLeft: 4 }} />}
                              </span>
                            );
                            cellClass = `col-right col-editable diff-col ${pctVal !== null && pctVal < 0 ? "col-lost" : ""}`;
                          }
                        } else if (
                          col.accessor === "diffPercentFromL2"
                        ) {
                          const isEditing = editingDiffL2Id === record.id;
                          const isSaving = !!savingKeys[`${record.id}-diffL2`];
                          const storedVal = record.diffPercentFromL2 as number | null;
                          const pctVal = storedVal !== null ? parseFloat((storedVal * 100).toFixed(4)) : null;
                          if (isEditing) {
                            cellContent = (
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <input
                                  type="number"
                                  step="any"
                                  className="docket-edit-input"
                                  value={diffL2EditValue}
                                  autoFocus
                                  placeholder="e.g. -6.5"
                                  onChange={(e) => setDiffL2EditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleDiffSave(record, "diffPercentFromL2", diffL2EditValue, setEditingDiffL2Id, setDiffL2EditValue);
                                    } else if (e.key === "Escape") {
                                      setEditingDiffL2Id(null);
                                    }
                                  }}
                                />
                                <button
                                  onClick={() => handleDiffSave(record, "diffPercentFromL2", diffL2EditValue, setEditingDiffL2Id, setDiffL2EditValue)}
                                  disabled={isSaving}
                                  className="docket-save-btn"
                                  title="Save"
                                >
                                  <Check size={14} />
                                </button>
                              </div>
                            );
                            cellClass = "col-right col-editable diff-col";
                          } else {
                            const displayVal = pctVal !== null ? `${pctVal >= 0 ? "+" : ""}${pctVal.toFixed(1)}%` : "—";
                            cellContent = (
                              <span className="docket-display">
                                {displayVal}
                                {isSaving && <Loader2 size={12} className="spin" style={{ marginLeft: 4 }} />}
                              </span>
                            );
                            cellClass = `col-right col-editable diff-col ${pctVal !== null && pctVal < 0 ? "col-lost" : ""}`;
                          }
                        } else if (col.accessor === "competitors") {
                          const compVal =
                            (record[
                              col.accessor as keyof EpcTenderRecord
                            ] as string) || "";
                          const isEditingComp = editingCompetitorsId === record.id;
                          const isSavingComp = !!savingKeys[`${record.id}-competitors`];
                          if (isEditingComp) {
                            cellContent = (
                              <div style={{ display: "inline-flex", alignItems: "flex-start", gap: 4 }}>
                                <textarea
                                  value={competitorsEditValue}
                                  onChange={(e) => setCompetitorsEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.shiftKey) return;
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleCompetitorsSave(record);
                                    } else if (e.key === "Escape") {
                                      setEditingCompetitorsId(null);
                                    }
                                  }}
                                  autoFocus
                                  disabled={isSavingComp}
                                  className="remarks-edit-textarea"
                                  rows={3}
                                  style={{ width: "100%", minWidth: 180, fontSize: 11, padding: "4px 6px", resize: "vertical" }}
                                />
                                <button
                                  onClick={() => handleCompetitorsSave(record)}
                                  disabled={isSavingComp}
                                  className="docket-save-btn"
                                  title="Save"
                                  style={{ flexShrink: 0, marginTop: 2 }}
                                >
                                  <Check size={14} />
                                </button>
                              </div>
                            );
                            cellClass = "col-left col-editable";
                          } else {
                            cellContent = (
                              <span className="docket-display" style={{ display: "block", width: "100%" }}>
                                {compVal || "-"}
                                {isSavingComp && <Loader2 size={12} className="spin" style={{ marginLeft: 4 }} />}
                              </span>
                            );
                            cellClass = "col-left col-editable";
                          }
                        } else if (col.accessor === "remarks") {
                          const remarksVal =
                            (record[
                              col.accessor as keyof EpcTenderRecord
                            ] as string) || "";
                          const isEditingRem = editingRemarksId === record.id;
                          const isSavingRem = !!savingKeys[`${record.id}-remarks`];
                          if (isEditingRem) {
                            cellContent = (
                              <div style={{ display: "inline-flex", alignItems: "flex-start", gap: 4 }}>
                                <textarea
                                  value={remarksEditValue}
                                  onChange={(e) => setRemarksEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.shiftKey) return;
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleRemarksSave(record);
                                    } else if (e.key === "Escape") {
                                      setEditingRemarksId(null);
                                    }
                                  }}
                                  autoFocus
                                  disabled={isSavingRem}
                                  className="remarks-edit-textarea"
                                  rows={3}
                                  style={{ width: "100%", minWidth: 180, fontSize: 11, padding: "4px 6px", resize: "vertical" }}
                                />
                                <button
                                  onClick={() => handleRemarksSave(record)}
                                  disabled={isSavingRem}
                                  className="docket-save-btn"
                                  title="Save"
                                  style={{ flexShrink: 0, marginTop: 2 }}
                                >
                                  <Check size={14} />
                                </button>
                              </div>
                            );
                            cellClass = "col-left col-editable";
                          } else {
                            cellContent = (
                              <span className="docket-display" style={{ display: "block", width: "100%" }}>
                                {remarksVal || "-"}
                                {isSavingRem && <Loader2 size={12} className="spin" style={{ marginLeft: 4 }} />}
                              </span>
                            );
                            cellClass = "col-left col-editable";
                          }
                        } else if (col.accessor === "reason") {
                          const reasonVal =
                            (record[
                              col.accessor as keyof EpcTenderRecord
                            ] as string) || "";
                          const isEditingReason = editingReasonId === record.id;
                          const isSavingReason = !!savingKeys[`${record.id}-reason`];
                          if (isEditingReason) {
                            cellContent = (
                              <div style={{ display: "inline-flex", alignItems: "flex-start", gap: 4 }}>
                                <textarea
                                  value={reasonEditValue}
                                  onChange={(e) => setReasonEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.shiftKey) return;
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleReasonSave(record);
                                    } else if (e.key === "Escape") {
                                      setEditingReasonId(null);
                                    }
                                  }}
                                  autoFocus
                                  disabled={isSavingReason}
                                  className="remarks-edit-textarea"
                                  rows={3}
                                  style={{ width: "100%", minWidth: 180, fontSize: 11, padding: "4px 6px", resize: "vertical" }}
                                />
                                <button
                                  onClick={() => handleReasonSave(record)}
                                  disabled={isSavingReason}
                                  className="docket-save-btn"
                                  title="Save"
                                  style={{ flexShrink: 0, marginTop: 2 }}
                                >
                                  <Check size={14} />
                                </button>
                              </div>
                            );
                            cellClass = "col-left col-editable";
                          } else {
                            cellContent = (
                              <span className="docket-display" style={{ display: "block", width: "100%" }}>
                                {reasonVal || "-"}
                                {isSavingReason && <Loader2 size={12} className="spin" style={{ marginLeft: 4 }} />}
                              </span>
                            );
                            cellClass = "col-left col-editable";
                          }
                        } else if (col.accessor === "tenderUpdateStatus") {
                          const statusValue =
                            overrides[record.id!]?.tenderUpdateStatus ??
                            record.tenderUpdateStatus ??
                            "OPEN";
                          const isSaving =
                            !!savingKeys[`${record.id}::tenderUpdateStatus`];
                          if (readOnly) {
                            cellContent = (
                              <span className={`status-badge ${statusValue === "CLOSED" ? "won" : "eval"}`}>
                                {statusValue}
                              </span>
                            );
                            cellClass = "col-center";
                          } else {
                            cellContent = (
                              <select
                                value={statusValue}
                                disabled={isSaving}
                                onChange={(e) =>
                                  handleUpdate(
                                    record,
                                    "tenderUpdateStatus",
                                    e.target.value,
                                  )
                                }
                                className="table-editable-select status-select"
                              >
                                <option value="OPEN">Open</option>
                                <option value="CLOSED">Closed</option>
                              </select>
                            );
                            cellClass = "col-center col-editable";
                          }
                        } else if (col.accessor === "nextAction") {
                          const actionValue =
                            overrides[record.id!]?.nextAction !== undefined
                              ? overrides[record.id!]?.nextAction
                              : (record.nextAction ?? "");
                          const isSaving =
                            !!savingKeys[`${record.id}::nextAction`];
                          if (readOnly) {
                            const actionLabels: Record<string, string> = {
                              "UPDATE_FROM_AB_LETTER": "Update from AB letter",
                              "BG_REFUND_LETTER_TO_BE_SENT": "BG refund letter to be sent",
                              "FOLLOW_UP_FOR_FINANCIAL_STATUS": "Follow up for financial status",
                              "REVERSE_AUCTION_PENDING": "Reverse auction pending",
                            };
                            cellContent = (
                              <span>{actionValue ? actionLabels[actionValue] || actionValue : "-"}</span>
                            );
                            cellClass = "col-left";
                          } else {
                            cellContent = (
                              <select
                                value={actionValue || ""}
                                disabled={isSaving}
                                onChange={(e) =>
                                  handleUpdate(
                                    record,
                                    "nextAction",
                                    e.target.value || null,
                                  )
                                }
                                className="table-editable-select action-select"
                              >
                                <option value="">None</option>
                                <option value="UPDATE_FROM_AB_LETTER">
                                  Update from AB letter
                                </option>
                                <option value="BG_REFUND_LETTER_TO_BE_SENT">
                                  BG refund letter to be sent
                                </option>
                                <option value="FOLLOW_UP_FOR_FINANCIAL_STATUS">
                                  Follow up for financial status
                                </option>
                                <option value="REVERSE_AUCTION_PENDING">
                                  Reverse auction pending
                                </option>
                              </select>
                            );
                            cellClass = "col-left col-editable";
                          }
                        } else {
                          cellVal =
                            record[col.accessor as keyof EpcTenderRecord];

                          if (col.accessor === "attachmentUrl") {
                            const filesRaw = record.tenderFiles as string | undefined;
                            let url = "";
                            if (filesRaw) {
                              try {
                                const files: Array<{ url: string; tags: string[] }> = JSON.parse(filesRaw);
                                const costingFile = files.find((f) => f.tags?.includes("costingAttachment"));
                                url = costingFile?.url ?? "";
                              } catch {}
                            }
                            cellContent = url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="table-attachment-link"
                                title="Click to view costing attachment"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <FileText size={14} /> Costing
                              </a>
                            ) : (
                              "-"
                            );
                            cellClass = "col-center";
                          } else if (col.accessor === "priceBasis") {
                            const basis = (cellVal as string) || "Firm";
                            cellContent = (
                              <span
                                className={`price-basis-badge ${basis.toLowerCase().includes("variable") ? "variable" : "firm"}`}
                              >
                                {basis}
                              </span>
                            );
                            cellClass = "col-center";
                          } else if (col.type === "currency") {
                            cellContent = formatCurrency(
                              cellVal as number | null,
                            );
                            cellClass = "col-currency";
                          } else if (col.type === "percentage") {
                            cellContent = formatPercentage(
                              cellVal as number | null,
                            );
                            cellClass = "col-percentage";
                            if (cellVal !== null) {
                              cellClass +=
                                (cellVal as number) < 0 ? " col-lost" : ""; // Optional text highlight
                            }
                          } else if (col.type === "date") {
                            cellContent = formatDate(cellVal as Date | null);
                          } else if (col.type === "boolean") {
                            if (col.accessor === "reverseAuctionApplicable") {
                              const raVal =
                                overrides[record.id!]
                                  ?.reverseAuctionApplicable !== undefined
                                  ? overrides[record.id!]
                                      ?.reverseAuctionApplicable
                                  : record.reverseAuctionApplicable;
                              const isSaving =
                                !!savingKeys[
                                  `${record.id}::reverseAuctionApplicable`
                                ];

                              if (readOnly) {
                                const raDisplay = raVal === true ? "Yes" : raVal === false ? "No" : "-";
                                cellContent = <span>{raDisplay}</span>;
                                cellClass = "col-center";
                              } else {
                                let selectVal = "BLANK";
                                if (raVal === true) selectVal = "YES";
                                else if (raVal === false) selectVal = "NO";

                                cellContent = (
                                  <select
                                    value={selectVal}
                                    disabled={isSaving}
                                    onChange={(e) => {
                                      const val =
                                        e.target.value === "YES"
                                          ? true
                                          : e.target.value === "NO"
                                            ? false
                                            : null;
                                      handleUpdate(
                                        record,
                                        "reverseAuctionApplicable",
                                        val,
                                      );
                                    }}
                                    className="table-editable-select status-select"
                                    style={{
                                      minWidth: "60px",
                                      padding: "2px 4px",
                                      fontSize: "11px",
                                    }}
                                  >
                                    <option value="BLANK">(Blank)</option>
                                    <option value="YES">Yes</option>
                                    <option value="NO">No</option>
                                  </select>
                                );
                                cellClass = "col-center col-editable";
                              }
                            } else if (col.accessor === "participated") {
                              const participatedVal = cellVal as boolean | null;
                              const isYes = participatedVal === true;
                              const isNo = participatedVal === false;

                              if (readOnly && !editableColumns.includes("participated")) {
                                cellContent = isYes ? (
                                  <span className="status-badge won" style={{ fontSize: "11px", padding: "2px 8px" }}>Yes</span>
                                ) : isNo ? (
                                  <span className="status-badge lost" style={{ fontSize: "11px", padding: "2px 8px" }}>No</span>
                                ) : (
                                  <span>-</span>
                                );
                                cellClass = "col-center";
                              } else {
                                const reduxRow = tenderData?.rows.find(r => String(r.id) === String(record.id));
                                const reduxIndex = reduxRow != null ? tenderData!.rows.indexOf(reduxRow) : -1;
                                const updKey = `${reduxIndex}-participated`;
                                const isUpdating = !!updatingCells[updKey];

                                cellContent = (
                                  <div style={{ display: "flex", gap: "4px", padding: "4px 0" }}>
                                    <button
                                      type="button"
                                      disabled={isUpdating}
                                      onClick={() => {
                                        if (reduxIndex < 0 || !record.id) return;
                                        const oldVal = String(tenderData!.rows[reduxIndex]?.participated ?? "");
                                        dispatch(updateTenderCell({
                                          rowIndex: reduxIndex,
                                          field: "participated",
                                          value: "true",
                                          tenderMergedId: Number(record.id),
                                          oldValue: oldVal,
                                        }));
                                      }}
                                      style={{
                                        width: "28px", height: "28px", borderRadius: "4px",
                                        fontSize: "11px", fontWeight: 700, border: "2px solid",
                                        cursor: isUpdating ? "not-allowed" : "pointer",
                                        opacity: isUpdating ? 0.5 : 1,
                                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                                        backgroundColor: isUpdating ? "#e2e8f0" : isYes ? "#22c55e" : "#ffffff",
                                        color: isUpdating ? "#94a3b8" : isYes ? "#ffffff" : "#94a3b8",
                                        borderColor: isUpdating ? "#cbd5e1" : isYes ? "#16a34a" : "#cbd5e1",
                                      }}
                                    >
                                      {isUpdating ? "..." : "Y"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isUpdating}
                                      onClick={() => {
                                        if (reduxIndex < 0 || !record.id) return;
                                        const oldVal = String(tenderData!.rows[reduxIndex]?.participated ?? "");
                                        dispatch(updateTenderCell({
                                          rowIndex: reduxIndex,
                                          field: "participated",
                                          value: "false",
                                          tenderMergedId: Number(record.id),
                                          oldValue: oldVal,
                                        }));
                                      }}
                                      style={{
                                        width: "28px", height: "28px", borderRadius: "4px",
                                        fontSize: "11px", fontWeight: 700, border: "2px solid",
                                        cursor: isUpdating ? "not-allowed" : "pointer",
                                        opacity: isUpdating ? 0.5 : 1,
                                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                                        backgroundColor: isUpdating ? "#e2e8f0" : isNo ? "#ef4444" : "#ffffff",
                                        color: isUpdating ? "#94a3b8" : isNo ? "#ffffff" : "#94a3b8",
                                        borderColor: isUpdating ? "#cbd5e1" : isNo ? "#dc2626" : "#cbd5e1",
                                      }}
                                    >
                                      {isUpdating ? "..." : "N"}
                                    </button>
                                  </div>
                                );
                                cellClass = "col-center";
                              }
                            } else {
                              const isApp = cellVal as boolean | null;
                              cellContent =
                                isApp === null || isApp === undefined ? (
                                  <span className="ra-icon not-applicable">
                                    -
                                  </span>
                                ) : (
                                  <span
                                    className={`ra-icon ${isApp ? "applicable" : "not-applicable"}`}
                                  >
                                    {isApp ? (
                                      <Check size={14} />
                                    ) : (
                                      <Circle size={14} />
                                    )}
                                  </span>
                                );
                              cellClass = "col-center";
                            }
                          } else if (col.type === "status") {
                            const statusVal = (cellVal as string) || "";
                            cellContent = statusVal ? (
                              <span
                                className={`status-badge ${getStatusClass(statusVal)}`}
                              >
                                {statusVal}
                              </span>
                            ) : (
                              <span>-</span>
                            );
                            cellClass = "col-center";
                          } else if (col.type === "decision") {
                            const decVal = cellVal as ManagementDecision;
                            cellContent = (
                              <span
                                className={`decision-badge ${getDecisionClass(decVal)}`}
                              >
                                {decVal}
                              </span>
                            );
                            cellClass = "col-center";
                          } else {
                            if (col.accessor === "bgStatus") {
                              const val = (cellVal as string) || "";
                              cellContent = val ? (
                                <span
                                  className={`bg-status-badge ${val.toLowerCase()}`}
                                >
                                  {val}
                                </span>
                              ) : (
                                "-"
                              );
                              cellClass = "col-center";
                            } else if (col.accessor === "docketNo") {
                              const docketVal = cellVal !== null && cellVal !== undefined ? String(cellVal) : "";
                              const isEditing = editingDocketId === record.id;
                              const isSaving = !!savingKeys[`${record.id}-docket`];
                              canEditDocket = !readOnly || !docketVal;
                              if (!canEditDocket) {
                                cellContent = (
                                  <span className="docket-display">{docketVal || "-"}</span>
                                );
                                cellClass = "col-docket";
                              } else if (isEditing) {
                                cellContent = (
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                    <input
                                      type="text"
                                      value={docketEditValue}
                                      onChange={(e) => setDocketEditValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          handleDocketSave(record);
                                        } else if (e.key === "Escape") {
                                          setEditingDocketId(null);
                                        }
                                      }}
                                      autoFocus
                                      disabled={isSaving}
                                      className="docket-edit-input"
                                    />
                                    <button
                                      onClick={() => handleDocketSave(record)}
                                      disabled={isSaving}
                                      className="docket-save-btn"
                                      title="Save"
                                    >
                                      <Check size={14} />
                                    </button>
                                  </div>
                                );
                              } else {
                                cellContent = (
                                  <span className="docket-display">
                                    {docketVal || "-"}
                                    {isSaving && <Loader2 size={12} className="spin" style={{ marginLeft: 4 }} />}
                                  </span>
                                );
                              }
                              cellClass = !canEditDocket ? "col-docket" : "col-docket col-editable";
                            } else if (col.accessor === "bgNoUtrNo") {
                              const bgUtrVal = cellVal !== null && cellVal !== undefined ? String(cellVal) : "";
                              const isEditingBg = editingBgUtrId === record.id;
                              const isSavingBg = !!savingKeys[`${record.id}-bgUtr`];
                              if (isEditingBg) {
                                cellContent = (
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                    <input
                                      type="text"
                                      value={bgUtrEditValue}
                                      onChange={(e) => setBgUtrEditValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          handleBgUtrSave(record);
                                        } else if (e.key === "Escape") {
                                          setEditingBgUtrId(null);
                                        }
                                      }}
                                      autoFocus
                                      disabled={isSavingBg}
                                      className="docket-edit-input"
                                    />
                                    <button
                                      onClick={() => handleBgUtrSave(record)}
                                      disabled={isSavingBg}
                                      className="docket-save-btn"
                                      title="Save"
                                    >
                                      <Check size={14} />
                                    </button>
                                  </div>
                                );
                              } else {
                                cellContent = (
                                  <span className="docket-display">
                                    {bgUtrVal || "-"}
                                    {isSavingBg && <Loader2 size={12} className="spin" style={{ marginLeft: 4 }} />}
                                  </span>
                                );
                              }
                              cellClass = "col-editable";
                            } else if (col.accessor === "loiPoNoAndDate") {
                              const loiPoVal = cellVal !== null && cellVal !== undefined ? String(cellVal) : "";
                              const isEditingLoi = editingLoiPoId === record.id;
                              const isSavingLoi = !!savingKeys[`${record.id}-loiPo`];
                              if (isEditingLoi) {
                                cellContent = (
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                    <input
                                      type="text"
                                      value={loiPoEditValue}
                                      onChange={(e) => setLoiPoEditValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") { handleLoiPoSave(record); }
                                        else if (e.key === "Escape") { setEditingLoiPoId(null); }
                                      }}
                                      autoFocus
                                      disabled={isSavingLoi}
                                      className="docket-edit-input"
                                    />
                                    <button onClick={() => handleLoiPoSave(record)} disabled={isSavingLoi} className="docket-save-btn" title="Save"><Check size={14} /></button>
                                  </div>
                                );
                                cellClass = "col-editable";
                              } else {
                                cellContent = (
                                  <span className="docket-display">
                                    {loiPoVal || "-"}
                                    {isSavingLoi && <Loader2 size={12} className="spin" style={{ marginLeft: 4 }} />}
                                  </span>
                                );
                                cellClass = "col-editable";
                              }
                            } else if (col.accessor === "beneficiaryBankDetails") {
                              const bankVal = cellVal !== null && cellVal !== undefined ? String(cellVal) : "";
                              const isEditingBank = editingBankDetailsId === record.id;
                              const isSavingBank = !!savingKeys[`${record.id}-bankDetails`];
                              if (isEditingBank) {
                                cellContent = (
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                    <input
                                      type="text"
                                      value={bankDetailsEditValue}
                                      onChange={(e) => setBankDetailsEditValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          handleBankDetailsSave(record);
                                        } else if (e.key === "Escape") {
                                          setEditingBankDetailsId(null);
                                        }
                                      }}
                                      autoFocus
                                      disabled={isSavingBank}
                                      className="docket-edit-input"
                                    />
                                    <button
                                      onClick={() => handleBankDetailsSave(record)}
                                      disabled={isSavingBank}
                                      className="docket-save-btn"
                                      title="Save"
                                    >
                                      <Check size={14} />
                                    </button>
                                  </div>
                                );
                              } else {
                                cellContent = (
                                  <span className="docket-display">
                                    {bankVal || "-"}
                                    {isSavingBank && <Loader2 size={12} className="spin" style={{ marginLeft: 4 }} />}
                                  </span>
                                );
                              }
                              cellClass = "col-editable";
                            } else {
                              cellContent =
                                cellVal !== null && cellVal !== undefined
                                  ? String(cellVal)
                                  : "-";
                            }
                          }
                        }

                        return (
                          <td
                            key={col.accessor}
                            className={cellClass}
                            style={{ width: `${columnWidths[col.accessor]}px` }}
                            onClick={
                              col.accessor === "docketNo" && canEditDocket && editingDocketId !== record.id
                                ? () => {
                                    if (!savingKeys[`${record.id}-docket`]) {
                                      setEditingDocketId(record.id!);
                                      setDocketEditValue(cellVal != null ? String(cellVal) : "");
                                    }
                                  }
                                : col.accessor === "bgNoUtrNo" && editingBgUtrId !== record.id
                                  ? () => {
                                      if (!savingKeys[`${record.id}-bgUtr`]) {
                                        setEditingBgUtrId(record.id!);
                                        setBgUtrEditValue(cellVal != null ? String(cellVal) : "");
                                      }
                                    }
                                  : col.accessor === "remarks" && editingRemarksId !== record.id
                                    ? () => {
                                        if (!savingKeys[`${record.id}-remarks`]) {
                                          setEditingRemarksId(record.id!);
                                          setRemarksEditValue(cellVal != null ? String(cellVal) : "");
                                        }
                                      }
                                    : col.accessor === "diffPercentFromL1" && editingDiffL1Id !== record.id
                                      ? () => {
                                          if (!savingKeys[`${record.id}-diffL1`]) {
                                            setEditingDiffL1Id(record.id!);
                                            const storedL1 = record.diffPercentFromL1 as number | null;
                                            const pct = storedL1 !== null ? parseFloat((storedL1 * 100).toFixed(4)) : null;
                                            setDiffL1EditValue(pct !== null ? String(pct) : "");
                                          }
                                        }
                                      : col.accessor === "diffPercentFromL2" && editingDiffL2Id !== record.id
                                        ? () => {
                                            if (!savingKeys[`${record.id}-diffL2`]) {
                                              setEditingDiffL2Id(record.id!);
                                              const storedL2 = record.diffPercentFromL2 as number | null;
                                              const pct = storedL2 !== null ? parseFloat((storedL2 * 100).toFixed(4)) : null;
                                              setDiffL2EditValue(pct !== null ? String(pct) : "");
                                            }
                                          }
                                        : col.accessor === "loiPoNoAndDate" && editingLoiPoId !== record.id
                                          ? () => {
                                              if (!savingKeys[`${record.id}-loiPo`]) {
                                                setEditingLoiPoId(record.id!);
                                                setLoiPoEditValue(cellVal != null ? String(cellVal) : "");
                                              }
                                            }
                                          : col.accessor === "competitors" && editingCompetitorsId !== record.id
                                            ? () => {
                                                if (!savingKeys[`${record.id}-competitors`]) {
                                                  setEditingCompetitorsId(record.id!);
                                                  setCompetitorsEditValue(cellVal != null ? String(cellVal) : "");
                                                }
                                              }
                                             : col.accessor === "reason" && editingReasonId !== record.id
                                               ? () => {
                                                   if (!savingKeys[`${record.id}-reason`]) {
                                                     setEditingReasonId(record.id!);
                                                     setReasonEditValue(cellVal != null ? String(cellVal) : "");
                                                   }
                                                 }
                                               : col.accessor === "beneficiaryBankDetails" && editingBankDetailsId !== record.id
                                                 ? () => {
                                                     if (!savingKeys[`${record.id}-bankDetails`]) {
                                                       setEditingBankDetailsId(record.id!);
                                                       setBankDetailsEditValue(cellVal != null ? String(cellVal) : "");
                                                     }
                                                   }
                                                 : undefined
                            }
                            title={
                              col.accessor !== "rawMaterials" &&
                              col.type !== "boolean" &&
                              cellVal !== null &&
                              cellVal !== undefined
                                ? String(cellVal)
                                : undefined
                            }
                          >
                            {cellContent}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Expandable Details Row */}
                    {isExpanded && (
                      <tr className="details-panel-row">
                        <td colSpan={visibleColumns.length + 1}>
                          <div className="details-panel-content">
                            <div className="details-grid">
                              {/* 1. Name of Work / Item Description */}
                              <div className="details-item span-full">
                                <span className="details-label">
                                  Name of Work / Item Description
                                </span>
                                <span className="details-value">
                                  {record.nameOfWorkDescription}
                                </span>
                              </div>

                              {/* 2. Total Quantity in Meter */}
                              <div className="details-item">
                                <span className="details-label">
                                  Total Quantity (in Meters)
                                </span>
                                <span className="details-value">
                                  {record.totalQuantityMeter !== null &&
                                  record.totalQuantityMeter !== undefined
                                    ? new Intl.NumberFormat("en-IN").format(
                                        record.totalQuantityMeter,
                                      )
                                    : "-"}
                                </span>
                              </div>

                              {/* 3. Bid Validity */}
                              <div className="details-item">
                                <span className="details-label">
                                  Bid Validity
                                </span>
                                <span className="details-value">
                                  {record.bidValidityDays !== null
                                    ? `${record.bidValidityDays} Days`
                                    : "-"}
                                </span>
                              </div>

                              {/* 4. Contract Period in Days */}
                              <div className="details-item">
                                <span className="details-label">
                                  Contract Period
                                </span>
                                <span className="details-value">
                                  {record.contractPeriodDays !== null
                                    ? `${record.contractPeriodDays} Days`
                                    : "-"}
                                </span>
                              </div>

                              {/* 5. Cost of Tender / Tender Fee (In Rs) */}
                              <div className="details-item">
                                <span className="details-label">
                                  Tender Fee / Cost
                                </span>
                                <span className="details-value">
                                  {record.costOfTenderFeeRs !== null
                                    ? `₹ ${formatCurrency(record.costOfTenderFeeRs)}`
                                    : "-"}
                                </span>
                              </div>

                              {/* 6. EMD Payment Through BG / NEFT */}
                              <div className="details-item">
                                <span className="details-label">
                                  EMD Payment Mode
                                </span>
                                <span className="details-value">
                                  {record.emdPaymentMode || "-"}
                                </span>
                              </div>

                              {/* 7. BG No / UTR No */}
                              <div className="details-item">
                                <span className="details-label">
                                  BG No / UTR No
                                </span>
                                <span className="details-value">
                                  {record.bgNoUtrNo || "-"}
                                </span>
                              </div>

                              {/* 8. EMD Validity */}
                              <div className="details-item">
                                <span className="details-label">
                                  EMD Validity Date
                                </span>
                                <span className="details-value">
                                  {formatDate(record.emdValidity)}
                                </span>
                              </div>

                              {/* 9. Remarks */}
                              <div className="details-item span-full">
                                <span className="details-label">Remarks</span>
                                <span className="details-value">
                                  {record.remarks || "-"}
                                </span>
                              </div>

                              {/* 10. Final Remarks */}
                              <div className="details-item span-full">
                                <span className="details-label">
                                  Final Remarks
                                </span>
                                <span className="details-value">
                                  {record.finalRemarks || "-"}
                                </span>
                              </div>

                              {/* 11. Costing Attachment Link */}
                              {record.attachmentUrl && (
                                <div className="details-item span-full">
                                  <span className="details-label">
                                    Costing Attachment
                                  </span>
                                  <span
                                    className="details-value"
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "10px",
                                      alignItems: "flex-start",
                                      marginTop: "6px",
                                    }}
                                  >
                                    <a
                                      href={record.attachmentUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="costing-attachment-link"
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                      }}
                                    >
                                      <FileText size={14} /> View Costing
                                      Attachment
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
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
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

      <AttachmentModal
        isOpen={isAttachmentModalOpen}
        onClose={() => setIsAttachmentModalOpen(false)}
        files={selectedFiles}
      />

    </div>
  );
};
