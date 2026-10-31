/**
 * Everything Pip says in a notification, in one voice: first person, plain,
 * one short sentence ending in a full stop. Call these instead of writing
 * toast text inline, so the voice stays the same everywhere.
 *
 * A failure is a `couldNot`/`notSaved` title; `toastError` adds the reason
 * underneath, e.g. "I couldn't save APM." / "You are signed out. Sign in and try again."
 */

const num = (n: number) => n.toLocaleString("en-IN");
/** "1 tender", "2,400 tenders". */
export const count = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

export const say = {
  // A value changed
  set: (what: string, value: string) => `I've set ${what} to ${value}.`,
  cleared: (what: string) => `I've cleared ${what}.`,
  updated: (what: string) => `I've updated ${what}.`,
  saved: (what: string) => `I've saved ${what}.`,
  notSaved: (what: string) => `I couldn't save ${what}.`,
  cantChange: (what: string) => `I can't change ${what}.`,

  // Records
  created: (what: string) => `I've created ${what}.`,
  added: (what: string) => `I've added ${what}.`,
  removed: (what: string) => `I've removed ${what}.`,
  restored: (what: string) => `I've restored ${what}.`,
  uploaded: (what: string) => `I've uploaded ${what}.`,
  sent: (what: string) => `I've sent ${what}.`,
  copied: (what: string) => `I've copied ${what}.`,
  generated: (what: string) => `I've generated ${what}.`,

  // Any action that failed
  couldNot: (action: string) => `I couldn't ${action}.`,

  // Exports
  exporting: () => "I'm preparing the export…",
  exported: (n: number, one: string) => `I've exported ${count(n, one)}.`,

  // Account and users
  passwordChanged: () => "I've changed your password.",
  passwordReset: (name: string) => `I've reset ${name}'s password.`,
  activated: (name: string) => `I've activated ${name}.`,
  deactivated: (name: string) => `I've deactivated ${name}.`,

  // Tenders
  feedbackSent: () => "I've sent your feedback for analysis.",
  deleteRequested: (ref: string) => `I've asked a developer to delete ${ref}. It is hidden until they decide.`,
  tenderAssigned: () => "I've assigned the tender.",
  sameOrganisationUpdated: (n: number) => `I've also updated ${count(n, "tender")} from the same organisation.`,
  collectingTenders: () => "I'm collecting the filtered tenders…",
  nothingToQueue: () => "There's nothing to queue. Every filtered tender already has an AI result or no brief.",
  queueing: (done: number, total: number) => `I'm queueing tenders for AI analysis (${num(done)} of ${num(total)})…`,
  queued: (n: number) => `I've queued ${count(n, "tender")} for AI analysis.`,
  queuedSome: (queued: number, failed: number) => `I queued ${num(queued)}, but ${num(failed)} failed.`,
  queueStopped: (queued: number) => `I've stopped after queueing ${count(queued, "tender")}.`,
  rejected: (n: number) => `I couldn't take ${count(n, "tender")}.`,
  rejectedDownloaded: () => "I've downloaded them as an Excel file so you can check them.",

  // AI analysis
  requeueing: (which: string, stage: string) => `I'm requeueing ${which} tenders in ${stage}…`,
  requeued: (n: number) => `I've requeued ${count(n, "tender")}.`,
  requeuedSome: (queued: number, notQueued: number) =>
    `I've requeued ${num(queued)}, but ${num(notQueued)} couldn't be sent. See the Error column.`,

  // Uploads
  reading: (name: string, i: number, total: number) => `I'm reading ${name} (${i} of ${total})…`,
  read: (name: string) => `I've read ${name}.`,
  couldNotRead: (name: string) => `I couldn't read ${name}.`,
  skippedFiles: (n: number) => `I skipped ${count(n, "file")}. I can only read .xlsx and .xls.`,

  // Performance certificates
  split: (pages: number) => `I've split it into ${count(pages, "page row")}.`,
  analysisStarted: (jobs: number, files: number) =>
    `I've sent ${count(jobs, "job")} (${count(files, "file")}) for analysis.`,

  // Supply history
  certificateEmailed: (to: string, cc: string[] = []) =>
    `I've emailed the certificate to ${to}${cc.length ? ` (cc ${cc.join(", ")})` : ""}.`,
  documentsScanned: () => "I've scanned the documents.",
  quotationsSynced: (updated: number, contracts: number, errors: number) =>
    `I've synced quotations: ${count(updated, "record")} updated across ${count(contracts, "contract")}, ${count(errors, "error")}.`,
  noDocumentsHere: () => "I found no documents in this view.",
  excelNoDocuments: () => "I've exported the Excel. There were no documents to zip.",
  driveOnlyLeftOut: (n: number) => `I left out ${count(n, "record")} that only have Google Drive documents.`,

  // Daily logs and filters
  markedDone: () => "I've marked it done.",
  unchecked: () => "I've unchecked it.",
  signInFirst: (action: string) => `Sign in first, then I can ${action}.`,
  notLoggable: () => "I can't log this column. AI and parsing fill it in.",
  filterNoLongerFits: (name: string) => `"${name}" doesn't fit this page any more.`,
};
