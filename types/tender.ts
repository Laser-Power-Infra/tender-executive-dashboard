/**
 * Enums representing the categorical fields of the EPC Tender schema.
 */

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

/**
 * Interface representing a single EPC Tender record from the Google Sheet.
 * All fields map 1:1 with the spreadsheet columns.
 */
export interface EpcTenderRecord {
  /** PostgreSQL database primary key */
  id?: string;

  /** Column: "SL No." - Unique row index */
  slNo: number;

  /** Column: "Docket No" - Unique business docket identifier */
  docketNo: string;

  /** Column: "Tender For" - Project scope or material category */
  tenderFor: string;

  /** Column: "Type of Tender" - E.g. Open, Limited, Nomination */
  typeOfTender: TypeOfTender | string;

  /** Column: "Tender No / NIT No with Date" - Official tender reference and NIT date */
  tenderNoNitNo: string;

  /** Column: "Name of Work / Item Description" - Detailed scope description */
  nameOfWorkDescription?: string;

  /** Column: "Total Quantity in Meter" - Dimensional metric */
  totalQuantityMeter?: number | null;

  /** Column: "Name of the Client" - Client name */
  nameOfTheClient: string;

  /** Column: "Last Date of Submission" - Submission deadline */
  lastDateOfSubmission: Date | null;

  /** Column: "Tender Opening Date" - Bid opening date */
  tenderOpeningDate: Date | null;

  /** Column: "Cost of Tender / Tender Fee (In Rs)" - Document purchase cost */
  costOfTenderFeeRs: number | null;

  /** Column: "EMD Amount (In Rs)" - Earnest Money Deposit */
  emdAmountRs: number | null;

  /** Column: "Estimated Cost (In Rs)" - Client project budget */
  estimatedCostRs: number | null;

  /** Column: "Bid Validity (in Days)" - Number of days the bid remains valid */
  bidValidityDays: number | null;

  /** Column: "Contract Period in Days" - Construction or supply timeline */
  contractPeriodDays: number | null;

  /** Column: "Management Decision" - Go / No Go / Pending */
  managementDecision: ManagementDecision;

  /** Column: "Participated" - Yes / No participation flag */
  participated: boolean | null;

  /** Column: "Tender Prepare By" - Engineer responsible for bid preparation */
  tenderPrepareBy: string;

  /** Column: "Current Status" - E.g., Submitted, Won, Lost, Under Evaluation */
  currentStatus: string;

  /** Column: "Tender Submitted Date" - Date of submission (Primary filter field) */
  tenderSubmittedDate: Date | null;

  /** Column: "Reverse Auction Applicable" - Yes / No flag */
  reverseAuctionApplicable: boolean | null;

  /** Column: "Reverse Auction Date" - Scheduled date of Reverse Auction */
  reverseAuctionDate: Date | null;

  /** Column: "EMD Payment Through BG / NEFT" - Payment mode used */
  emdPaymentMode: EMDExchangeMode | null;

  /** Column: "BG No / UTR No" - Guarantee or Transaction Reference number */
  bgNoUtrNo: string | null;

  /** Column: "EMD Validity" - Expiry date of the EMD */
  emdValidity: Date | null;

  /** Column: "LOI / PO No & Date" - Contract award reference */
  loiPoNoAndDate: string | null;

  /** Column: "Remarks" - Preparation remarks */
  remarks: string | null;

  /** Column: "Bid Validity Expired" - Yes / No flag */
  bidValidityExpired: boolean;

  /** Column: "Diff % from L1" - Variance from lowest bidder (decimal, e.g. -0.052 for -5.2%) */
  diffPercentFromL1: number | null;

  /** Column: "Diff % from L2" - Variance from second lowest bidder (decimal, e.g. 0.021 for 2.1%) */
  diffPercentFromL2: number | null;

  /** Column: "Reason" - Reason for status or decision */
  reason: string | null;

  /** Column: "Final Remarks" - Closing notes */
  finalRemarks: string | null;

  /** Dynamic left-joined costing attachment URL from the second Google Sheet */
  attachmentUrl?: string | null;

  /** Costing Excel details: Price Basis (Firm or Variable) */
  priceBasis?: string | null;

  /** Costing Excel details: Raw Material Rates */
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


