"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { StackedCell } from "@/components/v2/data-table/cells";
import { DataTable } from "@/components/v2/data-table/data-table";
import type {
  ColumnFilterState,
  ColumnFilterType,
  DataTableColumn,
} from "@/components/v2/data-table/types";
import { Button } from "@/components/v2/ui/button";
import { describeError } from "@/components/v2/ui/errors";
import { Badge, type Tone } from "@/components/v2/ui/field";
import { Page, PageHeader, PageSkeleton } from "@/components/v2/ui/page";

interface ActivityLog {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  tableName: string;
  recordId: string | null;
  referenceNo: string | null;
  details: string | null;
  createdAt: string;
}

const PAGE_SIZE = 20;
const PAGE_SIZES = [PAGE_SIZE];

const ACTION_TONES: Record<string, Tone> = {
  CREATE: "accent",
  UPDATE: "neutral",
  DELETE: "bad",
};

const TABLES = [
  "Tender",
  "GemTender",
  "NonGemTender",
  "ColumnMapping",
  "ColumnGroup",
  "TenderAssociation",
  "UtilityMapping",
  "User",
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

// The server pages and filters this log, and only by user, table and reference number.
const fixed = { search: false, sortable: false } as const;

const columns: DataTableColumn<ActivityLog>[] = [
  { id: "createdAt", header: "Date & Time", width: 210, ...fixed, text: (r) => formatDateTime(r.createdAt) },
  {
    // "Contains" here also matches the email and the reference number.
    id: "user",
    header: "User",
    width: 240,
    sortable: false,
    cell: (r) => <StackedCell primary={r.userName || "Unknown"} secondary={r.userEmail ?? undefined} />,
  },
  {
    id: "action",
    header: "Action",
    width: 110,
    ...fixed,
    cell: (r) => <Badge tone={ACTION_TONES[r.action] ?? "neutral"}>{r.action}</Badge>,
  },
  {
    id: "tableName",
    header: "Table",
    width: 170,
    ...fixed,
    filter: { type: "select", options: TABLES.map((t) => ({ value: t, label: t })) },
  },
  { id: "referenceNo", header: "Reference No", width: 220, sortable: false, text: (r) => r.referenceNo ?? "" },
  { id: "details", header: "Details", width: 460, ...fixed, text: (r) => r.details ?? "" },
];

const getRowId = (row: ActivityLog) => row.id;
const noop = () => {};

export function ActivityView() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [user, setUser] = useState("");
  const [table, setTable] = useState("");
  const [ref, setRef] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (user) params.set("user", user);
    if (table) params.set("table", table);
    if (ref) params.set("ref", ref);

    setLoading(true);
    fetch(`/api/activity?${params}`, { signal: abort.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        const data: { logs: ActivityLog[]; total: number } = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
        setError(null);
      })
      .catch(async (err) => {
        if (abort.signal.aborted) return;
        setError(await describeError(err));
      })
      .finally(() => {
        if (abort.signal.aborted) return;
        setLoading(false);
        setLoaded(true);
      });
    return () => abort.abort();
  }, [page, user, table, ref, refresh]);

  const reload = useCallback(() => setRefresh((n) => n + 1), []);

  const filters = useMemo(() => {
    const out: Record<string, ColumnFilterState> = {};
    if (user) out.user = { text: user };
    if (table) out.tableName = { select: [table] };
    if (ref) out.referenceNo = { text: ref };
    return out;
  }, [user, table, ref]);

  const onFilterChange = useCallback(
    (columnId: string, type: ColumnFilterType, value: unknown | undefined) => {
      if (columnId === "user" && type === "text") setUser((value as string | undefined) ?? "");
      if (columnId === "referenceNo" && type === "text") setRef((value as string | undefined) ?? "");
      // One table at a time: the newest pick replaces the last.
      if (columnId === "tableName" && type === "select") {
        setTable((value as string[] | undefined)?.at(-1) ?? "");
      }
      setPage(1);
    },
    [],
  );

  const onResetFilters = useCallback(() => {
    setUser("");
    setTable("");
    setRef("");
    setPage(1);
  }, []);

  if (!loaded) return <PageSkeleton label="activity log" />;

  return (
    <Page>
      <PageHeader
        title="Activity Log"
        meta={`${total.toLocaleString("en-IN")} records`}
        actions={
          <Button icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={reload}>
            Refresh
          </Button>
        }
      />
      <DataTable<ActivityLog>
        noun="records"
        columns={columns}
        rows={logs}
        getRowId={getRowId}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        pageSizeOptions={PAGE_SIZES}
        onPageChange={setPage}
        onPageSizeChange={noop}
        sort={null}
        onSortChange={noop}
        filters={filters}
        onFilterChange={onFilterChange}
        onResetFilters={onResetFilters}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        loading={loading}
        error={error}
        onRetry={reload}
      />
    </Page>
  );
}
