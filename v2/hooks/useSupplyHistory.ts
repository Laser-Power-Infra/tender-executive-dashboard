"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { SupplyHistoryRecord } from "@/types/supplyHistory";

interface UseSupplyHistoryResult {
  data: SupplyHistoryRecord[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export const useSupplyHistory = (): UseSupplyHistoryResult => {
  const [data, setData] = useState<SupplyHistoryRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const hasData = useRef(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (forceRefresh || !hasData.current) {
      setLoading(true);
    }
    setError(null);

    try {
      const query = forceRefresh ? "?fresh=true" : "";
      const response = await fetch(`/api/supply-history${query}`);
      const json = await response.json();

      if (!response.ok || !json.success) {
        const msg = json.error || `Server error (${response.status})`;
        throw new Error(msg);
      }

      const records: SupplyHistoryRecord[] = json.data || [];
      hasData.current = true;
      setData(records);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unexpected error fetching supply history data"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  return { data, loading, error, refresh };
};

export default useSupplyHistory;
