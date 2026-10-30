import { getProvenance, getProvenanceForFields } from "@/lib/columnProvenance";
import { formatDateISTLong } from "@/lib/format-ist";
import { formatRupees } from "@/lib/rupees";
import { REASON_FOR_NOT_APM_OPTIONS } from "@/lib/reason-for-not-apm";
import type { MergedGroup } from "@/lib/tender-query";
import type { TenderPageAssociation } from "@/lib/slices/tenderPageSlice";
import { Chips, Clamp, StackedCell, emdRangeFilter, valueRangeFilter } from "@/components/v2/data-table/cells";
import { BLANK, selectFilter } from "@/components/v2/data-table/types";
import type { DataTableColumn, FilterOption } from "@/components/v2/data-table/types";
import { Badge, Dash, Field, Input } from "@/components/v2/ui/field";
import {
  AgentReportCell,
  AiRelevanceCell,
  AssigneeCell,
  DecisionCell,
  DivisionCell,
  DocumentsCell,
  ParseStatusCell,
  PriceCell,
  RawMaterialsCell,
  ReasonNotApmCell,
  ReferenceCell,
  RemarksCell,
  ReportingsCell,
  SizeCell,
  WebsiteCell,
  locationText,
  type Row,
} from "./cells";
import type { ColumnIndexRow } from "./use-tenders";

type Column = DataTableColumn<Row>;

export { BLANK, selectFilter };

const normalizeKey = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

/** Sheet columns that never get a column of their own. */
const SKIP_COLUMNS = new Set([
  "sr. no.",
  "sr no",
  "s.no",
  "s. no",
  "serial no",
  "serial no.",
  "sn",
  "sno",
  "s r. n o.",
  "excluded category",
  "excludedcategory",
  "ai relevance",
  "ai relevance valid",
  "ai relevance reason",
  "searchkey",
  "ready",
  "remark",
  "quotationno",
  "quotation no",
  // Rendered inside the category column.
  "subcategory",
]);

const FROZEN = new Set(["organization", "tenderBrief", "itemCategory", "size"]);

/** Amount cell: "₹12,34,567", or a dash for 0 (no amount). */
const rupeeCell = (field: string) => (row: Row) => {
  const amount = formatRupees(row[field]);
  return amount ? <span className="tabular-nums">{amount}</span> : <Dash />;
};

const PROVENANCE_LABEL = {
  PRE: "Pre",
  POST: "Post",
  NOT_PARTICIPATED: "Not participated",
} as const;

export const DEADLINE_PRESETS: FilterOption[] = [
  { value: "thisWeek", label: "This week" },
  { value: "thisMonth", label: "This month" },
  { value: "thisYear", label: "This year" },
];

function formatColumnName(name: string): string {
  if (name === "t247Id") return "Portal ID";
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/** A JSON array or object, else the raw text split on `splitBy`. */
export function parseList(raw: unknown, splitBy: RegExp, useKeys = false): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
    if (parsed && typeof parsed === "object") {
      return (useKeys ? Object.keys(parsed) : Object.values(parsed)).map(String);
    }
  } catch {
    // Not JSON: fall through to splitting.
  }
  return raw
    .split(splitBy)
    .map((p) => p.trim())
    .filter(Boolean);
}

const LIST_COLUMNS: Record<
  string,
  { width: number; splitBy: RegExp; useKeys?: boolean; header?: string }
> = {
  itemSchedules: { width: 220, splitBy: /\n+/, header: "Item Schedule" },
  proposedErpItemName: { width: 250, splitBy: /\n+/, useKeys: true },
  proposedErpQuantity: { width: 280, splitBy: /[\n,;]+/ },
  cva: { width: 180, splitBy: /@/ },
};

type RawMaterialsRange = { aluMin: string; aluMax: string; cuMin: string; cuMax: string };
const EMPTY_RANGE: RawMaterialsRange = { aluMin: "", aluMax: "", cuMin: "", cuMax: "" };

export const rawMaterialsFilter: Column["filter"] = {
  type: "custom",
  stateKey: "rawMaterials",
  render: ({ value, onChange }) => {
    const range = { ...EMPTY_RANGE, ...(value as RawMaterialsRange | undefined) };
    const set = (key: keyof RawMaterialsRange, next: string) => {
      const updated = { ...range, [key]: next };
      onChange(Object.values(updated).some(Boolean) ? updated : undefined);
    };
    const input = (key: keyof RawMaterialsRange, label: string) => (
      <Field label={label}>
        <Input
          type="number"
          inputMode="decimal"
          value={range[key]}
          onChange={(e) => set(key, e.target.value)}
        />
      </Field>
    );
    return (
      <div className="grid grid-cols-2 gap-2">
        {input("aluMin", "Aluminium min")}
        {input("aluMax", "Aluminium max")}
        {input("cuMin", "Copper min")}
        {input("cuMax", "Copper max")}
      </div>
    );
  },
  summary: (value) => {
    const r = value as RawMaterialsRange | undefined;
    if (!r) return null;
    const part = (name: string, min: string, max: string) =>
      min || max ? `${name} ${min || "0"}–${max || "any"}` : null;
    return (
      [part("Al", r.aluMin, r.aluMax), part("Cu", r.cuMin, r.cuMax)]
        .filter(Boolean)
        .join(", ") || null
    );
  },
};

export interface TenderColumnInput {
  /** Column names as the server reports them. */
  serverColumns: string[];
  displayNameMap: Record<string, string>;
  columnIndices: ColumnIndexRow[];
  mergedGroups: MergedGroup[];
  associations: TenderPageAssociation[];
}

/**
 * The tenders page's column definitions: order, visibility, filters, merged
 * columns and every interactive cell. The table renders whatever this returns.
 */
export function buildTenderColumns({
  serverColumns,
  displayNameMap,
  columnIndices,
  mergedGroups,
  associations,
}: TenderColumnInput): Column[] {
  if (serverColumns.length === 0) return [];

  const indexMap = new Map(columnIndices.map((idx) => [normalizeKey(idx.columnName), idx]));
  const byAdminOrder = (a: string, b: string) => {
    const ia = indexMap.get(normalizeKey(a));
    const ib = indexMap.get(normalizeKey(b));
    if (ia && ib) {
      return (
        ia.displayOrder - ib.displayOrder ||
        new Date(ia.createdAt).getTime() - new Date(ib.createdAt).getTime()
      );
    }
    return ia ? -1 : ib ? 1 : 0;
  };

  const seen = new Set<string>();
  const ordered = serverColumns
    .filter((col) => {
      const normalized = col.toLowerCase().trim().replace(/\s+/g, " ");
      if (SKIP_COLUMNS.has(normalized) || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .sort(byAdminOrder);

  const groups = mergedGroups.filter((g) => g.fields.length >= 2);
  const mergedFields = new Set(groups.flatMap((g) => g.fields));

  const single = (col: string): Column => {
    const index = indexMap.get(normalizeKey(col));
    const label = displayNameMap[col];
    const byIndex = index ? !index.visible : false;
    const lower = col.toLowerCase();

    switch (col) {
      case "category":
        return {
          id: col,
          header: label ?? "Category",
          hint: "business line of the tender: EPC (contracts to build or install) or Manufacturing (supply of goods)",
          width: index?.width ?? 150,
          hidden: byIndex,
          search: false,
          frozen: true,
          filter: selectFilter(),
          extraFilters: [{ id: "subCategory", label: "Sub category", options: [BLANK] }],
          cell: (row) => (
            <StackedCell primary={row.category ?? ""} secondary={row.subCategory} />
          ),
        };
      case "app":
      case "aps":
      case "apm":
        return {
          id: col,
          header: col.toUpperCase(),
          width: 96,
          sortable: false,
          filter: selectFilter({ value: "YES", label: "Yes" }, { value: "NO", label: "No" }),
          cell: (row, { rowIndex }) => (
            <DecisionCell row={row} field={col} rowIndex={rowIndex} />
          ),
        };
      case "participated":
        return {
          id: col,
          header: label ?? "Participated",
          width: index?.width ?? 120,
          hidden: byIndex,
          sortable: false,
          // Stored as a boolean, so the values are "true" / "false".
          filter: selectFilter({ value: "true", label: "Yes" }, { value: "false", label: "No" }),
          cell: (row, { rowIndex }) => (
            <DecisionCell row={row} field={col} rowIndex={rowIndex} />
          ),
        };
      case "aiRelevanceValid":
        return {
          id: col,
          header: "AI Relevance",
          width: 220,
          sortable: false,
          search: false,
          filter: selectFilter(
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
            { value: "not_analysed", label: "Not analysed" },
          ),
          cell: (row) => <AiRelevanceCell row={row} />,
        };
      case "aiRelevanceReason":
      case "parseError":
        return { id: col, header: formatColumnName(col), hidden: true };
      case "assignedTo":
        return {
          id: col,
          header: "Assigned To",
          width: 190,
          search: false,
          filter: selectFilter(
            ...associations.map((a) => ({ value: String(a.id), label: a.name })),
          ),
          cell: (row, { rowIndex }) => <AssigneeCell row={row} rowIndex={rowIndex} />,
        };
      case "reasonForNotAPM":
        return {
          id: col,
          header: label ?? "Reason for Not Approval",
          width: index?.width ?? 220,
          hidden: byIndex,
          search: false,
          filter: selectFilter(...REASON_FOR_NOT_APM_OPTIONS.map((v) => ({ value: v, label: v }))),
          cell: (row) => <ReasonNotApmCell row={row} />,
        };
      case "parseStatus":
        return {
          id: col,
          header: "Parse Status",
          width: 140,
          filter: selectFilter(
            { value: "COMPLETED", label: "Completed" },
            { value: "FAILED", label: "Failed" },
            { value: "RATE_LIMITED", label: "Rate limited" },
            { value: "PROCESSING", label: "Processing" },
          ),
          cell: (row) => <ParseStatusCell row={row} />,
        };
      case "tenderFileUrl":
        return {
          id: col,
          header: "Tender Document",
          width: 190,
          filter: selectFilter(
            { value: "Available", label: "Available" },
            { value: "Not Available", label: "Not available" },
          ),
          cell: (row) => <DocumentsCell row={row} />,
        };
      case "reportings":
        return {
          id: col,
          header: "Reporting Officers",
          width: 200,
          filter: selectFilter(),
          cell: (row) => <ReportingsCell row={row} />,
        };
      case "website":
        return {
          id: col,
          header: "Website",
          width: 200,
          filter: selectFilter(
            { value: "Available", label: "Available" },
            { value: "Not Available", label: "Not available" },
          ),
          cell: (row) => <WebsiteCell row={row} />,
        };
      case "location":
        return {
          id: col,
          header: "Location",
          width: 200,
          filter: selectFilter(),
          text: locationText,
        };
      case "referenceNo":
        return {
          id: col,
          header: label ?? "Reference No",
          width: 180,
          frozen: true,
          filter: selectFilter(),
          cell: (row) => <ReferenceCell row={row} />,
        };
      case "type":
        return {
          id: col,
          header: "Type",
          width: 100,
          search: false,
          frozen: true,
          filter: selectFilter(),
          cell: (row) =>
            row.type ? (
              <Badge tone={row.type === "Gem" ? "accent" : "neutral"}>{row.type}</Badge>
            ) : (
              <Dash />
            ),
        };
      case "publishedDate":
      case "assignedDate":
        return {
          id: col,
          header: label ?? (col === "publishedDate" ? "Published Date" : "Assigned Date"),
          width: 140,
          filter: { type: "dateRange" },
          cell: (row) => <DateCell value={row[col]} />,
        };
      case "remarks":
        return {
          id: col,
          header: label ?? "Remarks",
          width: index?.width ?? 250,
          hidden: byIndex,
          filter: selectFilter(),
          cell: (row) => <RemarksCell row={row} />,
        };
      case "agentReport":
        return {
          id: col,
          header: "Agent Report",
          width: 150,
          search: false,
          sortable: true,
          cell: (row) => <AgentReportCell row={row} />,
        };
      case "divisionOrDepartment":
        return {
          id: col,
          header: label ?? "Division or Department",
          width: index?.width ?? 220,
          hidden: byIndex,
          filter: selectFilter(),
          cell: (row) => <DivisionCell row={row} />,
        };
    }

    if (col in LIST_COLUMNS) {
      const spec = LIST_COLUMNS[col];
      return {
        id: col,
        header: spec.header ?? label ?? formatColumnName(col),
        width: spec.width,
        search: false,
        cell: (row) => <Chips items={parseList(row[col], spec.splitBy, spec.useKeys)} />,
      };
    }

    if (lower.trim().replace(/\s+/g, " ") === "quantity / size") {
      return {
        id: col,
        header: "Size",
        width: 200,
        filter: selectFilter(),
        cell: (row) => <SizeCell row={row} field={col} />,
      };
    }

    if (lower.replace(/[\s_]/g, "") === "price") {
      return {
        id: col,
        header: displayNameMap.price ?? "Price",
        width: 130,
        filter: selectFilter(
          { value: "FIRM", label: "Firm" },
          { value: "VARIABLE", label: "Variable" },
        ),
        cell: (row) => <PriceCell row={row} />,
      };
    }

    const isDate =
      lower.includes("date") || lower.includes("deadline") || lower.includes("submission");
    const isRawMaterials = lower.replace(/[\s_]/g, "") === "rawmaterials";
    const base: Column = {
      id: col,
      header: col === "reason" ? "Reason for not participation" : (label ?? formatColumnName(col)),
      width:
        index?.width ??
        (col === "id" ? 80 : col === "deadline" ? 160 : col === "rawMaterials" ? 240 : 200),
      // Without an admin index row a plain column stays out of the table.
      hidden: index ? !index.visible : true,
      frozen: FROZEN.has(col) || undefined,
    };

    if (col === "ourRank") {
      // Exact ranks ("1", "L1") need a list; text search would also match 10, 11.
      return {
        ...base,
        hint: "our bid rank in the result; rank 1 / L1 means we won or were lowest bidder",
        filter: selectFilter(),
      };
    }
    if (isRawMaterials) {
      return {
        ...base,
        search: false,
        filter: rawMaterialsFilter,
        cell: (row) => <RawMaterialsCell row={row} />,
      };
    }
    if (col === "emd") {
      return { ...base, search: false, filter: emdRangeFilter, cell: rupeeCell(col) };
    }
    if (col === "value") {
      return { ...base, search: false, filter: valueRangeFilter, cell: rupeeCell(col) };
    }
    if (isDate) {
      return {
        ...base,
        search: col === "deadline" ? false : undefined,
        filter: {
          type: "dateRange",
          presets: col === "deadline" ? DEADLINE_PRESETS : undefined,
        },
        cell: (row) => <DateCell value={row[col]} />,
      };
    }
    return {
      ...base,
      filter:
        col === "organization"
          ? { type: "select", options: [BLANK], searchAsText: true }
          : selectFilter(),
      // Quantity falls back to the parsed total when the sheet left it empty.
      text:
        lower === "quantity"
          ? (row) =>
              row[col] || (row.totalQuantity && row.totalQuantity !== "0" ? row.totalQuantity : "")
          : undefined,
    };
  };

  const merged = (g: MergedGroup): Column => {
    const first = g.fields[0];
    const concatenated = g.separator.trim().length > 0;
    const orgAndDept = g.fields.includes("organization") && g.fields.includes("departmentName");
    const briefAndCategory = g.fields.includes("tenderBrief") && g.fields.includes("itemCategory");
    const hasSize = g.fields.includes("size");
    const isAmount = !concatenated && first === "value";
    const text = (row: Row) =>
      concatenated
        ? g.fields
            .map((f) => row[f] ?? "")
            .filter(Boolean)
            .join(g.separator)
        : (row[first] ?? "");

    return {
      id: g.label,
      header: concatenated
        ? (displayNameMap[g.label] ?? g.label)
        : (displayNameMap[first] ?? formatColumnName(first)),
      width: 250,
      frozen: orgAndDept || briefAndCategory || hasSize || undefined,
      // A blank separator shows the first field alone, so an amount stays an amount.
      ...(isAmount ? { search: false, filter: valueRangeFilter } : { filter: selectFilter() }),
      badges: getProvenanceForFields(g.fields).map((p) => PROVENANCE_LABEL[p]),
      text,
      cell: orgAndDept
        ? (row) => (
            <StackedCell primary={row.organization ?? ""} secondary={row.departmentName} />
          )
        : hasSize
          ? (row) => <SizeCell row={row} field={first} />
          : isAmount
            ? rupeeCell(first)
            : (row) => (text(row) ? <Clamp>{text(row)}</Clamp> : <Dash />),
    };
  };

  // A merged column takes the place of its first source field.
  const columns: Column[] = [];
  const placedGroups = new Set<string>();
  for (const col of ordered) {
    for (const g of groups) {
      if (g.fields[0] === col && !placedGroups.has(g.label)) {
        placedGroups.add(g.label);
        columns.push(merged(g));
      }
    }
    if (!mergedFields.has(col)) {
      const def = single(col);
      def.badges = getProvenance(col).map((p) => PROVENANCE_LABEL[p]);
      columns.push(def);
    }
  }

  columns.sort((a, b) => byAdminOrder(a.id, b.id));

  const move = (id: string, to: (list: Column[]) => number) => {
    const from = columns.findIndex((c) => c.id === id);
    if (from < 0) return;
    const [col] = columns.splice(from, 1);
    columns.splice(to(columns), 0, col);
  };
  // Category always leads; the website sits beside the location it belongs to.
  move("category", () => 0);
  if (columns.some((c) => c.id === "location" && !c.frozen)) {
    move("website", (list) => list.findIndex((c) => c.id === "location") + 1);
  }

  return columns;
}

export function DateCell({ value }: { value: string | undefined }) {
  if (!value) return <Dash />;
  return <span className="tabular-nums">{formatDateISTLong(value)}</span>;
}
