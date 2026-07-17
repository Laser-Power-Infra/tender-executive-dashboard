"use client";

import React, { useState, useMemo } from "react";

interface SelectColumnFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  selectClassName?: string;
  searchable?: boolean;
  onSearchChange?: (text: string) => void;
}

export const SelectColumnFilter: React.FC<SelectColumnFilterProps> = ({
  value,
  onChange,
  options,
  placeholder = "All",
  className = "column-status-filter",
  selectClassName = "status-filter-select",
  searchable = false,
  onSearchChange,
}) => {
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.value === value ||
        opt.label.toLowerCase().includes(lower) ||
        opt.value.toLowerCase().includes(lower),
    );
  }, [options, search, value]);

  return (
    <div
      className={className}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={searchable ? { flexDirection: "column", gap: "4px" } : undefined}
    >
      {searchable && (
        <input
          type="text"
          className="text-filter-input"
          placeholder="Search..."
          value={search}
          onChange={(e) => {
            const text = e.target.value;
            setSearch(text);
            onSearchChange?.(text);
          }}
        />
      )}
      <select
        className={selectClassName}
        value={value}
        onChange={(e) => {
          setSearch("");
          onSearchChange?.("");
          onChange(e.target.value);
        }}
        style={searchable ? { width: "100%" } : undefined}
      >
        <option value="">{placeholder}</option>
        {filteredOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};
