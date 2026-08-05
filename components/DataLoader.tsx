"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchFiles } from "@/lib/slices/filesSlice";
import { fetchAllTenders } from "@/lib/slices/tendersSlice";

export function DataLoader({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const files = useAppSelector((s) => s.files.items);

  useEffect(() => {
    dispatch(fetchFiles());
  }, [dispatch]);

  useEffect(() => {
    if (files.length > 0) {
      dispatch(fetchAllTenders());
    }
  }, [files, dispatch]);

  return <>{children}</>;
}
