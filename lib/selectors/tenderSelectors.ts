import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/store";
import { mapTenderSliceToEpcRecords } from "@/lib/mapTenderSliceToEpcRecords";
import type { TenderData } from "@/lib/slices/tendersSlice";

const selectTenderData = (s: RootState) => s.tenders.data as TenderData | null;

// Cached mapping: same TenderData reference => same array reference (avoids 34k object re-creation on every selector call)
export const selectMappedEpcRecords = createSelector(
  [selectTenderData],
  (data) => mapTenderSliceToEpcRecords(data)
);

// Per-filter variants that still benefit from memoization across routes
export const selectPreParticipationTenderData = createSelector(
  [selectTenderData],
  (data) => {
    if (!data) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
      ...data,
      rows: data.rows.filter((r) => {
        if (r.apm !== "YES") return false;
        if (r.participated === "true" || r.participated === "false") return false;
        const d = new Date(r.deadline as string);
        if (isNaN(d.getTime())) return false;
        return d.getTime() >= today.getTime();
      }),
    } as TenderData;
  }
);

export const selectPostParticipationTenderData = createSelector(
  [selectTenderData],
  (data) => {
    if (!data) return null;
    return {
      ...data,
      rows: data.rows.filter((r) => r.apm === "YES" && r.participated === "true"),
    } as TenderData;
  }
);

export const selectNotParticipatedTenderData = createSelector(
  [selectTenderData],
  (data) => {
    if (!data) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
      ...data,
      rows: data.rows.filter((r) => {
        if (r.apm !== "YES") return false;
        if (r.participated === "false") return true;
        if (r.participated === "true") return false;
        const d = new Date(r.deadline as string);
        if (isNaN(d.getTime())) return false;
        return d.getTime() < today.getTime();
      }),
    } as TenderData;
  }
);
