"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { say } from "@/lib/pip-says";
import { Download, Inbox, Pencil, Plus, Settings, Trash2, TriangleAlert } from "lucide-react";
import { CellAction, Chips, Clamp, StackedCell } from "@/components/v2/data-table/cells";
import { DataTable } from "@/components/v2/data-table/data-table";
import type { DataTableColumn } from "@/components/v2/data-table/types";
import { Button, IconButton } from "@/components/v2/ui/button";
import { Calendar, DatePicker, DateRange } from "@/components/v2/ui/calendar";
import {
  Badge,
  Checkbox,
  Choice,
  Dash,
  Field,
  Input,
  Switch,
  Textarea,
} from "@/components/v2/ui/field";
import {
  Combobox,
  Dialog,
  Menu,
  MenuCheckItem,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSwitchItem,
  Popover,
  Select,
  Tip,
} from "@/components/v2/ui/overlay";
import { EmptyState, Page, PageHeader, Pill, Skeleton, StatTile } from "@/components/v2/ui/page";
import { Sheet } from "@/components/v2/ui/sheet";

const COLOURS = [
  "canvas",
  "surface",
  "raised",
  "sunken",
  "rail",
  "ink",
  "ink-2",
  "ink-3",
  "line",
  "line-strong",
  "hover",
  "accent",
  "accent-ink",
  "accent-soft",
  "good",
  "good-soft",
  "bad",
  "bad-soft",
  "warn",
  "warn-soft",
  ...["apricot", "butter", "mint", "rose"].flatMap((f) =>
    ["surface", "line", "soft", "ink"].map((p) => `${f}-${p}`),
  ),
];

const TYPE = [
  { className: "type-display", name: "type-display", use: "Page title" },
  { className: "type-stat", name: "type-stat", use: "Stat value" },
  { className: "type-title", name: "type-title", use: "Dialog and sheet title" },
  { className: "text-md", name: "text-md", use: "Body, cells, controls" },
  { className: "text-xs", name: "text-xs", use: "Column header, small control" },
  { className: "type-label text-ink-3", name: "type-label", use: "Field and group label" },
  { className: "text-3xs text-ink-3", name: "text-3xs", use: "Text under a column header" },
  { className: "font-mono text-xs tabular-nums", name: "font-mono", use: "GEM/2026/B/1234567" },
];

const SURFACES = [
  { className: "edge", name: "edge", use: "Control outline" },
  { className: "hairline", name: "hairline", use: "Resting tile or pill" },
  { className: "card", name: "card", use: "Table, card" },
  { className: "shadow-(--shadow-pop) bg-raised", name: "--shadow-pop", use: "Popover, menu" },
  { className: "shadow-(--shadow-sheet) bg-raised", name: "--shadow-sheet", use: "Dialog, sheet" },
];

const RADII = ["rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl"];

const LONG_TEXT =
  "Supply of ACSR conductor and associated hardware for the 132 kV transmission line, including testing at the manufacturer's works, packing, forwarding and delivery to site stores. Longer text scrolls inside the cell.";

const toDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

interface GroupedRow {
  id: string;
  docket: string;
  tender: string;
  client: string;
}

const GROUPED_ROWS: GroupedRow[] = [
  { id: "1", docket: "ENQ-101-2026-2027", tender: "GEM/2026/B/1001", client: "Power Grid Corporation" },
  { id: "2", docket: "ENQ-101-2026-2027", tender: "GEM/2026/B/1002", client: "Power Grid Corporation" },
  { id: "3", docket: "ENQ-101-2026-2027", tender: "GEM/2026/B/1003", client: "Power Grid Corporation" },
  { id: "4", docket: "ENQ-102-2026-2027", tender: "NIT/44/2026", client: "Damodar Valley Corporation" },
];

const GROUPED_COLUMNS: DataTableColumn<GroupedRow>[] = [
  { id: "docket", header: "Docket No", frozen: true, spanGroup: true, sortable: false, search: false },
  { id: "tender", header: "Tender / NIT No", sortable: false, search: false },
  { id: "client", header: "Client", width: 260, sortable: false, search: false },
];

const NO_FILTERS = {};
const noop = () => {};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card flex shrink-0 flex-col gap-3 rounded-xl bg-surface p-4">
      <h2 className="type-title">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="type-label w-28 shrink-0 text-ink-3">{label}</span>
      {children}
    </div>
  );
}

/** A table cell's width, so cell helpers show their real wrapping. */
function CellBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex w-45 flex-col gap-1">
      <span className="type-label text-ink-3">{label}</span>
      <div className="hairline rounded-md bg-surface px-3 py-2">{children}</div>
    </div>
  );
}

export function Showcase() {
  const [stat, setStat] = useState(true);
  const [pill, setPill] = useState("Asha");
  const [checked, setChecked] = useState(true);
  const [choice, setChoice] = useState<string | null>("week");
  const [range, setRange] = useState({ from: "", to: "" });
  const [date, setDate] = useState("");
  const [select, setSelect] = useState<string | null>(null);
  const [menuCheck, setMenuCheck] = useState(true);
  const [switchOn, setSwitchOn] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <Page className="overflow-y-auto">
      <PageHeader
        title="Design system"
        meta="v2"
        actions={
          <Link href="/v2/tenders" className="text-accent-ink underline-offset-2 hover:underline">
            Live example: Tenders
          </Link>
        }
      />

      <Section title="Colour">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
          {COLOURS.map((name) => (
            <div key={name} className="flex items-center gap-2">
              <span
                className="edge size-8 shrink-0 rounded-md"
                style={{ background: `var(--${name})` }}
              />
              <span className="font-mono text-xs">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        {TYPE.map((t) => (
          <div key={t.name} className="flex items-baseline gap-3">
            <span className="w-28 shrink-0 font-mono text-xs text-ink-3">{t.name}</span>
            <span className={t.className}>{t.use}</span>
          </div>
        ))}
      </Section>

      <Section title="Shape and elevation">
        <div className="flex flex-wrap gap-4">
          {RADII.map((r) => (
            <div key={r} className="flex flex-col items-center gap-1">
              <div className={`edge size-14 bg-surface ${r}`} />
              <span className="font-mono text-xs text-ink-3">{r}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 rounded-lg bg-canvas p-4">
          {SURFACES.map((s) => (
            <div
              key={s.name}
              className={`flex h-16 w-36 flex-col justify-center rounded-xl px-3 ${s.className}`}
            >
              <span className="font-mono text-xs">{s.name}</span>
              <span className="text-xs text-ink-3">{s.use}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        {(["md", "sm"] as const).map((size) => (
          <Row key={size} label={`Button ${size}`}>
            <Button size={size} variant="primary">
              Primary
            </Button>
            <Button size={size}>Secondary</Button>
            <Button size={size} variant="ghost">
              Ghost
            </Button>
            <Button size={size} variant="danger">
              Danger
            </Button>
            <Button size={size} icon={<Download className="size-3.5" />}>
              With icon
            </Button>
            <Button size={size} loading>
              Loading
            </Button>
            <Button size={size} disabled>
              Disabled
            </Button>
          </Row>
        ))}
        <Row label="IconButton">
          <IconButton label="Settings">
            <Settings className="size-4" />
          </IconButton>
          <IconButton size="sm" label="Edit">
            <Pencil className="size-3.5" />
          </IconButton>
          <IconButton size="sm" label="Edit (disabled)" disabled>
            <Pencil className="size-3.5" />
          </IconButton>
        </Row>
      </Section>

      <Section title="Fields">
        <div className="grid max-w-2xl grid-cols-2 gap-3">
          <Field label="Input">
            <Input placeholder="Placeholder" />
          </Field>
          <Field label="Input, disabled">
            <Input disabled value="Cannot change" readOnly />
          </Field>
          <Field label="Select">
            <Select
              label="Select"
              value={select}
              onChange={setSelect}
              options={[
                { value: "firm", label: "Firm" },
                { value: "variable", label: "Variable" },
              ]}
            />
          </Field>
          <Field label="Select, small">
            <Select
              size="sm"
              label="Select, small"
              value={select}
              onChange={setSelect}
              options={[
                { value: "firm", label: "Firm" },
                { value: "variable", label: "Variable" },
              ]}
            />
          </Field>
          <Field label="Combobox">
            <Combobox
              label="Combobox"
              value={select}
              onChange={setSelect}
              options={[
                { value: "firm", label: "Firm" },
                { value: "variable", label: "Variable" },
              ]}
            />
          </Field>
          <Field label="Textarea" className="col-span-2">
            <Textarea rows={2} placeholder="Longer text" />
          </Field>
          <Field label="DatePicker">
            <DatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="DatePicker, disabled">
            <DatePicker value="" onChange={() => {}} disabled />
          </Field>
          <div className="col-span-2">
            <DateRange
              from={range.from}
              to={range.to}
              onChange={(from, to) => setRange({ from, to })}
            />
          </div>
        </div>
        <Row label="Calendar">
          <div className="hairline rounded-xl bg-surface p-2">
            <Calendar
              mode="single"
              selected={date ? new Date(`${date}T00:00:00`) : undefined}
              onSelect={(next) => setDate(next ? toDay(next) : "")}
            />
          </div>
        </Row>
        <Row label="Checkbox">
          <Checkbox checked={checked} onChange={setChecked}>
            Include closed tenders
          </Checkbox>
          <Checkbox checked={false} onChange={() => {}} disabled>
            Disabled
          </Checkbox>
        </Row>
        <Row label="Switch">
          <Switch checked={switchOn} onChange={setSwitchOn}>
            Developer mode
          </Switch>
          <Switch checked={false} onChange={() => {}} disabled>
            Disabled
          </Switch>
        </Row>
        <Row label="Choice">
          <Choice
            label="Deadline"
            allowClear
            value={choice}
            onChange={setChoice}
            options={[
              { value: "today", label: "Today" },
              { value: "week", label: "This week" },
              { value: "month", label: "This month" },
            ]}
          />
        </Row>
      </Section>

      <Section title="Badges">
        <Row label="Badge">
          <Badge>Neutral</Badge>
          <Badge tone="accent">Pre</Badge>
          <Badge tone="good">Yes</Badge>
          <Badge tone="bad">Failed</Badge>
          <Badge tone="warn">Variable</Badge>
        </Row>
        <Row label="Dash">
          <Dash />
          <span className="text-ink-3">for every empty value</span>
        </Row>
      </Section>

      <Section title="Notifications">
        <Row label="Said by Pip">
          <Button size="sm" onClick={() => toast.success(say.set("APM", "YES"))}>Success</Button>
          <Button size="sm" onClick={() => toast.warning(say.queuedSome(3, 1))}>Warning</Button>
          <Button
            size="sm"
            onClick={() =>
              toast.error(say.notSaved("the price"), { description: "Could not reach the server. Check your connection and try again." })
            }
          >
            Error
          </Button>
          <Button size="sm" onClick={() => toast.info(say.queueStopped(12))}>Info</Button>
          <Button
            size="sm"
            onClick={() =>
              toast.promise(new Promise((r) => setTimeout(r, 2500)), {
                loading: say.exporting(),
                success: say.exported(240, "tender"),
                error: say.couldNot("export them"),
              })
            }
          >
            Loading then success
          </Button>
          <Button
            size="sm"
            onClick={() => toast(say.removed("the filter"), { action: { label: "Undo", onClick: () => toast.success(say.restored("the filter")) } })}
          >
            With action
          </Button>
        </Row>
      </Section>

      <Section title="Overlays">
        <Row label="Open one">
          <Tip label="Shown after 500ms">
            <Button>Tip</Button>
          </Tip>
          <Popover trigger={<Button>Popover</Button>}>
            <div className="flex w-72 flex-col gap-3">
              <h3 className="font-semibold">Panel title</h3>
              <Field label="Contains">
                <Input placeholder="Text" />
              </Field>
            </div>
          </Popover>
          <Menu trigger={<Button>Menu</Button>}>
            <MenuLabel>Actions</MenuLabel>
            <MenuItem icon={<Plus />}>Add row</MenuItem>
            <MenuCheckItem checked={menuCheck} onCheckedChange={setMenuCheck}>
              Show archived
            </MenuCheckItem>
            <MenuSwitchItem checked={switchOn} onCheckedChange={setSwitchOn}>
              Developer mode
            </MenuSwitchItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} tone="bad">
              Delete
            </MenuItem>
          </Menu>
          <Button onClick={() => setDialogOpen(true)}>Dialog</Button>
          <Button onClick={() => setSheetOpen(true)}>Sheet</Button>
        </Row>
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Dialog title"
          description="One short task with a clear outcome."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setDialogOpen(false)}>
                Save change
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <Field label="Reason">
              <Textarea rows={3} />
            </Field>
          </div>
        </Dialog>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Sheet title">
          <p className="text-ink-2">
            Long read-only content beside the table. Drag the header to the right to dismiss.
          </p>
        </Sheet>
      </Section>

      <Section title="Page">
        <Row label="StatTile">
          <StatTile
            label="APM yes"
            detail="Allocated"
            value="1,24,310"
            selected={stat}
            onClick={() => setStat(!stat)}
          />
          <StatTile label="Not clickable" value="42" />
          <StatTile label="Loading" value={null} />
        </Row>
        <Row label="Pill">
          {["Asha", "Ravi", "Meera"].map((name, i) => (
            <Pill
              key={name}
              selected={pill === name}
              count={(i + 1) * 7}
              onClick={() => setPill(name)}
            >
              {name}
            </Pill>
          ))}
        </Row>
        <Row label="Skeleton">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-14 w-40" />
        </Row>
        <Row label="EmptyState">
          <EmptyState
            icon={Inbox}
            title="No tenders match these filters"
            action={<Button>Reset column filters</Button>}
          />
          <EmptyState
            icon={TriangleAlert}
            tone="bad"
            title="Could not load tenders"
            description="The server did not respond."
            action={<Button>Try again</Button>}
          />
        </Row>
      </Section>

      <Section title="Cells">
        <div className="flex flex-wrap items-start gap-4">
          <CellBox label="Clamp">
            <Clamp>{LONG_TEXT}</Clamp>
          </CellBox>
          <CellBox label='Clamp lines="fill"'>
            {/* Stands in for a row the other cells made taller. */}
            <div className="flex h-24 flex-col">
              <Clamp lines="fill">{LONG_TEXT}</Clamp>
            </div>
          </CellBox>
          <CellBox label="StackedCell">
            <StackedCell primary="Power Grid Corporation" secondary="Northern Region II" />
          </CellBox>
          <CellBox label="Chips">
            <Chips items={["ACSR Zebra", "ACSR Moose", "AAAC Panther", "Earthwire"]} />
          </CellBox>
          <CellBox label="CellAction">
            <CellAction
              action={
                <IconButton size="sm" label="Edit remarks">
                  <Pencil className="size-3.5" />
                </IconButton>
              }
            >
              <Clamp>Awaiting corrigendum</Clamp>
            </CellAction>
          </CellBox>
        </div>
      </Section>

      <Section title="Grouped rows">
        <div className="flex h-72 flex-col">
          <DataTable<GroupedRow>
            noun="dockets"
            columns={GROUPED_COLUMNS}
            rows={GROUPED_ROWS}
            getRowId={(row) => row.id}
            groupBy={(row) => row.docket}
            total={2}
            page={1}
            pageSize={10}
            onPageChange={noop}
            onPageSizeChange={noop}
            sort={null}
            onSortChange={noop}
            filters={NO_FILTERS}
            onFilterChange={noop}
            onResetFilters={noop}
            columnVisibility={NO_FILTERS}
            onColumnVisibilityChange={noop}
          />
        </div>
      </Section>
    </Page>
  );
}
