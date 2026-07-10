// hooks/useSmartsheetTenders.ts
// Fetches from /api/smartsheet-tenders with 30s polling.
// The server uses SWR (Stale-While-Revalidate) caching,
// so most requests return instantly with cached data.
import { useState, useEffect, useCallback, useRef } from "react";
import { SmartsheetTender } from "../types/smartsheetTender";

interface UseSmartsheetTendersResult {
  data: SmartsheetTender[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export const useSmartsheetTenders = (): UseSmartsheetTendersResult => {
  const [data, setData] = useState<SmartsheetTender[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const hasData = useRef(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    // Only show loading on initial fetch or manual refresh, not background polls
    if (forceRefresh || !hasData.current) {
      setLoading(true);
    }
    setError(null);

    try {
      const query = forceRefresh ? "?fresh=true" : "";
      const response = await fetch(`/api/smartsheet-tenders${query}`);
      const json = await response.json();

      if (!response.ok || !json.success) {
        // Use the server's meaningful error message
        const msg = json.error || `Server error (${response.status})`;
        throw new Error(msg);
      }

      const records: SmartsheetTender[] = json.data || [];
      hasData.current = true;
      setData(records);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unexpected error fetching Smartsheet data"));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + polling every 30 seconds
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

export default useSmartsheetTenders;
