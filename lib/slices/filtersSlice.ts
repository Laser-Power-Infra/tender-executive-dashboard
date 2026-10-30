import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
type VisibilityState = Record<string, boolean>;
import type { ColumnFilterState, ColumnFilterType } from "@/lib/types";

type ParticipationFilter = "participated" | "notParticipated" | "upcomingRa" | "participatedWithRa" | "participatedWithoutRa" | "yetToOpenRa" | "bidOpeningPendingExclRa" | "participatedTotal" | "raDone" | "raPending" | "technicalOpen" | "technicalNotOpen" | "weL1" | "weLost" | "expRaDate" | "contractReceived" | "contractPending" | "financialOpen" | "financialNotOpen" | "financialWeL1" | "financialWeLost" | "financialContractReceived" | "financialContractPending";
type AnalyticsFilter = "aiYes" | "aiYesUnallocated" | "apmYesAllocated" | "apmYesUnallocated" | null;

interface FiltersState {
  exclusionFilter: string | null;
  columnVisibility: VisibilityState;
  columnFilters: Record<string, ColumnFilterState>;
  participationFilters: ParticipationFilter[];
  analyticsFilter: AnalyticsFilter;
  /** Turns off the tenders page's default "today onward" deadline rule. */
  showPastDeadlines: boolean;
}

const initialState: FiltersState = {
  exclusionFilter: null,
  columnVisibility: {},
  columnFilters: {},
  participationFilters: [],
  analyticsFilter: null,
  showPastDeadlines: false,
};

export const filtersSlice = createSlice({
  name: "filters",
  initialState,
  reducers: {
    setExclusionFilter(state, action: PayloadAction<string | null>) {
      state.exclusionFilter = action.payload;
    },
    setColumnVisibility(state, action: PayloadAction<VisibilityState>) {
      state.columnVisibility = action.payload;
    },
    toggleParticipationFilter(state, action: PayloadAction<ParticipationFilter>) {
      const value = action.payload;
      const idx = state.participationFilters.indexOf(value);
      if (idx >= 0) {
        state.participationFilters.splice(idx, 1);
      } else {
        state.participationFilters.push(value);
      }
    },
    clearParticipationFilters(state) {
      state.participationFilters = [];
    },
    setAnalyticsFilter(state, action: PayloadAction<AnalyticsFilter>) {
      state.analyticsFilter = action.payload;
    },
    setShowPastDeadlines(state, action: PayloadAction<boolean>) {
      state.showPastDeadlines = action.payload;
    },
    // Keyed by filter type, so every ColumnFilterType (numberRange included) is
    // stored without a case per type.
    setColumnFilter(state, action: PayloadAction<{ accessor: string; filterType: ColumnFilterType; value: unknown }>) {
      const { accessor, filterType, value } = action.payload;
      state.columnFilters[accessor] = {
        ...state.columnFilters[accessor],
        [filterType]: value,
      } as ColumnFilterState;
    },
    clearColumnFilter(state, action: PayloadAction<{ accessor: string; filterType: ColumnFilterType }>) {
      const { accessor, filterType } = action.payload;
      const currentFilter = state.columnFilters[accessor];
      if (!currentFilter) return;
      state.columnFilters[accessor] = { ...currentFilter, [filterType]: undefined };
    },
    resetColumnFilters(state) {
      state.columnFilters = {};
    },
  },
});

export const {
  setExclusionFilter,
  setColumnVisibility,
  toggleParticipationFilter,
  clearParticipationFilters,
  setAnalyticsFilter,
  setShowPastDeadlines,
  setColumnFilter,
  clearColumnFilter,
  resetColumnFilters,
} = filtersSlice.actions;

export type { ParticipationFilter, AnalyticsFilter };

export default filtersSlice.reducer;
