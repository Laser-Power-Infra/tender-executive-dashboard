export type ColumnFilterType = "dateRange" | "select" | "text" | "boolean";

export interface FilterOption {
  value: string;
  label: string;
}

export interface ColumnFilterConfig {
  type: ColumnFilterType;
  options?: FilterOption[];
  placeholder?: string;
  searchable?: boolean;
}

export interface ColumnFilterState {
  dateRange?: { startDate: string; endDate: string };
  select?: string;
  text?: string;
  boolean?: boolean | null;
}
