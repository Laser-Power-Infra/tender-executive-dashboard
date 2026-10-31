"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { confirmTenderDelete, listDeleteRequests, rejectTenderDelete } from "@/actions/tender-delete";
import { dateText } from "@/components/v2/data-table/cells";
import { ClientTablePage } from "@/components/v2/data-table/client-table-page";
import { selectFilter, type DataTableColumn, type SortState } from "@/components/v2/data-table/types";
import { Button, IconButton } from "@/components/v2/ui/button";
import { toastError } from "@/components/v2/ui/errors";
import { Dialog } from "@/components/v2/ui/overlay";
import { say } from "@/lib/pip-says";
import { useRows } from "./shared";

type Request = Awaited<ReturnType<typeof listDeleteRequests>>[number];

const defaultSort: SortState = { column: "requestedAt", direction: "asc" };
const getRowId = (row: Request) => String(row.id);

/** An icon button that asks before it acts. */
function ConfirmButton({
  icon,
  label,
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const confirm = () => {
    setPending(true);
    onConfirm()
      .then(() => setOpen(false))
      .catch((err) => toastError(say.couldNot(label.toLowerCase()), err))
      .finally(() => setPending(false));
  };
  return (
    <>
      <IconButton size="sm" label={label} onClick={() => setOpen(true)}>
        {icon}
      </IconButton>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant={danger ? "danger" : "primary"} loading={pending} onClick={confirm}>
              {confirmLabel}
            </Button>
          </>
        }
      />
    </>
  );
}

export function DeleteRequestsView() {
  const t = useRows(listDeleteRequests);
  const { remove } = t;

  const columns = useMemo<DataTableColumn<Request>[]>(
    () => [
      { id: "referenceNo", header: "Reference No", width: 220 },
      { id: "docketNo", header: "Docket", width: 140, text: (r) => r.docketNo ?? "" },
      { id: "organization", header: "Organisation", width: 220, filter: selectFilter(), text: (r) => r.organization ?? "" },
      { id: "tenderBrief", header: "Brief", width: 300, text: (r) => r.tenderBrief ?? "" },
      { id: "requestedBy", header: "Requested by", width: 180, filter: selectFilter(), text: (r) => r.requestedBy ?? "" },
      { id: "reason", header: "Reason", width: 300, text: (r) => r.reason ?? "" },
      { id: "requestedAt", header: "Requested", width: 130, search: false, text: (r) => dateText(r.requestedAt) },
      {
        id: "actions",
        header: "Actions",
        width: 100,
        search: false,
        sortable: false,
        cell: (row) => (
          <div className="flex gap-0.5">
            <ConfirmButton
              icon={<Check className="size-3.5" />}
              label="Delete permanently"
              title={`Delete ${row.referenceNo} for good?`}
              description="The tender and its associations, reportings, evaluations, files and costing rows are removed. This cannot be undone."
              confirmLabel="Delete permanently"
              danger
              onConfirm={() =>
                confirmTenderDelete(row.id).then(() => {
                  remove(row.id);
                  toast.success(say.removed(row.referenceNo));
                })
              }
            />
            <ConfirmButton
              icon={<Undo2 className="size-3.5" />}
              label="Reject request"
              title={`Keep ${row.referenceNo}?`}
              description="The request is dropped and the tender shows up in the tables again."
              confirmLabel="Keep tender"
              onConfirm={() =>
                rejectTenderDelete(row.id).then(() => {
                  remove(row.id);
                  toast.success(say.restored(row.referenceNo));
                })
              }
            />
          </div>
        ),
      },
    ],
    [remove],
  );

  return (
    <ClientTablePage
      title="Delete requests"
      noun="requests"
      rows={t.rows}
      columns={columns}
      getRowId={getRowId}
      loading={t.loading}
      error={t.error}
      onRetry={t.reload}
      defaultSort={defaultSort}
    />
  );
}
