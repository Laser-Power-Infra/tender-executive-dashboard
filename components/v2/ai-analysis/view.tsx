"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceStrict } from "date-fns";
import { signIn, useSession } from "next-auth/react";
import { useIsDeveloper } from "@/components/v2/providers";
import { toast } from "sonner";
import { AlertTriangle, Ban, Check, Circle, Clock, LogIn, Radio, RefreshCw, RotateCcw, X } from "lucide-react";
import { requeueStage } from "@/actions/ai-analysis";
import {
  fetchLifecycleCounts,
  fetchLifecycleTenders,
  type LifecycleTender,
  type LifecycleTenderFilter,
} from "@/actions/tender-lifecycle";
import {
  LIFECYCLE_MAIN_STAGES,
  LIFECYCLE_STAGE_INFO,
  LIFECYCLE_SLOW_MS as SLOW_MS,
  TENDER_LIFECYCLE_STATUS,
  type LifecycleCounts,
  type LifecycleMainStage,
  type LifecycleStageCount,
} from "@/lib/tender-lifecycle";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/v2/data-table/data-table";
import type { ColumnFilterType, DataTableColumn } from "@/components/v2/data-table/types";
import { Button, IconButton } from "@/components/v2/ui/button";
import { describeError } from "@/components/v2/ui/errors";
import { Badge, Dash } from "@/components/v2/ui/field";
import { EmptyState, Page, PageHeader, PageSkeleton, StatTile } from "@/components/v2/ui/page";
import { say } from "@/lib/pip-says";

const POLL_MS = 5_000;
const PAGE_SIZE = 50;
const PAGE_SIZES = [PAGE_SIZE];

type RequeueFrom = Parameters<typeof requeueStage>[1];

const STAGES = LIFECYCLE_STAGE_INFO;

const fmt = (n: number) => n.toLocaleString("en-IN");

/** A status in words, e.g. "Waiting for Documents". */
function statusLabel(status: string | null): string {
  if (!status || status === "NEW") return "Not started";
  if (status === "COMPLETED") return "Completed";
  if (status === "RELEVANCE_REJECTED") return "Rejected as not relevant";
  const [stage, state] = status.split("_") as [LifecycleMainStage, string];
  const label = STAGES[stage]?.label ?? stage;
  return state === "QUEUED" ? `Waiting for ${label}` : `Failed at ${label}`;
}

const FILTER_OPTIONS = Object.values(TENDER_LIFECYCLE_STATUS).map((value) => ({
  value,
  label: statusLabel(value),
}));

/** Loads once signed in, then again on demand. */
function useLifecycleCounts(signedIn: boolean) {
  const [counts, setCounts] = useState<LifecycleCounts | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);

  const load = useCallback(async () => {
    // A slow answer must not pile requests up behind it: this tick is skipped.
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      setCounts(await fetchLifecycleCounts());
      setUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      setError(await describeError(err));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  // The action rejects a signed-out caller, so it is not called at all.
  useEffect(() => {
    if (signedIn) load();
  }, [signedIn, load]);

  return { counts, updatedAt, error, loading, load };
}

/** One page of tenders with the picked status; reloads when `tick` moves. */
function useLifecycleTenders(signedIn: boolean, filter: LifecycleTenderFilter, page: number, tick: number) {
  const [tenders, setTenders] = useState<LifecycleTender[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    if (!signedIn) return;
    const id = ++latest.current;
    setLoading(true);
    fetchLifecycleTenders(filter, page)
      .then((res) => {
        if (id !== latest.current) return;
        setTenders(res.tenders);
        setTotal(res.total);
        setError(null);
      })
      .catch(async (err) => {
        if (id === latest.current) setError(await describeError(err));
      })
      .finally(() => {
        if (id === latest.current) setLoading(false);
      });
  }, [signedIn, filter, page, tick]);

  return { tenders, total, loading, error };
}

interface Part {
  label: string;
  value: number;
  /** Background class of the bar segment and the legend dot. */
  fill: string;
}

/** Parts of a whole on one line. Empty parts take no room. */
function SegmentBar({ parts, className }: { parts: Part[]; className?: string }) {
  return (
    <div
      role="img"
      aria-label={parts.map((p) => `${p.label} ${fmt(p.value)}`).join(", ")}
      className={cn("flex gap-px overflow-hidden rounded-full bg-sunken", className)}
    >
      {parts.map(
        (p) =>
          p.value > 0 && (
            <span
              key={p.label}
              title={`${p.label}: ${fmt(p.value)}`}
              style={{ flexGrow: p.value }}
              className={cn(
                "min-w-0.5 basis-0 transition-[flex-grow] duration-500 ease-out motion-reduce:transition-none",
                p.fill,
              )}
            />
          ),
      )}
    </div>
  );
}

function Legend({ parts }: { parts: Part[] }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      {parts.map((p) => (
        <div key={p.label} className="flex flex-col">
          <dt className="flex items-center gap-1.5 text-xs text-ink-2">
            <span className={cn("size-2 rounded-full", p.fill)} aria-hidden />
            {p.label}
          </dt>
          <dd className="type-stat tabular-nums">{fmt(p.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="hairline shrink-0 rounded-xl bg-surface">
      <header className="flex min-h-9 flex-wrap items-center gap-x-3 px-4">
        <h2 className="font-medium">{title}</h2>
        {aside && <span className="ml-auto text-xs text-ink-3">{aside}</span>}
      </header>
      <div className="border-t">{children}</div>
    </section>
  );
}

const TH = "type-label px-3 py-1.5 text-right align-bottom font-medium text-ink-3";
const TD = "border-t px-3 py-2.5 text-right align-middle tabular-nums";

/** A column header with what its number means underneath. */
function Head({ label, meaning, className }: { label: string; meaning: string; className?: string }) {
  return (
    <th scope="col" className={cn(TH, className)}>
      <span className="block">{label}</span>
      <span className="block text-3xs font-normal normal-case tracking-normal text-ink-3">{meaning}</span>
    </th>
  );
}

/** A count that filters the tender list to its status when clicked. */
function CountButton({
  value,
  selected,
  onClick,
  children,
}: {
  value: number;
  selected: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  if (value === 0) return <span className="text-ink-3">0</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title="Show these tenders below"
      className={cn(
        "rounded-md px-1.5 py-0.5 underline-offset-2 hover:underline",
        selected && "bg-accent-soft text-accent-ink",
      )}
    >
      {children ?? fmt(value)}
    </button>
  );
}

/** Where each stage is right now: one line per stage, plain counts. */
function Stages({
  stages,
  now,
  filter,
  onFilter,
  onRequeue,
  requeuing,
}: {
  stages: LifecycleStageCount[];
  now: Date;
  filter: LifecycleTenderFilter;
  onFilter: (filter: LifecycleTenderFilter) => void;
  /** Developers only: send a stage's failed or slow tenders through it again. */
  onRequeue?: (stage: LifecycleMainStage, from: RequeueFrom) => void;
  /** `${stage}_${from}` of the requeue in flight. */
  requeuing: string | null;
}) {
  const requeueButton = (stage: LifecycleMainStage, from: RequeueFrom, label: string) =>
    onRequeue && (
      <IconButton size="sm" label={label} disabled={requeuing !== null} onClick={() => onRequeue(stage, from)}>
        <RotateCcw
          className={cn(
            "size-3.5",
            requeuing === `${stage}_${from}` &&
              "animate-spin [animation-direction:reverse] motion-reduce:animate-none",
          )}
        />
      </IconButton>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-separate border-spacing-0">
        <thead>
          <tr>
            <Head label="Stage" meaning="In pipeline order" className="pl-4 text-left" />
            <Head label="Waiting for reply" meaning="Job sent, worker has not answered" />
            <Head label="In queue now" meaning="Jobs no worker has picked up" />
            <Head label="Workers" meaning="Listening on the queue" />
            <Head label="Failed" meaning="Stopped with an error" />
            <Head label="Longest wait" meaning="Oldest job still waiting" className="pr-4" />
          </tr>
        </thead>
        <tbody>
          {stages.map((row, i) => {
            const { label, detail } = STAGES[row.stage];
            const waited = row.oldestQueued ? now.getTime() - new Date(row.oldestQueued).getTime() : 0;
            const slow = waited > SLOW_MS;
            const queuedStatus = `${row.stage}_QUEUED` as LifecycleTenderFilter;
            const failedStatus = `${row.stage}_FAILED` as LifecycleTenderFilter;
            // Waiting jobs that are neither in the queue nor with a worker were lost.
            const stuck = row.queued > 0 && row.queue && row.queue.ready === 0 && row.queue.workers === 0;
            return (
              <tr key={row.stage}>
                <th scope="row" className="border-t py-2.5 pl-4 pr-3 text-left font-normal">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-sunken text-3xs font-semibold tabular-nums text-ink-2">
                      {i + 1}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{label}</span>
                      <span className="text-xs text-ink-3">{detail}</span>
                      {stuck && (
                        <span className="text-xs text-warn">
                          Jobs were sent, but none is queued and no worker is running
                        </span>
                      )}
                    </span>
                  </div>
                </th>
                <td className={cn(TD, "font-semibold")}>
                  <span className="inline-flex items-center gap-1">
                    <CountButton
                      value={row.queued}
                      selected={filter === queuedStatus}
                      onClick={() => onFilter(queuedStatus)}
                    />
                    {row.queued > 0 &&
                      slow &&
                      requeueButton(
                        row.stage,
                        "QUEUED",
                        `Requeue tenders waiting over ${formatDistanceStrict(0, SLOW_MS)} in ${label}`,
                      )}
                  </span>
                </td>
                <td className={cn(TD, "text-ink-2")}>{row.queue ? fmt(row.queue.ready) : <Dash />}</td>
                <td className={TD}>
                  {!row.queue ? (
                    <Dash />
                  ) : row.queue.workers === 0 ? (
                    <Badge tone="warn">None running</Badge>
                  ) : (
                    <span className="text-ink-2">{fmt(row.queue.workers)}</span>
                  )}
                </td>
                <td className={TD}>
                  <span className="inline-flex items-center gap-1">
                    <CountButton
                      value={row.failed}
                      selected={filter === failedStatus}
                      onClick={() => onFilter(failedStatus)}
                    >
                      <Badge tone="bad">{fmt(row.failed)}</Badge>
                    </CountButton>
                    {row.failed > 0 &&
                      requeueButton(row.stage, "FAILED", `Requeue ${fmt(row.failed)} failed in ${label}`)}
                  </span>
                </td>
                <td className={cn(TD, "pr-4")}>
                  {row.oldestQueued ? (
                    <span
                      className={cn("inline-flex items-center gap-1", slow ? "font-medium text-warn" : "text-ink-2")}
                    >
                      {slow && <Clock className="size-3" aria-hidden />}
                      {formatDistanceStrict(new Date(row.oldestQueued), now)}
                    </span>
                  ) : (
                    <Dash />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type StepState = "done" | "current" | "failed" | "rejected" | "todo";

const STEP_ICON: Record<StepState, { icon: typeof Check; className: string; word: string }> = {
  done: { icon: Check, className: "bg-good-soft text-good", word: "done" },
  current: { icon: Clock, className: "bg-accent-soft text-accent-ink", word: "waiting" },
  failed: { icon: X, className: "bg-bad-soft text-bad", word: "failed" },
  rejected: { icon: Ban, className: "bg-sunken text-ink-2", word: "rejected" },
  todo: { icon: Circle, className: "bg-sunken text-ink-3", word: "not reached" },
};

/** Each stage's state for one tender. */
function steps(status: string | null): StepState[] {
  if (status === "COMPLETED") return LIFECYCLE_MAIN_STAGES.map(() => "done");
  if (status === "RELEVANCE_REJECTED") return LIFECYCLE_MAIN_STAGES.map((_, i) => (i === 0 ? "rejected" : "todo"));
  const [stage, state] = (status ?? "").split("_");
  const at = LIFECYCLE_MAIN_STAGES.indexOf(stage as LifecycleMainStage);
  return LIFECYCLE_MAIN_STAGES.map((_, i) =>
    at < 0 || i > at ? "todo" : i < at ? "done" : state === "FAILED" ? "failed" : "current",
  );
}

function Progress({ status }: { status: string | null }) {
  const states = steps(status);
  return (
    <span
      className="inline-flex items-center gap-1"
      aria-label={LIFECYCLE_MAIN_STAGES.map((s, i) => `${STAGES[s].label} ${STEP_ICON[states[i]].word}`).join(", ")}
    >
      {LIFECYCLE_MAIN_STAGES.map((stage, i) => {
        const { icon: Icon, className, word } = STEP_ICON[states[i]];
        return (
          <span
            key={stage}
            title={`${STAGES[stage].label}: ${word}`}
            className={cn("grid size-5 place-items-center rounded-full", className)}
          >
            <Icon className="size-3" aria-hidden />
          </span>
        );
      })}
    </span>
  );
}

const fixed = { search: false, sortable: false } as const;

function tenderColumns(now: Date): DataTableColumn<LifecycleTender>[] {
  return [
    { id: "referenceNo", header: "Reference No", width: 200, ...fixed, text: (r) => r.referenceNo ?? "" },
    { id: "tenderBrief", header: "Brief", width: 320, ...fixed, text: (r) => r.tenderBrief ?? "" },
    {
      id: "progress",
      header: "Progress",
      width: 130,
      ...fixed,
      cell: (r) => <Progress status={r.lifecycleStatus} />,
    },
    {
      id: "status",
      header: "Status",
      width: 220,
      sortable: false,
      filter: { type: "select", options: FILTER_OPTIONS },
      text: (r) => statusLabel(r.lifecycleStatus),
    },
    {
      id: "since",
      header: "Since",
      width: 130,
      ...fixed,
      text: (r) =>
        r.lifecycleUpdatedAt ? formatDistanceStrict(new Date(r.lifecycleUpdatedAt), now, { addSuffix: true }) : "",
    },
    { id: "lifecycleError", header: "Error", width: 380, ...fixed, text: (r) => r.lifecycleError ?? "" },
  ];
}

const getRowId = (row: LifecycleTender) => String(row.id);
const noop = () => {};

export function AiAnalysisView() {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const { counts, updatedAt, error, loading, load } = useLifecycleCounts(signedIn);
  const developer = useIsDeveloper();
  const [requeuing, setRequeuing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState<LifecycleTenderFilter>("ALL");
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const list = useLifecycleTenders(signedIn, filter, page, tick);

  const reloadAll = useCallback(() => {
    load();
    setTick((t) => t + 1);
  }, [load]);

  useEffect(() => {
    if (!live || !signedIn) return;
    const interval = setInterval(reloadAll, POLL_MS);
    return () => clearInterval(interval);
  }, [live, signedIn, reloadAll]);

  const pick = useCallback((next: LifecycleTenderFilter) => {
    setFilter((prev) => (prev === next ? "ALL" : next));
    setPage(1);
  }, []);

  const columns = useMemo(() => tenderColumns(updatedAt ?? new Date()), [updatedAt]);

  const requeue = (stage: LifecycleMainStage, from: RequeueFrom) => {
    setRequeuing(`${stage}_${from}`);
    toast.promise(
      requeueStage(stage, from).finally(() => {
        setRequeuing(null);
        reloadAll();
      }),
      {
        loading: say.requeueing(from === "FAILED" ? "failed" : "slow", STAGES[stage].label),
        success: ({ queued, notQueued }) =>
          notQueued > 0
            ? say.requeuedSome(queued, notQueued)
            : say.requeued(queued),
        error: async (err) => `${say.couldNot("requeue them")} ${await describeError(err)}`,
      },
    );
  };

  // Hold the spinner for five seconds so a fast refresh is still visible.
  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 5_000);
    reloadAll();
  };

  if (status === "unauthenticated") {
    return (
      <Page className="items-center justify-center">
        <EmptyState
          icon={LogIn}
          title="Sign in to see AI analysis status"
          action={<Button onClick={() => signIn()}>Sign in</Button>}
        />
      </Page>
    );
  }

  if (!counts || !updatedAt) {
    if (!error) return <PageSkeleton label="AI analysis" />;
    return (
      <Page className="items-center justify-center">
        <EmptyState
          icon={AlertTriangle}
          tone="bad"
          title="Could not load AI analysis status"
          description={error}
          action={<Button onClick={load}>Try again</Button>}
        />
      </Page>
    );
  }

  const inPipeline = counts.stages.reduce((sum, s) => sum + s.queued + s.failed, 0);
  const tiles: { filter: LifecycleTenderFilter; label: string; detail: string; value: number }[] = [
    { filter: "NEW", label: "Not started", detail: "never sent", value: counts.notStarted },
    { filter: "ALL", label: "In pipeline", detail: "waiting or failed", value: inPipeline },
    { filter: "RELEVANCE_REJECTED", label: "Rejected", detail: "not relevant", value: counts.rejected },
    { filter: "COMPLETED", label: "Completed", detail: "report saved", value: counts.completed },
  ];
  const parsing: Part[] = [
    { label: "Parsed", value: counts.parsing.completed, fill: "bg-good" },
    { label: "Pending", value: counts.parsing.pending, fill: "bg-accent" },
    { label: "Failed", value: counts.parsing.failed, fill: "bg-bad" },
    { label: "Not sent", value: counts.parsing.notSent, fill: "bg-sunken" },
  ];

  const onFilterChange = (columnId: string, type: ColumnFilterType, value: unknown | undefined) => {
    if (columnId !== "status" || type !== "select") return;
    // One status at a time: the newest pick replaces the last.
    setFilter(((value as string[] | undefined)?.at(-1) as LifecycleTenderFilter | undefined) ?? "ALL");
    setPage(1);
  };

  return (
    <Page className="overflow-y-auto">
      <PageHeader
        title="AI Analysis"
        meta={
          <span className="inline-flex items-center gap-2">
            {live && (
              <span className="inline-flex items-center gap-1.5 text-good">
                <span className="size-1.5 animate-pulse rounded-full bg-good motion-reduce:animate-none" />
                Live
              </span>
            )}
            Updated {updatedAt.toLocaleTimeString("en-IN")}
          </span>
        }
        actions={
          <>
            <Button
              aria-pressed={live}
              icon={<Radio className="size-3.5" />}
              className={cn(live && "bg-accent-soft text-accent-ink")}
              onClick={() => setLive(!live)}
            >
              Live update {live ? "on" : "off"}
            </Button>
            <Button
              icon={<RefreshCw className="size-3.5" />}
              // Live ticks would flicker the spinner every five seconds.
              loading={refreshing || (loading && !live)}
              onClick={refresh}
            >
              Refresh
            </Button>
          </>
        }
      />

      {error && (
        <p role="alert" className="text-bad">
          Last update failed: {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {tiles.map((t) => (
          <StatTile
            key={t.filter}
            label={t.label}
            detail={t.detail}
            value={fmt(t.value)}
            selected={filter === t.filter}
            onClick={() => pick(t.filter)}
          />
        ))}
      </div>

      <Panel title="Stages" aside={`A wait over ${formatDistanceStrict(0, SLOW_MS)} is marked as slow`}>
        <Stages
          stages={counts.stages}
          now={updatedAt}
          filter={filter}
          onFilter={pick}
          onRequeue={developer ? requeue : undefined}
          requeuing={requeuing}
        />
      </Panel>

      <Panel title="File parsing" aside="Per file, alongside ingestion">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-3 p-4">
          <Legend parts={parsing} />
          <SegmentBar parts={parsing} className="h-2 min-w-48 flex-1" />
        </div>
      </Panel>

      <section className="flex min-h-[28rem] shrink-0 flex-col">
        <DataTable<LifecycleTender>
          noun="tenders"
          columns={columns}
          rows={list.tenders}
          getRowId={getRowId}
          total={list.total}
          page={page}
          pageSize={PAGE_SIZE}
          pageSizeOptions={PAGE_SIZES}
          onPageChange={setPage}
          onPageSizeChange={noop}
          sort={null}
          onSortChange={noop}
          filters={filter === "ALL" ? {} : { status: { select: [filter] } }}
          onFilterChange={onFilterChange}
          onResetFilters={() => pick("ALL")}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          loading={list.loading}
          error={list.error}
          onRetry={reloadAll}
        />
      </section>
    </Page>
  );
}
