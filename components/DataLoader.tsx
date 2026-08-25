"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchFiles } from "@/lib/slices/filesSlice";
import { fetchAllTenders } from "@/lib/slices/tendersSlice";
import { fetchAllBomOptions } from "@/lib/slices/utilitySlice";

export function DataLoader({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const files = useAppSelector((s) => s.files.items);

  useEffect(() => {
    dispatch(fetchFiles());
  }, [dispatch]);

  useEffect(() => {
    if (files.length > 0) {
      // run Bom options fetch in parallel with tenders fetch — populates utilitySlice for O(1) dropdown lookup
      dispatch(fetchAllTenders());
      dispatch(fetchAllBomOptions());
    }
  }, [files, dispatch]);

  return <>{children}</>;
}
