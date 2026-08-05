import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { toast } from "sonner";

interface SheetResult {
  sheetName: string;
  gemCount: number;
  nonGemCount: number;
  excludedCount: number;
  errors: string[];
  skipped: boolean;
}

interface FileResult {
  fileName: string;
  fileId: number;
  sheets: SheetResult[];
  totalGem: number;
  totalNonGem: number;
  totalErrors: string[];
  totalCount: number;
  excludedCount: number;
}

interface UploadResponse {
  success: boolean;
  results: FileResult[];
  error?: string;
}

interface UploadState {
  pendingFiles: File[];
  parsing: boolean;
  results: FileResult[] | null;
}

const initialState: UploadState = {
  pendingFiles: [],
  parsing: false,
  results: null,
};

export const uploadFiles = createAsyncThunk(
  "upload/uploadFiles",
  async (files: File[]) => {
    const accumulated: FileResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const label = `Processing file ${i + 1}/${files.length}: ${file.name}`;
      const loadingToast = toast.loading(label);

      try {
        const formData = new FormData();
        formData.append("files", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data: UploadResponse = await res.json();

        if (!res.ok) {
          toast.dismiss(loadingToast);
          toast.error(`${file.name} failed`, {
            description: data.error || "Upload error",
          });
          continue;
        }

        const fileResult = data.results[0];
        accumulated.push(fileResult);

        toast.dismiss(loadingToast);
        toast.success(`${file.name} done`, {
          description: `${fileResult.totalGem} GEM · ${fileResult.totalNonGem} Non-GEM · ${fileResult.excludedCount} excluded${fileResult.totalErrors.length ? ` · ${fileResult.totalErrors.length} error(s)` : ""}`,
        });
      } catch {
        toast.dismiss(loadingToast);
        toast.error(`${file.name} failed`, {
          description: "Network error. Please try again.",
        });
      }
    }

    return accumulated;
  },
);

export const uploadSlice = createSlice({
  name: "upload",
  initialState,
  reducers: {
    addFiles(state, action: { payload: FileList }) {
      const incoming = Array.from(action.payload);
      const validFiles = incoming.filter(
        (f) =>
          f.name.endsWith(".xlsx") ||
          f.name.endsWith(".xls") ||
          f.type.includes("spreadsheet") ||
          f.type.includes("excel"),
      );

      const invalidCount = incoming.length - validFiles.length;
      if (invalidCount > 0) {
        toast.error(`${invalidCount} file(s) skipped — only .xlsx/.xls allowed`);
      }

      const existing = new Set(state.pendingFiles.map((f) => f.name + f.size));
      const unique = validFiles.filter(
        (f) => !existing.has(f.name + f.size),
      );
      state.pendingFiles.push(...unique);
    },
    removeFile(state, action) {
      state.pendingFiles.splice(action.payload, 1);
    },
    clearFiles(state) {
      state.pendingFiles = [];
    },
    clearResults(state) {
      state.results = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(uploadFiles.pending, (state) => {
        state.parsing = true;
        state.results = null;
      })
      .addCase(uploadFiles.fulfilled, (state, action) => {
        state.parsing = false;
        state.pendingFiles = [];
        state.results = action.payload;
      })
      .addCase(uploadFiles.rejected, (state) => {
        state.parsing = false;
      });
  },
});

export const { addFiles, removeFile, clearFiles, clearResults } =
  uploadSlice.actions;
export default uploadSlice.reducer;
