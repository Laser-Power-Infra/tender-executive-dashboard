export enum TypeOfTender {
  OPEN = "Open",
  LIMITED = "Limited",
  SINGLE = "Single",
  NOMINATION = "Nomination",
  PROPRIETARY = "Proprietary"
}

export enum ManagementDecision {
  GO = "Go",
  NO_GO = "No Go",
  PENDING = "Pending",
  DEFERRED = "Deferred"
}

export enum CurrentStatus {
  SUBMITTED = "Submitted",
  WON = "Won",
  LOST = "Lost",
  UNDER_EVALUATION = "Under Evaluation",
  RA_PENDING = "RA Pending",
  IN_PREPARATION = "In Preparation",
  CANCELLED = "Cancelled"
}

export enum EMDExchangeMode {
  BG = "BG",
  NEFT = "NEFT",
  EXEMPTED = "Exempted",
  NOT_APPLICABLE = "Not Applicable"
}

export interface EpcTenderRecord {
  id?: string;
  slNo: number;
  docketNo: string;
  tenderFor: string;
  typeOfTender: TypeOfTender | string;
  tenderNoNitNo: string;
  nameOfWorkDescription?: string;
  totalQuantityMeter?: number | null;
  nameOfTheClient: string;
  lastDateOfSubmission: Date | null;
  tenderOpeningDate: Date | null;
  costOfTenderFeeRs: number | null;
  emdAmountRs: number | null;
  estimatedCostRs: number | null;
  bidValidityDays: number | null;
  contractPeriodDays: number | null;
  managementDecision: ManagementDecision;
  participated: boolean | null;
  tenderPrepareBy: string;
  currentStatus: string;
  tenderSubmittedDate: Date | null;
  reverseAuctionApplicable: boolean | null;
  reverseAuctionDate: Date | null;
  emdPaymentMode: EMDExchangeMode | null;
  bgNoUtrNo: string | null;
  emdValidity: Date | null;
  loiPoNoAndDate: string | null;
  remarks: string | null;
  bidValidityExpired: boolean;
  diffPercentFromL1: number | null;
  diffPercentFromL2: number | null;
  reason: string | null;
  finalRemarks: string | null;
  attachmentUrl?: string | null;
  priceBasis?: string | null;
  aluminiumPrice?: number | null;
  aluminiumAlloyPrice?: number | null;
  copperTapePrice?: number | null;
  extrudedSemiconductivePrice?: number | null;
  htXlpePrice?: number | null;
  pvcTypeSt2Price?: number | null;
  galvanisedSteelFlatStripPrice?: number | null;
  fillerPrice?: number | null;
  proposedErpItemName?: string;
  proposedQty?: string;
  statusCategory?: string;
  itemCategory?: string | null;
  competitors?: string | null;
  fileCount?: number;
  hasBoqChart?: boolean;
  bgStatus?: string | null;
  tenderUpdateStatus?: TenderUpdateStatus;
  nextAction?: NextAction | null;
}

export enum TenderUpdateStatus {
  OPEN = "OPEN",
  CLOSED = "CLOSED"
}

export enum NextAction {
  UPDATE_FROM_AB_LETTER = "UPDATE_FROM_AB_LETTER",
  BG_REFUND_LETTER_TO_BE_SENT = "BG_REFUND_LETTER_TO_BE_SENT",
  FOLLOW_UP_FOR_FINANCIAL_STATUS = "FOLLOW_UP_FOR_FINANCIAL_STATUS",
  REVERSE_AUCTION_PENDING = "REVERSE_AUCTION_PENDING"
}
