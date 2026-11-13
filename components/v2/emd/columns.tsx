"use client";

import { memo, useState } from "react";
import { format } from "date-fns";
import { Eye, Mail } from "lucide-react";
import { toast } from "sonner";
import { EMD_MAIL_TEMPLATE, type EMD_MAIL_TYPE } from "@/emails/emd-mail-template";
import { TENDER_REASON_OPTIONS } from "@/lib/emdReasonOptions";
import { EMD_STATUS_OPTIONS } from "@/lib/emdStatusOptions";
import { formatDateISTShort, formatDateTimeIST } from "@/lib/format-ist";
import { useAppDispatch } from "@/lib/hooks";
import { parseDate as parseSheetDate } from "@/lib/parse-date";
import {
  fetchEmdMerged,
  updateEmdField,
  type EmdEditableField,
  type EmdMergedRecord as Row,
} from "@/lib/slices/emdSlice";
import { SelectEditCell, TextEditCell } from "@/components/v2/data-table/edit-cells";
import { selectFilter, type DataTableColumn } from "@/components/v2/data-table/types";
import type { ColumnValues } from "@/components/v2/data-table/use-client-table";
import { Button } from "@/components/v2/ui/button";
import { toastError } from "@/components/v2/ui/errors";
import { Field, Input, Textarea } from "@/components/v2/ui/field";
import { Sheet } from "@/components/v2/ui/sheet";
import { parseRupees } from "@/lib/rupees";
import { say } from "@/lib/pip-says";

export type { Row };
type Column = DataTableColumn<Row>;
type TextField = Exclude<keyof Row, "tenderMergeds">;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invalidEmails = (value: string) =>
  value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((e) => !EMAIL.test(e));

/* ---------------------------------- Values --------------------------------- */

export const parseAmount = (value: unknown): number => parseRupees(value) ?? 0;

/** Sheet dates arrive as ISO, as "31-12-2025" or as free text. */
function toDate(value: unknown): Date | null {
  if (value == null || String(value).trim() === "") return null;
  const date = parseSheetDate(value as string) ?? new Date(String(value));
  if (!Number.isNaN(date.getTime())) return date;
  const m = String(value).match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

/** A date that cannot be read is shown as it was typed. */
function dateText(value: unknown): string {
  if (value == null || String(value).trim() === "") return "";
  const date = toDate(value);
  if (!date) return String(value);
  const text = formatDateISTShort(date);
  return text === "-" ? String(value) : text;
}

const DATE_COLUMNS = [
  "issueDt",
  "bgDate",
  "expiryDate",
  "claimDate",
  "expectedRefundDateOrRefundedDate",
] as const;
const AMOUNT_COLUMNS = ["emdAmt", "bgAmtLocal", "bgAmtFc"] as const;

export const values: ColumnValues<Row> = {
  ...Object.fromEntries(DATE_COLUMNS.map((id) => [id, (row: Row) => toDate(row[id])])),
  ...Object.fromEntries(
    AMOUNT_COLUMNS.map((id) => [id, (row: Row) => (row[id] ? parseAmount(row[id]) : null)]),
  ),
  lastEmailSentAt: (row) => toDate(row.lastEmailSentAt),
};

/* ---------------------------------- Editing -------------------------------- */

function useSaveField(row: Row, field: EmdEditableField) {
  const dispatch = useAppDispatch();
  // The slice shows the new value at once and restores the old one on failure.
  return (next: string) =>
    dispatch(updateEmdField({ id: row.id, field, value: next || null })).unwrap();
}

function EditText({
  row,
  field,
  label,
  validate,
}: {
  row: Row;
  field: EmdEditableField;
  label: string;
  validate?: (next: string) => string | null;
}) {
  return (
    <TextEditCell
      multiline
      label={label}
      value={row[field] ?? ""}
      onSave={useSaveField(row, field)}
      validate={validate}
    />
  );
}

function EditChoice({
  row,
  field,
  label,
  options,
}: {
  row: Row;
  field: EmdEditableField;
  label: string;
  options: readonly string[];
}) {
  return (
    <SelectEditCell
      label={label}
      value={row[field] ?? ""}
      onSave={useSaveField(row, field)}
      options={options.map((o) => ({ value: o, label: o }))}
    />
  );
}

/* ----------------------------------- Email --------------------------------- */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

// The template only uses plain {{field}} slots, so a regex fill replaces Handlebars here.
const compileMail = (data: EMD_MAIL_TYPE) =>
  EMD_MAIL_TEMPLATE.replace(/{{(\w+)}}/g, (_, key: string) =>
    String(data[key as keyof EMD_MAIL_TYPE] ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]),
  );

const mailDate = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : format(date, "dd-MM-yyyy");
};

function buildMail(row: Row): { subject: string; mailData: EMD_MAIL_TYPE } {
  const tenderNumber = row.tenderNo || "-";
  return {
    subject: `Request for Release/Return of Bid Guarantee Submitted Against Tender No. ${tenderNumber}`,
    mailData: {
      employerName: row.customerName || "-",
      employerAddress: row.address || "-",
      tenderNumber,
      tenderDescription: row.remarks || `Tender ${tenderNumber}`,
      bgNumber: row.bgNo || "-",
      bgIssueDate: mailDate(row.bgDate),
      bankName: row.bankName || "-",
      bgAmount: row.bgAmtLocal || row.bgAmtFc || "-",
      bgValidityDate: mailDate(row.expiryDate || row.claimDate),
      tenderOutcome: row.reason || "-",
      companyName: "Laser Power & Infra Limited",
      date: format(new Date(), "dd-MM-yyyy"),
    },
  };
}

const rowTitle = (row: Row) => row.bgNo || row.tenderNo || row.customerName || row.id.slice(0, 8);

const MailPreview = memo(function MailPreview({ html }: { html: string }) {
  return (
    <iframe
      title="Email preview"
      srcDoc={html}
      sandbox="allow-same-origin"
      loading="lazy"
      // An email is always light, whatever the app's theme.
      className="edge h-full min-h-80 w-full flex-1 rounded-lg bg-white"
    />
  );
});

/** Mounted when the sheet opens, so the draft is built from the row as it is then. */
function SendEmailForm({ row, onDone }: { row: Row; onDone: () => void }) {
  const dispatch = useAppDispatch();
  const [mail] = useState(() => buildMail(row));
  const [subject, setSubject] = useState(mail.subject);
  const [html, setHtml] = useState(() => compileMail(mail.mailData));
  const [preview, setPreview] = useState(true);
  const [sending, setSending] = useState(false);

  const to = (row.contactEmailId ?? "").trim();
  const invalid = invalidEmails(to);

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/emd/${row.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body: html, html, mailData: mail.mailData }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed");
      toast.success(say.sent("the email"));
      onDone();
      // The send stamps "last email sent" and the stored draft on the server;
      // the slice has no action to take them from the response.
      dispatch(fetchEmdMerged({ force: true }));
    } catch (err) {
      toastError(say.couldNot("send the email"), err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="text-ink-2">
        Reason: <span className="text-ink">{row.reason || "–"}</span>
      </p>
      <Field label="To (from Contact Email)">
        <Textarea rows={2} readOnly disabled value={to} placeholder="No contact email" />
      </Field>
      {!to && <p className="text-warn">No contact email for this record</p>}
      {invalid.length > 0 && <p className="text-bad">Invalid email(s): {invalid.join(", ")}</p>}
      <Field label="Subject">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <div className="flex items-center justify-between">
        <span className="type-label text-ink-3">Body {preview ? "(preview)" : "(HTML)"}</span>
        <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)}>
          {preview ? "Edit HTML" : "Show preview"}
        </Button>
      </div>
      {preview ? (
        <MailPreview html={html} />
      ) : (
        <Textarea
          aria-label="Body HTML"
          className="min-h-0 flex-1 resize-none font-mono text-xs"
          value={html}
          onChange={(e) => setHtml(e.target.value)}
        />
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={sending} onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="primary"
          icon={<Mail className="size-3.5" />}
          loading={sending}
          disabled={!to || invalid.length > 0 || !subject || !row.reason}
          onClick={send}
        >
          Confirm and send
        </Button>
      </div>
    </div>
  );
}

function SendEmailCell({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="primary"
        icon={<Mail className="size-3.5" />}
        disabled={!row.reason}
        title={row.reason ? undefined : "Select Tender Conclusion Reason first"}
        onClick={() => setOpen(true)}
      >
        Send email
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={`Send email · ${rowTitle(row)}`} width="56rem">
        <SendEmailForm row={row} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function DraftCell({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const html = row.emailDraft?.trim() ? row.emailDraft : null;
  return (
    <>
      <Button size="sm" icon={<Eye className="size-3.5" />} onClick={() => setOpen(true)}>
        View
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={`Email draft · ${rowTitle(row)}`} width="56rem">
        <div className="flex h-full min-h-0 flex-col">
          {html ? <MailPreview html={html} /> : <p className="text-ink-2">No draft available.</p>}
        </div>
      </Sheet>
    </>
  );
}

/* ---------------------------------- Columns -------------------------------- */

const text = (id: TextField, header: string, width = 180): Column => ({
  id,
  header,
  width,
  filter: selectFilter(),
  text: (row) => row[id] ?? "",
});

const date = (id: (typeof DATE_COLUMNS)[number], header: string): Column => ({
  ...text(id, header, 150),
  filter: { type: "dateRange" },
  text: (row) => dateText(row[id]),
});

const editable = (
  id: EmdEditableField,
  header: string,
  width = 200,
  validate?: (next: string) => string | null,
): Column => ({
  ...text(id, header, width),
  cell: (row) => <EditText row={row} field={id} label={header} validate={validate} />,
});

export const columns: Column[] = [
  text("emdType", "EMD Type", 120),
  editable("bgNo", "BG No"),
  text("tenderNo", "Tender No", 200),
  text("customerName", "Customer Name", 240),
  editable("docketNo", "Docket No"),
  editable("tmNo", "TM No"),
  text("emdAmt", "EMD Amt", 140),
  text("bgAmtLocal", "BG Amt Local", 150),
  text("bgAmtFc", "BG Amt FC", 140),
  date("issueDt", "Issue DT"),
  date("bgDate", "BG Date"),
  date("expiryDate", "Expiry Date"),
  date("claimDate", "Claim Date"),
  date("expectedRefundDateOrRefundedDate", "Expected Refund Date"),
  text("trantype", "Tran Type", 130),
  text("bankName", "Bank Name", 200),
  text("partyCode", "Party Code", 140),
  text("staffName", "Staff Name", 160),
  {
    ...text("status", "Status", 160),
    cell: (row) => <EditChoice row={row} field="status" label="Status" options={EMD_STATUS_OPTIONS} />,
  },
  text("match", "Match", 120),
  text("bgMatch", "BG Match", 130),
  text("statusPriceAssDone", "Status Price Done", 170),
  text("permanent", "Permanent", 130),
  text("chDdNo", "CH/DD No", 150),
  text("acHolder", "A/C Holder", 180),
  text("statusAsPerSujibDaAndOther", "Status As Per Sujib", 200),
  text("canBeRefunded", "Can Be Refunded", 160),
  text("rank", "Rank", 100),
  text("poIssueStatus", "PO Issue Status", 160),
  text("aocAwardOfContractStatus", "AOC Status", 160),
  text("refundableOrNot", "Refundable/Not", 160),
  text("statusRefundedPending", "Refunded/Pending", 170),
  text("statusOfTender", "Status of Tender", 180),
  text("conditionsForRefund", "Conditions for Refund", 220),
  text("certificateByParty", "Certificate By Party", 190),
  text("certificateByUtility", "Certificate By Utility", 190),
  editable("remarks", "Remarks", 260),
  editable("contactNo", "Contact No"),
  editable("contactEmailId", "Contact Email", 260, (next) => {
    const bad = invalidEmails(next);
    return bad.length ? `Invalid email(s): ${bad.join(", ")}` : null;
  }),
  text("address", "Address", 260),
  text("lastEmailSent", "Last Email Sent", 200),
  {
    ...text("lastEmailSentAt", "Last Email Sent At", 180),
    filter: { type: "dateRange" },
    text: (row) => (row.lastEmailSentAt ? formatDateTimeIST(row.lastEmailSentAt) : ""),
  },
  {
    id: "emailDraft",
    header: "Email Draft",
    width: 120,
    search: false,
    sortable: false,
    // The export carries the stored HTML, as before.
    text: (row) => row.emailDraft ?? "",
    cell: (row) => <DraftCell row={row} />,
  },
  {
    ...text("reason", "Tender Conclusion Reason", 320),
    cell: (row) => (
      <EditChoice row={row} field="reason" label="Reason" options={TENDER_REASON_OPTIONS} />
    ),
  },
  {
    id: "action",
    header: "Action",
    width: 150,
    search: false,
    sortable: false,
    cell: (row) => <SendEmailCell row={row} />,
  },
];
