"use client";
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  EpcTenderRecord,
  ManagementDecision,
  EMDExchangeMode,
  CURRENT_STATUS_OPTIONS,
} from "@/types/tender";
import { AttachmentModal } from "./AttachmentModal";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { AppDispatch } from "@/lib/store";
import { updateTenderDocketNo, updateTenderBgNoUtrNo, updateTenderRemarks, updateTenderBeneficiaryBankDetails, updateTenderReason, updateTenderLoiPoNoAndDate, updateTenderCompetitors, updateTenderDiffPercentFromL1, updateTenderDiffPercentFromL2, updateTenderCell, updateTenderStatusAndAction, updateTenderMergedField, updateWebsiteMapping } from "@/lib/slices/tendersSlice";
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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MergedOfficeEditDialog from "./MergedOfficeEditDialog";
import WebsiteEditDialog from "./tender-viewer/website-edit-dialog";
import ReportingOfficersEditDialog from "./ReportingOfficersEditDialog";
import { countRawMaterials } from "@/lib/rawMaterials";
import "./TenderTable.css";

const filesCache = new Map<string, any[]>();
const filesPromiseCache = new Map<string, Promise<any[]>>();

const fetchDocketFiles = (docketNo: string): Promise<any[]> => {
  if (filesCache.has(docketNo)) {
    // console.log(`[DEBUG fetchDocketFiles] CACHE HIT for ${docketNo}:`, filesCache.get(docketNo));
    return Promise.resolve(filesCache.get(docketNo)!);
  }
  if (filesPromiseCache.has(docketNo)) {
    // console.log(`[DEBUG fetchDocketFiles] IN-FLIGHT HIT for ${docketNo}`);
    return filesPromiseCache.get(docketNo)!;
  }
  // console.log(`[DEBUG fetchDocketFiles] FETCHING for ${docketNo}`);
  const promise = fetch(`/api/executive-tenders/${docketNo}/files`, {
    headers: {
      Authorization: "Bearer MOCK_TOKEN_LASERPOWER_SECURE_AUTH_SCOPE",
    },
  })
    .then((res) => {
      // console.log(`[DEBUG fetchDocketFiles] ${docketNo} response status:`, res.status, res.statusText);
      return res.ok ? res.json() : { files: [] };
    })
    .then((data) => {
      // console.log(`[DEBUG fetchDocketFiles] ${docketNo} response data:`, JSON.stringify(data).slice(0, 500));
      const files = data.files || [];
      filesCache.set(docketNo, files);
      filesPromiseCache.delete(docketNo);
      return files;
    })
    .catch((err) => {
      // console.warn(`[DEBUG fetchDocketFiles] ${docketNo} fetch error:`, err);
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

type EditableInputKind = "text" | "textarea" | "number";

interface EditableFieldConfig {
  accessor: string;
  kind: EditableInputKind;
  editableClass: string;
  readOnlyClass?: string;
  canEdit: (
    record: EpcTenderRecord,
    readOnly: boolean,
    editableColumns: string[],
  ) => boolean;
  display: (record: EpcTenderRecord) => string;
  toDraft: (record: EpcTenderRecord) => string;
  displayClass?: (record: EpcTenderRecord) => string;
  parse?: (draft: string) => { error?: string };
  toStored: (draft: string) => unknown;
  fromStored: (record: EpcTenderRecord) => unknown;
  save: (
    dispatch: AppDispatch,
    record: EpcTenderRecord,
    stored: unknown,
    draft: string,
  ) => Promise<unknown>;
  successMessage?: (record: EpcTenderRecord, draft: string) => string;
}

const textFieldConfig = (
  accessor: string,
  kind: EditableInputKind,
  editableClass: string,
  readOnlyClass?: string,
  canEdit?: (
    record: EpcTenderRecord,
    readOnly: boolean,
    editableColumns: string[],
  ) => boolean,
  save?: (
    dispatch: AppDispatch,
    record: EpcTenderRecord,
    stored: unknown,
    draft: string,
  ) => Promise<unknown>,
  successMessage?: (record: EpcTenderRecord, draft: string) => string,
): EditableFieldConfig => ({
  accessor,
  kind,
  editableClass,
  readOnlyClass,
  canEdit: canEdit ?? (() => true),
  display: (record) => {
    const v = record[accessor as keyof EpcTenderRecord];
    return v !== null && v !== undefined && v !== "" ? String(v) : "-";
  },
  toDraft: (record) => {
    const v = record[accessor as keyof EpcTenderRecord];
    return v !== null && v !== undefined ? String(v) : "";
  },
  toStored: (draft) => draft.trim(),
  fromStored: (record) =>
    String(record[accessor as keyof EpcTenderRecord] ?? ""),
  save:
    save ??
    ((dispatch, record, stored) =>
      dispatch(
        updateTenderMergedField({
          rowIndex: 0,
          field: accessor,
          value: stored as string,
          tenderMergedId: Number(record.id),
          oldValue: String(record[accessor as keyof EpcTenderRecord] ?? ""),
        }),
      ).unwrap()),
  successMessage:
    successMessage ?? (() => `${accessor} updated successfully!`),
});

const diffFieldConfig = (
  accessor: "diffPercentFromL1" | "diffPercentFromL2",
  label: string,
  saveThunk: (
    dispatch: AppDispatch,
    record: EpcTenderRecord,
    stored: unknown,
  ) => Promise<unknown>,
): EditableFieldConfig => ({
  accessor,
  kind: "number",
  editableClass: "col-right col-editable diff-col",
  readOnlyClass: "col-right diff-col",
  canEdit: () => true,
  display: (record) => {
    const storedVal = record[accessor] as number | null;
    const pctVal =
      storedVal !== null ? parseFloat((storedVal * 100).toFixed(4)) : null;
    return pctVal !== null
      ? `${pctVal >= 0 ? "+" : ""}${pctVal.toFixed(1)}%`
      : "—";
  },
  displayClass: (record) => {
    const storedVal = record[accessor] as number | null;
    const pctVal =
      storedVal !== null ? parseFloat((storedVal * 100).toFixed(4)) : null;
    return pctVal !== null && pctVal < 0 ? " col-lost" : "";
  },
  toDraft: (record) => {
    const storedVal = record[accessor] as number | null;
    const pctVal =
      storedVal !== null ? parseFloat((storedVal * 100).toFixed(4)) : null;
    return pctVal !== null ? String(pctVal) : "";
  },
  parse: (draft) => {
    const t = draft.trim();
    if (t !== "" && isNaN(parseFloat(t))) {
      return { error: "Please enter a valid number." };
    }
    return {};
  },
  toStored: (draft) => {
    const t = draft.trim();
    const n = t === "" ? null : parseFloat(t);
    return n !== null ? parseFloat((n / 100).toFixed(6)) : null;
  },
  fromStored: (record) => (record[accessor] as number | null) ?? null,
  save: (dispatch, record, stored) => saveThunk(dispatch, record, stored),
  successMessage: () => `${label} saved!`,
});

const EDITABLE_FIELDS: Record<string, EditableFieldConfig> = {
  docketNo: textFieldConfig(
    "docketNo",
    "text",
    "col-docket col-editable",
    "col-docket",
    (r, readOnly) => !readOnly || !r.docketNo,
    (dispatch, record, stored) =>
      dispatch(
        updateTenderDocketNo({
          tenderMergedId: Number(record.id),
          docketNo: stored as string,
          oldDocketNo: record.docketNo ?? "",
        }),
      ).unwrap(),
    (_, draft) => `Docket ${draft.trim()} updated successfully!`,
  ),
  bgNoUtrNo: textFieldConfig(
    "bgNoUtrNo",
    "text",
    "col-editable",
    undefined,
    undefined,
    (dispatch, record, stored) =>
      dispatch(
        updateTenderBgNoUtrNo({
          tenderMergedId: Number(record.id),
          bgNoUtrNo: stored as string,
          oldBgNoUtrNo: record.bgNoUtrNo ?? "",
        }),
      ).unwrap(),
    () => "BG/UTR No updated successfully!",
  ),
  remarks: textFieldConfig(
    "remarks",
    "textarea",
    "col-left col-editable",
    undefined,
    undefined,
    (dispatch, record, stored) =>
      dispatch(
        updateTenderRemarks({
          tenderMergedId: Number(record.id),
          remarks: stored as string,
          oldRemarks: record.remarks ?? "",
        }),
      ).unwrap(),
    () => "Remarks updated successfully!",
  ),
  beneficiaryBankDetails: textFieldConfig(
    "beneficiaryBankDetails",
    "text",
    "col-editable",
    undefined,
    undefined,
    (dispatch, record, stored) =>
      dispatch(
        updateTenderBeneficiaryBankDetails({
          tenderMergedId: Number(record.id),
          beneficiaryBankDetails: stored as string,
          oldBeneficiaryBankDetails: record.beneficiaryBankDetails ?? "",
        }),
      ).unwrap(),
    () => "Bank details updated!",
  ),
  loiPoNoAndDate: textFieldConfig(
    "loiPoNoAndDate",
    "text",
    "col-editable",
    undefined,
    undefined,
    (dispatch, record, stored) =>
      dispatch(
        updateTenderLoiPoNoAndDate({
          tenderMergedId: Number(record.id),
          loiPoNoAndDate: stored as string,
          oldLoiPoNoAndDate: record.loiPoNoAndDate ?? "",
        }),
      ).unwrap(),
    () => "LOI/PO No updated!",
  ),
  competitors: textFieldConfig(
    "competitors",
    "textarea",
    "col-left col-editable",
    undefined,
    undefined,
    (dispatch, record, stored) =>
      dispatch(
        updateTenderCompetitors({
          tenderMergedId: Number(record.id),
          competitors: stored as string,
          oldCompetitors: record.competitors ?? "",
        }),
      ).unwrap(),
    () => "Competitors updated!",
  ),
  reason: textFieldConfig(
    "reason",
    "textarea",
    "col-left col-editable",
    undefined,
    undefined,
    (dispatch, record, stored) =>
      dispatch(
        updateTenderReason({
          tenderMergedId: Number(record.id),
          reason: stored as string,
          oldReason: record.reason ?? "",
        }),
      ).unwrap(),
    () => "Reason updated!",
  ),
  miiPurchasePreference: textFieldConfig("miiPurchasePreference", "text", "col-editable"),
  raQualificationRule: textFieldConfig("raQualificationRule", "text", "col-editable"),
  startupExemption: textFieldConfig("startupExemption", "text", "col-editable"),
  minimumAverageAnnualTurnover: textFieldConfig(
    "minimumAverageAnnualTurnover",
    "text",
    "col-editable",
  ),
  yearsOfPastExperience: textFieldConfig("yearsOfPastExperience", "text", "col-editable"),
  ePbgDurationMonths: textFieldConfig("ePbgDurationMonths", "text", "col-editable"),
  ourRank: textFieldConfig(
    "ourRank",
    "text",
    "col-center col-editable",
    "col-center",
    (r, readOnly, editableColumns) => !(readOnly && !editableColumns.includes("ourRank")),
  ),
  ourValue: textFieldConfig(
    "ourValue",
    "text",
    "col-center col-editable",
    "col-center",
    (r, readOnly, editableColumns) => !(readOnly && !editableColumns.includes("ourValue")),
  ),
  nameOfRank1: textFieldConfig(
    "nameOfRank1",
    "text",
    "col-left col-editable",
    "col-left",
    (r, readOnly, editableColumns) => !(readOnly && !editableColumns.includes("nameOfRank1")),
  ),
  valueOfRank1: textFieldConfig(
    "valueOfRank1",
    "text",
    "col-right col-editable",
    "col-right",
    (r, readOnly, editableColumns) => !(readOnly && !editableColumns.includes("valueOfRank1")),
  ),
  differenceBetweenRank1: textFieldConfig(
    "differenceBetweenRank1",
    "text",
    "col-right col-editable",
    "col-right",
    (r, readOnly, editableColumns) => !(readOnly && !editableColumns.includes("differenceBetweenRank1")),
  ),
  nameOfRank2: textFieldConfig(
    "nameOfRank2",
    "text",
    "col-left col-editable",
    "col-left",
    (r, readOnly, editableColumns) => !(readOnly && !editableColumns.includes("nameOfRank2")),
  ),
  valueOfRank2: textFieldConfig(
    "valueOfRank2",
    "text",
    "col-right col-editable",
    "col-right",
    (r, readOnly, editableColumns) => !(readOnly && !editableColumns.includes("valueOfRank2")),
  ),
  differenceBetweenRank2: textFieldConfig(
    "differenceBetweenRank2",
    "text",
    "col-right col-editable",
    "col-right",
    (r, readOnly, editableColumns) => !(readOnly && !editableColumns.includes("differenceBetweenRank2")),
  ),
  quotationNo: textFieldConfig(
    "quotationNo",
    "text",
    "col-docket col-editable",
    "col-docket",
    (r, readOnly) => !readOnly || !r.quotationNo,
  ),
  contractNo: textFieldConfig(
    "contractNo",
    "text",
    "col-docket col-editable",
    "col-docket",
    (r, readOnly) => !readOnly || !r.contractNo,
  ),
  emd: textFieldConfig("emd", "text", "col-editable"),
  bgDate: textFieldConfig("bgDate", "text", "col-editable"),
  bgExpiryDate: textFieldConfig("bgExpiryDate", "text", "col-editable"),
  claimDate: textFieldConfig("claimDate", "text", "col-editable"),
  diffPercentFromL1: diffFieldConfig(
    "diffPercentFromL1",
    "Diff L1",
    (dispatch, record, stored) =>
      dispatch(
        updateTenderDiffPercentFromL1({
          tenderMergedId: Number(record.id),
          diffPercentFromL1: stored as number | null,
          oldDiffPercentFromL1: String(record.diffPercentFromL1 ?? ""),
        }),
      ).unwrap(),
  ),
  diffPercentFromL2: diffFieldConfig(
    "diffPercentFromL2",
    "Diff L2",
    (dispatch, record, stored) =>
      dispatch(
        updateTenderDiffPercentFromL2({
          tenderMergedId: Number(record.id),
          diffPercentFromL2: stored as number | null,
          oldDiffPercentFromL2: String(record.diffPercentFromL2 ?? ""),
        }),
      ).unwrap(),
  ),
};

const InlineEditor: React.FC<{
  initialValue: string;
  kind: EditableInputKind;
  saving: boolean;
  onSave: (draft: string) => void;
  onCancel: () => void;
}> = ({ initialValue, kind, saving, onSave, onCancel }) => {
  const [draft, setDraft] = useState(initialValue);
  const editorRef = useRef<HTMLDivElement>(null);
  const commit = () => {
    if (!saving) onSave(draft);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (saving) return;
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () =>
      document.removeEventListener("mousedown", handleOutsideClick);
  }, [onCancel, saving]);

  if (kind === "textarea") {
    return (
      <div
        ref={editorRef}
        style={{ display: "inline-flex", alignItems: "flex-start", gap: 4 }}
        onContextMenu={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.shiftKey) return;
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              onCancel();
            }
          }}
          autoFocus
          disabled={saving}
          className="remarks-edit-textarea"
          rows={3}
          style={{ width: "100%", minWidth: 180, fontSize: 11, padding: "4px 6px", resize: "vertical" }}
        />
        <button
          onClick={commit}
          disabled={saving}
          className="docket-save-btn"
          title="Save"
          style={{ flexShrink: 0, marginTop: 2 }}
        >
          <Check size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={editorRef}
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      onContextMenu={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input
        type={kind === "number" ? "number" : "text"}
        step={kind === "number" ? "any" : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        autoFocus
        disabled={saving}
        className="docket-edit-input"
        placeholder={kind === "number" ? "e.g. -6.5" : undefined}
      />
      <button onClick={commit} disabled={saving} className="docket-save-btn" title="Save">
        <Check size={14} />
      </button>
    </div>
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
  defaultEndDate?: string;
}

interface ColumnDef {
  header: string;
  accessor: keyof EpcTenderRecord | "rawMaterials" | "files" | "boqChart" | "merged_office_consignees" | "tenderDocument";
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
  defaultEndDate,
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
      header: "Proposed ERP Quantity",
      accessor: "proposedErpQuantity",
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
      accessor: "price",
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
      header: "emd",
      accessor: "emd",
      defaultWidth: 130,
      align: "right",
      type: "string",
    },
    {
      header: "bgDate",
      accessor: "bgDate",
      defaultWidth: 120,
      align: "center",
      type: "string",
    },
    {
      header: "bgExpiryDate",
      accessor: "bgExpiryDate",
      defaultWidth: 120,
      align: "center",
      type: "string",
    },
    {
      header: "claimDate",
      accessor: "claimDate",
      defaultWidth: 120,
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
      header: "Reason for not participation",
      accessor: "reason",
      defaultWidth: 250,
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
      header: "Quotation No",
      accessor: "quotationNo",
      defaultWidth: 150,
      align: "left",
      type: "string",
    },
    {
      header: "Contract No",
      accessor: "contractNo",
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
      header: "Our Rank",
      accessor: "ourRank",
      defaultWidth: 100,
      align: "center",
      type: "string",
    },
    {
      header: "Our Value",
      accessor: "ourValue",
      defaultWidth: 120,
      align: "right",
      type: "string",
    },
    {
      header: "L1 Party Name",
      accessor: "nameOfRank1",
      defaultWidth: 200,
      align: "left",
      type: "string",
    },
    {
      header: "L1 Price",
      accessor: "valueOfRank1",
      defaultWidth: 120,
      align: "right",
      type: "string",
    },
    {
      header: "L1 Diff (%)",
      accessor: "differenceBetweenRank1",
      defaultWidth: 110,
      align: "right",
      type: "string",
    },
    {
      header: "L2 Party Name",
      accessor: "nameOfRank2",
      defaultWidth: 200,
      align: "left",
      type: "string",
    },
    {
      header: "L2 Price",
      accessor: "valueOfRank2",
      defaultWidth: 120,
      align: "right",
      type: "string",
    },
    {
      header: "L2 Diff (%)",
      accessor: "differenceBetweenRank2",
      defaultWidth: 110,
      align: "right",
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
    {
      header: "Mgmt Dec.",
      accessor: "managementDecision",
      defaultWidth: 100,
      align: "center",
      type: "decision",
    },
    {
      header: "Prep By",
      accessor: "tenderPrepareBy",
      defaultWidth: 120,
      align: "left",
      type: "string",
    },
    {
      header: "Participated?",
      accessor: "participated",
      defaultWidth: 100,
      align: "center",
      type: "boolean",
    },
    // --- New Columns ---
    {
      header: "Office Name @ Consignees Reporting Officer",
      accessor: "merged_office_consignees",
      defaultWidth: 220,
      align: "left",
      type: "custom",
    },
    {
      header: "Mii Purchase Preference",
      accessor: "miiPurchasePreference",
      defaultWidth: 150,
      align: "left",
      type: "string",
    },
    {
      header: "Tender Document",
      accessor: "tenderDocument",
      defaultWidth: 200,
      align: "center",
      type: "custom",
    },
    {
      header: "Reporting Officers",
      accessor: "reportings",
      defaultWidth: 500,
      align: "left",
      type: "custom",
    },
    {
      header: "Website",
      accessor: "website",
      defaultWidth: 200,
      align: "left",
      type: "string",
    },
    {
      header: "RA Qualification Rule",
      accessor: "raQualificationRule",
      defaultWidth: 150,
      align: "left",
      type: "string",
    },
    {
      header: "Startup Exemption",
      accessor: "startupExemption",
      defaultWidth: 130,
      align: "center",
      type: "custom",
    },
    {
      header: "Minimum Avg Annual Turnover",
      accessor: "minimumAverageAnnualTurnover",
      defaultWidth: 150,
      align: "right",
      type: "string",
    },
    {
      header: "Years of Past Experience",
      accessor: "yearsOfPastExperience",
      defaultWidth: 140,
      align: "right",
      type: "string",
    },
    {
      header: "e-PBG Duration (Months)",
      accessor: "ePbgDurationMonths",
      defaultWidth: 150,
      align: "right",
      type: "string",
    },
  ];

  const postParticipationAccessors = new Set([
    "bgNoUtrNo", "remarks", "loiPoNoAndDate",
    "competitors", "diffPercentFromL1", "diffPercentFromL2",
    "nextAction",
    "quotationNo", "contractNo", "currentStatus",
    "ourRank", "ourValue",
    "nameOfRank1", "valueOfRank1", "differenceBetweenRank1",
    "nameOfRank2", "valueOfRank2", "differenceBetweenRank2",
  ]);
  const postParticipationExcludeAccessors = new Set([
    "merged_office_consignees", "miiPurchasePreference", "tenderDocument",
    "reportings", "website", "raQualificationRule", "startupExemption",
    "minimumAverageAnnualTurnover", "yearsOfPastExperience", "ePbgDurationMonths",
  ]);
  const visibleColumns = showPostParticipationColumns
    ? columns.filter((col) => !postParticipationExcludeAccessors.has(col.accessor))
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
  const [editingCell, setEditingCell] = useState<{ id: string; accessor: string } | null>(null);

  // Dialog state for merged office name
  const [officeDialogRecord, setOfficeDialogRecord] = useState<EpcTenderRecord | null>(null);
  const [officeDialogSaving, setOfficeDialogSaving] = useState(false);
  const [websiteDialogRecord, setWebsiteDialogRecord] = useState<EpcTenderRecord | null>(null);
  const [reportingDialogRecord, setReportingDialogRecord] = useState<EpcTenderRecord | null>(null);

  const dispatch = useAppDispatch();
  const tenderData = useAppSelector((s) => s.tenders.data);
  const updatingCells = useAppSelector((s) => s.tenders.updatingCells);

  const saveCell = useCallback(
    (record: EpcTenderRecord, accessor: string, draft: string) => {
      const cfg = EDITABLE_FIELDS[accessor];
      if (!cfg) return;
      if (!record.id) {
        toast.error("Database record ID not found. Please refresh.");
        return;
      }
      const parsed = cfg.parse?.(draft);
      if (parsed?.error) {
        toast.error(parsed.error);
        return;
      }
      const stored = cfg.toStored(draft);
      const current = cfg.fromStored(record);
      if (stored === current) {
        setEditingCell(null);
        return;
      }
      const key = `${record.id}-${accessor}`;
      setSavingKeys((prev) => ({ ...prev, [key]: true }));
      cfg
        .save(dispatch, record, stored, draft)
        .then(() => {
          toast.success(
            cfg.successMessage?.(record, draft) ??
              `${accessor} updated successfully!`,
          );
        })
        .catch((err: any) => {
          toast.error(err?.message || `Failed to update ${accessor}.`);
        })
        .finally(() => {
          setEditingCell(null);
          setSavingKeys((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
          });
        });
    },
    [dispatch],
  );

  const handleMergedFieldSave = useCallback(
    (record: EpcTenderRecord, field: string, currentValue: string, setEditingId: (id: string | null) => void, setEditValue: (v: string) => void) => {
      if (!record.id) {
        toast.error("Database record ID not found. Please refresh.");
        return;
      }
      const newVal = (() => {
        if (field === "emdPaymentMode") return currentValue;
        return currentValue.trim();
      })();
      const oldVal = record[field as keyof EpcTenderRecord] ?? "";
      if (newVal === String(oldVal)) {
        setEditingId(null);
        return;
      }
      const key = `${record.id}-${field}`;
      setSavingKeys((prev) => ({ ...prev, [key]: true }));
      dispatch(
        updateTenderMergedField({
          rowIndex: 0,
          field,
          value: newVal,
          tenderMergedId: Number(record.id),
          oldValue: String(oldVal),
        }),
      )
        .unwrap()
        .then(() => {
          toast.success(`${field} updated successfully!`);
        })
        .catch((err: any) => {
          toast.error(err?.message || `Failed to update ${field}.`);
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
    },
    [dispatch],
  );

  const handleOfficeDialogSave = useCallback(
    async (params: { tenderMergedId: number; officeName: string; consigneesReportingOfficer: string; oldOfficeName: string; oldConsignees: string }) => {
      setOfficeDialogSaving(true);
      try {
        if (params.officeName !== params.oldOfficeName) {
          await dispatch(
            updateTenderMergedField({
              rowIndex: 0,
              field: "officeName",
              value: params.officeName,
              tenderMergedId: params.tenderMergedId,
              oldValue: params.oldOfficeName,
            }),
          ).unwrap();
        }
        if (params.consigneesReportingOfficer !== params.oldConsignees) {
          await dispatch(
            updateTenderMergedField({
              rowIndex: 0,
              field: "consigneesReportingOfficer",
              value: params.consigneesReportingOfficer,
              tenderMergedId: params.tenderMergedId,
              oldValue: params.oldConsignees,
            }),
          ).unwrap();
        }
        toast.success("Office details updated!");
        setOfficeDialogRecord(null);
      } catch (err: any) {
        toast.error(err?.message || "Failed to update office details.");
      } finally {
        setOfficeDialogSaving(false);
      }
    },
    [dispatch],
  );

  const handleWebsiteSave = useCallback(
    async (params: { tenderMergedId: number; website: string; oldValue: string }) => {
      try {
        await dispatch(updateWebsiteMapping(params)).unwrap();
        toast.success("Website updated!");
        setWebsiteDialogRecord(null);
      } catch (err: any) {
        toast.error(err?.message || "Failed to update website.");
      }
    },
    [dispatch],
  );

  const handleReportingSave = useCallback(
    async (params: { tenderMergedId: number; reportings: string; oldValue: string }) => {
      try {
        await dispatch(
          updateTenderMergedField({
            rowIndex: 0,
            field: "reportings",
            value: params.reportings,
            tenderMergedId: params.tenderMergedId,
            oldValue: params.oldValue,
          }),
        ).unwrap();
        toast.success("Reporting officers updated!");
        setReportingDialogRecord(null);
      } catch (err: any) {
        toast.error(err?.message || "Failed to update reporting officers.");
      }
    },
    [dispatch],
  );

  const handleEmdPaymentModeChange = useCallback(
    (record: EpcTenderRecord, newValue: string) => {
      handleMergedFieldSave(record, "emdPaymentMode", newValue, () => {}, () => {});
    },
    [handleMergedFieldSave],
  );

  const handleBidValidityExpiredChange = useCallback(
    (record: EpcTenderRecord, newValue: boolean) => {
      if (!record.id) return;
      const oldVal = record.bidValidityExpired ? "true" : "false";
      const newVal = newValue ? "true" : "false";
      if (newVal === oldVal) return;
      const key = `${record.id}-bidValidityExpired`;
      setSavingKeys((prev) => ({ ...prev, [key]: true }));
      dispatch(
        updateTenderMergedField({
          rowIndex: 0,
          field: "bidValidityExpired",
          value: newVal,
          tenderMergedId: Number(record.id),
          oldValue: oldVal,
        }),
      )
        .unwrap()
        .then(() => {
          toast.success("Bid validity expired updated!");
        })
        .catch((err: any) => {
          toast.error(err?.message || "Failed to update bid validity expired.");
        })
        .finally(() => {
          setSavingKeys((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
          });
        });
    },
    [dispatch],
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
    if (field === "reverseAuctionApplicable") {
      const raRule = record.raQualificationRule;
      if (raRule != null && raRule !== "") {
        toast.error("Reverse Auction Applicable cannot be edited when RA Qualification Rule is set.");
        return;
      }
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

      await dispatch(
        updateTenderStatusAndAction({
          tenderMergedId: Number(record.id),
          tenderUpdateStatus: currentStatus,
          nextAction: currentAction,
          reverseAuctionApplicable: currentRa,
        }),
      ).unwrap();

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
    keyof EpcTenderRecord | "rawMaterials" | "files" | "boqChart" | "merged_office_consignees" | "tenderDocument" | null
  >("lastDateOfSubmission");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>(defaultEndDate ?? "");

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
    column: keyof EpcTenderRecord | "rawMaterials" | "files" | "boqChart" | "merged_office_consignees" | "tenderDocument",
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
          valA = countRawMaterials(a.rawMaterials);
          valB = countRawMaterials(b.rawMaterials);
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
        } else if (sortColumn === "merged_office_consignees") {
          valA = `${a.officeName || ""} ${a.consigneesReportingOfficer || ""}`;
          valB = `${b.officeName || ""} ${b.consigneesReportingOfficer || ""}`;
        } else if (sortColumn === "tenderDocument") {
          const getHasDoc = (r: EpcTenderRecord) => {
            if (!r.tenderFiles) return 0;
            try {
              const files: Array<{ tags: string[] }> = JSON.parse(r.tenderFiles);
              return files.some((f) => f.tags?.includes("tenderDocument")) ? 1 : 0;
            } catch { return 0; }
          };
          valA = getHasDoc(a);
          valB = getHasDoc(b);
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
                            <span className="filter-row-label">Alu:</span>
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

                        const editableCfg = EDITABLE_FIELDS[col.accessor];
                        if (editableCfg) {
                          const isEditing =
                            editingCell?.id === record.id &&
                            editingCell?.accessor === col.accessor;
                          const isSaving =
                            !!savingKeys[`${record.id}-${col.accessor}`];
                          if (isEditing) {
                            cellContent = (
                              <InlineEditor
                                initialValue={editableCfg.toDraft(record)}
                                kind={editableCfg.kind}
                                saving={isSaving}
                                onSave={(draft) =>
                                  saveCell(record, col.accessor, draft)
                                }
                                onCancel={() => setEditingCell(null)}
                              />
                            );
                          } else {
                            cellContent = (
                              <span className="docket-display">
                                {editableCfg.display(record)}
                                {isSaving && (
                                  <Loader2
                                    size={12}
                                    className="spin"
                                    style={{ marginLeft: 4 }}
                                  />
                                )}
                              </span>
                            );
                          }
                          const editable = editableCfg.canEdit(
                            record,
                            readOnly,
                            editableColumns,
                          );
                          cellClass = editable
                            ? editableCfg.editableClass
                            : (editableCfg.readOnlyClass ??
                              editableCfg.editableClass);
                          cellClass += editableCfg.displayClass?.(record) ?? "";
                        } else if (col.accessor === "merged_office_consignees") {
                          const office = record.officeName || "";
                          const consignees = record.consigneesReportingOfficer || "";
                          cellContent = (
                            <div className="relative group/cell h-full">
                              <div className="flex flex-col leading-tight" style={{ minHeight: 30 }}>
                                <span className="text-xs font-medium">{office || "-"}</span>
                                {consignees && <span className="text-[11px] text-slate-500">{consignees}</span>}
                              </div>
                              <button
                                className="opacity-0 group-hover/cell:opacity-100 transition-all absolute top-0 right-0 w-8 h-8 rounded-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 p-1 shadow-sm cursor-pointer"
                                title="Edit Office Name @ Consignees"
                                onClick={(e) => { e.stopPropagation(); setOfficeDialogRecord(record); }}
                              >
                                <Pencil className="w-4 h-4 text-white" />
                              </button>
                            </div>
                          );
                          cellClass = "col-left";
                        } else if (col.accessor === "website") {
                          const websiteVal = record.website || "";
                          const websiteKey = `${record.id}-website`;
                          const isSaving = !!updatingCells[websiteKey];
                          const urls = websiteVal
                            ? websiteVal.split(",").map((s: string) => s.trim()).filter(Boolean)
                            : [];
                          cellContent = (
                            <div className="relative group/cell h-full">
                              <div className="h-full" style={{ height: 70, maxHeight: 70, overflowY: "auto", whiteSpace: "normal" }}>
                                {urls.length > 0 ? (
                                  <div className="flex flex-col gap-1">
                                    {urls.map((url: string, i: number) => (
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
                                onClick={(e) => { e.stopPropagation(); setWebsiteDialogRecord(record); }}
                              >
                                {isSaving ? (
                                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                                ) : (
                                  <Pencil className="w-4 h-4 text-white" />
                                )}
                              </button>
                            </div>
                          );
                          cellClass = "col-left";
                        } else if (col.accessor === "rawMaterials") {
                          const raw = (record as any).rawMaterials;
                          let entries: [string, unknown][] = [];
                          if (raw != null && raw !== "") {
                            if (typeof raw === "object") {
                              entries = Object.entries(raw);
                            } else {
                              try {
                                const parsed = JSON.parse(String(raw));
                                if (typeof parsed === "object" && parsed !== null) {
                                  entries = Object.entries(parsed);
                                }
                              } catch {}
                            }
                          }
                          const nonNull = entries.filter(
                            ([, v]) => v !== null && v !== undefined && String(v) !== "",
                          );
                          cellContent = nonNull.length > 0 ? (
                            <div
                              className="raw-materials-scroll-cell"
                              title={nonNull
                                .map(([k, v]) => `${k}: ${String(v)}`)
                                .join(" | ")}
                            >
                              <div className="raw-materials-grid">
                                {nonNull.map(([key, val], i) => (
                                  <div
                                    className="material-rate-tag"
                                    key={i}
                                    title={`${key}: ${String(val)}`}
                                  >
                                    <span className="mat-lbl">{key}:</span>
                                    <span className="mat-val">{String(val)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span>-</span>
                          );
                          cellClass = "col-left";
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
                        } else if (col.accessor === "proposedErpItemName") {
                          const raw: unknown = record[col.accessor as keyof EpcTenderRecord];
                          let parts: string[] = [];
                          if (raw != null && raw !== "") {
                            if (typeof raw === "object" && !(raw instanceof Date)) {
                              if (Array.isArray(raw)) {
                                parts = (raw as any[]).map(String);
                              } else {
                                parts = Object.keys(raw as Record<string, unknown>).map(String);
                              }
                            } else if (typeof raw === "string") {
                              try {
                                const parsed = JSON.parse(raw);
                                if (Array.isArray(parsed)) {
                                  parts = parsed.map(String);
                                } else if (typeof parsed === "object" && parsed !== null) {
                                  parts = Object.keys(parsed).map(String);
                                }
                              } catch {
                                parts = raw.split(/\n+/).map(p => p.trim()).filter(Boolean);
                              }
                            }
                          }
                          cellContent = parts.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              {parts.map((part, i) => <div key={i} style={{ background: "#f1f3f4", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", border: "1px solid #dadce0", width: "fit-content", color: "#202124" }}>{part}</div>)}
                            </div>
                          ) : (
                            <span>-</span>
                          );
                          cellClass = "col-left";
                        } else if (col.accessor === "proposedErpQuantity") {
                          const raw: unknown = record[col.accessor as keyof EpcTenderRecord];
                          let parts: string[] = [];
                          if (raw != null && raw !== "") {
                            if (typeof raw === "object" && !(raw instanceof Date)) {
                              if (Array.isArray(raw)) {
                                parts = (raw as any[]).map(String);
                              } else {
                                parts = Object.values(raw as Record<string, unknown>).map(String);
                              }
                            } else if (typeof raw === "string") {
                              try {
                                const parsed = JSON.parse(raw);
                                if (Array.isArray(parsed)) {
                                  parts = parsed.map(String);
                                } else if (typeof parsed === "object" && parsed !== null) {
                                  parts = Object.values(parsed).map(String);
                                }
                              } catch {
                                parts = raw.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
                              }
                            }
                          }
                          cellContent = parts.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              {parts.map((part, i) => <div key={i} style={{ background: "#f1f3f4", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", border: "1px solid #dadce0", width: "fit-content", color: "#202124" }}>{part}</div>)}
                            </div>
                          ) : (
                            <span>-</span>
                          );
                          cellClass = "col-left";
                        } else if (col.accessor === "tenderUpdateStatus") {
                          const statusValue =
                            overrides[record.id!]?.tenderUpdateStatus ??
                            record.tenderUpdateStatus ??
                            "OPEN";
                          const isSaving =
                            !!savingKeys[`${record.id}::tenderUpdateStatus`];
                          if (readOnly && !editableColumns.includes("tenderUpdateStatus")) {
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
                          if (readOnly && !editableColumns.includes("nextAction")) {
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
                                const files: Array<{ url: string; source: string; tags: string[] }> = JSON.parse(filesRaw);
                                const costingFile = files.find((f) => f.tags?.includes("costingAttachment"));
                                url = costingFile?.source && costingFile.source !== 'SHEET_SYNC'
                                  ? `/api/executive-files/view/${costingFile.source}`
                                  : costingFile?.url ?? "";
                              } catch {}
                            }
                            cellContent = url ? (
                              <a
                                href={url.startsWith('/api/')
                                  ? `${url}?auth=${encodeURIComponent("Bearer MOCK_TOKEN_LASERPOWER_SECURE_AUTH_SCOPE")}`
                                  : url}
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
                          } else if (col.accessor === "tenderDocument") {
                            const filesRaw = record.tenderFiles as string | undefined;
                            let docUrl = "";
                            let docName = "";
                            if (filesRaw) {
                              try {
                                const files: Array<{ url: string; name?: string; tags: string[] }> = JSON.parse(filesRaw);
                                const doc = files.find((f) => f.tags?.includes("tenderDocument"));
                                docUrl = doc?.url ?? "";
                                docName = doc?.name ?? "Tender Document";
                              } catch {}
                            }
                            cellContent = docUrl ? (
                              <a
                                href={docUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="table-attachment-link"
                                title={docName}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <FileText size={14} /> Show Tender Document
                              </a>
                            ) : (
                              "-"
                            );
                            cellClass = "col-center";
                          } else if (col.accessor === "reportings") {
                            const rawJson = cellVal as string | undefined;
                            let entries: { officer: string; address?: string; quantity?: string }[] = [];
                            if (rawJson) {
                              try {
                                const parsed = JSON.parse(rawJson);
                                if (Array.isArray(parsed)) entries = parsed;
                              } catch {}
                            }
                            cellContent = (
                              <div className="relative group/cell h-full">
                                <div style={{ maxHeight: 80, overflowY: "auto", whiteSpace: "normal" }} className="flex flex-col gap-1 text-xs">
                                  {entries.length > 0 ? entries.map((e, i) => (
                                    <div key={i} className="flex gap-2">
                                      <span className="font-medium">{e.officer}</span>
                                      {e.quantity && <span className="text-slate-500">qty: {e.quantity}</span>}
                                    </div>
                                  )) : <span className="text-slate-300">-</span>}
                                </div>
                                <button
                                  className="opacity-0 group-hover/cell:opacity-100 transition-all absolute top-0 right-0 w-8 h-8 rounded-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 p-1 shadow-sm cursor-pointer"
                                  title="Edit Reporting Officers"
                                  onClick={(e) => { e.stopPropagation(); setReportingDialogRecord(record); }}
                                >
                                  <Pencil className="w-4 h-4 text-white" />
                                </button>
                              </div>
                            );
                            cellClass = "col-left";
                          } else if (col.accessor === "emdPaymentMode") {
                            const isSaving = !!savingKeys[`${record.id}-emdPaymentMode`];
                            const val = (cellVal as string) || "";
                            cellContent = (
                              <select
                                value={val}
                                disabled={isSaving}
                                onChange={(e) => handleMergedFieldSave(record, "emdPaymentMode", e.target.value, () => {}, () => {})}
                                className="table-editable-select status-select"
                                style={{ minWidth: "100px", padding: "2px 4px", fontSize: "11px" }}
                              >
                                <option value="">(Blank)</option>
                                <option value="Draft">Draft</option>
                                <option value="Bank Guarantee">Bank Guarantee</option>
                                <option value="Online">Online</option>
                              </select>
                            );
                            cellClass = "col-center col-editable";
                          } else if (col.accessor === "price") {
                            const isSaving = !!savingKeys[`${record.id}-price`];
                            const val = (cellVal as string) || "";
                            cellContent = val ? (
                              <span
                                className={`price-basis-badge ${val.toLowerCase().includes("variable") ? "variable" : "firm"}`}
                              >
                                {val}
                              </span>
                            ) : (
                              <select
                                value=""
                                disabled={isSaving}
                                onChange={(e) => {
                                  handleMergedFieldSave(record, "price", e.target.value, () => {}, () => {});
                                }}
                                className="table-editable-select status-select"
                                style={{ minWidth: "100px", padding: "2px 4px", fontSize: "11px" }}
                              >
                                <option value="">(Blank)</option>
                                <option value="FIRM">FIRM</option>
                                <option value="VARIABLE">VARIABLE</option>
                              </select>
                            );
                            cellClass = "col-center col-editable";
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
                              const hasRaRule =
                                record.raQualificationRule != null &&
                                record.raQualificationRule !== "";

                              if (hasRaRule) {
                                cellContent = <span>Yes</span>;
                                cellClass = "col-center";
                              } else {
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
                                          value: isYes ? "null" : "true",
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
                                          value: isNo ? "null" : "false",
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
                            if (readOnly && !editableColumns.includes("currentStatus")) {
                              cellContent = statusVal ? (
                                <span className={`status-badge ${getStatusClass(statusVal)}`}>{statusVal}</span>
                              ) : (
                                <span>-</span>
                              );
                              cellClass = "col-center";
                            } else {
                              const isSaving = !!savingKeys[`${record.id}::currentStatus`];
                              cellContent = (
                                <select
                                  value={statusVal}
                                  disabled={isSaving}
                                  onChange={(e) => {
                                    const key = `${record.id}::currentStatus`;
                                    setSavingKeys(prev => ({ ...prev, [key]: true }));
                                    dispatch(updateTenderMergedField({
                                      rowIndex: 0,
                                      field: "currentStatus",
                                      value: e.target.value,
                                      tenderMergedId: Number(record.id),
                                      oldValue: statusVal,
                                    }))
                                      .unwrap()
                                      .then(() => toast.success("Status updated!"))
                                      .catch((err) => toast.error(err?.message || "Failed to update status."))
                                      .finally(() => setSavingKeys(prev => { const c = { ...prev }; delete c[key]; return c; }));
                                  }}
                                  className="table-editable-select status-select"
                                >
                                  <option value="">None</option>
                                  {CURRENT_STATUS_OPTIONS.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              );
                              cellClass = "col-center col-editable";
                            }
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
                              const isSaving = !!savingKeys[`${record.id}-bgStatus`];
                              cellContent = (
                                <select
                                  value={val}
                                  disabled={isSaving}
                                  onChange={(e) => handleMergedFieldSave(record, "bgStatus", e.target.value, () => {}, () => {})}
                                  className="table-editable-select status-select"
                                  style={{ minWidth: "100px", padding: "2px 4px", fontSize: "11px" }}
                                >
                                  <option value="">(Blank)</option>
                                  <option value="PENDING">PENDING</option>
                                  <option value="TO BE FOLLOWED UP">TO BE FOLLOWED UP</option>
                                  <option value="RETURNED">RETURNED</option>
                                </select>
                              );
                              cellClass = "col-center col-editable";
                            } else if (col.accessor === "cva") {
                              let parts: string[] = [];
                              if (cellVal != null && cellVal !== "") {
                                if (typeof cellVal === "object" && !(cellVal instanceof Date)) {
                                  if (Array.isArray(cellVal)) {
                                    parts = (cellVal as any[]).map(String);
                                  } else {
                                    parts = Object.values(cellVal as Record<string, unknown>).map(String);
                                  }
                                } else if (typeof cellVal === "string") {
                                  try {
                                    const parsed = JSON.parse(cellVal);
                                    if (Array.isArray(parsed)) {
                                      parts = parsed.map(String);
                                    } else if (typeof parsed === "object" && parsed !== null) {
                                      parts = Object.values(parsed).map(String);
                                    }
                                  } catch {
                                    parts = cellVal.split("@").filter(Boolean);
                                  }
                                }
                              }
                              cellContent = parts.length > 0 ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
                                  {parts.map((part, i) => <div key={i} style={{ background: "#f1f3f4", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", border: "1px solid #dadce0", width: "fit-content", color: "#202124" }}>{part}</div>)}
                                </div>
                              ) : "-";
                              cellClass = "col-center";
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
                              editableCfg &&
                              editingCell?.id !== record.id &&
                              editableCfg.canEdit(
                                record,
                                readOnly,
                                editableColumns,
                              ) &&
                              !savingKeys[`${record.id}-${col.accessor}`]
                                ? () =>
                                    setEditingCell({
                                      id: record.id!,
                                      accessor: col.accessor,
                                    })
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

      {officeDialogRecord && (
        <MergedOfficeEditDialog
          row={officeDialogRecord as unknown as Record<string, unknown>}
          isSaving={officeDialogSaving}
          onSave={handleOfficeDialogSave}
          onClose={() => setOfficeDialogRecord(null)}
        />
      )}

      {websiteDialogRecord && (
        <WebsiteEditDialog
          row={websiteDialogRecord as unknown as Record<string, unknown>}
          isSaving={false}
          onSave={handleWebsiteSave}
          onClose={() => setWebsiteDialogRecord(null)}
        />
      )}

      {reportingDialogRecord && (
        <ReportingOfficersEditDialog
          row={reportingDialogRecord as unknown as Record<string, unknown>}
          isSaving={false}
          onSave={handleReportingSave}
          onClose={() => setReportingDialogRecord(null)}
        />
      )}

    </div>
  );
};
