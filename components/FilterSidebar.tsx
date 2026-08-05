"use client";
import React from "react";
import { ManagementDecision } from "@/types/tender";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "./FilterSidebar.css";

interface FilterSidebarProps {
  clientSearch: string;
  setClientSearch: (val: string) => void;
  selectedStatuses: string[];
  setSelectedStatuses: (statuses: string[]) => void;
  uniqueStatuses: string[];
  selectedEngineer: string;
  setSelectedEngineer: (val: string) => void;
  engineersList: string[];
  selectedDecision: string;
  setSelectedDecision: (val: string) => void;
  valueMin: string;
  setValueMin: (val: string) => void;
  valueMax: string;
  setValueMax: (val: string) => void;
  aluminiumMin: string;
  setAluminiumMin: (val: string) => void;
  aluminiumMax: string;
  setAluminiumMax: (val: string) => void;
  copperMin: string;
  setCopperMin: (val: string) => void;
  copperMax: string;
  setCopperMax: (val: string) => void;
  priceBasisFilter: string;
  setPriceBasisFilter: (val: string) => void;
  onRefresh?: () => void;
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  clientSearch, setClientSearch,
  selectedStatuses, setSelectedStatuses, uniqueStatuses,
  selectedEngineer, setSelectedEngineer, engineersList,
  selectedDecision, setSelectedDecision,
  valueMin, setValueMin, valueMax, setValueMax,
  aluminiumMin, setAluminiumMin, aluminiumMax, setAluminiumMax,
  copperMin, setCopperMin, copperMax, setCopperMax,
  priceBasisFilter, setPriceBasisFilter,
  onRefresh
}) => {
  const handleStatusToggle = (status: string) => {
    if (selectedStatuses.includes(status)) {
      setSelectedStatuses(selectedStatuses.filter(s => s !== status));
    } else {
      setSelectedStatuses([...selectedStatuses, status]);
    }
  };

  return (
    <div className="filter-sidebar-container">
      <div className="sidebar-header">Participation Filters</div>
      <div className="sidebar-content">
        <div className="filter-section">
          <label className="filter-label">Client</label>
          <input type="text" className="filter-text-input" placeholder="Search Client..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
        </div>
        <div className="filter-section">
          <label className="filter-label">Status</label>
          <div className="checkbox-group">
            {uniqueStatuses.map(status => (
              <label key={status} className="checkbox-label">
                <input type="checkbox" className="checkbox-input" checked={selectedStatuses.includes(status)} onChange={() => handleStatusToggle(status)} />
                <span>{status || "(Blank)"}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="filter-section">
          <label className="filter-label">Engineer (Prepare By)</label>
          <Select value={selectedEngineer} onValueChange={(v) => setSelectedEngineer(v ?? "All")}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="All Engineers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Engineers</SelectItem>
              {engineersList.map(eng => (<SelectItem key={eng} value={eng}>{eng}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="filter-section">
          <label className="filter-label">Mgmt Decision</label>
          <Select value={selectedDecision} onValueChange={(v) => setSelectedDecision(v ?? "All")}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="All Decisions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Decisions</SelectItem>
              <SelectItem value={ManagementDecision.GO}>Go</SelectItem>
              <SelectItem value={ManagementDecision.NO_GO}>No Go</SelectItem>
              <SelectItem value={ManagementDecision.PENDING}>Pending</SelectItem>
              <SelectItem value={ManagementDecision.DEFERRED}>Deferred</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="filter-section">
          <label className="filter-label">Value Range (\u20B9 Cr)</label>
          <div className="range-grid">
            <input type="number" className="filter-text-input" placeholder="Min" value={valueMin} onChange={(e) => setValueMin(e.target.value)} min="0" />
            <input type="number" className="filter-text-input" placeholder="Max" value={valueMax} onChange={(e) => setValueMax(e.target.value)} min="0" />
          </div>
        </div>
        <div className="filter-section">
          <label className="filter-label">Price</label>
          <Select value={priceBasisFilter} onValueChange={(v) => setPriceBasisFilter(v ?? "All")}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="All Prices" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Prices</SelectItem>
              <SelectItem value="Firm">Firm</SelectItem>
              <SelectItem value="Variable">Variable</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="filter-section">
          <label className="filter-label">Aluminium Price Range</label>
          <div className="range-grid">
            <input type="number" className="filter-text-input" placeholder="Min" value={aluminiumMin} onChange={(e) => setAluminiumMin(e.target.value)} min="0" />
            <input type="number" className="filter-text-input" placeholder="Max" value={aluminiumMax} onChange={(e) => setAluminiumMax(e.target.value)} min="0" />
          </div>
        </div>
        <div className="filter-section">
          <label className="filter-label">Copper Price Range</label>
          <div className="range-grid">
            <input type="number" className="filter-text-input" placeholder="Min" value={copperMin} onChange={(e) => setCopperMin(e.target.value)} min="0" />
            <input type="number" className="filter-text-input" placeholder="Max" value={copperMax} onChange={(e) => setCopperMax(e.target.value)} min="0" />
          </div>
        </div>
      </div>
      {onRefresh && (
        <div className="sidebar-footer">
          <button className="refresh-btn" onClick={onRefresh}>Refresh Dashboard</button>
        </div>
      )}
    </div>
  );
};
