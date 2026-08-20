import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import pLimit from "p-limit";
import {
  updateTenderDecision,
  updateTenderAssignmentsAction,
  updateTenderUtilityMapping,
  bulkAssignUtilityMappingAction,
  updateDocketNumber,
  updateBgNoUtrNo,
  updateRemarks,
  updateReason,
  updateLoiPoNoAndDate,
  updateCompetitors,
  updateDiffPercentFromL1,
  updateDiffPercentFromL2,
  updateStatusAndAction,
  triggerReverseAuctionMail,
  updateTenderMergedStringField,
  updateTenderMergedDateField,
  updateTenderMergedBooleanField,
  updateBeneficiaryBankDetails,
} from "@/actions/tender";
import { importEpcTendersAction } from "@/actions/importEpcTenders";
import { analyzeTenderValidity, saveAiRelevance } from "@/actions/ai-analysis";
import type { ReverseAuctionWebhookData } from "@/lib/integrations/n8n";
import { filtersSlice } from "./filtersSlice";
import { uploadFiles } from "./uploadSlice";
import type { TenderMergedMinAggregateOutputType } from "@/generated/prisma/models/TenderMerged";

type StringifyFields<T> = { [K in keyof T]: string };

export type TenderMergedRow =
  & Partial<StringifyFields<TenderMergedMinAggregateOutputType>>
  & {
    type: string;
    id: string;
    tenderFiles?: string;
    reportings?: string;
    evaluations?: string;
    aiFeedbackCorrected?: string;
    aiFeedbackReason?: string;
    fileId?: string;
    [key: string]: string | undefined;
  };

export interface TenderData {
  fileName: string;
  columns: string[];
  rows: TenderMergedRow[];
  associations: { id: number; name: string; email: string }[];
  totalGem: number;
  totalNonGem: number;
}

interface TendersState {
  data: TenderData | null;
  loading: boolean;
  totalFiles: number;
  completedFiles: number;
  updatingCells: Record<string, boolean>;
  feedbackSaving: Record<string, boolean>;
  pdfDownloading: Record<string, boolean>;
  pdfParsing: Record<string, boolean>;
}

const initialState: TendersState = {
  data: null,
  loading: false,
  totalFiles: 0,
  completedFiles: 0,
  updatingCells: {},
  feedbackSaving: {},
  pdfDownloading: {},
  pdfParsing: {},
};

export const updateTenderAssignments = createAsyncThunk(
  "tenders/updateAssignments",
  async (params: {
    rowIndex: number;
    tenderMergedId: number;
    associationIds: number[];
    oldValue: string;
  }) => {
    await updateTenderAssignmentsAction({
      tenderMergedId: params.tenderMergedId,
      associationIds: params.associationIds,
    });
  },
);

export const uploadTenderDocument = createAsyncThunk(
  "tenders/uploadTenderDocument",
  async (params: { tenderMergedId: number; file: File; fileType: string }) => {
    const formData = new FormData();
    formData.append("file", params.file);
    formData.append("fileType", params.fileType);
    const res = await fetch(
      `/api/executive-tenders/${params.tenderMergedId}/document`,
      {
        method: "POST",
        body: formData,
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return {
      tenderMergedId: params.tenderMergedId,
      url: data.url as string,
      fileType: data.fileType as string,
      id: data.id as number,
      name: data.name as string,
      extension: data.extension as string,
      source: data.source as string,
      tags: data.tags as string[],
    };
  },
);

export const updateWebsiteMapping = createAsyncThunk(
  "tenders/updateWebsiteMapping",
  async (params: {
    tenderMergedId: number;
    website: string;
    oldValue: string;
  }) => {
    const result = await updateTenderUtilityMapping({
      tenderMergedId: params.tenderMergedId,
      website: params.website,
    });
    return { ...result, tenderMergedId: params.tenderMergedId };
  },
);

export const bulkAssignUtilityMapping = createAsyncThunk(
  "tenders/bulkAssignUtilityMapping",
  async (params: {
    organization: string;
    website: string;
    utilityMappingId: number;
    excludeTenderMergedId: number;
  }) => {
    const result = await bulkAssignUtilityMappingAction(params);
    return result;
  },
);

export const updateTenderMergedField = createAsyncThunk(
  "tenders/updateMergedField",
  async (params: {
    rowIndex: number;
    field: string;
    value: string;
    tenderMergedId: number;
    oldValue: string;
  }) => {
    let diffs: {
      diffPercentFromL1?: number | null;
      diffPercentFromL2?: number | null;
      differenceBetweenRank1?: string | null;
      differenceBetweenRank2?: string | null;
    } | undefined;
    if (params.field === "emdPaymentMode") {
      const result = await updateTenderMergedStringField({
        tenderMergedId: params.tenderMergedId,
        field: params.field,
        value: params.value,
      });
      if (!result.ok) throw new Error(result.error);
      diffs = result;
    } else if (
      params.field === "emdValidity" ||
      params.field === "reverseAuctionDate" ||
      params.field === "reverseAuctionStartDate" ||
      params.field === "reverseAuctionEndDate" ||
      params.field === "tenderOpeningDate"
    ) {
      await updateTenderMergedDateField({
        tenderMergedId: params.tenderMergedId,
        field: params.field,
        value: params.value || null,
      });
    } else if (
      params.field === "bidValidityExpired" ||
      params.field === "participated" ||
      params.field === "reverseAuctionApplicable" ||
      params.field === "diffL1ManuallyEdited" ||
      params.field === "diffL2ManuallyEdited"
    ) {
      await updateTenderMergedBooleanField({
        tenderMergedId: params.tenderMergedId,
        field: params.field,
        value: params.value === "true",
      });
    } else {
      const result = await updateTenderMergedStringField({
        tenderMergedId: params.tenderMergedId,
        field: params.field,
        value: params.value,
      });
      if (!result.ok) throw new Error(result.error);
      diffs = result;
    }
    return { ...params, diffs };
  },
);

export const updateTenderCell = createAsyncThunk(
  "tenders/updateCell",
  async (params: {
    rowIndex: number;
    field: string;
    value: string;
    tenderMergedId: number;
    oldValue: string;
  }) => {
    const result = await updateTenderDecision({
      tenderMergedId: params.tenderMergedId,
      field: params.field as "app" | "aps" | "apm" | "participated" | "catalogueDone",
      value: params.value as "YES" | "NO" | "NOT_DECIDED" | "true" | "false",
    });
    return result;
  },
);

export const updateTenderDocketNo = createAsyncThunk(
  "tenders/updateDocketNo",
  async (
    params: {
      tenderMergedId: number;
      docketNo: string;
      oldDocketNo: string;
    },
    { rejectWithValue },
  ) => {
    try {
      await updateDocketNumber({
        tenderMergedId: params.tenderMergedId,
        docketNo: params.docketNo,
      });
      return params;
    } catch (err: any) {
      return rejectWithValue(
        err?.message || "Failed to update docket number",
      );
    }
  },
);

export const updateTenderBgNoUtrNo = createAsyncThunk(
  "tenders/updateBgNoUtrNo",
  async (params: {
    tenderMergedId: number;
    bgNoUtrNo: string;
    oldBgNoUtrNo: string;
  }) => {
    await updateBgNoUtrNo({
      tenderMergedId: params.tenderMergedId,
      bgNoUtrNo: params.bgNoUtrNo,
    });
    return params;
  },
);

export const updateTenderRemarks = createAsyncThunk(
  "tenders/updateRemarks",
  async (params: { tenderMergedId: number; remarks: string; oldRemarks: string }) => {
    await updateRemarks({ tenderMergedId: params.tenderMergedId, remarks: params.remarks });
    return params;
  },
);

export const updateTenderBeneficiaryBankDetails = createAsyncThunk(
  "tenders/updateBeneficiaryBankDetails",
  async (params: { tenderMergedId: number; beneficiaryBankDetails: string; oldBeneficiaryBankDetails: string }) => {
    await updateBeneficiaryBankDetails({ tenderMergedId: params.tenderMergedId, beneficiaryBankDetails: params.beneficiaryBankDetails });
    return params;
  },
);

export const updateTenderReason = createAsyncThunk(
  "tenders/updateReason",
  async (params: { tenderMergedId: number; reason: string; oldReason: string }) => {
    await updateReason({ tenderMergedId: params.tenderMergedId, reason: params.reason });
    return params;
  },
);

export const updateTenderLoiPoNoAndDate = createAsyncThunk(
  "tenders/updateLoiPoNoAndDate",
  async (params: { tenderMergedId: number; loiPoNoAndDate: string; oldLoiPoNoAndDate: string }) => {
    await updateLoiPoNoAndDate({ tenderMergedId: params.tenderMergedId, loiPoNoAndDate: params.loiPoNoAndDate });
    return params;
  },
);

export const updateTenderCompetitors = createAsyncThunk(
  "tenders/updateCompetitors",
  async (params: { tenderMergedId: number; competitors: string; oldCompetitors: string }) => {
    await updateCompetitors({ tenderMergedId: params.tenderMergedId, competitors: params.competitors });
    return params;
  },
);

export const updateTenderDiffPercentFromL1 = createAsyncThunk(
  "tenders/updateDiffPercentFromL1",
  async (params: { tenderMergedId: number; diffPercentFromL1: number | null; oldDiffPercentFromL1: string }) => {
    await updateDiffPercentFromL1({ tenderMergedId: params.tenderMergedId, diffPercentFromL1: params.diffPercentFromL1 });
    return params;
  },
);

export const updateTenderDiffPercentFromL2 = createAsyncThunk(
  "tenders/updateDiffPercentFromL2",
  async (params: { tenderMergedId: number; diffPercentFromL2: number | null; oldDiffPercentFromL2: string }) => {
    await updateDiffPercentFromL2({ tenderMergedId: params.tenderMergedId, diffPercentFromL2: params.diffPercentFromL2 });
    return params;
  },
);

export const updateTenderStatusAndAction = createAsyncThunk(
  "tenders/updateStatusAndAction",
  async (params: {
    tenderMergedId: number;
    tenderUpdateStatus: string;
    nextAction: string | null;
    reverseAuctionApplicable: boolean | null;
  }) => {
    await updateStatusAndAction({
      tenderMergedId: params.tenderMergedId,
      tenderUpdateStatus: params.tenderUpdateStatus,
      nextAction: params.nextAction,
      reverseAuctionApplicable: params.reverseAuctionApplicable,
    });
    return params;
  },
);

export const triggerReverseAuctionWebhook = createAsyncThunk(
  "tenders/triggerReverseAuctionWebhook",
  async (params: ReverseAuctionWebhookData) => {
    await triggerReverseAuctionMail(params);
    return params;
  },
);

export const fetchTendersIncremental = createAsyncThunk(
  "tenders/fetchTendersIncremental",
  async (fileIds: number[], { dispatch }) => {
    if (fileIds.length === 0) return;

    dispatch(startFetch(fileIds.length));

    const limit = pLimit(6);

    const fetches = fileIds.map((id) =>
      limit(async () => {
        try {
          const res = await fetch(`/api/tenders?fileId=${id}`);
          if (!res.ok) return null;
          const data: TenderData = await res.json();
          data.rows = data.rows.map((r) => ({ ...r, fileId: String(id) }));
          dispatch(mergeFile(data));
          return data;
        } catch {
          return null;
        }
      }),
    );

    await Promise.allSettled(fetches);
    dispatch(finishFetch());
  },
);

export const fetchAllTenders = createAsyncThunk(
  "tenders/fetchAllTenders",
  async (_, { dispatch, rejectWithValue }) => {
    dispatch(startFetch(1));
    try {
      const res = await fetch("/api/tenders-all");
      if (!res.ok || !res.body) {
        throw new Error(`Failed to fetch tenders (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let columns: string[] = [];
      let batch: TenderMergedRow[] = [];

      const flush = () => {
        if (batch.length === 0) return;
        dispatch(appendStreamBatch({ rows: batch }));
        batch = [];
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line) continue;

          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }

          if (Array.isArray(parsed)) {
            if (columns.length === 0) continue;
            const row: TenderMergedRow = { type: "", id: "" };
            for (let i = 0; i < columns.length; i++) {
              const v = parsed[i];
              row[columns[i]] = v == null ? "" : String(v);
            }
            batch.push(row);
            if (batch.length >= 100) flush();
          } else if (
            parsed &&
            typeof parsed === "object" &&
            "columns" in (parsed as Record<string, unknown>)
          ) {
            const meta = parsed as {
              columns: string[];
              associations: { id: number; name: string; email: string }[];
              total: number;
            };
            columns = meta.columns ?? [];
            dispatch(setStreamMeta(meta));
          } else if (
            parsed &&
            typeof parsed === "object" &&
            (parsed as Record<string, unknown>).done
          ) {
            const trailer = parsed as { totalGem?: number; totalNonGem?: number };
            dispatch(finishStream(trailer));
          }
        }
      }

      flush();
      dispatch(finishStream({}));
      return true;
    } catch (err: any) {
      console.error("[fetchAllTenders] stream error:", err);
      dispatch(finishStream({}));
      return rejectWithValue(
        err instanceof Error ? err.message : "Failed to fetch tenders",
      );
    }
  },
);

export const saveAiFeedback = createAsyncThunk(
  "tenders/saveAiFeedback",
  async (params: {
    tenderMergedId: number;
    tenderType: string;
    briefText: string;
    originalAi: string;
    correctedAi: string;
    feedbackReason: string;
  }) => {
    const res = await fetch("/api/ai-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenderId: params.tenderMergedId,
        tenderType: params.tenderType,
        briefText: params.briefText,
        originalAi: params.originalAi,
        correctedAi: params.correctedAi,
        feedbackReason: params.feedbackReason,
      }),
    });
    if (!res.ok) throw new Error("Failed to save feedback");
    return res.json();
  },
);

export const analyzeTender = createAsyncThunk(
  "tenders/analyzeTender",
  async (params: { tenderMergedId: number; brief: string }) => {
    const result = await analyzeTenderValidity(params.brief);
    if (!result.success) throw new Error(result.error);

    await saveAiRelevance({
      tenderMergedId: params.tenderMergedId,
      valid: result.data.valid,
      reason: result.data.reason,
    });

    return {
      tenderMergedId: params.tenderMergedId,
      valid: String(result.data.valid),
      reason: result.data.reason,
    };
  },
);

export const downloadTenderPdf = createAsyncThunk(
  "tenders/downloadTenderPdf",
  async (params: {
    tenderMergedId: number;
    gemId?: string;
    referenceNo?: string;
    tenderStatusId?: number | null;
  }) => {
    const res = await fetch("/api/download-pdfs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenders: [
          {
            id: params.tenderMergedId,
            gemId: params.gemId,
            referenceNo: params.referenceNo,
            tenderStatusId: params.tenderStatusId,
          },
        ],
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Download failed");
    return {
      tenderMergedId: params.tenderMergedId,
      tenderFileUrl: "",
      captchaDetected: false,
    };
  },
);

export const parseTenderPdf = createAsyncThunk(
  "tenders/parseTenderPdf",
  async (params: { tenderMergedId: number }) => {
    const res = await fetch("/api/parse-pdfs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenders: [{ id: params.tenderMergedId }] }),
    });
    const data = await res.json();
    const detail = data.results?.[0];
    if (!detail?.success) throw new Error(detail?.error || "Parse failed");
    return {
      tenderMergedId: params.tenderMergedId,
      itemCategory: detail.itemCategory,
      totalQuantity: detail.totalQuantity,
      parseStatus: "COMPLETED",
    };
  },
);

export const saveFeedbackAndReanalyze = createAsyncThunk(
  "tenders/saveFeedbackAndReanalyze",
  async (params: {
    tenderMergedId: number;
    tenderType: string;
    briefText: string;
    originalAi: string;
    correctedAi: string;
    feedbackReason: string;
  }) => {
    const res = await fetch("/api/ai-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenderId: params.tenderMergedId,
        tenderType: params.tenderType,
        briefText: params.briefText,
        originalAi: params.originalAi,
        correctedAi: params.correctedAi,
        feedbackReason: params.feedbackReason,
      }),
    });
    if (!res.ok) throw new Error("Failed to save feedback");

    const result = await analyzeTenderValidity(params.briefText);
    if (!result.success) throw new Error(result.error);

    await saveAiRelevance({
      tenderMergedId: params.tenderMergedId,
      valid: result.data.valid,
      reason: result.data.reason,
    });

    return {
      tenderMergedId: params.tenderMergedId,
      valid: String(result.data.valid),
      reason: result.data.reason,
    };
  },
);

export const syncSheetToMerged = createAsyncThunk(
  "tenders/syncSheetToMerged",
  async (_, { rejectWithValue }) => {
    const res = await fetch("/api/sync-to-merged", { method: "POST" });
    if (!res.ok) {
      const body = await res.json();
      return rejectWithValue(body.error || "Sync failed");
    }
    return await res.json();
  },
);

export const importEpcGoTenders = createAsyncThunk(
  "tenders/importEpcGoTenders",
  async (_, { dispatch }) => {
    const result = await importEpcTendersAction();
    if (result.fileId) {
      await dispatch(appendTenders([result.fileId]));
    }
    return result;
  }
);

export const appendTenders = createAsyncThunk(
  "tenders/appendTenders",
  async (fileIds: number[], { dispatch }) => {
    if (fileIds.length === 0) return;

    const limit = pLimit(6);

    const fetches = fileIds.map((id) =>
      limit(async () => {
        try {
          const res = await fetch(`/api/tenders?fileId=${id}`);
          if (!res.ok) return null;
          const data: TenderData = await res.json();
          data.rows = data.rows.map((r) => ({ ...r, fileId: String(id) }));
          dispatch(mergeFile(data));
          return data;
        } catch {
          return null;
        }
      }),
    );

    await Promise.allSettled(fetches);
  },
);

export const tendersSlice = createSlice({
  name: "tenders",
  initialState,
  reducers: {
    startFetch(state, action: PayloadAction<number>) {
      state.loading = true;
      state.data = null;
      state.totalFiles = action.payload;
      state.completedFiles = 0;
    },
    mergeFile(state, action: PayloadAction<TenderData>) {
      const incoming = action.payload;

      if (!state.data) {
        state.data = {
          fileName: `Files (1/${state.totalFiles})`,
          columns: [...incoming.columns],
          rows: [...incoming.rows],
          associations: incoming.associations ?? [],
          totalGem: incoming.totalGem,
          totalNonGem: incoming.totalNonGem,
        };
      } else {
        const existingColumns = new Set(state.data.columns);
        const newCols: string[] = [];
        for (const col of incoming.columns) {
          if (!existingColumns.has(col)) {
            state.data.columns.push(col);
            existingColumns.add(col);
            newCols.push(col);
          }
        }
        const existingRefNos = new Set(state.data.rows.map((r) => r.referenceNo));
        const uniqueRows = incoming.rows.filter((r) => !existingRefNos.has(r.referenceNo));
        state.data.rows.push(...uniqueRows);
        state.data.totalGem += incoming.totalGem;
        state.data.totalNonGem += incoming.totalNonGem;
        state.data.fileName = `Files (${state.completedFiles + 1}/${state.totalFiles})`;

        // console.log(
        //   `[mergeFile] incoming="${incoming.fileName}" cols=${incoming.columns.length} rows=${incoming.rows.length}`,
        //   `newCols=${newCols.length > 0 ? JSON.stringify(newCols) : "none"}`,
        //   `totalCols=${state.data.columns.length}`,
        // );
      }

      state.completedFiles += 1;
    },
    finishFetch(state) {
      state.loading = false;
      if (state.data) {
        state.data.fileName = `All Files (${state.completedFiles})`;
      }
    },
    setStreamMeta(
      state,
      action: PayloadAction<{
        columns: string[];
        associations: { id: number; name: string; email: string }[];
        total: number;
      }>,
    ) {
      const { columns, associations } = action.payload;
      if (!state.data) {
        state.data = {
          fileName: "All Files (streaming)",
          columns: [...columns],
          rows: [],
          associations: associations ?? [],
          totalGem: 0,
          totalNonGem: 0,
        };
      } else {
        const existing = new Set(state.data.columns);
        for (const col of columns) {
          if (!existing.has(col)) {
            state.data.columns.push(col);
            existing.add(col);
          }
        }
        if (associations && associations.length > 0) {
          state.data.associations = associations;
        }
      }
      state.completedFiles = 1;
    },
    appendStreamBatch(
      state,
      action: PayloadAction<{ rows: TenderMergedRow[] }>,
    ) {
      if (!state.data) return;
      state.data.rows.push(...action.payload.rows);
      state.completedFiles = 1;
    },
    finishStream(
      state,
      action: PayloadAction<{ totalGem?: number; totalNonGem?: number }>,
    ) {
      state.loading = false;
      if (state.data) {
        if (action.payload.totalGem !== undefined) {
          state.data.totalGem = action.payload.totalGem;
        }
        if (action.payload.totalNonGem !== undefined) {
          state.data.totalNonGem = action.payload.totalNonGem;
        }
        state.data.fileName = `All Files (${state.data.rows.length})`;
      }
    },
    updateAnalysisResult(
      state,
      action: PayloadAction<{ tenderMergedId: number; valid: string; reason: string }>,
    ) {
      if (!state.data) return;
      const row = state.data.rows.find(
        (r) => Number(r.id) === action.payload.tenderMergedId,
      );
      if (row) {
        row.aiRelevanceValid = action.payload.valid;
        row.aiRelevanceReason = action.payload.reason;
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchTendersIncremental.rejected, (state) => {
      state.loading = false;
    });
    builder.addCase(updateTenderCell.pending, (state, action) => {
      const { rowIndex, field } = action.meta.arg;
      state.updatingCells[`${rowIndex}-${field}`] = true;
    });
    builder.addCase(updateTenderCell.fulfilled, (state, action) => {
      const { rowIndex, field, value } = action.meta.arg;
      state.updatingCells[`${rowIndex}-${field}`] = false;
      if (state.data?.rows[rowIndex]) {
        state.data.rows[rowIndex][field] = value;
      }
    });
    builder.addCase(updateTenderCell.rejected, (state, action) => {
      const { rowIndex, field, oldValue } = action.meta.arg;
      state.updatingCells[`${rowIndex}-${field}`] = false;
      if (state.data?.rows[rowIndex]) {
        state.data.rows[rowIndex][field] = oldValue;
      }
    });
    // updateTenderDocketNo
    builder.addCase(updateTenderDocketNo.pending, (state, action) => {
      const { tenderMergedId } = action.meta.arg;
      state.updatingCells[`${tenderMergedId}-docketNo`] = true;
    });
    builder.addCase(updateTenderDocketNo.fulfilled, (state, action) => {
      const { tenderMergedId, docketNo } = action.meta.arg;
      state.updatingCells[`${tenderMergedId}-docketNo`] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) row.docketNo = docketNo;
      }
    });
    builder.addCase(updateTenderDocketNo.rejected, (state, action) => {
      const { tenderMergedId } = action.meta.arg;
      state.updatingCells[`${tenderMergedId}-docketNo`] = false;
    });
    // updateTenderBgNoUtrNo
    builder.addCase(updateTenderBgNoUtrNo.pending, (state, action) => {
      const { tenderMergedId } = action.meta.arg;
      state.updatingCells[`${tenderMergedId}-bgNoUtrNo`] = true;
    });
    builder.addCase(updateTenderBgNoUtrNo.fulfilled, (state, action) => {
      const { tenderMergedId, bgNoUtrNo } = action.meta.arg;
      state.updatingCells[`${tenderMergedId}-bgNoUtrNo`] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) row.bgNoUtrNo = bgNoUtrNo;
      }
    });
    builder.addCase(updateTenderBgNoUtrNo.rejected, (state, action) => {
      const { tenderMergedId } = action.meta.arg;
      state.updatingCells[`${tenderMergedId}-bgNoUtrNo`] = false;
    });
    // updateTenderRemarks
    builder.addCase(updateTenderRemarks.pending, (state, action) => {
      state.updatingCells[`${action.meta.arg.tenderMergedId}-remarks`] = true;
    });
    builder.addCase(updateTenderRemarks.fulfilled, (state, action) => {
      const { tenderMergedId, remarks } = action.meta.arg;
      console.log(`[redux] updateTenderRemarks.fulfilled id=${tenderMergedId} remarks="${remarks}"`);
      state.updatingCells[`${tenderMergedId}-remarks`] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) row.remarks = remarks;
      }
    });
    builder.addCase(updateTenderRemarks.rejected, (state, action) => {
      console.warn(`[redux] updateTenderRemarks.rejected:`, action.error);
      state.updatingCells[`${action.meta.arg.tenderMergedId}-remarks`] = false;
    });
    // updateTenderBeneficiaryBankDetails
    builder.addCase(updateTenderBeneficiaryBankDetails.pending, (state, action) => {
      state.updatingCells[`${action.meta.arg.tenderMergedId}-beneficiaryBankDetails`] = true;
    });
    builder.addCase(updateTenderBeneficiaryBankDetails.fulfilled, (state, action) => {
      const { tenderMergedId, beneficiaryBankDetails } = action.meta.arg;
      console.log(`[redux] updateTenderBeneficiaryBankDetails.fulfilled id=${tenderMergedId} value="${beneficiaryBankDetails}"`);
      state.updatingCells[`${tenderMergedId}-beneficiaryBankDetails`] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) row.beneficiaryBankDetails = beneficiaryBankDetails;
      }
    });
    builder.addCase(updateTenderBeneficiaryBankDetails.rejected, (state, action) => {
      console.warn(`[redux] updateTenderBeneficiaryBankDetails.rejected:`, action.error);
      state.updatingCells[`${action.meta.arg.tenderMergedId}-beneficiaryBankDetails`] = false;
    });
    // updateTenderLoiPoNoAndDate
    builder.addCase(updateTenderLoiPoNoAndDate.pending, (state, action) => {
      state.updatingCells[`${action.meta.arg.tenderMergedId}-loiPoNoAndDate`] = true;
    });
    builder.addCase(updateTenderLoiPoNoAndDate.fulfilled, (state, action) => {
      const { tenderMergedId, loiPoNoAndDate } = action.meta.arg;
      console.log(`[redux] updateTenderLoiPoNoAndDate.fulfilled id=${tenderMergedId} loiPoNoAndDate="${loiPoNoAndDate}"`);
      state.updatingCells[`${tenderMergedId}-loiPoNoAndDate`] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) row.loiPoNoAndDate = loiPoNoAndDate;
      }
    });
    builder.addCase(updateTenderLoiPoNoAndDate.rejected, (state, action) => {
      console.warn(`[redux] updateTenderLoiPoNoAndDate.rejected:`, action.error);
      state.updatingCells[`${action.meta.arg.tenderMergedId}-loiPoNoAndDate`] = false;
    });
    // updateTenderCompetitors
    builder.addCase(updateTenderCompetitors.pending, (state, action) => {
      state.updatingCells[`${action.meta.arg.tenderMergedId}-competitors`] = true;
    });
    builder.addCase(updateTenderCompetitors.fulfilled, (state, action) => {
      const { tenderMergedId, competitors } = action.meta.arg;
      console.log(`[redux] updateTenderCompetitors.fulfilled id=${tenderMergedId} competitors="${competitors}"`);
      state.updatingCells[`${tenderMergedId}-competitors`] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) row.competitors = competitors;
      }
    });
    builder.addCase(updateTenderCompetitors.rejected, (state, action) => {
      console.warn(`[redux] updateTenderCompetitors.rejected:`, action.error);
      state.updatingCells[`${action.meta.arg.tenderMergedId}-competitors`] = false;
    });
    // updateTenderReason
    builder.addCase(updateTenderReason.pending, (state, action) => {
      state.updatingCells[`${action.meta.arg.tenderMergedId}-reason`] = true;
    });
    builder.addCase(updateTenderReason.fulfilled, (state, action) => {
      const { tenderMergedId, reason } = action.meta.arg;
      state.updatingCells[`${tenderMergedId}-reason`] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) row.reason = reason;
      }
    });
    builder.addCase(updateTenderReason.rejected, (state, action) => {
      state.updatingCells[`${action.meta.arg.tenderMergedId}-reason`] = false;
    });
    // updateTenderDiffPercentFromL1
    builder.addCase(updateTenderDiffPercentFromL1.pending, (state, action) => {
      state.updatingCells[`${action.meta.arg.tenderMergedId}-diffL1`] = true;
    });
    builder.addCase(updateTenderDiffPercentFromL1.fulfilled, (state, action) => {
      const { tenderMergedId, diffPercentFromL1 } = action.meta.arg;
      console.log(`[redux] updateTenderDiffPercentFromL1.fulfilled id=${tenderMergedId} value=${diffPercentFromL1}`);
      state.updatingCells[`${tenderMergedId}-diffL1`] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) row.diffPercentFromL1 = String(diffPercentFromL1 ?? "");
      }
    });
    builder.addCase(updateTenderDiffPercentFromL1.rejected, (state, action) => {
      console.warn(`[redux] updateTenderDiffPercentFromL1.rejected:`, action.error);
      state.updatingCells[`${action.meta.arg.tenderMergedId}-diffL1`] = false;
    });
    // updateTenderDiffPercentFromL2
    builder.addCase(updateTenderDiffPercentFromL2.pending, (state, action) => {
      state.updatingCells[`${action.meta.arg.tenderMergedId}-diffL2`] = true;
    });
    builder.addCase(updateTenderDiffPercentFromL2.fulfilled, (state, action) => {
      const { tenderMergedId, diffPercentFromL2 } = action.meta.arg;
      console.log(`[redux] updateTenderDiffPercentFromL2.fulfilled id=${tenderMergedId} value=${diffPercentFromL2}`);
      state.updatingCells[`${tenderMergedId}-diffL2`] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) row.diffPercentFromL2 = String(diffPercentFromL2 ?? "");
      }
    });
    builder.addCase(updateTenderDiffPercentFromL2.rejected, (state, action) => {
      console.warn(`[redux] updateTenderDiffPercentFromL2.rejected:`, action.error);
      state.updatingCells[`${action.meta.arg.tenderMergedId}-diffL2`] = false;
    });
    // updateTenderStatusAndAction
    builder.addCase(updateTenderStatusAndAction.pending, (state, action) => {
      const { tenderMergedId } = action.meta.arg;
      state.updatingCells[`${tenderMergedId}-statusAndAction`] = true;
    });
    builder.addCase(updateTenderStatusAndAction.fulfilled, (state, action) => {
      const { tenderMergedId, tenderUpdateStatus, nextAction, reverseAuctionApplicable } = action.meta.arg;
      state.updatingCells[`${tenderMergedId}-statusAndAction`] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) {
          row.tenderUpdateStatus = tenderUpdateStatus;
          row.nextAction = nextAction ?? "";
          row.reverseAuctionApplicable = reverseAuctionApplicable ? "true" : "false";
        }
      }
    });
    builder.addCase(updateTenderStatusAndAction.rejected, (state, action) => {
      console.warn(`[redux] updateTenderStatusAndAction.rejected:`, action.error);
      state.updatingCells[`${action.meta.arg.tenderMergedId}-statusAndAction`] = false;
    });
    builder.addCase(updateTenderAssignments.pending, (state, action) => {
      const { rowIndex, associationIds } = action.meta.arg;
      if (state.data?.rows[rowIndex]) {
        state.data.rows[rowIndex].assignedTo = associationIds.join(",");
      }
    });
    builder.addCase(updateTenderAssignments.fulfilled, (state, action) => {
      const { rowIndex, associationIds } = action.meta.arg;
      if (state.data?.rows[rowIndex]) {
        state.data.rows[rowIndex].assignedTo = associationIds.join(",");
      }
    });
    builder.addCase(updateTenderAssignments.rejected, (state, action) => {
      const { rowIndex, oldValue } = action.meta.arg;
      if (state.data?.rows[rowIndex]) {
        state.data.rows[rowIndex].assignedTo = oldValue;
      }
    });
    // updateWebsiteMapping
    builder.addCase(updateWebsiteMapping.pending, (state, action) => {
      const { tenderMergedId, website } = action.meta.arg;
      const key = `${tenderMergedId}-website`;
      state.updatingCells[key] = true;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) row.website = website;
      }
    });
    builder.addCase(updateWebsiteMapping.fulfilled, (state, action) => {
      const key = `${action.meta.arg.tenderMergedId}-website`;
      state.updatingCells[key] = false;
    });
    builder.addCase(updateWebsiteMapping.rejected, (state, action) => {
      const { tenderMergedId, oldValue } = action.meta.arg;
      const key = `${tenderMergedId}-website`;
      state.updatingCells[key] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) row.website = oldValue;
      }
    });

    // uploadTenderDocument
    builder.addCase(uploadTenderDocument.pending, (state, action) => {
      const key = `${action.meta.arg.tenderMergedId}-tenderDocument`;
      state.updatingCells[key] = true;
    });
    builder.addCase(uploadTenderDocument.fulfilled, (state, action) => {
      const key = `${action.meta.arg.tenderMergedId}-tenderDocument`;
      state.updatingCells[key] = false;
      if (state.data) {
        const row = state.data.rows.find(
          (r) => Number(r.id) === action.meta.arg.tenderMergedId,
        );
        if (row) {
          const files = row.tenderFiles ? JSON.parse(row.tenderFiles) : [];
          const filtered = Array.isArray(files)
            ? files.filter(
                (f: { tags?: string[] }) =>
                  !f.tags?.includes(action.meta.arg.fileType),
              )
            : [];
          filtered.push({
            id: action.payload.id,
            name: action.payload.name,
            extension: action.payload.extension,
            url: action.payload.url,
            source: action.payload.source,
            tags: [action.meta.arg.fileType],
          });
          row.tenderFiles = JSON.stringify(filtered);
        }
      }
    });
    builder.addCase(uploadTenderDocument.rejected, (state, action) => {
      const key = `${action.meta.arg.tenderMergedId}-tenderDocument`;
      state.updatingCells[key] = false;
    });

    // updateTenderMergedField (generic)
    builder.addCase(updateTenderMergedField.pending, (state, action) => {
      const { tenderMergedId, field } = action.meta.arg;
      state.updatingCells[`${tenderMergedId}-${field}`] = true;
    });
    builder.addCase(updateTenderMergedField.fulfilled, (state, action) => {
      const { tenderMergedId, field, value } = action.meta.arg;
      const key = `${tenderMergedId}-${field}`;
      state.updatingCells[key] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) {
          row[field] = value;
          if (field === "raQualificationRule") {
            row.reverseAuctionApplicable = value ? "true" : row.reverseAuctionApplicable;
          }
          const diffs = (action.payload as any)?.diffs as
            | {
                diffPercentFromL1?: number | null;
                diffPercentFromL2?: number | null;
                differenceBetweenRank1?: string | null;
                differenceBetweenRank2?: string | null;
              }
            | undefined;
          if (diffs) {
            if (diffs.diffPercentFromL1 !== undefined) {
              row.diffPercentFromL1 = diffs.diffPercentFromL1 == null ? "" : String(diffs.diffPercentFromL1);
            }
            if (diffs.diffPercentFromL2 !== undefined) {
              row.diffPercentFromL2 = diffs.diffPercentFromL2 == null ? "" : String(diffs.diffPercentFromL2);
            }
            if (diffs.differenceBetweenRank1 !== undefined) {
              row.differenceBetweenRank1 = diffs.differenceBetweenRank1 == null ? "" : String(diffs.differenceBetweenRank1);
            }
            if (diffs.differenceBetweenRank2 !== undefined) {
              row.differenceBetweenRank2 = diffs.differenceBetweenRank2 == null ? "" : String(diffs.differenceBetweenRank2);
            }
          }
        }
      }
    });
    builder.addCase(updateTenderMergedField.rejected, (state, action) => {
      const { tenderMergedId, field } = action.meta.arg;
      state.updatingCells[`${tenderMergedId}-${field}`] = false;
    });

    // bulkAssignUtilityMapping
    builder.addCase(bulkAssignUtilityMapping.fulfilled, (state, action) => {
      const { updatedIds } = action.payload;
      if (state.data) {
        for (const id of updatedIds) {
          const row = state.data.rows.find((r) => Number(r.id) === id);
          if (row) row.website = action.meta.arg.website;
        }
      }
    });

    builder.addCase(saveAiFeedback.pending, (state, action) => {
      const key = `${action.meta.arg.tenderMergedId}-feedback`;
      state.feedbackSaving[key] = true;
    });
    builder.addCase(saveAiFeedback.fulfilled, (state, action) => {
      const { tenderMergedId, correctedAi, feedbackReason } =
        action.meta.arg;
      const key = `${tenderMergedId}-feedback`;
      state.feedbackSaving[key] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) {
          row.aiFeedbackCorrected = correctedAi;
          row.aiFeedbackReason = feedbackReason;
        }
      }
    });
    builder.addCase(saveAiFeedback.rejected, (state, action) => {
      const key = `${action.meta.arg.tenderMergedId}-feedback`;
      state.feedbackSaving[key] = false;
    });

    // analyzeTender
    builder.addCase(analyzeTender.pending, (state, action) => {
      state.updatingCells[
        `${action.meta.arg.tenderMergedId}-analyze`
      ] = true;
    });
    builder.addCase(analyzeTender.fulfilled, (state, action) => {
      const { tenderMergedId, valid, reason } = action.payload;
      state.updatingCells[`${tenderMergedId}-analyze`] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) {
          row.aiRelevanceValid = valid;
          row.aiRelevanceReason = reason;
        }
      }
    });
    builder.addCase(analyzeTender.rejected, (state, action) => {
      state.updatingCells[
        `${action.meta.arg.tenderMergedId}-analyze`
      ] = false;
    });

    // downloadTenderPdf
    builder.addCase(downloadTenderPdf.pending, (state, action) => {
      state.pdfDownloading[String(action.meta.arg.tenderMergedId)] = true;
    });
    builder.addCase(downloadTenderPdf.fulfilled, (state, action) => {
      const { tenderMergedId, tenderFileUrl } = action.payload;
      state.pdfDownloading[String(tenderMergedId)] = false;
      if (state.data && tenderFileUrl) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) {
          row.tenderFileUrl = tenderFileUrl;
        }
      }
    });
    builder.addCase(downloadTenderPdf.rejected, (state, action) => {
      state.pdfDownloading[String(action.meta.arg.tenderMergedId)] = false;
    });

    // parseTenderPdf
    builder.addCase(parseTenderPdf.pending, (state, action) => {
      state.pdfParsing[String(action.meta.arg.tenderMergedId)] = true;
    });
    builder.addCase(parseTenderPdf.fulfilled, (state, action) => {
      const { tenderMergedId, itemCategory, totalQuantity, parseStatus } = action.payload;
      state.pdfParsing[String(tenderMergedId)] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) {
          row.itemCategory = itemCategory;
          row.totalQuantity = totalQuantity;
          row.parseStatus = parseStatus;
        }
      }
    });
    builder.addCase(parseTenderPdf.rejected, (state, action) => {
      state.pdfParsing[String(action.meta.arg.tenderMergedId)] = false;
    });

    // saveFeedbackAndReanalyze
    builder.addCase(saveFeedbackAndReanalyze.pending, (state, action) => {
      const key = `${action.meta.arg.tenderMergedId}-reanalyze`;
      state.feedbackSaving[key] = true;
    });
    builder.addCase(saveFeedbackAndReanalyze.fulfilled, (state, action) => {
      const { tenderMergedId, valid, reason } = action.payload;
      const { correctedAi, feedbackReason } = action.meta.arg;
      const key = `${tenderMergedId}-reanalyze`;
      state.feedbackSaving[key] = false;
      if (state.data) {
        const row = state.data.rows.find((r) => Number(r.id) === tenderMergedId);
        if (row) {
          row.aiRelevanceValid = valid;
          row.aiRelevanceReason = reason;
          row.aiFeedbackCorrected = correctedAi;
          row.aiFeedbackReason = feedbackReason;
        }
      }
    });
    builder.addCase(saveFeedbackAndReanalyze.rejected, (state, action) => {
      const key = `${action.meta.arg.tenderMergedId}-reanalyze`;
      state.feedbackSaving[key] = false;
    });

    // syncSheetToMerged
    builder.addCase(syncSheetToMerged.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(syncSheetToMerged.fulfilled, (state, action) => {
      state.loading = false;
      const { tenders } = action.payload;
      if (!state.data || !tenders) return;

      for (const row of tenders.rows) {
        const idx = state.data.rows.findIndex((r) => r.referenceNo === row.referenceNo);
        if (idx >= 0) {
          state.data.rows[idx] = { ...state.data.rows[idx], ...row };
        } else {
          state.data.rows.push(row);
        }
      }

      for (const col of tenders.columns) {
        if (!state.data.columns.includes(col)) {
          state.data.columns.push(col);
        }
      }
    });
    builder.addCase(syncSheetToMerged.rejected, (state) => {
      state.loading = false;
    });
  },
});

export const {
  startFetch,
  mergeFile,
  finishFetch,
  updateAnalysisResult,
  setStreamMeta,
  appendStreamBatch,
  finishStream,
} =
  tendersSlice.actions;
export default tendersSlice.reducer;
