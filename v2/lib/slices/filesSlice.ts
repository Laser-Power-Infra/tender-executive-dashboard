import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { format, subDays } from "date-fns";

interface FileItem {
  id: number;
  fileName: string;
  totalCount: number | null;
  excludedCount: number | null;
  status: string | null;
}

interface FilesState {
  selectedDateFrom: string;
  selectedDateTo: string;
  items: FileItem[];
  loading: boolean;
}

function todayString(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function twoDaysAgoString(): string {
  const d = subDays(new Date(), 2);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const initialState: FilesState = {
  selectedDateFrom: twoDaysAgoString(),
  selectedDateTo: todayString(),
  items: [],
  loading: false,
};

export const fetchFiles = createAsyncThunk(
  "files/fetchFiles",
  async ({ from, to }: { from: Date; to: Date }) => {
    const fromStr = format(from, "yyyy-MM-dd");
    const toStr = format(to, "yyyy-MM-dd");
    const res = await fetch(`/api/files?from=${fromStr}&to=${toStr}`);
    if (!res.ok) {
      throw new Error("Failed to fetch files");
    }
    const data = await res.json();
    return data.files as FileItem[];
  },
);

export const filesSlice = createSlice({
  name: "files",
  initialState,
  reducers: {
    setSelectedDateRange(state, action) {
      state.selectedDateFrom = action.payload.from;
      state.selectedDateTo = action.payload.to;
      state.items = [];
    },
    clearState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFiles.pending, (state) => {
        state.loading = true;
        state.items = [];
      })
      .addCase(fetchFiles.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchFiles.rejected, (state) => {
        state.loading = false;
        state.items = [];
      });
  },
});

export const { setSelectedDateRange, clearState } = filesSlice.actions;
export default filesSlice.reducer;
