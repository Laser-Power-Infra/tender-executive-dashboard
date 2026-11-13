"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  FileSpreadsheet,
  FileUp,
  Filter,
  ListPlus,
  Sparkles,
  Square,
  Upload,
  X,
} from "lucide-react";
import { fetchAllFilteredTenderRows } from "@/actions/tender-query";
import { publishAiAnalysisJob, queueTenderStage, startAiAnalysisRun } from "@/actions/ai-analysis";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { QUEUE_OPTIONS, QUEUE_OPTION_INFO, type QueueOption } from "@/lib/tender-lifecycle";
import { useIsDeveloper } from "@/components/v2/providers";
import { cn } from "@/lib/utils";
import {
  TENDER_CATEGORIES,
  TENDER_SUBCATEGORIES,
  isValidCategorySelection,
  type TenderCategory,
} from "@/lib/tender-categories";
import type { TenderQuery } from "@/lib/tender-query";
import {
  clearState as clearFilesState,
  resetSelectedDateRange,
  setSelectedDateRange,
} from "@/lib/slices/filesSlice";
import { setExclusionFilter } from "@/lib/slices/filtersSlice";
import {
  addFiles,
  clearFiles,
  clearResults,
  removeFile,
  uploadFiles,
  uploadResultFiles,
} from "@/lib/slices/uploadSlice";
import { Button, IconButton } from "@/components/v2/ui/button";
import { DateRange } from "@/components/v2/ui/calendar";
import { describeError } from "@/components/v2/ui/errors";
import { Checkbox, Field } from "@/components/v2/ui/field";
import { Dialog, Menu, MenuItem, MenuSeparator, Popover, Select } from "@/components/v2/ui/overlay";
import { say } from "@/lib/pip-says";

/* --------------------------------- Uploads --------------------------------- */

type UploadMode = "parse" | "result";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function UploadDialog({ mode, onClose }: { mode: UploadMode; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const pendingFiles = useAppSelector((s) => s.upload.pendingFiles);
  const parsing = useAppSelector((s) => s.upload.parsing);
  const rejectedRows = useAppSelector((s) => s.upload.rejectedRows);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const subCategories = TENDER_SUBCATEGORIES[category as TenderCategory] ?? [];
  const selectionValid = isValidCategorySelection(category, subCategory);

  // Rows the server refused come back as a spreadsheet to fix and re-upload.
  useEffect(() => {
    if (parsing || rejectedRows.length === 0) return;
    const data = rejectedRows.map((r) => ({
      "Source File": r.fileName,
      Sheet: r.sheetName,
      "Rejection Reason": r.reason,
      ...r.row,
    }));
    void import("xlsx").then((XLSX) => {
      const sheet = XLSX.utils.json_to_sheet(data);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Rejected Tenders");
      XLSX.writeFile(book, `rejected-tenders-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.error(say.rejected(rejectedRows.length), {
        description: say.rejectedDownloaded(),
      });
    });
  }, [parsing, rejectedRows]);

  useEffect(
    () => () => {
      dispatch(clearFiles());
      dispatch(clearResults());
      // Back to the default upload window, so fresh uploads are in view.
      dispatch(clearFilesState());
    },
    [dispatch],
  );

  const submit = () => {
    if (pendingFiles.length === 0) return;
    if (mode === "result") {
      dispatch(uploadResultFiles(pendingFiles));
    } else if (selectionValid) {
      dispatch(uploadFiles({ files: pendingFiles, category, subCategory: subCategory || null }));
    }
  };

  const count = pendingFiles.length;
  const noun = `${count} file${count === 1 ? "" : "s"}`;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={mode === "parse" ? "Upload tenders" : "Upload result"}
      description="Excel files, .xlsx or .xls"
      width="36rem"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            loading={parsing}
            disabled={count === 0 || (mode === "parse" && !selectionValid)}
            onClick={submit}
          >
            {mode === "parse" ? `Parse ${noun}` : `Upload result for ${noun}`}
          </Button>
        </>
      }
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".xlsx,.xls"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) dispatch(addFiles(e.target.files));
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) dispatch(addFiles(e.dataTransfer.files));
        }}
        className={cn(
          "flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-8 text-ink-2 transition-colors duration-(--dur-pop)",
          dragOver ? "border-accent bg-accent-soft text-accent-ink" : "not-disabled:hover:bg-hover border-line-strong",
        )}
      >
        <FileUp className="size-5" aria-hidden />
        <span>{dragOver ? "Drop files to add them" : "Choose files or drag them here"}</span>
      </button>

      {count > 0 && (
        <ul className="mt-3 flex flex-col">
          {pendingFiles.map((file, i) => (
            <li key={file.name + file.size} className="flex items-center gap-2 border-b py-1.5 last:border-b-0">
              <FileSpreadsheet className="size-4 shrink-0 text-ink-3" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-ink-3">
                {formatFileSize(file.size)}
              </span>
              <IconButton size="sm" label={`Remove ${file.name}`} onClick={() => dispatch(removeFile(i))}>
                <X className="size-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {mode === "parse" && count > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Category">
            <Select
              label="Category"
              placeholder="Select category"
              value={category || null}
              disabled={parsing}
              onChange={(v) => {
                setCategory(v ?? "");
                setSubCategory("");
              }}
              options={Object.values(TENDER_CATEGORIES).map((c) => ({ value: c, label: c }))}
            />
          </Field>
          <Field label="Subcategory">
            <Select
              label="Subcategory"
              placeholder={subCategories.length ? "Select subcategory" : "None for this category"}
              value={subCategory || null}
              disabled={parsing || subCategories.length === 0}
              onChange={(v) => setSubCategory(v ?? "")}
              options={subCategories.map((s) => ({ value: s, label: s }))}
            />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

export function UploadMenu() {
  const [mode, setMode] = useState<UploadMode | null>(null);
  return (
    <>
      <Menu align="end" trigger={<Button icon={<Upload className="size-3.5" />}>Upload</Button>}>
        <MenuItem icon={<FileUp />} onClick={() => setMode("parse")}>
          Tender files
        </MenuItem>
        <MenuItem icon={<FileSpreadsheet />} onClick={() => setMode("result")}>
          Result files
        </MenuItem>
      </Menu>
      {mode && <UploadDialog mode={mode} onClose={() => setMode(null)} />}
    </>
  );
}

/* -------------------------------- AI analysis ------------------------------ */

type QueueProgress = { done: number; total: number } | null;

/** Sends one job per target, one at a time, with a progress toast; `abort.current` stops the loop. */
async function queueEach<T>(
  targets: T[],
  send: (target: T) => Promise<boolean>,
  what: string,
  toastId: string | number,
  setProgress: (p: QueueProgress) => void,
  abort: { current: boolean },
) {
  setProgress({ done: 0, total: targets.length });
  let queued = 0;
  let failed = 0;
  for (const target of targets) {
    if (abort.current) break;
    try {
      if (await send(target)) queued++;
      else failed++;
    } catch {
      failed++;
    }
    toast.loading(say.queueing(queued + failed, targets.length, what), { id: toastId });
    setProgress({ done: queued + failed, total: targets.length });
  }
  if (abort.current) toast.info(say.queueStopped(queued), { id: toastId });
  else if (failed === 0) toast.success(say.queued(queued, what), { id: toastId });
  else toast.warning(say.queuedSome(queued, failed), { id: toastId });
}

function StopButton({ progress, onStop }: { progress: NonNullable<QueueProgress>; onStop: () => void }) {
  return (
    <Button variant="danger" icon={<Square className="size-3 fill-current" />} onClick={onStop}>
      Stop
      <span className="tabular-nums">
        {progress.done}/{progress.total}
      </span>
    </Button>
  );
}

export function AiAnalysisButton({ query, total }: { query: TenderQuery; total: number }) {
  const [open, setOpen] = useState(false);
  const [reRunAll, setReRunAll] = useState(false);
  const [progress, setProgress] = useState<QueueProgress>(null);
  const abort = useRef(false);

  const run = async () => {
    abort.current = false;
    setOpen(false);
    setProgress({ done: 0, total: 0 });
    const toastId = toast.loading(say.collectingTenders());

    try {
      // Every row the filters match, not only the visible page.
      const rows = await fetchAllFilteredTenderRows(query, [
        "tenderBrief",
        "itemCategory",
        "aiRelevanceValid",
        "referenceNo",
      ]);
      const targets = rows.filter((r) => {
        const brief = String(r.tenderBrief ?? "");
        if (!brief || brief === "—") return false;
        if (!r.referenceNo) return false;
        return reRunAll || !r.aiRelevanceValid;
      });

      if (targets.length === 0) {
        toast.info(say.nothingToQueue(), { id: toastId });
        return;
      }

      // Earlier rejections stop counting on the AI analysis page. Only that count
      // depends on it, so a failure here must not stop the queueing.
      await startAiAnalysisRun().catch((err) => console.warn("[ai-analysis] run not reset:", err));
      await queueEach(
        targets,
        (row) =>
          publishAiAnalysisJob({
            referenceNo: String(row.referenceNo ?? ""),
            tenderBrief: String(row.tenderBrief ?? ""),
            itemCategory: String(row.itemCategory ?? ""),
          }),
        "AI analysis",
        toastId,
        setProgress,
        abort,
      );
    } catch (err) {
      toast.error(say.couldNot("start the AI analysis"), { id: toastId, description: await describeError(err) });
    } finally {
      setProgress(null);
    }
  };

  if (progress) return <StopButton progress={progress} onStop={() => (abort.current = true)} />;

  return (
    <>
      <Button icon={<Sparkles className="size-3.5" />} onClick={() => setOpen(true)}>
        AI analysis
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Run AI analysis"
        description={`Queues the ${total.toLocaleString("en-IN")} tenders matching the current filters. Results arrive as each one is analysed.`}
        width="28rem"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={run}>
              Queue analysis
            </Button>
          </>
        }
      >
        <Checkbox checked={reRunAll} onChange={setReRunAll}>
          Also re-analyse tenders that already have a result
        </Checkbox>
      </Dialog>
    </>
  );
}

/* ------------------------- Queue to a stage (developer) -------------------- */

/** Sends every filtered tender to the chosen lifecycle stage's queue, whatever its current status. */
export function QueueStageMenu({ query, total }: { query: TenderQuery; total: number }) {
  const isDeveloper = useIsDeveloper();
  const [stage, setStage] = useState<QueueOption | null>(null);
  const [progress, setProgress] = useState<QueueProgress>(null);
  const abort = useRef(false);
  if (!isDeveloper) return null;

  const run = async (picked: QueueOption) => {
    abort.current = false;
    setStage(null);
    const what = QUEUE_OPTION_INFO[picked].label;
    setProgress({ done: 0, total: 0 });
    const toastId = toast.loading(say.collectingTenders());
    try {
      const rows = await fetchAllFilteredTenderRows(query, ["referenceNo"]);
      const refs = rows.map((r) => String(r.referenceNo ?? "")).filter(Boolean);
      if (refs.length === 0) {
        toast.info(say.noneMatch(), { id: toastId });
        return;
      }
      await queueEach(refs, (ref) => queueTenderStage(picked, ref), what, toastId, setProgress, abort);
    } catch (err) {
      toast.error(say.couldNot(`queue ${what}`), { id: toastId, description: await describeError(err) });
    } finally {
      setProgress(null);
    }
  };

  if (progress) return <StopButton progress={progress} onStop={() => (abort.current = true)} />;

  const label = stage ? QUEUE_OPTION_INFO[stage].label : "";
  return (
    <>
      <Menu align="end" trigger={<Button icon={<ListPlus className="size-3.5" />}>Queue to</Button>}>
        {QUEUE_OPTIONS.map((s) => (
          <MenuItem key={s} onClick={() => setStage(s)}>
            {QUEUE_OPTION_INFO[s].label}
          </MenuItem>
        ))}
      </Menu>
      <Dialog
        open={stage !== null}
        onOpenChange={(open) => !open && setStage(null)}
        title={`Queue ${label}`}
        description={`Sends the ${total.toLocaleString("en-IN")} tenders matching the current filters to the ${label} queue, whatever their current status.`}
        width="28rem"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStage(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => stage && run(stage)}>
              Queue {label}
            </Button>
          </>
        }
      >
        {stage && <p className="text-ink-2">{QUEUE_OPTION_INFO[stage].detail}.</p>}
      </Dialog>
    </>
  );
}

/* -------------------------------- Exclusions ------------------------------- */

export const EXCLUSION_OPTIONS = [
  { value: "cable", label: "Exclude cables" },
  { value: "conductors", label: "Exclude conductors" },
  { value: "both", label: "Exclude both" },
];

export function ExclusionsMenu() {
  const dispatch = useAppDispatch();
  const current = useAppSelector((s) => s.filters.exclusionFilter);
  return (
    <Menu align="end" trigger={<Button icon={<Filter className="size-3.5" />}>Exclusions</Button>}>
      {EXCLUSION_OPTIONS.map((opt) => (
        <MenuItem
          key={opt.value}
          icon={current === opt.value ? <Check /> : <span className="block size-3.5" />}
          onClick={() => dispatch(setExclusionFilter(current === opt.value ? null : opt.value))}
        >
          {opt.label}
        </MenuItem>
      ))}
      {current && (
        <>
          <MenuSeparator />
          <MenuItem onClick={() => dispatch(setExclusionFilter(null))}>Clear exclusion</MenuItem>
        </>
      )}
    </Menu>
  );
}

/* ------------------------------- Upload window ----------------------------- */

export const toDayInput = (iso: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd") : "");
export const fromDayInput = (value: string) => new Date(`${value}T00:00:00`).toISOString();

export function formatUploadWindow(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  return `${format(new Date(from), "d MMM yyyy")} – ${format(new Date(to), "d MMM yyyy")}`;
}

export function UploadWindowControl() {
  const dispatch = useAppDispatch();
  const from = useAppSelector((s) => s.files.selectedDateFrom);
  const to = useAppSelector((s) => s.files.selectedDateTo);
  const [draft, setDraft] = useState({ from: toDayInput(from), to: toDayInput(to) });

  useEffect(() => setDraft({ from: toDayInput(from), to: toDayInput(to) }), [from, to]);

  // The window only applies with both ends set.
  const update = (next: { from: string; to: string }) => {
    setDraft(next);
    if (next.from && next.to) {
      dispatch(setSelectedDateRange({ from: fromDayInput(next.from), to: fromDayInput(next.to) }));
    }
  };

  return (
    <Popover
      trigger={
        <Button icon={<CalendarDays className="size-3.5" />}>
          <span className="text-ink-3">Uploaded</span>
          {formatUploadWindow(from, to) ?? "Any time"}
        </Button>
      }
    >
      <div className="flex w-72 flex-col gap-3">
        <h3 className="font-semibold">Upload date</h3>
        <DateRange from={draft.from} to={draft.to} onChange={(from, to) => update({ from, to })} />
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          disabled={!from && !to}
          onClick={() => dispatch(resetSelectedDateRange())}
        >
          Show files from any time
        </Button>
      </div>
    </Popover>
  );
}
