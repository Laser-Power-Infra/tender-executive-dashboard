"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Eye, Pencil, Scissors, Sparkles, Upload, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  publishPerformanceCertificateJobs,
  splitPerformanceCertificatePages,
  type PerformanceCertificateField,
} from "@/actions/performanceCertificates";
import { formatDateISTShort, toISTDateKey } from "@/lib/format-ist";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchItems } from "@/lib/slices/itemsSlice";
import {
  fetchPerformanceCertificates,
  fetchSupplyPartyNames,
  fetchUtilityPartyNames,
  updatePerformanceCertificateField,
  updatePerformanceCertificatePartyName,
  type PerformanceCertificateRow as Row,
} from "@/lib/slices/performanceCertificatesSlice";
import { cn } from "@/lib/utils";
import { CellAction, Chips } from "@/components/v2/data-table/cells";
import { DataTable } from "@/components/v2/data-table/data-table";
import { selectFilter, type DataTableColumn } from "@/components/v2/data-table/types";
import { useClientTable } from "@/components/v2/data-table/use-client-table";
import { Button, IconButton } from "@/components/v2/ui/button";
import { DatePicker } from "@/components/v2/ui/calendar";
import { toastError } from "@/components/v2/ui/errors";
import { CheckMark, Choice, Dash, Input } from "@/components/v2/ui/field";
import { Combobox, Popover, type SelectOption } from "@/components/v2/ui/overlay";
import { Page, PageHeader, PageSkeleton } from "@/components/v2/ui/page";
import { UploadCertificateDialog } from "@/components/v2/performance-certificates/upload-dialog";
import { say } from "@/lib/pip-says";

/** What the cells share: the certificate shown beside the table and the pick lists. */
const PageContext = createContext<{
  preview: Row | null;
  setPreview: (row: Row | null) => void;
  partyOptions: SelectOption[];
  utilityOptions: SelectOption[];
  itemOptions: SelectOption[];
}>({ preview: null, setPreview: () => {}, partyOptions: [], utilityOptions: [], itemOptions: [] });

const NEW_TAB_LINK =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-hover";

function NewTabLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open in new tab"
      title="Open in new tab"
      className={NEW_TAB_LINK}
    >
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

function LinkCell({ row }: { row: Row }) {
  const { preview, setPreview } = useContext(PageContext);
  if (!row.certificateUrl) return <Dash />;
  const active = preview?.id === row.id;
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant={active ? "primary" : "secondary"}
        aria-pressed={active}
        icon={<Eye className="size-3.5" />}
        onClick={() => setPreview(active ? null : row)}
      >
        Preview
      </Button>
      <NewTabLink url={row.certificateUrl} />
      {extensionOf(row.certificateUrl) === ".pdf" && <SplitPagesButton row={row} />}
    </div>
  );
}

/** Splits the row's PDF into a new row per page, then refreshes the table. */
function SplitPagesButton({ row }: { row: Row }) {
  const dispatch = useAppDispatch();
  const [pending, setPending] = useState(false);
  return (
    <IconButton
      size="sm"
      label="Split PDF into page rows"
      disabled={pending}
      onClick={() => {
        setPending(true);
        splitPerformanceCertificatePages(row.id)
          .then(({ pages }) =>
            toast.success(say.split(pages)),
          )
          .catch((err: unknown) => toastError(say.couldNot("split it"), err))
          .finally(() => {
            setPending(false);
            dispatch(fetchPerformanceCertificates());
          });
      }}
    >
      <Scissors className="size-3.5" />
    </IconButton>
  );
}

function UtilityNameCell({ row }: { row: Row }) {
  const { utilityOptions } = useContext(PageContext);
  const { pending, save } = useFieldSave(row, "utilityNames", "Utility name");
  return (
    <Combobox
      size="sm"
      label="Utility name"
      placeholder="Not set"
      value={row.utilityNames}
      disabled={pending}
      options={utilityOptions}
      onChange={save}
    />
  );
}

const saved = (label: string, value: string | null) =>
  toast.success(value ? say.updated(label) : say.cleared(label));

function PartyCell({ row }: { row: Row }) {
  const dispatch = useAppDispatch();
  const { partyOptions } = useContext(PageContext);
  const [pending, setPending] = useState(false);
  return (
    <Combobox
      size="sm"
      label="Party name"
      placeholder="Not set"
      value={row.partyName}
      disabled={pending}
      options={partyOptions}
      onChange={(partyName) => {
        setPending(true);
        dispatch(updatePerformanceCertificatePartyName({ id: row.id, partyName }))
          .unwrap()
          .then(() => saved("Party name", partyName))
          .catch((err: unknown) => toastError(say.notSaved("the party name"), err))
          .finally(() => setPending(false));
      }}
    />
  );
}

function useFieldSave(row: Row, field: PerformanceCertificateField, label: string) {
  const dispatch = useAppDispatch();
  const pending = useAppSelector((s) => !!s.performanceCertificates.saving[`${row.id}-${field}`]);
  const save = (value: string | null) =>
    dispatch(updatePerformanceCertificateField({ id: row.id, field, value }))
      .unwrap()
      .then(() => saved(label, value))
      .catch((err: unknown) => toastError(say.notSaved(label), err));
  return { pending, save };
}

const UTILITY_OPTIONS: SelectOption[] = [
  { value: "CLIENT", label: "By Client" },
  { value: "UTILITY", label: "By Utility" },
];
const USE_OPTIONS: SelectOption[] = [
  { value: "USE", label: "Use" },
  { value: "NOT_USE", label: "Not Use" },
];

const labelOf = (options: SelectOption[], value: string | null) =>
  options.find((o) => o.value === value)?.label ?? value ?? "";

/** Pressing the selected option again clears it. */
function ToggleCell({
  row,
  field,
  label,
  options,
}: {
  row: Row;
  field: "utilityOrClient" | "useNotUse";
  label: string;
  options: SelectOption[];
}) {
  const { pending, save } = useFieldSave(row, field, label);
  return (
    <Choice
      label={label}
      options={options}
      value={row[field]}
      allowClear
      onChange={save}
      className={cn("flex-nowrap", pending && "pointer-events-none opacity-60")}
    />
  );
}

/** Pressing the selected day again clears it. */
function DateCell({
  row,
  field,
  label,
}: {
  row: Row;
  field: "issueDate" | "signingDate";
  label: string;
}) {
  const { pending, save } = useFieldSave(row, field, label);
  const current = toISTDateKey(row[field]) ?? "";
  return (
    <DatePicker
      label={label}
      value={current}
      placeholder="Not set"
      disabled={pending}
      className="h-7 px-2 text-xs"
      onChange={(next) => {
        if (next !== current) save(next || null);
      }}
    />
  );
}

// Several item schedules are kept in one field, comma-separated, as v1 stores them.
const splitList = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const MAX_SHOWN = 100;

function ItemPicker({
  selected,
  disabled,
  onChange,
}: {
  selected: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const { itemOptions } = useContext(PageContext);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // Picked values lead, so they can be unticked without a search.
  const pool = [
    ...selected.map((value) => ({ value, label: value })),
    ...itemOptions.filter((o) => !selected.includes(o.value)),
  ];
  const shown = (q ? pool.filter((o) => o.label.toLowerCase().includes(q)) : pool).slice(
    0,
    MAX_SHOWN,
  );
  return (
    <>
      <Input
        autoFocus
        aria-label="Search item schedule"
        placeholder="Search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="-mx-1 flex max-h-64 flex-col overflow-y-auto">
        {shown.map((o) => {
          const isOn = selected.includes(o.value);
          return (
            <li key={o.value}>
              <button
                type="button"
                role="checkbox"
                aria-checked={isOn}
                disabled={disabled}
                onClick={() =>
                  onChange(isOn ? selected.filter((v) => v !== o.value) : [...selected, o.value])
                }
                className="not-disabled:hover:bg-hover flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left disabled:opacity-50"
              >
                <CheckMark checked={isOn} />
                <span className="min-w-0 flex-1 wrap-break-word">{o.label}</span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-2 py-1.5 text-ink-3">No matches</li>}
      </ul>
    </>
  );
}

function ItemScheduleCell({ row }: { row: Row }) {
  const { pending, save } = useFieldSave(row, "itemSchedule", "Item schedule");
  const selected = splitList(row.itemSchedule);
  return (
    <CellAction
      pending={pending}
      action={
        <Popover
          align="end"
          className="flex w-72 flex-col gap-2 p-2"
          trigger={
            <IconButton size="sm" label="Edit item schedule">
              <Pencil className="size-3.5" />
            </IconButton>
          }
        >
          <ItemPicker
            selected={selected}
            disabled={pending}
            onChange={(next) => save(next.length ? next.join(",") : null)}
          />
        </Popover>
      }
    >
      <Chips items={selected} />
    </CellAction>
  );
}

const certId = (serial: number) => `PERF-CERT-${String(serial).padStart(4, "0")}`;

function DuplicateCell({ row }: { row: Row }) {
  const rows = useAppSelector((s) => s.performanceCertificates.rows);
  const { pending, save } = useFieldSave(row, "duplicateOfId", "Duplicate link");
  const options = rows
    .filter((r) => r.id !== row.id)
    .map((r) => ({ value: r.id, label: certId(r.serial) }));
  const original = rows.find((r) => r.id === row.duplicateOfId) ?? null;
  return (
    <div className="flex items-center gap-1">
      <Combobox
        size="sm"
        label="Duplicate of"
        placeholder="Not a duplicate"
        value={row.duplicateOfId}
        disabled={pending}
        options={options}
        onChange={save}
      />
      {original?.certificateUrl && <NewTabLink url={original.certificateUrl} />}
    </div>
  );
}

const allColumns: DataTableColumn<Row>[] = [
  {
    id: "serial",
    header: "ID",
    width: 130,
    text: (row) => certId(row.serial),
    cell: (row) => (
      <span className="font-mono tabular-nums">{certId(row.serial)}</span>
    ),
  },
  { id: "certificateName", header: "Certificate Name", width: 300, filter: selectFilter() },
  {
    id: "duplicateOfId",
    header: "Duplicate Of",
    width: 260,
    search: false,
    sortable: false,
    cell: (row) => <DuplicateCell row={row} />,
  },
  {
    id: "certificateUrl",
    header: "Certificate Link",
    width: 200,
    search: false,
    sortable: false,
    cell: (row) => <LinkCell row={row} />,
  },
  {
    id: "partyName",
    header: "Party Name",
    width: 220,
    filter: selectFilter(),
    cell: (row) => <PartyCell row={row} />,
  },
  {
    id: "utilityNames",
    header: "Utility Name",
    width: 220,
    filter: selectFilter(),
    cell: (row) => <UtilityNameCell row={row} />,
  },
  {
    id: "utilityOrClient",
    header: "Received From Utility / Client",
    width: 210,
    filter: selectFilter(),
    text: (row) => labelOf(UTILITY_OPTIONS, row.utilityOrClient),
    cell: (row) => (
      <ToggleCell row={row} field="utilityOrClient" label="Received From Utility / Client" options={UTILITY_OPTIONS} />
    ),
  },
  {
    id: "itemSchedule",
    header: "Item Schedule",
    width: 240,
    filter: selectFilter(),
    cell: (row) => <ItemScheduleCell row={row} />,
  },
  {
    id: "useNotUse",
    header: "Use / Not Use",
    width: 170,
    filter: selectFilter(),
    text: (row) => labelOf(USE_OPTIONS, row.useNotUse),
    cell: (row) => <ToggleCell row={row} field="useNotUse" label="Use / Not Use" options={USE_OPTIONS} />,
  },
  {
    id: "issueDate",
    header: "Issue Date",
    width: 150,
    search: false,
    filter: { type: "dateRange" },
    text: (row) => formatDateISTShort(row.issueDate),
    cell: (row) => <DateCell row={row} field="issueDate" label="Issue Date" />,
  },
  {
    id: "signingDate",
    header: "Signing Date",
    width: 150,
    search: false,
    filter: { type: "dateRange" },
    text: (row) => formatDateISTShort(row.signingDate),
    cell: (row) => <DateCell row={row} field="signingDate" label="Signing Date" />,
  },
];

const getRowId = (row: Row) => row.id;

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);

function extensionOf(url: string): string {
  try {
    return /\.[^./]+$/.exec(new URL(url, "http://x").pathname)?.[0].toLowerCase() ?? "";
  } catch {
    return "";
  }
}

function FilePreview({ url }: { url: string }) {
  const extension = extensionOf(url);
  if (extension === ".pdf") {
    return <iframe key={url} src={url} title="Certificate preview" className="size-full border-0" />;
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return <img src={url} alt="Certificate" className="mx-auto block h-auto max-w-full" />;
  }
  return (
    <p className="p-6 text-center text-ink-2">
      No inline preview for {extension || "this file"}. Open it in a new tab.
    </p>
  );
}

function PreviewPanel({ row, onClose }: { row: Row; onClose: () => void }) {
  const name = row.certificateName ?? "Certificate";
  const url = row.certificateUrl ?? "";
  return (
    <aside
      aria-label="Certificate preview"
      className="flex min-h-0 w-[46%] max-w-240 shrink-0 flex-col overflow-hidden rounded-xl bg-surface card"
    >
      <header className="flex shrink-0 items-center gap-1 border-b px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-medium" title={name}>
          {name}
        </span>
        <NewTabLink url={url} />
        <IconButton label="Close preview" size="sm" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <FilePreview url={url} />
      </div>
    </aside>
  );
}

export function PerformanceCertificatesView() {
  const dispatch = useAppDispatch();
  const { rows, loading, error, partyNames, utilityNames } = useAppSelector(
    (s) => s.performanceCertificates,
  );
  const itemRows = useAppSelector((s) => s.items.rows);
  const [preview, setPreview] = useState<Row | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const role = useSession().data?.user?.role;
  // Use / Not Use is for admins; the server hides Not Use rows from everyone else.
  const columns = useMemo(
    () =>
      role === "admin" || role === "developer"
        ? allColumns
        : allColumns.filter((c) => c.id !== "useNotUse"),
    [role],
  );
  const { table, filtered } = useClientTable(rows, columns);

  useEffect(() => {
    if (rows.length === 0) dispatch(fetchPerformanceCertificates());
    if (partyNames.length === 0) dispatch(fetchSupplyPartyNames());
    if (utilityNames.length === 0) dispatch(fetchUtilityPartyNames());
    if (itemRows.length === 0) dispatch(fetchItems());
  }, [dispatch, rows.length, partyNames.length, utilityNames.length, itemRows.length]);

  const partyOptions = useMemo(
    () => partyNames.map((name) => ({ value: name, label: name })),
    [partyNames],
  );
  const utilityOptions = useMemo(
    () => utilityNames.map((name) => ({ value: name, label: name })),
    [utilityNames],
  );
  const itemOptions = useMemo(() => {
    const schedules = new Set<string>();
    for (const item of itemRows) {
      const schedule = item.itemSchedule?.trim();
      if (schedule) schedules.add(schedule);
    }
    return [...schedules].map((value) => ({ value, label: value }));
  }, [itemRows]);
  const context = useMemo(
    () => ({ preview, setPreview, partyOptions, utilityOptions, itemOptions }),
    [preview, partyOptions, utilityOptions, itemOptions],
  );

  // The previewed row's place in the filtered list, so a row that drops out of
  // the filter can hand the preview to the row that takes its place.
  const previewIndex = useRef(-1);

  const closePreview = () =>
    setPreview((current) => {
      if (!current) return null;
      const index = filtered.findIndex((r) => r.id === current.id);
      return index < 0 ? null : (filtered.slice(index + 1).find((r) => r.certificateUrl) ?? null);
    });

  // A filter or a cell edit can drop the previewed row; open the next one.
  useEffect(() => {
    if (!preview) {
      previewIndex.current = -1;
      return;
    }
    const index = filtered.findIndex((r) => r.id === preview.id);
    if (index >= 0) {
      previewIndex.current = index;
      return;
    }
    setPreview(
      previewIndex.current < 0
        ? null
        : (filtered.slice(previewIndex.current).find((r) => r.certificateUrl) ?? null),
    );
  }, [preview, filtered]);

  const analyzeDates = async () => {
    setAnalyzing(true);
    try {
      const { jobs, files } = await publishPerformanceCertificateJobs();
      toast.success(say.analysisStarted(jobs, files));
      dispatch(fetchPerformanceCertificates());
    } catch (err) {
      toastError(say.couldNot("start the analysis"), err);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading && rows.length === 0) return <PageSkeleton label="certificates" />;

  return (
    <Page>
      <PageHeader
        title="Performance Certificates"
        meta={`${table.total.toLocaleString("en-IN")} matching`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Sparkles className="size-3.5" />}
              loading={analyzing}
              onClick={analyzeDates}
            >
              Analyze Certificate
            </Button>
            <Button
              variant="primary"
              icon={<Upload className="size-3.5" />}
              onClick={() => setUploading(true)}
            >
              Upload certificate
            </Button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 gap-3">
        <PageContext value={context}>
          <DataTable<Row>
            noun="certificates"
            columns={columns}
            getRowId={getRowId}
            loading={loading}
            error={error}
            onRetry={() => dispatch(fetchPerformanceCertificates())}
            {...table}
          />
        </PageContext>
        {preview && <PreviewPanel row={preview} onClose={closePreview} />}
      </div>
      <UploadCertificateDialog open={uploading} onOpenChange={setUploading} />
    </Page>
  );
}
