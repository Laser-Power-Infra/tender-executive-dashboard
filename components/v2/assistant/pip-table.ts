import { localDay, refName, type FilterRef } from "@/components/v2/data-table/filter-formula";
import type { FilterOption } from "@/components/v2/data-table/types";

/**
 * The page's table, as Pip sees it. Every v2 page has one DataTable, which
 * registers here while mounted; Pip writes filter formulas against it, so
 * whatever Pip sets goes through the same checks as a typed formula.
 */
export interface PipTable {
  refs: FilterRef[];
  /** The live filters as a formula. */
  current(): string;
  /** Replaces every filter; "" clears them. Returns why it cannot, if it cannot. */
  apply(formula: string): Promise<string[]>;
  /** The options a list column takes, loading them if needed; null if it is not one. */
  values(column: string): Promise<FilterOption[] | null>;
  /** The rows on screen now. */
  rows?(): Record<string, unknown>[];
  /** Fetches the rows again, after Pip edits one. */
  reload?(): void;
}

let table: PipTable | null = null;

export function registerPipTable(t: PipTable): () => void {
  table = t;
  return () => {
    if (table === t) table = null;
  };
}

export const pipTable = () => table;

const MAX_VALUES = 30;
const MAX_ROWS = 30;
const MAX_BRIEF = 80;

// shortcut: reads tender keys off a generic row; add a per-page row summary when another table needs Pip edits.
function describeRows(rows: Record<string, unknown>[]): string[] {
  const tenders = rows.filter((r) => r.referenceNo);
  if (!tenders.length) return [];
  const lines = tenders.slice(0, MAX_ROWS).map((r) => {
    const brief = String(r.tenderBrief ?? "").trim();
    const cat = [r.category, r.subCategory].filter(Boolean).join(" / ");
    return `- ${r.referenceNo} | ${brief.length > MAX_BRIEF ? `${brief.slice(0, MAX_BRIEF)}...` : brief} | ${cat || "no category"}`;
  });
  if (tenders.length > MAX_ROWS) lines.push(`... and ${tenders.length - MAX_ROWS} more; filter to narrow.`);
  return [`Rows on screen (${tenders.length}): reference no | brief | category:`, ...lines];
}

function kind(ref: FilterRef): string {
  const f = ref.filter;
  if (f?.type === "select") return "list (IN; call list_filter_values for its values)";
  if (f?.type === "dateRange") {
    const presets = f.presets?.map((p) => p.value).join(", ");
    return `date (BETWEEN, BEFORE, AFTER, >=, <=, = TODAY${presets ? `; presets with IN: ${presets}` : ""})`;
  }
  if (f?.type === "boolean") return "yes/no (= YES, = NO)";
  if (f?.type === "custom" && f.stateKey === "numberRange") return "number (BETWEEN, >=, <=)";
  if (f?.type === "custom") return `raw ${f.stateKey} = {json}`;
  return "";
}

/** `"true" (Yes)`: the value to write, and what people call it. */
export const showOption = (o: FilterOption) =>
  o.label && o.label !== o.value ? `${JSON.stringify(o.value)} (${o.label})` : JSON.stringify(o.value);

/**
 * Pip's IN values against a column's options. A value is kept as is, or taken
 * as the option whose value or label it names in any case ("YES" is "true"
 * when the option reads "Yes"). Anything else is unknown.
 */
export function fitValues(values: string[], options: FilterOption[]): { values: string[]; unknown: string[] } {
  const key = (s: string) => s.trim().toLowerCase();
  const out: string[] = [];
  const unknown: string[] = [];
  for (const v of values) {
    const hit =
      options.find((o) => o.value === v) ?? options.find((o) => key(o.value) === key(v) || key(o.label) === key(v));
    if (hit) out.push(hit.value);
    else unknown.push(v);
  }
  return { values: out, unknown };
}

/** The table's filters as plain text for Pip's instructions. */
export function describeTable(t: PipTable | null, today = localDay(new Date())): string {
  if (!t) return "This page has no table to filter.";
  const lines = t.refs.flatMap((ref) => {
    const how = [kind(ref), ref.search ? "text search (CONTAINS)" : ""].filter(Boolean).join("; ");
    if (!how) return [];
    const options = ref.filter?.type === "select" ? ref.filter.options : undefined;
    const values = options?.length
      ? ` Known values: ${options.slice(0, MAX_VALUES).map(showOption).join(", ")}${options.length > MAX_VALUES ? ", ..." : ""}`
      : "";
    return `- [${refName(ref, t.refs)}]: ${how}.${ref.hint ? ` Meaning: ${ref.hint}.` : ""}${values}`;
  });
  return [
    `Today is ${today}.`,
    "Filterable columns:",
    ...lines,
    `Current filter: ${t.current() || "(none)"}`,
    ...describeRows(t.rows?.() ?? []),
  ].join("\n");
}
