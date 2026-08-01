import { TenderData } from "@/lib/slices/tendersSlice";
import { EpcTenderRecord, ManagementDecision, NextAction, StatusCategory } from "@/types/tender";

function parseFloatOrNull(val: string | undefined | null): number | null {
  if (val == null || val === "") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseIntOrNull(val: string | undefined | null): number | null {
  if (val == null || val === "") return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function resolveAssociationNames(
  assignedTo: string | undefined,
  associations: TenderData["associations"],
): string {
  if (!assignedTo) return "";
  const ids = assignedTo.split(",").filter(Boolean);
  const names = ids
    .map((id) => associations.find((a) => a.id === parseInt(id, 10))?.name)
    .filter(Boolean);
  return names.join(", ");
}

export function mapTenderSliceToEpcRecords(tenderData: TenderData | null): EpcTenderRecord[] {
  if (!tenderData) return [];
  return tenderData.rows.map((row, index) => ({
    id: row.id,
    slNo: index + 1,
    docketNo: row.docketNo || "",
    tenderFor: "",
    typeOfTender: row.type === "Gem" ? "Open" : "Open",
    tenderNoNitNo: row.referenceNo || "",
    nameOfWorkDescription: row.tenderBrief || "",
    totalQuantityMeter: parseFloatOrNull(row.totalQuantity ?? row.quantity),
    nameOfTheClient: row.organization || "",
    lastDateOfSubmission: row.deadline ? new Date(row.deadline) : null,
    tenderOpeningDate: row.bidOpeningDateTime ? new Date(row.bidOpeningDateTime) : null,
    costOfTenderFeeRs: parseFloatOrNull(row.documentFees),
    emdAmountRs: parseFloatOrNull(row.emd),
    estimatedCostRs: parseFloatOrNull(row.value ?? row.estimatedBidValue),
    bidValidityDays: parseIntOrNull(row.bidOfferValidity),
    contractPeriodDays: parseIntOrNull(row.contractPeriod),
    managementDecision: (row.apm || "Pending") as ManagementDecision,
    participated: row.participated === "true" ? true : row.participated === "false" ? false : null,
    tenderPrepareBy: resolveAssociationNames(row.assignedTo, tenderData.associations),
    currentStatus: row.currentStatus || "",
    tenderSubmittedDate: row.scrapedDate ? new Date(row.scrapedDate) : null,
    reverseAuctionApplicable: row.raQualificationRule
      ? true
      : row.reverseAuctionApplicable === "true"
        ? true
        : row.reverseAuctionApplicable === "false"
          ? false
          : null,
    reverseAuctionDate: null,
    emdPaymentMode: null,
    bgNoUtrNo: row.bgNoUtrNo || null,
    emdValidity: null,
    loiPoNoAndDate: row.loiPoNoAndDate || null,
    remarks: row.remarks || null,
    bidValidityExpired: false,
    diffPercentFromL1: parseFloatOrNull(row.diffPercentFromL1),
    diffPercentFromL2: parseFloatOrNull(row.diffPercentFromL2),
    reason: row.reason || null,
    finalRemarks: null,
    attachmentUrl: null,
    tenderFiles: row.tenderFiles || "",
    priceBasis: row.priceBasis || null,
    price: row.price || null,
    aluminiumPrice: parseFloatOrNull(row.aluminiumPrice),
    aluminiumAlloyPrice: parseFloatOrNull(row.aluminiumAlloyPrice),
    copperTapePrice: parseFloatOrNull(row.copperTapePrice),
    extrudedSemiconductivePrice: null,
    htXlpePrice: null,
    pvcTypeSt2Price: null,
    galvanisedSteelFlatStripPrice: null,
    fillerPrice: null,
    proposedErpItemName: row.proposedErpItemName || undefined,
    proposedErpQuantity: row.proposedErpQuantity || undefined,
    rawMaterials: row.rawMaterials || undefined,
    statusCategory: row.statusCategory as StatusCategory | undefined,
    itemCategory: row.itemCategory || null,
    competitors: row.competitors || null,
    fileCount: undefined,
    hasBoqChart: undefined,
    boqFileId: undefined,
    bgStatus: row.bgStatus || null,
    beneficiaryBankDetails: row.beneficiaryBankDetails || null,
    emd: row.emd || null,
    bgDate: row.bgDate || null,
    bgExpiryDate: row.bgExpiryDate || null,
    claimDate: row.claimDate || null,
    tenderUpdateStatus: undefined,
    nextAction: (row.nextAction || null) as NextAction | null,
    quotationNo: row.quotationNo || null,
    contractNo: row.contractNo || null,
    cva: null,
    officeName: row.officeName || "",
    consigneesReportingOfficer: row.consigneesReportingOfficer || "",
    miiPurchasePreference: row.miiPurchasePreference || null,
    website: row.website || null,
    raQualificationRule: row.raQualificationRule || null,
    startupExemption: row.startupExemption || null,
    minimumAverageAnnualTurnover: row.minimumAverageAnnualTurnover || null,
    yearsOfPastExperience: row.yearsOfPastExperience || null,
    ePbgDurationMonths: row.ePbgDurationMonths || null,
    reportings: row.reportings || "",
    ourRank: row.ourRank || null,
    ourValue: row.ourValue || null,
    nameOfRank1: row.nameOfRank1 || null,
    valueOfRank1: row.valueOfRank1 || null,
    differenceBetweenRank1: row.differenceBetweenRank1 || null,
    nameOfRank2: row.nameOfRank2 || null,
    valueOfRank2: row.valueOfRank2 || null,
    differenceBetweenRank2: row.differenceBetweenRank2 || null,
  }));
}
