export interface SupplyHistoryRecord {
  fy: string | null;
  saleBillNumber: string | null;
  saleBillDate: string | null;
  partyName: string | null;
  itemCode: string | null;
  itemName: string | null;
  lrNo: string | null;
  truckNo: string | null;
  partyRefNo: string | null;
  partyRefDate: string | null;
  contractVrNo: string | null;
  rate: number | null;
  invoiceQty: number | null;
  invoiceAmt: number | null;
  hasDocuments?: boolean;
  attachmentUrl?: string | null;
}
