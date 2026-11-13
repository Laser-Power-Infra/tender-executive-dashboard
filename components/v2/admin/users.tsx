"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { createUser, listUsers, resetUserPassword, setUserActive, updateUserRole } from "@/actions/users";
import { USER_ROLES } from "@/lib/user-roles";
import { dateText } from "@/components/v2/data-table/cells";
import { ClientTablePage } from "@/components/v2/data-table/client-table-page";
import { SelectEditCell } from "@/components/v2/data-table/edit-cells";
import { selectFilter, type DataTableColumn, type SortState } from "@/components/v2/data-table/types";
import { Button, IconButton } from "@/components/v2/ui/button";
import { toastError } from "@/components/v2/ui/errors";
import { Badge, Field, Input } from "@/components/v2/ui/field";
import { FormDialog } from "@/components/v2/ui/form-dialog";
import { Dialog, Select } from "@/components/v2/ui/overlay";
import { useRows } from "./shared";
import { say } from "@/lib/pip-says";

type User = Awaited<ReturnType<typeof listUsers>>[number];

interface Draft {
  name: string;
  email: string;
  role: string | null;
}

const BLANK: Draft = { name: "", email: "", role: "user" };
const ROLE_OPTIONS = USER_ROLES.map((r) => ({ value: r, label: r }));
const defaultSort: SortState = { column: "name", direction: "asc" };
const getRowId = (row: User) => row.id;
const nameOf = (row: User) => row.name || row.email;

/** An icon button that asks before it acts. */
function ConfirmButton({
  icon,
  label,
  title,
  description,
  confirmLabel,
  danger,
  disabled,
  onConfirm,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  disabled?: boolean;
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
      <IconButton size="sm" label={label} disabled={disabled} onClick={() => setOpen(true)}>
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

export function UsersView() {
  const t = useRows(listUsers);
  const viewer = useSession().data?.user;
  const me = viewer?.id;
  // Admins manage users and admins only; the server enforces the same cap.
  const isDeveloper = viewer?.role === "developer";
  const roleOptions = useMemo(
    () => (isDeveloper ? ROLE_OPTIONS : ROLE_OPTIONS.filter((o) => o.value !== "developer")),
    [isDeveloper],
  );
  const [creating, setCreating] = useState(false);

  const { upsert } = t;
  const columns = useMemo<DataTableColumn<User>[]>(
    () => [
      { id: "name", header: "Name", width: 220, filter: selectFilter(), text: (r) => r.name ?? "" },
      { id: "email", header: "Email", width: 300, filter: selectFilter() },
      {
        id: "role",
        header: "Role",
        width: 160,
        search: false,
        filter: selectFilter(),
        cell: (row) => (
          <SelectEditCell
            label={`Role of ${nameOf(row)}`}
            value={row.role}
            // A developer row keeps its own option so an admin still sees the role.
            options={row.role === "developer" ? ROLE_OPTIONS : roleOptions}
            required
            // Your own role stays put, so you cannot lock yourself out.
            readOnly={row.id === me || (!isDeveloper && row.role === "developer")}
            onSave={(role) => updateUserRole({ id: row.id, role }).then(upsert)}
          />
        ),
      },
      {
        id: "active",
        header: "Status",
        width: 120,
        search: false,
        filter: selectFilter(),
        text: (r) => (r.active ? "Active" : "Inactive"),
        cell: (r) => (r.active ? <Badge tone="good">Active</Badge> : <Badge>Inactive</Badge>),
      },
      {
        id: "createdAt",
        header: "Created",
        width: 130,
        search: false,
        text: (r) => dateText(r.createdAt),
      },
      {
        id: "actions",
        header: "Actions",
        width: 100,
        search: false,
        sortable: false,
        cell: (row) => (
          <div className="flex gap-0.5">
            <ConfirmButton
              icon={<KeyRound className="size-3.5" />}
              label="Reset password"
              title={`Reset password for ${nameOf(row)}?`}
              description="Their password goes back to the default. They should change it after signing in."
              confirmLabel="Reset password"
              onConfirm={() =>
                resetUserPassword(row.email).then(() => toast.success(say.passwordReset(nameOf(row))))
              }
            />
            {row.active ? (
              <ConfirmButton
                icon={<UserX className="size-3.5" />}
                label="Deactivate"
                title={`Deactivate ${nameOf(row)}?`}
                description="They are signed out and cannot sign in until activated again."
                confirmLabel="Deactivate"
                danger
                disabled={row.id === me}
                onConfirm={() =>
                  setUserActive({ id: row.id, active: false }).then((user) => {
                    upsert(user);
                    toast.success(say.deactivated(nameOf(row)));
                  })
                }
              />
            ) : (
              <ConfirmButton
                icon={<UserCheck className="size-3.5" />}
                label="Activate"
                title={`Activate ${nameOf(row)}?`}
                description="They can sign in again with their current password."
                confirmLabel="Activate"
                onConfirm={() =>
                  setUserActive({ id: row.id, active: true }).then((user) => {
                    upsert(user);
                    toast.success(say.activated(nameOf(row)));
                  })
                }
              />
            )}
          </div>
        ),
      },
    ],
    [upsert, me, isDeveloper, roleOptions],
  );
  // Reset password and deactivate are developer powers.
  const visibleColumns = useMemo(
    () => (isDeveloper ? columns : columns.filter((c) => c.id !== "actions")),
    [columns, isDeveloper],
  );

  const create = async (draft: Draft) => {
    if (!draft.email.trim()) throw new Error("Email is required");
    if (!draft.role) throw new Error("Role is required");
    const user = await createUser({ name: draft.name, email: draft.email, role: draft.role });
    upsert(user);
    toast.success(say.added(nameOf(user)));
  };

  return (
    <>
      <ClientTablePage
        title="Users"
        noun="users"
        rows={t.rows}
        columns={visibleColumns}
        getRowId={getRowId}
        loading={t.loading}
        error={t.error}
        onRetry={t.reload}
        defaultSort={defaultSort}
        actions={
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
            Add user
          </Button>
        }
      />

      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Add user"
        description="The user signs in with the default password and should change it."
        initial={BLANK}
        onSubmit={create}
        submitLabel="Add user"
      >
        {(draft, set) => (
          <>
            <Field label="Name">
              <Input autoFocus value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                autoComplete="off"
                value={draft.email}
                onChange={(e) => set({ email: e.target.value })}
              />
            </Field>
            <Field label="Role">
              <Select label="Role" value={draft.role} onChange={(role) => set({ role })} options={roleOptions} />
            </Field>
          </>
        )}
      </FormDialog>
    </>
  );
}
