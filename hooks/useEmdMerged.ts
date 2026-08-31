"use client";
import { useState, useEffect, useCallback, useRef } from "react";

export interface EmdMergedRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  emdType: "CASH" | "BG" | null;
  tenderNo: string | null;
  tmNo: string | null;
  remarks: string | null;
  contactEmailId: string | null;
  emailDraft: string | null;
  lastEmailSent: string | null;
  lastEmailSentAt: string | null;
  reason: string | null;
  contactNo: string | null;
  address: string | null;
  docketNo: string | null;
  bgNo: string | null;
  customerName: string | null;
  emdAmt: string | null;
  bgAmtLocal: string | null;
  bgAmtFc: string | null;
  issueDt: string | null;
  bgDate: string | null;
  expectedRefundDateOrRefundedDate: string | null;
  expiryDate: string | null;
  claimDate: string | null;
  trantype: string | null;
  bankName: string | null;
  partyCode: string | null;
  staffName: string | null;
  status: string | null;
  match: string | null;
  bgMatch: string | null;
  statusPriceAssDone: string | null;
  permanent: string | null;
  chDdNo: string | null;
  acHolder: string | null;
  statusAsPerSujibDaAndOther: string | null;
  canBeRefunded: string | null;
  rank: string | null;
  poIssueStatus: string | null;
  aocAwardOfContractStatus: string | null;
  refundableOrNot: string | null;
  statusRefundedPending: string | null;
  statusOfTender: string | null;
  conditionsForRefund: string | null;
  certificateByParty: string | null;
  certificateByUtility: string | null;
  tenderMergeds?: { id: number; docketNo: string | null }[];
}

interface UseEmdMergedResult {
  data: EmdMergedRecord[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export const useEmdMerged = (): UseEmdMergedResult => {
  const [data, setData] = useState<EmdMergedRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const hasData = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (forceRefresh || !hasData.current) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/emd", { signal: controller.signal });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Server error (${res.status})`);
      const records: EmdMergedRecord[] = json.data || [];
      hasData.current = true;
      setData(records);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err : new Error("Unexpected error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  const refresh = useCallback(async () => { await fetchData(true); }, [fetchData]);
  return { data, loading, error, refresh };
};
export default useEmdMerged;
