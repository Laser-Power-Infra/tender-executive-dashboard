"use client";

import React from "react";
import { X } from "lucide-react";

interface DeadlineColumnFilterProps {
  preset: string;
  onPresetChange: (value: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onClearDateRange: () => void;
}

export const DeadlineColumnFilter: React.FC<DeadlineColumnFilterProps> = ({
  preset,
  onPresetChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClearDateRange,
}) => {
  const todayStr = React.useMemo(() => new Date().toISOString().split("T")[0], []);
  const startInputValue = startDate || (!preset ? todayStr : "");

  return (
    <div className="column-deadline-filter" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <select
        className="deadline-preset-select"
        value={preset}
        onChange={(e) => onPresetChange(e.target.value)}
      >
        <option value="">All</option>
        <option value="thisWeek">This Week</option>
        <option value="thisMonth">This Month</option>
        <option value="thisYear">This Year</option>
      </select>
      <div className="deadline-date-range-row">
        <input
          type="date"
          className="date-filter-input"
          value={startInputValue}
          onChange={(e) => onStartDateChange(e.target.value)}
          title="Start Date"
        />
        <span className="date-filter-to">to</span>
        <input
          type="date"
          className="date-filter-input"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          title="End Date"
        />
        {(startDate || endDate) && (
          <button
            className="date-filter-clear-btn"
            onClick={onClearDateRange}
            title="Clear date filter"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
