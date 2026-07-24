export const TENDER_FILE_TYPES = {
  TENDER_DOCUMENT: "tenderDocument",
} as const;

export type TenderFileType =
  (typeof TENDER_FILE_TYPES)[keyof typeof TENDER_FILE_TYPES];
