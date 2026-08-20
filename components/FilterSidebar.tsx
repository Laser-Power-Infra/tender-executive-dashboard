"use client";
import React, { useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ParticipationCards } from "@/components/tender-viewer/participation-cards";
import { ParticipationFlowChart } from "@/components/ParticipationFlowChart";
import "./FilterSidebar.css";

interface FilterSidebarProps {
  priceBasisFilter: string;
  setPriceBasisFilter: (val: string) => void;
  aluminiumMin: string;
  setAluminiumMin: (val: string) => void;
  aluminiumMax: string;
  setAluminiumMax: (val: string) => void;
  copperMin: string;
  setCopperMin: (val: string) => void;
  copperMax: string;
  setCopperMax: (val: string) => void;
  rows?: Record<string, unknown>[];
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  priceBasisFilter, setPriceBasisFilter,
  aluminiumMin, setAluminiumMin, aluminiumMax, setAluminiumMax,
  copperMin, setCopperMin, copperMax, setCopperMax,
  rows = [],
}) => {
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleResizeMove = (e: MouseEvent) => {
    const diff = e.clientX - startXRef.current;
    const newWidth = Math.max(200, startWidthRef.current + diff);
    setSidebarWidth(newWidth);
  };

  const handleResizeEnd = () => {
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "default";
    document.body.style.userSelect = "";
  };

  return (
    <div className="filter-sidebar-container" style={{ width: sidebarWidth }}>
      <div className="sidebar-header">Participation Filters</div>
      <div className="sidebar-content">
        <ParticipationCards variant="dark" rows={rows} />
        <ParticipationFlowChart rows={rows} />
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
      <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
    </div>
  );
};
