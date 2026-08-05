"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SelectColumnFilterProps {
  value: string[];
  onChange: (values: string[]) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  searchable?: boolean;
  onSearchChange?: (text: string) => void;
  className?: string;
}

const FLUSH_DELAY = 250;

interface OptionRowProps {
  value: string;
  label: string;
  checked: boolean;
  onToggle: (value: string) => void;
}

const OptionRow = React.memo(function OptionRow({
  value,
  label,
  checked,
  onToggle,
}: OptionRowProps) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
      <Checkbox checked={checked} onCheckedChange={() => onToggle(value)} />
      <span className="truncate">{label}</span>
    </label>
  );
});

export const SelectColumnFilter: React.FC<SelectColumnFilterProps> = ({
  value,
  onChange,
  options,
  placeholder = "All",
  searchable = false,
  onSearchChange,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(value);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const pendingRef = useRef<string[]>(value);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSelected(value);
    pendingRef.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const scheduleFlush = useCallback((next: string[]) => {
    pendingRef.current = next;
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      onChangeRef.current(pendingRef.current);
    }, FLUSH_DELAY);
  }, []);

  const allOptions = useMemo(() => {
    const hasBlank = options.some((o) => o.value === "__blank__");
    return hasBlank
      ? options
      : [...options, { value: "__blank__", label: "Blank" }];
  }, [options]);

  const visibleOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q),
    );
  }, [allOptions, search]);

  const toggle = useCallback(
    (optValue: string) => {
      const cur = pendingRef.current;
      const next = cur.includes(optValue)
        ? cur.filter((v) => v !== optValue)
        : [...cur, optValue];
      setSelected(next);
      scheduleFlush(next);
    },
    [scheduleFlush],
  );

  const selectAll = useCallback(() => {
    const next = allOptions.map((o) => o.value);
    setSelected(next);
    scheduleFlush(next);
  }, [allOptions, scheduleFlush]);

  const clearAll = useCallback(() => {
    setSelected([]);
    scheduleFlush([]);
  }, [scheduleFlush]);

  const handleSearch = useCallback(
    (text: string) => {
      setSearch(text);
      setSelected([]);
      pendingRef.current = [];
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        onSearchChange?.(text);
      }, FLUSH_DELAY);
    },
    [onSearchChange],
  );

  return (
    <div
      className={className}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between text-xs font-normal"
            >
              <span className="truncate">
                {selected.length === 0
                  ? placeholder
                  : `${selected.length} selected`}
              </span>
              <ChevronDown className="size-3.5 shrink-0 opacity-60" />
            </Button>
          }
        />
        <PopoverContent
          align="start"
          className="w-96 max-w-96 gap-0 p-0"
        >
          <div className="flex items-center justify-between gap-2 border-b px-2.5 py-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={selectAll}
                className="rounded px-2 py-0.5 text-xs font-medium text-foreground hover:bg-accent"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="rounded px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                Clear All
              </button>
            </div>
            {selected.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {selected.length} selected
              </span>
            )}
          </div>
          {searchable && (
            <div className="border-b p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search..."
                  className="h-8 pl-7 text-xs"
                />
              </div>
            </div>
          )}
          <div className="h-72 overflow-y-auto p-1.5">
            {visibleOptions.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                No items found.
              </p>
            ) : (
              visibleOptions.map((opt) => (
                <OptionRow
                  key={opt.value}
                  value={opt.value}
                  label={opt.label}
                  checked={selected.includes(opt.value)}
                  onToggle={toggle}
                />
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
