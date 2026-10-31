"use client";

import { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  Check,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Lock,
  MessageSquarePlus,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useAppDispatch } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useIsDeveloper } from "@/components/v2/providers";
import { REASON_FOR_NOT_APM_OPTIONS } from "@/lib/reason-for-not-apm";
import type { FlatRow } from "@/lib/tender-flatten";
import {
  bulkAssignUtilityMapping,
  saveFeedbackAndReanalyze,
  updateTenderAssignments,
  updateTenderCell,
  updateTenderMergedField,
  updateTenderReasonForNotAPM,
  updateTenderRemarks,
  updateWebsiteMapping,
  uploadTenderDocument,
} from "@/lib/slices/tendersSlice";
import { Button, IconButton } from "@/components/v2/ui/button";
import { toastError } from "@/components/v2/ui/errors";
import { CellAction, Chips, Clamp } from "@/components/v2/data-table/cells";
import { Badge, Choice, Dash, Field, Input, Textarea, type Tone } from "@/components/v2/ui/field";
import { Dialog, Select } from "@/components/v2/ui/overlay";
import { Sheet } from "@/components/v2/ui/sheet";
import { requestTenderDelete } from "@/actions/tender-delete";
import { useTenderCellContext } from "./use-tenders";
import { say } from "@/lib/pip-says";

export type Row = FlatRow;

const str = (v: unknown) => (v == null ? "" : String(v));

function parseJsonArray(raw: unknown): string[] | null {
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(str(raw));
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

export function TenderSummary({ row }: { row: Row }) {
  const brief = str(row.tenderBrief);
  const organization = str(row.organization ?? row.nameOfTheClient);
  return (
    <div className="mb-3 rounded-lg bg-sunken px-3 py-2">
      <div className="font-medium">{organization || "No organisation"}</div>
      {brief && <div className="mt-0.5 line-clamp-2 text-ink-2">{brief}</div>}
    </div>
  );
}

/* ------------------------------- Decisions --------------------------------- */

export function DecisionCell({
  row,
  field,
  rowIndex,
}: {
  row: Row;
  field: "app" | "aps" | "apm" | "participated";
  rowIndex: number;
}) {
  const dispatch = useAppDispatch();
  // participated is a boolean column: "true" / "false", and empty when undecided.
  const bool = field === "participated";
  const stored = (choice: "YES" | "NO") => (bool ? String(choice === "YES") : choice);
  const label = bool ? "Participated" : field.toUpperCase();
  // Participated is set from the participation pages; only developers change it here.
  const developer = useIsDeveloper();
  const locked = bool && !developer;
  const saved = str(row[field]);
  // Shown the moment it is pressed; reverts if the server refuses.
  const [pending, setPending] = useState<string | null>(null);
  const value = pending ?? saved;

  const choose = (choice: "YES" | "NO") => {
    const cleared = saved === stored(choice);
    const next = cleared ? (bool ? "" : "NOT_DECIDED") : stored(choice);
    setPending(next);
    dispatch(
      updateTenderCell({
        rowIndex,
        field,
        value: next,
        tenderMergedId: Number(row.id),
        oldValue: saved,
      }),
    )
      .unwrap()
      .then((result) => {
        toast.success(cleared ? say.cleared(label) : say.set(label, choice));
        if (result?.webhookTriggered && result.webhookResponse?.message) {
          const notify = result.webhookResponse.success ? toast.success : toast.error;
          notify(`${result.referenceNo ?? ""}: ${result.webhookResponse.message}`);
        }
      })
      .catch((err: unknown) => toastError(say.notSaved(label), err))
      .finally(() => setPending(null));
  };

  const option = (choice: "YES" | "NO") => {
    const on = value === stored(choice);
    return (
      <button
        type="button"
        aria-pressed={on}
        aria-label={`${label} ${choice === "YES" ? "yes" : "no"}`}
        disabled={locked || pending !== null}
        onClick={() => choose(choice)}
        className={cn(
          "press h-6 w-7 rounded-[0.3125rem] text-xs font-semibold",
          locked ? "cursor-not-allowed" : "disabled:cursor-progress",
          on
            ? choice === "YES"
              ? "bg-good text-white dark:text-black"
              : "bg-bad text-white dark:text-black"
            : "not-disabled:hover:bg-hover text-ink-3",
        )}
      >
        {choice === "YES" ? "Y" : "N"}
      </button>
    );
  };

  return (
    <div
      className={cn(
        "inline-flex gap-0.5 rounded-md bg-sunken p-0.5",
        pending !== null && "opacity-60",
      )}
    >
      {option("YES")}
      {option("NO")}
    </div>
  );
}

/* ------------------------------- AI relevance ------------------------------ */

export function AiRelevanceCell({ row }: { row: Row }) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const valid = str(row.aiRelevanceValid);
  const isYes = valid === "true";
  const [corrected, setCorrected] = useState(isYes ? "NO" : "YES");
  const [reason, setReason] = useState("");

  if (!valid) return <Dash />;
  const hasFeedback = !!row.aiFeedbackCorrected;

  const briefText = [str(row.tenderBrief).trim(), str(row.itemCategory).trim()]
    .filter(Boolean)
    .join("@");

  const submit = () => {
    if (!reason.trim()) return;
    setSaving(true);
    dispatch(
      saveFeedbackAndReanalyze({
        tenderMergedId: Number(row.id),
        tenderType: row.type === "Gem" ? "Gem" : "NonGem",
        briefText,
        originalAi: isYes ? "YES" : "NO",
        correctedAi: corrected,
        feedbackReason: reason.trim(),
      }),
    )
      .unwrap()
      .then(() => {
        toast.success(say.feedbackSent());
        setOpen(false);
        setReason("");
      })
      .catch((err: unknown) => toastError(say.couldNot("send the feedback"), err))
      .finally(() => setSaving(false));
  };

  return (
    <>
      <CellAction
        action={
          !hasFeedback && (
            <IconButton size="sm" label="Correct the AI result" onClick={() => setOpen(true)}>
              <MessageSquarePlus className="size-3.5" />
            </IconButton>
          )
        }
      >
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-1">
            <Badge tone={isYes ? "good" : "bad"}>{isYes ? "Yes" : "No"}</Badge>
            {hasFeedback && <Badge tone="warn">Feedback given</Badge>}
          </div>
          {row.aiRelevanceReason && (
            <Clamp lines={2} className="text-xs text-ink-2">
              {row.aiRelevanceReason}
            </Clamp>
          )}
        </div>
      </CellAction>
      {open && (
        <Dialog
          open
          onOpenChange={setOpen}
          title="Correct the AI result"
          description="The tender is re-analysed with your correction."
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={saving}
                disabled={!reason.trim()}
                onClick={submit}
              >
                Send feedback
              </Button>
            </>
          }
        >
          <TenderSummary row={row} />
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-ink-2">AI said</span>
              <Badge tone={isYes ? "good" : "bad"}>{isYes ? "Yes" : "No"}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-ink-2">Correct answer</span>
              <Choice
                label="Correct answer"
                options={[
                  { value: "YES", label: "Yes" },
                  { value: "NO", label: "No" },
                ]}
                value={corrected}
                onChange={(next) => next && setCorrected(next)}
              />
            </div>
            <Field label="Why was the AI wrong?">
              <Textarea
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What it missed or misread"
              />
            </Field>
          </div>
        </Dialog>
      )}
    </>
  );
}

/* -------------------------------- Assignment ------------------------------- */

export function AssigneeCell({ row, rowIndex }: { row: Row; rowIndex: number }) {
  const dispatch = useAppDispatch();
  const { associations, reload } = useTenderCellContext();
  const [saving, setSaving] = useState(false);
  const value = str(row.assignedTo);

  if (value) {
    const names = value
      .split(",")
      .map((id) => associations.find((a) => a.id === parseInt(id.trim(), 10))?.name)
      .filter(Boolean);
    return (
      <div
        className="flex items-center gap-1.5"
        title="Assignment is locked once a person is allocated"
      >
        <span className="min-w-0 truncate">{names.join(", ") || "Assigned"}</span>
        <Lock className="size-3 shrink-0 text-ink-3" aria-label="Locked" />
      </div>
    );
  }

  return (
    <Select
      size="sm"
      label="Assign to"
      placeholder="Unassigned"
      value={null}
      disabled={saving}
      options={associations.map((a) => ({ value: String(a.id), label: a.name }))}
      onChange={(id) => {
        if (!id) return;
        setSaving(true);
        dispatch(
          updateTenderAssignments({
            rowIndex,
            tenderMergedId: Number(row.id),
            associationIds: [Number(id)],
            oldValue: value,
          }),
        )
          .unwrap()
          .then(() => {
            toast.success(say.tenderAssigned());
            // The slice cannot patch this row from an id list, so refetch.
            reload();
          })
          .catch((err: unknown) => toastError(say.couldNot("assign the tender"), err))
          .finally(() => setSaving(false));
      }}
    />
  );
}

/* ------------------------------ Inline selects ----------------------------- */

const CLEAR = "__clear__";

export function ReasonNotApmCell({ row }: { row: Row }) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const value = str(row.reasonForNotAPM);

  return (
    <Select
      size="sm"
      label="Reason for not approval"
      placeholder="Select reason"
      value={value || null}
      disabled={saving}
      options={[
        { value: CLEAR, label: "No reason" },
        ...REASON_FOR_NOT_APM_OPTIONS.map((v) => ({ value: v, label: v })),
      ]}
      onChange={(picked) => {
        const next = !picked || picked === CLEAR ? "" : picked;
        if (next === value) return;
        setSaving(true);
        dispatch(
          updateTenderReasonForNotAPM({
            tenderMergedId: Number(row.id),
            reasonForNotAPM: next,
            oldReasonForNotAPM: value,
          }),
        )
          .unwrap()
          .then(() => toast.success(next ? say.updated("the reason") : say.cleared("the reason")))
          .catch((err: unknown) => toastError(say.notSaved("the reason"), err))
          .finally(() => setSaving(false));
      }}
    />
  );
}

export function PriceCell({ row }: { row: Row }) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const value = str(row.price).trim();

  if (value) {
    return (
      <Badge tone={value.toUpperCase() === "VARIABLE" ? "warn" : "accent"}>{value}</Badge>
    );
  }
  return (
    <Select
      size="sm"
      label="Price basis"
      placeholder="Not set"
      value={null}
      disabled={saving}
      options={[
        { value: "FIRM", label: "FIRM" },
        { value: "VARIABLE", label: "VARIABLE" },
      ]}
      onChange={(next) => {
        if (!next) return;
        setSaving(true);
        dispatch(
          updateTenderMergedField({
            rowIndex: 0,
            field: "price",
            value: next,
            tenderMergedId: Number(row.id),
            oldValue: "",
          }),
        )
          .unwrap()
          .then(() => toast.success(say.updated("the price")))
          .catch((err: unknown) => toastError(say.notSaved("the price"), err))
          .finally(() => setSaving(false));
      }}
    />
  );
}

/* --------------------------------- Remarks --------------------------------- */

export function RemarksCell({ row }: { row: Row }) {
  const dispatch = useAppDispatch();
  const { canEditRemarks } = useTenderCellContext();
  const value = str(row.remarks);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing || !ref.current) return;
    ref.current.focus();
    ref.current.setSelectionRange(ref.current.value.length, ref.current.value.length);
  }, [editing]);

  const save = () => {
    setEditing(false);
    if (draft === value) return;
    setSaving(true);
    dispatch(
      updateTenderRemarks({ tenderMergedId: Number(row.id), remarks: draft, oldRemarks: value }),
    )
      .unwrap()
      .then(() => toast.success(say.updated("the remarks")))
      .catch((err: unknown) => toastError(say.notSaved("the remarks"), err))
      .finally(() => setSaving(false));
  };

  if (editing) {
    return (
      <div className="flex items-start gap-1">
        <Textarea
          ref={ref}
          aria-label="Remarks"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              setEditing(false);
            }
          }}
        />
        <div className="flex flex-col gap-0.5">
          <IconButton size="sm" label="Save remarks (Enter)" onClick={save}>
            <Check className="size-3.5" />
          </IconButton>
          <IconButton size="sm" label="Cancel (Esc)" onClick={() => setEditing(false)}>
            <X className="size-3.5" />
          </IconButton>
        </div>
      </div>
    );
  }

  return (
    <CellAction
      pending={saving}
      action={
        canEditRemarks && (
          <IconButton
            size="sm"
            label="Edit remarks"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            <Pencil className="size-3.5" />
          </IconButton>
        )
      }
    >
      {value ? <Clamp>{value}</Clamp> : <Dash />}
    </CellAction>
  );
}

/* --------------------------------- Website --------------------------------- */

export function WebsiteCell({ row }: { row: Row }) {
  const dispatch = useAppDispatch();
  const current = str(row.website);
  const [open, setOpen] = useState(false);
  const [website, setWebsite] = useState(current);
  const [saving, setSaving] = useState(false);
  const formId = useId();
  const urls = current
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const next = website.trim();
    if (!next) return;
    setSaving(true);
    dispatch(
      updateWebsiteMapping({ tenderMergedId: Number(row.id), website: next, oldValue: current }),
    )
      .unwrap()
      .then((result) => {
        toast.success(say.saved("the website"));
        setOpen(false);
        // The same organisation's other tenders take the same website.
        dispatch(
          bulkAssignUtilityMapping({
            organization: result.organization,
            website: next,
            utilityMappingId: result.utilityMappingId,
            excludeTenderMergedId: Number(row.id),
          }),
        )
          .unwrap()
          .then(({ updatedIds }) => {
            if (updatedIds.length > 0) {
              toast.success(say.sameOrganisationUpdated(updatedIds.length));
            }
          })
          .catch((err: unknown) => toastError(say.couldNot("update the other tenders"), err));
      })
      .catch((err: unknown) => toastError(say.notSaved("the website"), err))
      .finally(() => setSaving(false));
  };

  return (
    <>
      <CellAction
        action={
          <IconButton
            size="sm"
            label="Edit website"
            onClick={() => {
              setWebsite(current);
              setOpen(true);
            }}
          >
            <Pencil className="size-3.5" />
          </IconButton>
        }
      >
        <div className="flex flex-col gap-0.5">
          {urls.length === 0 && <Dash />}
        {urls.slice(0, 3).map((url, i) => (
          <a
            key={i}
            href={/^https?:\/\//.test(url) ? url : `https://${url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-accent-ink underline-offset-2 hover:underline"
            title={url}
          >
            {url}
          </a>
        ))}
          {urls.length > 3 && <span className="text-xs text-ink-3">+{urls.length - 3} more</span>}
        </div>
      </CellAction>
      {open && (
        <Dialog
          open
          onOpenChange={setOpen}
          title="Edit website"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form={formId}
                variant="primary"
                loading={saving}
                disabled={!website.trim()}
              >
                Save website
              </Button>
            </>
          }
        >
          <TenderSummary row={row} />
          <form id={formId} onSubmit={save} className="flex flex-col gap-3">
            <Field label="Website URL">
              <Input
                type="url"
                autoFocus
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
              />
            </Field>
            <p className="text-xs text-ink-3">
              Applies to every tender from this organisation.
            </p>
          </form>
        </Dialog>
      )}
    </>
  );
}

/* -------------------------------- Documents -------------------------------- */

export type TenderFile = Record<string, string> & { tags?: string[] | string };

// Same token v1 sends; the file routes only check its shape.
export const FILE_AUTH = "Bearer MOCK_TOKEN_LASERPOWER_SECURE_AUTH_SCOPE";

const FILE_TYPES = [
  { value: "tenderDocument", label: "Tender Document" },
  { value: "costingAttachment", label: "Costing Attachment" },
  { value: "catalogueDocument", label: "Catalogue Document" },
];

export function fileTags(file: TenderFile): string[] {
  if (Array.isArray(file.tags)) return file.tags;
  if (typeof file.tags === "string") {
    try {
      return JSON.parse(file.tags) as string[];
    } catch {
      return [];
    }
  }
  return [];
}

function driveFallbackName(url: string): string {
  const m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? `drive_document_${m[1].slice(0, 8)}` : "online_document";
}

export function FileRow({ file }: { file: TenderFile }) {
  const extension = file.extension || "";
  const rawName = file.name || file.filename || "Unknown";
  const baseName = ["view", "view.pdf"].includes(rawName.toLowerCase())
    ? driveFallbackName(file.url || file.source || "")
    : rawName;
  const name = baseName.endsWith(extension) ? baseName : baseName + extension;
  const tags = fileTags(file);
  const isHttp = file.url?.startsWith("http") || file.source?.startsWith("http");
  const isNetwork =
    (tags.includes("networkFiles") ||
      (!!file.source && file.source !== "SHEET_SYNC" && file.source !== "MANUAL_UPLOAD")) &&
    !isHttp;
  const isPdf = extension.replace(/^\./, "").toLowerCase() === "pdf";
  const api = (kind: "view" | "download") =>
    window.open(
      `/api/executive-files/${kind}/${file.source}?auth=${encodeURIComponent(FILE_AUTH)}`,
      "_blank",
    );

  return (
    <li className="flex items-center gap-3 border-b py-2 last:border-b-0">
      <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate" title={name}>
          {name}
        </div>
        {tags.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-1.5">
        {isNetwork && isPdf && (
          <Button size="sm" icon={<Eye className="size-3.5" />} onClick={() => api("view")}>
            Preview
          </Button>
        )}
        {isNetwork && (
          <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => api("download")}>
            Download
          </Button>
        )}
        {!isNetwork && isHttp && (
          <Button
            size="sm"
            icon={<ExternalLink className="size-3.5" />}
            onClick={() => window.open(file.url || file.source, "_blank")}
          >
            Open
          </Button>
        )}
      </div>
    </li>
  );
}

function UploadDocumentDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const { reload } = useTenderCellContext();
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState(FILE_TYPES[0].value);
  const [saving, setSaving] = useState(false);

  const upload = () => {
    if (!file) return;
    setSaving(true);
    dispatch(uploadTenderDocument({ tenderMergedId: Number(row.id), file, fileType }))
      .unwrap()
      .then(() => {
        toast.success(say.uploaded("the tender file"));
        onClose();
        reload();
      })
      .catch((err: unknown) => toastError(say.couldNot("upload the file"), err))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Upload tender file"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} disabled={!file} onClick={upload}>
            Upload
          </Button>
        </>
      }
    >
      <TenderSummary row={row} />
      <div className="flex flex-col gap-3">
        <Field label="File type">
          <Select
            label="File type"
            value={fileType}
            onChange={(v) => v && setFileType(v)}
            options={FILE_TYPES}
          />
        </Field>
        <Field label="File">
          <Input
            type="file"
            className="h-auto py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-sunken file:px-2 file:py-1 file:text-xs file:text-ink"
            accept=".pdf,.docx,.doc,.zip,.png,.jpg,.jpeg,.gif,.webp,.bmp,.xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
      </div>
    </Dialog>
  );
}

/** Hides the tender and asks a developer to delete it for good. */
export function DeleteRequestCell({ row }: { row: Row }) {
  const { reload } = useTenderCellContext();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = () => {
    setSaving(true);
    requestTenderDelete({ tenderMergedId: Number(row.id), reason })
      .then(() => {
        toast.success(say.deleteRequested(str(row.referenceNo)));
        setOpen(false);
        reload();
      })
      .catch((err: unknown) => toastError(say.couldNot("request the delete"), err))
      .finally(() => setSaving(false));
  };

  return (
    <>
      <IconButton size="sm" label="Request delete" onClick={() => { setReason(""); setOpen(true); }}>
        <Trash2 className="size-3.5" />
      </IconButton>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${str(row.referenceNo)}?`}
        description="The tender is hidden at once. A developer confirms the delete or brings it back."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={saving} disabled={!reason.trim()} onClick={submit}>
              Request delete
            </Button>
          </>
        }
      >
        <Field label="Reason">
          <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Dialog>
    </>
  );
}

export function DocumentsCell({ row }: { row: Row }) {
  const [viewing, setViewing] = useState(false);
  const [uploading, setUploading] = useState(false);

  let files: TenderFile[] = [];
  try {
    files = row.tenderFiles ? (JSON.parse(row.tenderFiles) as TenderFile[]) : [];
  } catch {}
  const documents = files.filter((f) => fileTags(f).includes("tenderDocument"));

  return (
    <div className="flex items-center gap-1.5">
      {documents.length > 0 ? (
        <Button size="sm" icon={<FileText className="size-3.5" />} onClick={() => setViewing(true)}>
          {documents.length} {documents.length === 1 ? "document" : "documents"}
        </Button>
      ) : (
        <span className="flex-1">
          <Dash />
        </span>
      )}
      <IconButton size="sm" label="Upload tender file" onClick={() => setUploading(true)}>
        <Upload className="size-3.5" />
      </IconButton>
      {viewing && (
        <Dialog open onOpenChange={setViewing} title="Tender documents" width="38rem">
          <ul>
            {documents.map((file, i) => (
              <FileRow key={file.id || i} file={file} />
            ))}
          </ul>
        </Dialog>
      )}
      {uploading && <UploadDocumentDialog row={row} onClose={() => setUploading(false)} />}
    </div>
  );
}

/* ------------------------------- Agent report ------------------------------ */

export function AgentReportCell({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const report = str(row.agentReport).trim();
  if (!report) return <Dash />;
  return (
    <>
      <Button size="sm" icon={<FileText className="size-3.5" />} onClick={() => setOpen(true)}>
        Agent report
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Agent report">
        <div className="md">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
        </div>
      </Sheet>
    </>
  );
}

/* ------------------------------ Display cells ------------------------------ */

export function ReferenceCell({ row }: { row: Row }) {
  const ref = str(row.referenceNo);
  let stage: { label: string; tone: Tone } | null = null;
  if (row.apm === "YES") {
    stage =
      row.participated === "true"
        ? { label: "Post", tone: "good" }
        : row.participated === "false"
          ? { label: "Not participated", tone: "bad" }
          : { label: "Pre", tone: "accent" };
  }
  return (
    <div className="flex flex-col items-start gap-1">
      {ref ? (
        <span className="break-all font-mono text-xs tabular-nums">{ref}</span>
      ) : (
        <Dash />
      )}
      {stage && <Badge tone={stage.tone}>{stage.label}</Badge>}
    </div>
  );
}

const PARSE_TONES: Record<string, Tone> = {
  COMPLETED: "good",
  FAILED: "bad",
  RATE_LIMITED: "warn",
  PROCESSING: "accent",
};

export function ParseStatusCell({ row }: { row: Row }) {
  const status = str(row.parseStatus);
  if (!status) return <Dash />;
  return (
    <Badge tone={PARSE_TONES[status] ?? "neutral"} title={str(row.parseError) || undefined}>
      {status.replace(/_/g, " ").toLowerCase()}
    </Badge>
  );
}

const DIVISION_TONES: Record<string, Tone> = {
  "LASER PROJECTS": "accent",
  "LASER MANUFACTURING": "good",
};

export function DivisionCell({ row }: { row: Row }) {
  const raw = str(row.divisionOrDepartment).trim();
  if (!raw) return <Dash />;
  return <Badge tone={DIVISION_TONES[raw.toUpperCase()] ?? "neutral"}>{raw}</Badge>;
}

export function ReportingsCell({ row }: { row: Row }) {
  let entries: { officer: string; quantity?: string }[] = [];
  try {
    entries = row.reportings ? JSON.parse(row.reportings) : [];
  } catch {}
  if (!Array.isArray(entries) || entries.length === 0) return <Dash />;
  return (
    <Clamp>
      {entries
        .map((e) => (e.quantity ? `${e.officer} (qty ${e.quantity})` : e.officer))
        .join("\n")}
    </Clamp>
  );
}

/** Location joined with the distinct reporting-officer addresses. */
export function locationText(row: Row): string {
  const addresses: string[] = [];
  const own = str(row.location).trim();
  if (own) addresses.push(own);
  try {
    const entries = row.reportings ? JSON.parse(row.reportings) : [];
    if (Array.isArray(entries)) {
      for (const e of entries as { address?: string }[]) {
        if (e.address && !addresses.includes(e.address)) addresses.push(e.address);
      }
    }
  } catch {}
  return addresses.join(" | ");
}

/** GeM sizes arrive as markdown; everything else as a JSON list or plain text. */
export function SizeCell({ row, field }: { row: Row; field: string }) {
  const value = str(row[field]);
  if (!value) return <Dash />;
  if (row.type === "Gem") {
    return (
      <Clamp className="md whitespace-normal text-xs">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
      </Clamp>
    );
  }
  const items = parseJsonArray(value);
  if (!items || items.length <= 1) return <Clamp>{value}</Clamp>;
  return <Chips items={items} />;
}

export function RawMaterialsCell({ row }: { row: Row }) {
  let entries: [string, unknown][] = [];
  try {
    const parsed = JSON.parse(str(row.rawMaterials));
    if (parsed && typeof parsed === "object") entries = Object.entries(parsed);
  } catch {}
  const filled = entries.filter(([, v]) => v != null && String(v) !== "");
  if (filled.length === 0) return <Dash />;
  return (
    <dl
      className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs"
      title={filled.map(([k, v]) => `${k}: ${String(v)}`).join(" | ")}
    >
      {filled.slice(0, 4).map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="truncate text-ink-3">{key}</dt>
          <dd className="truncate tabular-nums">{String(value)}</dd>
        </div>
      ))}
      {filled.length > 4 && (
        <dd className="col-span-2 text-ink-3">+{filled.length - 4} more</dd>
      )}
    </dl>
  );
}
