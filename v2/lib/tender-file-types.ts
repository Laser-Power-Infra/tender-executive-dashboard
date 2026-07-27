export const TENDER_FILE_TYPES = {
  TENDER_DOCUMENT: "tenderDocument",
  COSTING_ATTACHMENT: "costingAttachment",
  NETWORK_FILES: "networkFiles",
} as const;

export type TenderFileType =
  (typeof TENDER_FILE_TYPES)[keyof typeof TENDER_FILE_TYPES];
