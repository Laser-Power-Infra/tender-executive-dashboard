import type { ColumnFilter, ColumnFilterState, DataTableColumn } from "./types";
import { leafColumns } from "./types";

/**
 * A page's column filters as text people can copy, keep and paste back:
 *
 *   [Status] IN ("Open", "Closed")
 *   AND [Bid End Date] BETWEEN 2026-01-01 AND 2026-03-31
 *   AND [Party] CONTAINS "abc"
 *   AND [AI Yes] = YES
 *
 * TODAY stands for the day the formula is applied, so a saved formula moves
 * with the calendar: `[Deadline] = TODAY`, `[Deadline] >= TODAY`.
 *
 * Parsing checks every clause against the page's own columns, so a formula
 * copied from another page is refused instead of half applied.
 */

type Filters = Record<string, ColumnFilterState>;

/** A filter target on this page: a column or one of its extra filters. */
export interface FilterRef {
  id: string;
  name: string;
  filter?: ColumnFilter;
  /** Takes a "contains" search. */
  search: boolean;
  /** Further checks on the parsed value; returns why it cannot be applied. */
  check?: (state: ColumnFilterState) => string | null;
}

export function filterRefs<Row>(columns: DataTableColumn<Row>[]): FilterRef[] {
  const refs: FilterRef[] = [];
  for (const c of leafColumns(columns)) {
    refs.push({
      id: c.id,
      name: c.header,
      filter: c.filter,
      search: c.search !== false || (c.filter?.type === "select" && !!c.filter.searchAsText),
    });
    for (const e of c.extraFilters ?? []) {
      refs.push({ id: e.id, name: e.label, filter: { type: "select", options: e.options }, search: false });
    }
  }
  return refs;
}

const key = (s: string) => s.trim().toLowerCase();

/** Header when it names one target only, else the id. */
export function refName(ref: FilterRef, refs: FilterRef[]): string {
  const same = refs.filter((r) => key(r.name) === key(ref.name));
  return same.length === 1 && ref.name && !ref.name.includes("]") ? ref.name : ref.id;
}

const q = (s: string) => JSON.stringify(s);
/** Dates and numbers read better bare. */
const bare = (s: string) => (/^[\d.:-]+$/.test(s) ? s : q(s));

function range(name: string, from: string, to: string): string | null {
  if (from && to) return `[${name}] BETWEEN ${bare(from)} AND ${bare(to)}`;
  if (from) return `[${name}] >= ${bare(from)}`;
  if (to) return `[${name}] <= ${bare(to)}`;
  return null;
}

export function formatFilters(filters: Filters, refs: FilterRef[]): string {
  const clauses: string[] = [];
  for (const ref of refs) {
    const state = filters[ref.id];
    if (!state) continue;
    const name = refName(ref, refs);
    for (const [k, v] of Object.entries(state) as [keyof ColumnFilterState, unknown][]) {
      if (v === undefined || v === null) continue;
      let clause: string | null = null;
      if (k === "text") clause = v ? `[${name}] CONTAINS ${q(v as string)}` : null;
      else if (k === "select") {
        const values = v as string[];
        clause = values.length ? `[${name}] IN (${values.map(q).join(", ")})` : null;
      } else if (k === "dateRange") {
        const d = v as NonNullable<ColumnFilterState["dateRange"]>;
        clause = range(name, d.startDate, d.endDate);
      } else if (k === "numberRange") {
        const n = v as NonNullable<ColumnFilterState["numberRange"]>;
        clause = range(name, n.min, n.max);
      } else if (k === "boolean") clause = `[${name}] = ${v ? "YES" : "NO"}`;
      else clause = `[${name}] ${k} = ${JSON.stringify(v)}`;
      if (clause) clauses.push(clause);
    }
  }
  return clauses.join("\nAND ");
}

/* --------------------------------- Parsing ---------------------------------- */

type Token =
  | { t: "ref" | "str" | "word" | "json"; v: string }
  | { t: "sym"; v: "(" | ")" | "," | "=" | ">=" | "<=" };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "[") {
      const end = text.indexOf("]", i);
      if (end < 0) throw new Error("A column name is missing its closing ]");
      out.push({ t: "ref", v: text.slice(i + 1, end) });
      i = end + 1;
    } else if (ch === '"' || ch === "{") {
      // Scan to the matching quote or brace, stepping over escapes and strings.
      const start = i;
      let depth = 0;
      let inStr = false;
      for (; i < text.length; i++) {
        const c = text[i];
        if (inStr) {
          if (c === "\\") i++;
          else if (c === '"') {
            inStr = false;
            if (ch === '"') break;
          }
        } else if (c === '"') inStr = true;
        else if (c === "{") depth++;
        else if (c === "}" && --depth === 0) break;
      }
      if (i >= text.length) {
        throw new Error(ch === '"' ? "A quoted value is missing its closing quote" : "A { value } is not closed");
      }
      i++;
      const raw = text.slice(start, i);
      if (ch === "{") out.push({ t: "json", v: raw });
      else {
        try {
          out.push({ t: "str", v: JSON.parse(raw) });
        } catch {
          throw new Error(`Bad quoted value ${raw}`);
        }
      }
    } else if (text.startsWith(">=", i) || text.startsWith("<=", i)) {
      out.push({ t: "sym", v: text.slice(i, i + 2) as ">=" | "<=" });
      i += 2;
    } else if ("(),=".includes(ch)) {
      out.push({ t: "sym", v: ch as "(" | ")" | "," | "=" });
      i++;
    } else {
      const m = /^[^\s()[\]",={}<>]+/.exec(text.slice(i));
      if (!m) throw new Error(`Unexpected "${ch}"`);
      out.push({ t: "word", v: m[0] });
      i += m[0].length;
    }
  }
  return out;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local calendar day, the format the date range filter stores. */
export const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function isRealDay(s: string): boolean {
  const m = ISO_DAY.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function resolveRef(name: string, refs: FilterRef[]): FilterRef | undefined {
  const byName = refs.filter((r) => key(r.name) === key(name));
  return byName.length === 1 ? byName[0] : refs.find((r) => r.id === name.trim());
}

/**
 * Reads a formula against this page's filters. Nothing is returned to apply
 * unless `errors` is empty.
 */
export function parseFilters(
  text: string,
  refs: FilterRef[],
  today = localDay(new Date()),
): { filters: Filters; errors: string[] } {
  const filters: Filters = {};
  const errors: string[] = [];
  let tokens: Token[];
  try {
    tokens = tokenize(text);
  } catch (e) {
    return { filters, errors: [(e as Error).message] };
  }
  if (tokens.length === 0) return { filters, errors: ["The formula is empty"] };

  let i = 0;
  const peek = () => tokens[i];
  const isWord = (t: Token | undefined, w: string) => t?.t === "word" && t.v.toUpperCase() === w;
  const isSym = (t: Token | undefined, s: string) => t?.t === "sym" && t.v === s;
  const fail = (what: string): never => {
    const at = peek();
    throw new Error(`Expected ${what}${at ? ` near ${at.t === "ref" ? `[${at.v}]` : at.v}` : " at the end"}`);
  };
  const value = (): string => {
    const t = tokens[i];
    if (t?.t === "str" || t?.t === "word") {
      i++;
      return t.v;
    }
    return fail("a value");
  };

  const set = (ref: FilterRef, k: keyof ColumnFilterState, v: unknown) => {
    filters[ref.id] = { ...filters[ref.id], [k]: v };
  };

  /** Range clause: the column decides whether it reads dates or numbers. */
  const setRange = (ref: FilterRef, label: string, from: string, to: string) => {
    const f = ref.filter;
    if (f?.type === "dateRange") {
      [from, to] = [from, to].map((d) => (d.toUpperCase() === "TODAY" ? today : d));
      const bad = [from, to].filter((d) => d && !isRealDay(d));
      if (bad.length) errors.push(`${label}: ${bad.join(", ")} is not a date (use YYYY-MM-DD)`);
      else set(ref, "dateRange", { startDate: from, endDate: to });
    } else if (f?.type === "custom" && f.stateKey === "numberRange") {
      const bad = [from, to].filter((n) => n && !Number.isFinite(Number(n)));
      if (bad.length) errors.push(`${label}: ${bad.join(", ")} is not a number`);
      else set(ref, "numberRange", { min: from, max: to });
    } else errors.push(`${label} has no date or number range filter`);
  };

  try {
    while (i < tokens.length) {
      const head = peek();
      if (head.t !== "ref") fail("a [column]");
      i++;
      const name = head.v;
      const label = `[${name}]`;
      const ref = resolveRef(name, refs);
      if (!ref) errors.push(`${label} is not a column on this page`);
      // Parse the clause even for an unknown column, so later clauses still get checked.
      const op = peek();

      if (isWord(op, "CONTAINS")) {
        i++;
        const v = value();
        if (ref && !ref.search) errors.push(`${label} cannot be searched with CONTAINS`);
        else if (ref) set(ref, "text", v);
      } else if (isWord(op, "IN")) {
        i++;
        if (!isSym(peek(), "(")) fail("(");
        i++;
        const values = [value()];
        while (isSym(peek(), ",")) {
          i++;
          values.push(value());
        }
        if (!isSym(peek(), ")")) fail(")");
        i++;
        const f = ref?.filter;
        if (!ref) {
          // already reported
        } else if (f?.type === "select") set(ref, "select", values);
        else if (f?.type === "dateRange" && f.presets) {
          const known = new Set(f.presets.map((p) => p.value));
          const bad = values.filter((v) => !known.has(v));
          if (bad.length) errors.push(`${label}: unknown preset ${bad.map(q).join(", ")}`);
          else if (values.length > 1) errors.push(`${label} takes one preset only`);
          else set(ref, "select", values);
        } else errors.push(`${label} has no list of values to pick with IN`);
      } else if (isWord(op, "BETWEEN")) {
        i++;
        const from = value();
        if (!isWord(peek(), "AND")) fail("AND");
        i++;
        const to = value();
        if (ref) setRange(ref, label, from, to);
      } else if (isSym(op, ">=") || isSym(op, "<=")) {
        i++;
        const v = value();
        if (ref) setRange(ref, label, op.v === ">=" ? v : "", op.v === "<=" ? v : "");
      } else if (isSym(op, "=")) {
        i++;
        const v = value().toUpperCase();
        if (v === "TODAY") {
          if (ref && ref.filter?.type !== "dateRange") errors.push(`${label} has no date filter`);
          else if (ref) setRange(ref, label, v, v);
        } else if (v !== "YES" && v !== "NO") errors.push(`${label}: use = YES, = NO or = TODAY`);
        else if (ref && ref.filter?.type !== "boolean") errors.push(`${label} has no Yes/No filter`);
        else if (ref) set(ref, "boolean", v === "YES");
      } else if (op?.t === "word" && isSym(tokens[i + 1], "=")) {
        // Any other filter kind, written as its raw value: [Col] rawMaterials = {...}
        i += 2;
        const json = peek();
        if (json?.t !== "json") fail("a { value }");
        i++;
        const f = ref?.filter;
        if (!ref) {
          // already reported
        } else if (f?.type !== "custom" || f.stateKey !== op.v) {
          errors.push(`${label} has no ${op.v} filter`);
        } else {
          try {
            set(ref, f.stateKey, JSON.parse((json as { v: string }).v));
          } catch {
            errors.push(`${label}: ${op.v} value is not valid JSON`);
          }
        }
      } else fail("CONTAINS, IN, BETWEEN, >=, <= or =");

      if (i < tokens.length) {
        if (!isWord(peek(), "AND")) fail("AND");
        i++;
        if (i >= tokens.length) fail("a [column]");
      }
    }
  } catch (e) {
    errors.push((e as Error).message);
  }
  for (const ref of refs) {
    const problem = filters[ref.id] && ref.check?.(filters[ref.id]);
    if (problem) errors.push(`[${ref.name}]: ${problem}`);
  }
  return { filters, errors };
}
