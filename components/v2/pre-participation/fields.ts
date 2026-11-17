import { toISTDateKey } from "@/lib/format-ist";
import type { ReverseAuctionWebhookData } from "@/lib/integrations/n8n";
import { parseDate } from "@/lib/parse-date";
import { formatRupees } from "@/lib/rupees";
import type { AppDispatch } from "@/lib/store";
import type { FlatRow } from "@/lib/tender-flatten";
import type { TenderPageAssociation } from "@/lib/slices/tenderPageSlice";
import { CURRENT_STATUS_OPTIONS } from "@/types/tender";
import {
  triggerReverseAuctionWebhook,
  updateTenderBeneficiaryBankDetails,
  updateTenderCell,
  updateTenderDocketNo,
  updateTenderMergedField,
  updateTenderReason,
  updateTenderRemarks,
  updateTenderStatusAndAction,
} from "@/lib/slices/tendersSlice";

export type Row = FlatRow;

/** The pages built on these fields, by their slot in the scope-keyed tenderPage slice. */
export type ParticipationScope =
  | "home"
  | "postParticipation"
  | "notParticipated"
  | "quotationPending";

export interface SaveContext {
  dispatch: AppDispatch;
  associations: TenderPageAssociation[];
}

export type FieldSection =
  | "General"
  | "EMD and BG"
  | "Participation"
  | "Reverse auction"
  | "Result"
  | "Eligibility and terms";

/**
 * One editable tender field: how it is shown, what it may hold and which thunk
 * saves it. The table cell and the docket sheet both render from this, so an
 * edit rule exists once.
 */
export interface FieldDef {
  /** Flat row key. */
  id: string;
  label: string;
  kind: "text" | "textarea" | "select" | "yesNo" | "date" | "dateTime";
  /** `select` choices. */
  options?: { value: string; label: string }[];
  /** `select` only: no blank choice. */
  required?: boolean;
  /** `yesNo` stored values. */
  tokens?: { yes: string; no: string; none: string };
  section: FieldSection;
  /** Current value when it is not simply `row[id]`. */
  value?: (row: Row) => string;
  /** Text shown for the stored value; null shows a dash. */
  display?: (value: string) => string | null;
  /** A message when this value must not be saved. */
  validate?: (value: string) => string | null;
  /** A message when the field cannot be edited on this row. */
  locked?: (row: Row) => string | null;
  save: (ctx: SaveContext, row: Row, value: string) => Promise<unknown>;
}

/** Same key the server pages by: the docket, or the row when it has none. */
export const docketKey = (row: Row): string =>
  (row.docketNo ?? "").trim().toUpperCase() || `__row_${row.id}`;

export const fieldValue = (field: FieldDef, row: Row): string =>
  field.value ? field.value(row) : (row[field.id] ?? "");

/**
 * A stored day as `yyyy-MM-dd`, empty when it is unset or in no known format.
 * Older rows hold `29-May-26`, `31/07/2026` and `01-07-2026`.
 */
export const dateKey = (value: string): string => toISTDateKey(parseDate(value)) ?? "";

/** A non-empty RA qualification rule forces reverse auction to yes. */
function raValue(row: Row): boolean | null {
  if ((row.raQualificationRule ?? "").trim()) return true;
  if (row.reverseAuctionApplicable === "true") return true;
  if (row.reverseAuctionApplicable === "false") return false;
  return null;
}

function raWebhookData(
  row: Row,
  associations: TenderPageAssociation[],
  patch: Partial<ReverseAuctionWebhookData>,
): ReverseAuctionWebhookData {
  const ids = (row.assignedTo ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  const first = associations.find((a) => ids.includes(a.id));
  return {
    tenderMergedId: Number(row.id),
    organization: row.organization || null,
    docketNo: row.docketNo || null,
    referenceNo: row.referenceNo || null,
    reverseAuctionApplicable: raValue(row),
    reverseAuctionStartDate: row.reverseAuctionStartDate || null,
    reverseAuctionEndDate: row.reverseAuctionEndDate || null,
    associateName: first?.name ?? null,
    associateEmail: first?.email ?? null,
    ...patch,
  };
}

const merged =
  (field: string): FieldDef["save"] =>
  ({ dispatch }, row, value) =>
    dispatch(
      updateTenderMergedField({
        rowIndex: 0,
        field,
        value,
        tenderMergedId: Number(row.id),
        oldValue: row[field] ?? "",
      }),
    ).unwrap();

const decision =
  (field: "participated" | "catalogueDone"): FieldDef["save"] =>
  ({ dispatch }, row, value) =>
    dispatch(
      updateTenderCell({
        rowIndex: 0,
        field,
        value,
        tenderMergedId: Number(row.id),
        oldValue: row[field] ?? "",
      }),
    ).unwrap();

/** Status, next action and RA are written together by one server action. */
const statusAndAction = (
  { dispatch }: SaveContext,
  row: Row,
  patch: {
    tenderUpdateStatus?: string;
    nextAction?: string | null;
    reverseAuctionApplicable?: boolean | null;
  },
) =>
  dispatch(
    updateTenderStatusAndAction({
      tenderMergedId: Number(row.id),
      tenderUpdateStatus: row.tenderUpdateStatus || "OPEN",
      nextAction: row.nextAction || null,
      reverseAuctionApplicable: raValue(row),
      ...patch,
    }),
  ).unwrap();

const raDate =
  (field: "reverseAuctionStartDate" | "reverseAuctionEndDate"): FieldDef["save"] =>
  (ctx, row, value) =>
    merged(field)(ctx, row, value).then(() => {
      ctx.dispatch(
        triggerReverseAuctionWebhook(
          raWebhookData(row, ctx.associations, { [field]: value || null }),
        ),
      );
    });

const DOCKET_PATTERN = /^ENQ-\d+-(?:(\d{4})-\1|\d{2}-\d{2})$/i;

const text = (id: string, label: string, section: FieldSection): FieldDef => ({
  id,
  label,
  kind: "text",
  section,
  save: merged(id),
});

const options = (...values: string[]) => values.map((v) => ({ value: v, label: v }));

const choice = (id: string, label: string, section: FieldSection, ...values: string[]): FieldDef => ({
  ...text(id, label, section),
  kind: "select",
  options: options(...values),
});

/** Saved as `yyyy-MM-dd`, the form the date-range filter reads. */
const day = (id: string, label: string, section: FieldSection): FieldDef => ({
  ...text(id, label, section),
  kind: "date",
});

export const NEXT_ACTIONS = [
  { value: "UPDATE_FROM_AB_LETTER", label: "Update from AB letter" },
  { value: "BG_REFUND_LETTER_TO_BE_SENT", label: "BG refund letter to be sent" },
  { value: "FOLLOW_UP_FOR_FINANCIAL_STATUS", label: "Follow up for financial status" },
  { value: "REVERSE_AUCTION_PENDING", label: "Reverse auction pending" },
  { value: "COUNTER_OFFER_YES", label: "Counter offer yes" },
  { value: "COUNTER_OFFER_NO", label: "Counter offer no" },
  { value: "BID_VALIDITY_NOT_ACCEPTED", label: "Bid validity not accepted" },
];

const FIELD_LIST: FieldDef[] = [
  {
    id: "docketNo",
    label: "Docket No",
    kind: "text",
    section: "General",
    validate: (value) =>
      value === "" || DOCKET_PATTERN.test(value)
        ? null
        : "Use ENQ-<number>-<yyyy>-<yyyy> or ENQ-<number>-<yy>-<yy>",
    save: ({ dispatch }, row, value) =>
      dispatch(
        updateTenderDocketNo({
          tenderMergedId: Number(row.id),
          docketNo: value,
          oldDocketNo: row.docketNo ?? "",
        }),
      ).unwrap(),
  },
  choice("applicableIndex", "Applicable index", "General", "IEEMA", "CACMAI"),
  text("contractNo", "Contract number", "General"),
  text("quotationNo", "Quotation no", "General"),
  choice("miiPurchasePreference", "MII purchase preference", "General", "Yes", "No"),
  text("location", "Location", "General"),

  {
    id: "emdPaymentMode",
    label: "EMD payment mode",
    kind: "select",
    options: options("Draft", "Bank Guarantee", "Online", "NO"),
    section: "EMD and BG",
    save: merged("emdPaymentMode"),
  },
  { ...text("emd", "EMD", "EMD and BG"), display: formatRupees },
  text("documentFees", "Document fees", "EMD and BG"),
  day("bgDate", "BG date", "EMD and BG"),
  day("bgExpiryDate", "BG expiry date", "EMD and BG"),
  day("claimDate", "Claim date", "EMD and BG"),
  {
    id: "bgStatus",
    label: "BG status",
    kind: "select",
    options: options("PENDING", "TO BE FOLLOWED UP", "RETURNED"),
    section: "EMD and BG",
    save: merged("bgStatus"),
  },
  {
    id: "beneficiaryBankDetails",
    label: "Beneficiary bank details",
    kind: "text",
    section: "EMD and BG",
    save: ({ dispatch }, row, value) =>
      dispatch(
        updateTenderBeneficiaryBankDetails({
          tenderMergedId: Number(row.id),
          beneficiaryBankDetails: value,
          oldBeneficiaryBankDetails: row.beneficiaryBankDetails ?? "",
        }),
      ).unwrap(),
  },
  text("bgNoUtrNo", "BG / UTR No", "EMD and BG"),
  text("issuingBank", "Issuing Bank", "EMD and BG"),
  text("ePbgDurationMonths", "e-PBG duration (months)", "EMD and BG"),
  text("ePbgPercentage", "e-PBG percentage", "EMD and BG"),

  {
    id: "participated",
    label: "Participated",
    kind: "yesNo",
    tokens: { yes: "true", no: "false", none: "null" },
    section: "Participation",
    save: decision("participated"),
  },
  {
    id: "catalogueDone",
    label: "Catalogue done",
    kind: "yesNo",
    tokens: { yes: "YES", no: "NO", none: "NOT_DECIDED" },
    section: "Participation",
    save: decision("catalogueDone"),
  },
  {
    id: "tenderUpdateStatus",
    label: "Tender update status",
    kind: "select",
    options: [
      { value: "OPEN", label: "Open" },
      { value: "CLOSED", label: "Closed" },
    ],
    required: true,
    section: "Participation",
    value: (row) => row.tenderUpdateStatus || "OPEN",
    save: (ctx, row, value) =>
      statusAndAction(ctx, row, { tenderUpdateStatus: value || "OPEN" }),
  },
  {
    id: "reason",
    label: "Reason for not participated",
    kind: "textarea",
    section: "Participation",
    save: ({ dispatch }, row, value) =>
      dispatch(
        updateTenderReason({
          tenderMergedId: Number(row.id),
          reason: value,
          oldReason: row.reason ?? "",
        }),
      ).unwrap(),
  },

  {
    id: "reverseAuctionApplicable",
    label: "Reverse auction",
    kind: "yesNo",
    tokens: { yes: "true", no: "false", none: "" },
    section: "Reverse auction",
    value: (row) => {
      const ra = raValue(row);
      return ra === null ? "" : String(ra);
    },
    locked: (row) =>
      (row.raQualificationRule ?? "").trim()
        ? "Set by the RA qualification rule"
        : null,
    save: (ctx, row, value) => {
      const ra = value === "" ? null : value === "true";
      return statusAndAction(ctx, row, { reverseAuctionApplicable: ra }).then(() => {
        ctx.dispatch(
          triggerReverseAuctionWebhook(
            raWebhookData(row, ctx.associations, { reverseAuctionApplicable: ra }),
          ),
        );
      });
    },
  },
  {
    id: "reverseAuctionStartDate",
    label: "RA start",
    kind: "dateTime",
    section: "Reverse auction",
    save: raDate("reverseAuctionStartDate"),
  },
  {
    id: "reverseAuctionEndDate",
    label: "RA end",
    kind: "dateTime",
    section: "Reverse auction",
    save: raDate("reverseAuctionEndDate"),
  },
  day("expectedRaDate", "Expected RA date", "Reverse auction"),
  text("raQualificationRule", "RA qualification rule", "Reverse auction"),

  choice("currentStatus", "Current status", "Result", ...CURRENT_STATUS_OPTIONS),
  {
    id: "itemWiseRankEnabled",
    label: "Item-wise rank",
    kind: "yesNo",
    // Not null in the database: clearing a yes stores no.
    tokens: { yes: "true", no: "false", none: "false" },
    section: "Result",
    save: merged("itemWiseRankEnabled"),
  },
  text("ourRank", "Our rank", "Result"),
  text("ourValue", "Our value", "Result"),
  text("nameOfRank1", "L1 party name", "Result"),
  text("valueOfRank1", "L1 price", "Result"),
  text("nameOfRank2", "L2 party name", "Result"),
  text("valueOfRank2", "L2 price", "Result"),
  {
    id: "nextAction",
    label: "Next action",
    kind: "select",
    options: NEXT_ACTIONS,
    section: "Result",
    save: (ctx, row, value) => statusAndAction(ctx, row, { nextAction: value || null }),
  },
  {
    id: "remarks",
    label: "Remarks",
    kind: "textarea",
    section: "Result",
    save: ({ dispatch }, row, value) =>
      dispatch(
        updateTenderRemarks({
          tenderMergedId: Number(row.id),
          remarks: value,
          oldRemarks: row.remarks ?? "",
        }),
      ).unwrap(),
  },

  choice("startupExemption", "Startup exemption", "Eligibility and terms", "Yes", "No"),
  text("minimumAverageAnnualTurnover", "Minimum avg annual turnover", "Eligibility and terms"),
  text("oemAverageTurnover", "OEM average turnover", "Eligibility and terms"),
  text("yearsOfPastExperience", "Years of past experience", "Eligibility and terms"),
  text("pastPerformance", "Past performance", "Eligibility and terms"),
  choice("msmeExemption", "MSME exemption", "Eligibility and terms", "Yes", "No"),
  choice("msePurchasePreference", "MSE purchase preference", "Eligibility and terms", "Yes", "No"),
  text("contractPeriod", "Contract period", "Eligibility and terms"),
  text("bidOfferValidity", "Bid offer validity", "Eligibility and terms"),
  text("typeOfBid", "Type of bid", "Eligibility and terms"),
  text("documentRequiredFromSeller", "Document required from seller", "Eligibility and terms"),
  text(
    "technicalClarificationTimeAllowed",
    "Technical clarification time allowed",
    "Eligibility and terms",
  ),
  text("mediationClause", "Mediation clause", "Eligibility and terms"),
  text("arbitrationClause", "Arbitration clause", "Eligibility and terms"),
];

export const FIELDS: Record<string, FieldDef> = Object.fromEntries(
  FIELD_LIST.map((f) => [f.id, f]),
);

// v1's read-only rules. A docket or contract number stays once it is set on
// post participation and on not participated; not participated also never
// edits status, reverse auction or the result of the bid.
const NEVER_EDITED = new Set([
  "tenderUpdateStatus",
  "reverseAuctionApplicable",
  "reverseAuctionStartDate",
  "reverseAuctionEndDate",
  "expectedRaDate",
  "quotationNo",
  ...FIELD_LIST.filter((f) => f.section === "Result").map((f) => f.id),
]);
const KEPT_ONCE_SET = new Set(["docketNo", "contractNo", "quotationNo"]);

export const lockedOnceSet = (fieldId: string, row: Row): boolean =>
  KEPT_ONCE_SET.has(fieldId) && !!(row[fieldId] ?? "").trim();

export const lockedWhenNotParticipated = (fieldId: string, row: Row): boolean =>
  NEVER_EDITED.has(fieldId) || lockedOnceSet(fieldId, row);

export const FIELD_SECTIONS: { title: FieldSection; fields: FieldDef[] }[] = (
  [
    "General",
    "EMD and BG",
    "Participation",
    "Reverse auction",
    "Result",
    "Eligibility and terms",
  ] as const
).map((title) => ({ title, fields: FIELD_LIST.filter((f) => f.section === title) }));
