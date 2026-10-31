import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
type VisibilityState = Record<string, boolean>;
import type { ColumnFilterState, ColumnFilterType } from "@/lib/types";
import { localDay } from "@/components/v2/data-table/filter-formula";

type ParticipationFilter = "participated" | "notParticipated" | "upcomingRa" | "participatedWithRa" | "participatedWithoutRa" | "yetToOpenRa" | "bidOpeningPendingExclRa" | "participatedTotal" | "raDone" | "raPending" | "technicalOpen" | "technicalNotOpen" | "weL1" | "weLost" | "expRaDate" | "contractReceived" | "contractPending" | "financialOpen" | "financialNotOpen" | "financialWeL1" | "financialWeLost" | "financialContractReceived" | "financialContractPending";
type AnalyticsFilter = "aiYes" | "aiYesUnallocated" | "apmYesAllocated" | "apmYesUnallocated" | null;

interface FiltersState {
  exclusionFilter: string | null;
  columnVisibility: VisibilityState;
  columnFilters: Record<string, ColumnFilterState>;
  participationFilters: ParticipationFilter[];
  analyticsFilter: AnalyticsFilter;
}

const initialState: FiltersState = {
  exclusionFilter: null,
  columnVisibility: {},
  // The tenders page opens on upcoming deadlines; a real filter, so the formula bar shows it and it can be removed.
  columnFilters: { deadline: { dateRange: { startDate: localDay(new Date()), endDate: "" } } },
  participationFilters: [],
  analyticsFilter: null,
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
  setColumnFilter,
  clearColumnFilter,
  resetColumnFilters,
} = filtersSlice.actions;

export type { ParticipationFilter, AnalyticsFilter };

export default filtersSlice.reducer;
