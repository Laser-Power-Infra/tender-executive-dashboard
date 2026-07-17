import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { SortingState, ColumnSizingState, VisibilityState } from "@tanstack/react-table";
import type { ColumnFilterState, ColumnFilterType } from "@/lib/types";

type DeadlinePreset = "thisWeek" | "thisMonth" | "thisYear";

interface FiltersState {
  exclusionFilter: string | null;
  deadlinePreset: DeadlinePreset | null;
  deadlineDateFrom: string | null;
  deadlineDateTo: string | null;
  globalFilter: string;
  sorting: SortingState;
  columnVisibility: VisibilityState;
  columnSizing: ColumnSizingState;
  typeFilter: "all" | "Gem" | "Non-Gem";
  aiRelevanceFilter: "all" | "yes" | "no" | "not_analysed";
  showFilterTray: boolean;
  columnFilters: Record<string, ColumnFilterState>;
}

const initialState: FiltersState = {
  exclusionFilter: null,
  deadlinePreset: null,
  deadlineDateFrom: null,
  deadlineDateTo: null,
  globalFilter: "",
  sorting: [],
  columnVisibility: {},
  columnSizing: {},
  typeFilter: "all",
  aiRelevanceFilter: "all",
  showFilterTray: false,
  columnFilters: {},
};

export const filtersSlice = createSlice({
  name: "filters",
  initialState,
  reducers: {
    setExclusionFilter(state, action: PayloadAction<string | null>) {
      state.exclusionFilter = action.payload;
    },
    setDeadlinePreset(state, action: PayloadAction<DeadlinePreset | null>) {
      state.deadlinePreset = action.payload;
      if (action.payload) {
        state.deadlineDateFrom = null;
        state.deadlineDateTo = null;
      }
    },
    setDeadlineDateRange(state, action: PayloadAction<{ from: string | null; to: string | null }>) {
      state.deadlineDateFrom = action.payload.from;
      state.deadlineDateTo = action.payload.to;
      if (action.payload.from) {
        state.deadlinePreset = null;
      }
    },
    clearDeadlineFilter(state) {
      state.deadlinePreset = null;
      state.deadlineDateFrom = null;
      state.deadlineDateTo = null;
    },
    setGlobalFilter(state, action: PayloadAction<string>) {
      state.globalFilter = action.payload;
    },
    setSorting(state, action: PayloadAction<SortingState>) {
      state.sorting = action.payload;
    },
    setColumnVisibility(state, action: PayloadAction<VisibilityState>) {
      state.columnVisibility = action.payload;
    },
    setColumnSizing(state, action: PayloadAction<ColumnSizingState>) {
      state.columnSizing = action.payload;
    },
    setTypeFilter(state, action: PayloadAction<"all" | "Gem" | "Non-Gem">) {
      state.typeFilter = action.payload;
    },
    setAiRelevanceFilter(state, action: PayloadAction<"all" | "yes" | "no" | "not_analysed">) {
      state.aiRelevanceFilter = action.payload;
    },
    toggleFilterTray(state) {
      state.showFilterTray = !state.showFilterTray;
    },
    setShowFilterTray(state, action: PayloadAction<boolean>) {
      state.showFilterTray = action.payload;
    },
    setColumnFilter(state, action: PayloadAction<{ accessor: string; filterType: ColumnFilterType; value: unknown }>) {
      const { accessor, filterType, value } = action.payload;
      const currentFilter = state.columnFilters[accessor] || {};

      switch (filterType) {
        case "dateRange":
          state.columnFilters[accessor] = {
            ...currentFilter,
            dateRange: value as { startDate: string; endDate: string },
          };
          break;
        case "select":
          state.columnFilters[accessor] = {
            ...currentFilter,
            select: value as string,
          };
          break;
        case "text":
          state.columnFilters[accessor] = {
            ...currentFilter,
            text: value as string,
          };
          break;
        case "boolean":
          state.columnFilters[accessor] = {
            ...currentFilter,
            boolean: value as boolean | null,
          };
          break;
      }
    },
    clearColumnFilter(state, action: PayloadAction<{ accessor: string; filterType: ColumnFilterType }>) {
      const { accessor, filterType } = action.payload;
      const currentFilter = state.columnFilters[accessor];
      if (!currentFilter) return;

      switch (filterType) {
        case "dateRange":
          state.columnFilters[accessor] = { ...currentFilter, dateRange: undefined };
          break;
        case "select":
          state.columnFilters[accessor] = { ...currentFilter, select: undefined };
          break;
        case "text":
          state.columnFilters[accessor] = { ...currentFilter, text: undefined };
          break;
        case "boolean":
          state.columnFilters[accessor] = { ...currentFilter, boolean: undefined };
          break;
      }
    },
    resetColumnFilters(state) {
      state.columnFilters = {};
    },
    resetAllFilters(state) {
      state.exclusionFilter = null;
      state.deadlinePreset = null;
      state.deadlineDateFrom = null;
      state.deadlineDateTo = null;
      state.typeFilter = "all";
      state.aiRelevanceFilter = "all";
      state.globalFilter = "";
    },
  },
});

export const {
  setExclusionFilter,
  setDeadlinePreset,
  setDeadlineDateRange,
  clearDeadlineFilter,
  setGlobalFilter,
  setSorting,
  setColumnVisibility,
  setColumnSizing,
  setTypeFilter,
  setAiRelevanceFilter,
  toggleFilterTray,
  setShowFilterTray,
  setColumnFilter,
  clearColumnFilter,
  resetColumnFilters,
  resetAllFilters,
} = filtersSlice.actions;

export type { DeadlinePreset };

export default filtersSlice.reducer;
