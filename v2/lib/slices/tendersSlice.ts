import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import pLimit from "p-limit";
import {
  updateTenderDecision,
  updateTenderAssignmentsAction,
  updateTenderUtilityMapping,
  bulkAssignUtilityMappingAction,
} from "@/actions/tender";
import { importEpcTendersAction } from "@/actions/importEpcTenders";
import { analyzeTenderValidity, saveAiRelevance } from "@/actions/ai-analysis";
import { filtersSlice } from "./filtersSlice";
import { uploadFiles } from "./uploadSlice";

export interface TenderData {
  fileName: string;
  columns: string[];
  rows: Record<string, string>[];
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
      field: params.field as "app" | "aps" | "apm",
      value: params.value as "YES" | "NO" | "NOT_DECIDED",
    });
    return result;
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

export const saveAiFeedback = createAsyncThunk(
  "tenders/saveAiFeedback",
  async (params: {
    tenderMergedId: number;
    briefText: string;
    originalAi: string;
    correctedAi: string;
    feedbackReason: string;
  }) => {
    const res = await fetch("/api/ai-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
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
    const detail = data.results?.[0];
    if (!detail?.success) throw new Error(detail?.error || "Download failed");
    return {
      tenderMergedId: params.tenderMergedId,
      tenderFileUrl: detail.pdfPath ?? "",
      captchaDetected: detail.captchaDetected,
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
    briefText: string;
    originalAi: string;
    correctedAi: string;
    feedbackReason: string;
  }) => {
    const res = await fetch("/api/ai-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
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

        console.log(
          `[mergeFile] incoming="${incoming.fileName}" cols=${incoming.columns.length} rows=${incoming.rows.length}`,
          `newCols=${newCols.length > 0 ? JSON.stringify(newCols) : "none"}`,
          `totalCols=${state.data.columns.length}`,
        );
      }

      state.completedFiles += 1;
    },
    finishFetch(state) {
      state.loading = false;
      if (state.data) {
        state.data.fileName = `All Files (${state.completedFiles})`;
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
      const { rowIndex, field, value } = action.meta.arg;
      state.updatingCells[`${rowIndex}-${field}`] = true;
      if (state.data?.rows[rowIndex]) {
        state.data.rows[rowIndex][field] = value;
      }
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
  },
});

export const { startFetch, mergeFile, finishFetch, updateAnalysisResult } =
  tendersSlice.actions;
export default tendersSlice.reducer;
