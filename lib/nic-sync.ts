import { TENDER_FILE_TYPES, type TenderFileType } from "@/lib/tender-file-types";
import { TENDER_CATEGORIES, TENDER_SUBCATEGORIES, isValidCategorySelection } from "@/lib/tender-categories";
import type { CategoryFields } from "@/lib/tender-upsert";

// Shapes one NIC portal tender (from the automation-v2:sync worker) into the row the shared
// upsert in lib/tender-upsert.ts understands. See docs/tender-lifecycle.md "NIC portal sync".

export interface NicDocument {
  type: string;
  name: string;
  size_kb?: string;
  url: string | null;
}

export type NicTender = Record<string, unknown>;

/** Row headers: TenderMerged field names, which lib/tender-columns maps to themselves. */
export const NIC_ROW_HEADERS = [
  "referenceNo",
  "tenderBrief",
  "organization",
  "departmentName",
  "deadline",
  "value",
  "emd",
  "documentFees",
  "bidOpeningDateTime",
  "location",
  "source",
  "website",
] as const;

const str = (v: unknown) => (v == null ? "" : String(v).trim());
// NIC prints "NA" / "Nil" for empty fields.
const blank = (v: unknown) => /^(na|nil|n\/a|-)?$/i.test(str(v));
const field = (t: NicTender, key: string) => (blank(t[key]) ? "" : str(t[key]));

/** `portal` is the event's `data.portal`; stored as `website` (fill-only on existing tenders). */
export function nicTenderToRow(t: NicTender, portal = ""): Record<string, unknown> {
  const chain = field(t, "Organisation Chain").split("||").map((s) => s.trim()).filter(Boolean);
  return {
    referenceNo: field(t, "reference_no") || field(t, "Tender ID"),
    tenderBrief: field(t, "Work Description") || field(t, "Title"),
    organization: chain[0] ?? "",
    departmentName: chain.slice(1).join(" / "),
    deadline: field(t, "Bid Submission End Date"),
    value: field(t, "Tender Value in ₹"),
    emd: field(t, "EMD Amount in ₹"),
    documentFees: field(t, "Tender Fee in ₹"),
    bidOpeningDateTime: field(t, "Bid Opening Date"),
    location: field(t, "Location"),
    source: "NIC",
    website: portal,
  };
}

/** Int columns the row mapper would stringify; applied onto createData after prepare. */
export function nicIntFields(t: NicTender): Record<string, number> {
  const out: Record<string, number> = {};
  const days = (key: string) => {
    const n = parseInt(field(t, key), 10);
    return Number.isFinite(n) ? n : undefined;
  };
  const bid = days("Bid Validity(Days)");
  const period = days("Period Of Work(Days)");
  if (bid !== undefined) out.bidValidityDays = bid;
  if (period !== undefined) out.contractPeriodDays = period;
  return out;
}

// The sync worker's sub_category names -> the app's TENDER_SUBCATEGORIES.
const SUBCATEGORY_ALIASES: Record<string, string> = {
  // Manufacturing
  cables: "Cables & Conductors",
  conductors: "Cables & Conductors",
  // EPC
  distribution: "Power Distribution",
  transmission: "Power Transmission",
  solar: "Solar",
  water: "Water Distribution",
  railway: "Railways",
};

/** Payload category/sub_category validated against TENDER_SUBCATEGORIES; unknown values fall back. */
export function nicCategoryFields(t: NicTender): CategoryFields {
  const category = field(t, "category") || TENDER_CATEGORIES.MANUFACTURING;
  // Special tenders come only from the sync worker and never carry a sub category.
  if (category.toUpperCase() === "SPECIAL") return { category: "SPECIAL", subCategory: null };
  const rawSub = field(t, "sub_category");
  const subCategory = SUBCATEGORY_ALIASES[rawSub.toLowerCase()] ?? rawSub;
  if (isValidCategorySelection(category, subCategory)) return { category, subCategory: subCategory || null };
  if (category in TENDER_SUBCATEGORIES) return { category, subCategory: null };
  return { category: TENDER_CATEGORIES.MANUFACTURING, subCategory: null };
}

const DOC_TAGS: Record<string, TenderFileType> = {
  BOQ: TENDER_FILE_TYPES.BOQ_COMPARATIVE_CHART,
};

export interface NicFile {
  name: string;
  extension: string;
  url: string;
  source: string;
  tags: TenderFileType[];
}

/** Documents with a URL become TenderFile rows; NIC docs the worker could not store (url null) are skipped. */
export function nicDocsToFiles(docs: unknown): NicFile[] {
  if (!Array.isArray(docs)) return [];
  return docs
    .filter((d): d is NicDocument => !!d && typeof d.url === "string" && d.url.trim() !== "" && typeof d.name === "string")
    .map((d) => ({
      name: d.name,
      extension: d.name.includes(".") ? d.name.slice(d.name.lastIndexOf(".") + 1).toLowerCase() : "",
      url: d.url!.trim(),
      source: "nic-sync",
      tags: [DOC_TAGS[str(d.type).toUpperCase()] ?? TENDER_FILE_TYPES.TENDER_DOCUMENT],
    }));
}
