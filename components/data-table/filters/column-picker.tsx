"use client";

import { useState } from "react";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Table as TanStackTable } from "@tanstack/react-table";

interface ColumnPickerProps<TData> {
  table: TanStackTable<TData>;
  formatHeader?: (columnId: string) => string;
}

export function ColumnPicker<TData>({
  table,
  formatHeader = (id) => id,
}: ColumnPickerProps<TData>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        size="xs"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        className="text-xs"
      >
        <Columns3 className="size-3" />
        Columns
      </Button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-sm bg-white shadow-md ring-1 ring-slate-200 p-2 max-h-80 overflow-y-auto">
            <p className="text-[11px] font-medium text-slate-500 px-1 py-1.5 uppercase tracking-wider">
              Toggle Columns
            </p>
            {table
              .getAllLeafColumns()
              .filter((c) => c.getCanHide())
              .map((column) => (
                <label
                  key={column.id}
                  className="flex items-center gap-2 py-1.5 px-1.5 hover:bg-slate-50 rounded cursor-pointer text-xs"
                >
                  <input
                    type="checkbox"
                    checked={column.getIsVisible()}
                    onChange={column.getToggleVisibilityHandler()}
                    className="size-3.5 accent-primary"
                  />
                  {formatHeader(column.id)}
                </label>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
