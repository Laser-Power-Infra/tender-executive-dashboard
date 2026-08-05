import { format } from "date-fns";

export interface TenderFileInfo {
  id: number;
  name: string;
  extension: string;
  url: string;
  source: string;
  tags: string[];
}

export interface ReportingInfo {
  id: number;
  officer: string;
  address: string | null;
  quantity: string | null;
}

export interface EvaluationInfo {
  id: number;
  sellerName: string;
  offeredItem: string | null;
  totalPrice: string | null;
  rank: string | null;
  status: string | null;
}

export interface AssociationInfo {
  id: number;
  name: string;
}

export interface TenderAssociationInfo {
  association: AssociationInfo;
  createdAt?: string | Date;
}

export interface FlatRow {
  type: "Gem" | "Non-Gem";
  id: string;
  reportings?: string;
  evaluations?: string;
  tenderFiles?: string;
  assignedDate?: string;
  [key: string]: string | undefined;
}

export const SKIP_RELATION_FIELDS = new Set([
  "extraFields", "tenderAssociations", "reportings", "evaluations",
  "tenderFiles", "file", "tenderStatus", "utilityMapping",
]);

export function flattenTender(
  tender: Record<string, unknown>,
  type: "Gem" | "Non-Gem",
  id: number,
  tenderAssociations: TenderAssociationInfo[],
  reportings?: ReportingInfo[],
  evaluations?: EvaluationInfo[],
  tenderFiles?: TenderFileInfo[],
): FlatRow {
  const assignedIds = tenderAssociations.map((ta) => ta.association.id).join(",");
  const row: FlatRow = { type, id: String(id) };

  for (const field of Object.keys(tender)) {
    if (SKIP_RELATION_FIELDS.has(field)) continue;
    const val = tender[field];
    if (val instanceof Date) {
      row[field] = format(val, "yyyy-MM-dd");
    } else {
      row[field] = val == null ? "" : String(val);
    }
  }

  row.assignedTo = assignedIds;

  const assignedDates = tenderAssociations
    .map((ta) => ta.createdAt)
    .filter(
      (d): d is string | Date =>
        d != null && !isNaN(new Date(d as string).getTime()),
    )
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  row.assignedDate =
    assignedDates.length > 0
      ? format(new Date(assignedDates[0]), "yyyy-MM-dd")
      : "";

  const docFile = tenderFiles?.find((f) => f.tags.includes("tenderDocument"));
  row.tenderFileUrl = docFile?.url ?? "";

  const costingFile = tenderFiles?.find((f) => f.tags.includes("costingAttachment"));
  row.costingFileUrl = costingFile?.source && costingFile.source !== 'SHEET_SYNC'
    ? `/api/executive-files/view/${costingFile.source}`
    : costingFile?.url ?? "";

  if (tenderFiles && tenderFiles.length > 0) {
    row.tenderFiles = JSON.stringify(tenderFiles);
  } else {
    row.tenderFiles = "";
  }

  if (reportings && reportings.length > 0) {
    row.reportings = JSON.stringify(reportings);
  } else {
    row.reportings = "";
  }

  if (evaluations && evaluations.length > 0) {
    row.evaluations = JSON.stringify(evaluations);
  } else {
    row.evaluations = "";
  }

  return row;
}
