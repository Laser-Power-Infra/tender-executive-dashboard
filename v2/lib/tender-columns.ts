const GEM_FIELDS = new Set([
  "referenceNo", "tenderBrief", "value", "deadline", "app", "aps", "apm", "location",
  "organization", "documentFees", "emd", "msmeExemption",
  "startupExemption", "quantity", "bidOpeningDateTime",
  "bidOfferValidity", "ministryStateName", "departmentName",
  "officeName", "minimumAverageAnnualTurnover", "yearsOfPastExperience",
  "oemAverageTurnover", "contractPeriod",
  "financialDocumentPriceBreakupRequired", "similarCategory",
  "pastExperienceSimilarServicesRequired", "documentRequiredFromSeller",
  "pastPerformance", "bidToRaEnabled", "raQualificationRule",
  "boqTitle", "bidDetails", "comprehensiveMaintenanceChargesRequired",
  "typeOfBid", "technicalClarificationTimeAllowed", "inspectionRequired",
  "estimatedBidValue", "evaluationMethod", "advisoryBank",
  "ePbgPercentage", "ePbgDurationMonths", "msePurchasePreference",
  "miiPurchasePreference", "consigneesReportingOfficer",
  "mediationClause", "arbitrationClause", "checklist",
  "t247Id", "scrapedDate", "source", "assignedTo",
  "markedStatus", "sheetStatus", "ready", "searchKey",
  "downloadLink", "currency",
  "itemCategory", "totalQuantity",
]);

const NON_GEM_FIELDS = new Set([
  "referenceNo", "tenderBrief", "estimatedBidValue", "deadline", "app", "aps", "apm",
  "location", "organization", "documentFees", "emd",
  "msmeExemption", "startupExemption", "quantity", "checklist",
  "t247Id", "scrapedDate", "source", "assignedTo",
  "markedStatus", "sheetStatus", "ready", "searchKey",
  "downloadLink", "currency",
]);

type ColumnMap = Record<string, string>;

const COLUMN_MAP: ColumnMap = {
  referenceNo: "referenceNo",
  referenceNumber: "referenceNo",
  tenderReference: "referenceNo",
  tenderReferenceNo: "referenceNo",
  refNo: "referenceNo",
  ref: "referenceNo",
  deptTenderNumber: "referenceNo",
  deptTender: "referenceNo",
  tenderId: "referenceNo",

  tenderBrief: "tenderBrief",
  brief: "tenderBrief",
  tenderDescription: "tenderBrief",
  description: "tenderBrief",
  tenderDetails: "tenderBrief",
  workDescription: "tenderBrief",
  itemName: "tenderBrief",

  value: "value",
  tenderValue: "value",
  estimatedValue: "value",
  tenderValueInRs: "value",

  estimatedCost: "estimatedBidValue",

  deadline: "deadline",
  bidDeadline: "deadline",
  dueDate: "deadline",
  closingDate: "deadline",
  lastDate: "deadline",
  bidEndDate: "deadline",
  submissionDeadline: "deadline",
  bidSubmissionEndDate: "deadline",

  location: "location",
  placeOfWork: "location",
  workLocation: "location",
  region: "location",
  state: "location",
  city: "location",
  address: "location",
  country: "location",

  organization: "organization",
  procuringEntity: "organization",
  buyer: "organization",
  department: "organization",
  organisation: "organization",
  tenderAuthority: "organization",
  departmentName: "departmentName",
  officeName: "officeName",
  ministryStateName: "ministryStateName",

  documentFees: "documentFees",
  docFees: "documentFees",
  tenderFee: "documentFees",
  costOfDocument: "documentFees",
  tenderDocumentFees: "documentFees",

  emd: "emd",
  earnestMoney: "emd",
  bidSecurity: "emd",
  earnestMoneyDeposit: "emd",

  quantity: "quantity",
  size: "quantity",
  "quantity/size": "quantity",

  msmeExemption: "msmeExemption",
  startupExemption: "startupExemption",

  checklist: "checklist",
  requirementChecklist: "checklist",

  bidOpeningDateTime: "bidOpeningDateTime",
  bidOpeningDate: "bidOpeningDateTime",
  "Bid Opening Date/Time": "bidOpeningDateTime",
  bidOfferValidity: "bidOfferValidity",
  "Bid Offer Validity (From End Date)": "bidOfferValidity",

  minimumAverageAnnualTurnover: "minimumAverageAnnualTurnover",
  avgAnnualTurnover: "minimumAverageAnnualTurnover",
  averageTurnover: "minimumAverageAnnualTurnover",
  "Minimum Average Annual Turnover of the bidder": "minimumAverageAnnualTurnover",

  yearsOfPastExperience: "yearsOfPastExperience",
  pastExperience: "yearsOfPastExperience",
  "Years of Past Experience Required for same/similar service": "yearsOfPastExperience",

  oemAverageTurnover: "oemAverageTurnover",
  oemTurnover: "oemAverageTurnover",

  contractPeriod: "contractPeriod",
  periodOfContract: "contractPeriod",

  similarCategory: "similarCategory",

  typeOfBid: "typeOfBid",
  bidType: "typeOfBid",

  boqTitle: "boqTitle",

  bidDetails: "bidDetails",

  estimatedBidValue: "estimatedBidValue",
  tenderAmount: "estimatedBidValue",

  evaluationMethod: "evaluationMethod",

  advisoryBank: "advisoryBank",
  bank: "advisoryBank",

  ePbgPercentage: "ePbgPercentage",
  epbgPercentage: "ePbgPercentage",
  performanceBankGuarantee: "ePbgPercentage",

  ePbgDurationMonths: "ePbgDurationMonths",
  epbgDuration: "ePbgDurationMonths",

  inspectionRequired: "inspectionRequired",
  "Inspection Required (By Empanelled Inspection Authority / Agencies pre registered with GeM)": "inspectionRequired",

  pastPerformance: "pastPerformance",

  bidToRaEnabled: "bidToRaEnabled",
  raEnabled: "bidToRaEnabled",

  msePurchasePreference: "msePurchasePreference",
  msePreference: "msePurchasePreference",

  miiPurchasePreference: "miiPurchasePreference",
  miiPreference: "miiPurchasePreference",

  consigneesReportingOfficer: "consigneesReportingOfficer",
  reportingOfficer: "consigneesReportingOfficer",

  mediationClause: "mediationClause",
  arbitrationClause: "arbitrationClause",

  raQualificationRule: "raQualificationRule",

  comprehensiveMaintenanceChargesRequired: "comprehensiveMaintenanceChargesRequired",
  maintenanceCharges: "comprehensiveMaintenanceChargesRequired",

  technicalClarificationTimeAllowed: "technicalClarificationTimeAllowed",
  "Time allowed for Technical Clarifications during technical evaluation": "technicalClarificationTimeAllowed",

  financialDocumentPriceBreakupRequired: "financialDocumentPriceBreakupRequired",
  priceBreakupRequired: "financialDocumentPriceBreakupRequired",
  "Financial Document Indicating Price Breakup Required": "financialDocumentPriceBreakupRequired",
  documentRequiredFromSeller: "documentRequiredFromSeller",

  pastExperienceSimilarServicesRequired: "pastExperienceSimilarServicesRequired",
  "Past Experience of Similar Services": "pastExperienceSimilarServicesRequired",

  t247Id: "t247Id",
  tidNo: "t247Id",

  scrapedDate: "scrapedDate",
  publicationDate: "scrapedDate",

  source: "source",
  originalSource: "source",

  assignedTo: "assignedTo",

  markedStatus: "markedStatus",

  sheetStatus: "sheetStatus",

  ready: "ready",

  searchKey: "searchKey",
  tenderClassifiedIn: "searchKey",

  downloadLink: "downloadLink",

  currency: "currency",

  itemCategory: "itemCategory",
  itemcategory: "itemCategory",
  "Item Category": "itemCategory",

  totalQuantity: "totalQuantity",
  totalquantity: "totalQuantity",
  "Total Quantity": "totalQuantity",
  totalQty: "totalQuantity",
  totalqty: "totalQuantity",
};

const NORMALIZED_COLUMN_MAP: ColumnMap = (() => {
  const map: ColumnMap = {};
  for (const [key, value] of Object.entries(COLUMN_MAP)) {
    map[normalizeHeader(key)] = value;
  }
  return map;
})();

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[.\s_-]+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function isIgnoredHeader(header: string): boolean {
  const trimmed = header.trim();
  if (!trimmed) return true;
  if (/^__empty/i.test(trimmed)) return true;
  const normalized = normalizeHeader(trimmed);
  return !normalized;
}

export interface ParsedRow {
  knownFields: Record<string, unknown>;
  extraFields: { fieldName: string; fieldValue: string }[];
}

function parseDate(rawValue: unknown): Date | null {
  if (rawValue == null) return null;

  if (rawValue instanceof Date && !isNaN(rawValue.getTime())) {
    return rawValue;
  }

  if (typeof rawValue === "number") {
    const date = new Date(Math.round((rawValue - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) return date;
  }

  const str = String(rawValue).trim();
  if (!str) return null;

  const dmyMatch = str.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (dmyMatch) {
    const [, d, m, y, hh, mm, ss] = dmyMatch;
    const date = new Date(
      parseInt(y),
      parseInt(m) - 1,
      parseInt(d),
      hh ? parseInt(hh) : 0,
      mm ? parseInt(mm) : 0,
      ss ? parseInt(ss) : 0
    );
    if (!isNaN(date.getTime())) return date;
  }

  const date = new Date(str);
  if (!isNaN(date.getTime())) return date;

  return null;
}

export function mapRowToTender(
  row: Record<string, unknown>,
  knownFieldSet: Set<string>
): ParsedRow {
  const knownFields: Record<string, unknown> = {};
  const extraFields: { fieldName: string; fieldValue: string }[] = [];

  for (const [header, rawValue] of Object.entries(row)) {
    if (isIgnoredHeader(header)) continue;

    const normalized = normalizeHeader(header);
    const mappedField = NORMALIZED_COLUMN_MAP[normalized]
      ?? (/quantity|qty/.test(normalized) && /size/.test(normalized) ? "quantity" : undefined);

    if (mappedField && knownFieldSet.has(mappedField)) {
      if (mappedField === "deadline") {
        const parsed = parseDate(rawValue);
        if (parsed) knownFields[mappedField] = parsed;
      } else {
        const val = rawValue == null ? "" : String(rawValue).trim();
        if (val) knownFields[mappedField] = val;
      }
    } else {
      const val = rawValue == null ? "" : String(rawValue).trim();
      if (val) extraFields.push({ fieldName: header, fieldValue: val });
    }
  }

  return { knownFields, extraFields };
}

function findReferenceNoColumn(
  headers: string[]
): string | undefined {
  for (const h of headers) {
    if (isIgnoredHeader(h)) continue;
    if (/^ref(erence)?\.?\s*no(\.|mber)?$/i.test(h) || /^ref(erence)?\.?\s*no(\.|mber)?$/i.test(h.replace(/[\s_-]+/g, " "))) {
      return h;
    }
    const n = normalizeHeader(h);
    if (n.includes("ref") && n.includes("no")) return h;
    if (n === "tenderid" || n === "tid") return h;
    if (NORMALIZED_COLUMN_MAP[n] === "referenceNo") return h;
  }
  return undefined;
}

export function hasReferenceNoColumn(headers: string[]): boolean {
  return !!findReferenceNoColumn(headers);
}

export function getReferenceNo(
  row: Record<string, unknown>,
  headers: string[]
): string | null {
  const col = findReferenceNoColumn(headers);
  if (!col) return null;
  const val = row[col];
  return val == null ? null : String(val).trim();
}

export function isGemReference(refNo: string): boolean {
  return /gem/i.test(refNo);
}

export function filterHeaders(headers: string[]): string[] {
  return headers.filter((h) => !isIgnoredHeader(h));
}

export function findColumnByFieldName(
  headers: string[],
  fieldName: string
): string | undefined {
  for (const h of headers) {
    if (isIgnoredHeader(h)) continue;
    const n = normalizeHeader(h);
    if (NORMALIZED_COLUMN_MAP[n] === fieldName) return h;
  }
  return undefined;
}

export function getFieldValue(
  row: Record<string, unknown>,
  headers: string[],
  fieldName: string
): unknown {
  const col = findColumnByFieldName(headers, fieldName);
  if (!col) return null;
  return row[col] ?? null;
}

export { parseDate, GEM_FIELDS, NON_GEM_FIELDS };
