/**
 * TenderTable speaks EpcTenderRecord accessors; the database speaks
 * tender_merged columns and the flattenTender pseudo-columns.
 *
 * This file is the translation table, and it is deliberately Prisma-free so the
 * browser bundle can import it (same reason as lib/tender-filter-meta.ts).
 *
 * The spec is lib/mapTenderSliceToEpcRecords.ts: every entry here is a field
 * that file renames. Fields it copies verbatim need no entry, and fields it
 * hardcodes to null are listed in EPC_UNFILTERABLE so nothing tries to guess a
 * same-named scalar for them.
 */

/** EPC accessor -> flat row key understood by columnValueSql. */
export const EPC_TO_FLAT: Readonly<Record<string, string>> = {
  tenderNoNitNo: "referenceNo",
  nameOfWorkDescription: "tenderBrief",
  totalQuantityMeter: "totalQuantity",
  nameOfTheClient: "organization",
  lastDateOfSubmission: "deadline",
  tenderOpeningDate: "bidOpeningDateTime",
  costOfTenderFeeRs: "documentFees",
  emdAmountRs: "emd",
  estimatedCostRs: "value",
  bidValidityDays: "bidOfferValidity",
  contractPeriodDays: "contractPeriod",
  managementDecision: "apm",
  tenderSubmittedDate: "scrapedDate",
  // The cell renders the tenderDocument-tagged file, which is tenderFileUrl.
  tenderDocument: "tenderFileUrl",
};

/**
 * Accessors the mapper fills with a constant null, or that exist only as a
 * render concern. No SQL can produce them, so they are never filterable.
 */
export const EPC_UNFILTERABLE: ReadonlySet<string> = new Set([
  "slNo",
  "tenderFor",
  "emdValidity",
  "finalRemarks",
  "attachmentUrl",
  "extrudedSemiconductivePrice",
  "htXlpePrice",
  "pvcTypeSt2Price",
  "galvanisedSteelFlatStripPrice",
  "fillerPrice",
  "fileCount",
  "hasBoqChart",
  "boqFileId",
  // Rendered from the tenderFiles JSON by the cell itself.
  "files",
  "boqChart",
]);

/**
 * Columns whose dropdown never lists data-derived values: date ranges, the
 * raw-material range inputs, free-text boxes and the static option lists.
 * Moved here from TenderTable so the server and the table share one copy.
 */
export const EPC_UNIQUE_OPTION_SKIP: ReadonlySet<string> = new Set([
  "lastDateOfSubmission",
  "attachmentUrl",
  "files",
  "boqChart",
  "rawMaterials",
  "proposedErpItemName",
  "remarks",
  "tenderUpdateStatus",
  "nextAction",
  "itemCategory",
  "publishedDate",
  "assignedDate",
  "itemSchedules",
  "reverseAuctionStartDate",
]);

/** Multi-select columns whose tokens are Yes / No / (Blank), not raw values. */
export const EPC_BOOLEAN_COLUMNS: ReadonlySet<string> = new Set([
  "participated",
  "reverseAuctionApplicable",
]);

/** Whether an EPC dropdown should hit the database for its values. */
export function epcNeedsFacetQuery(accessor: string): boolean {
  if (EPC_UNFILTERABLE.has(accessor)) return false;
  if (EPC_UNIQUE_OPTION_SKIP.has(accessor)) return false;
  if (EPC_BOOLEAN_COLUMNS.has(accessor)) return false;
  return true;
}

/** The (Blank) / Yes / No tokens the table stores, as the SQL layer wants them. */
export function normalizeEpcSelectTokens(
  accessor: string,
  values: string[],
): string[] {
  return values.map((v) => {
    if (v === "(Blank)") return "__blank__";
    if (!EPC_BOOLEAN_COLUMNS.has(accessor)) return v;
    if (v === "Yes") return "true";
    if (v === "No") return "false";
    return v;
  });
}
