"use client";
import React, { useState, useMemo } from "react";
import { FilterSidebar } from "@/components/FilterSidebar";
import { TenderTable } from "@/components/TenderTable";
import { AlertPanel } from "@/components/AlertPanel";
import { useTenderData } from "@/hooks/useTenderData";
import { TenderCalculations } from "@/services/tenderCalculations";
import { Eraser, RefreshCw, AlertTriangle } from "lucide-react";
import "./Dashboard.css";

export default function Home() {
  const referenceDate = useMemo(() => new Date("2026-06-25T12:00:00"), []);
  const { data: liveRecords, loading: liveLoading, error: liveError, refresh: liveRefresh } = useTenderData();
  const [clearTrigger, setClearTrigger] = useState<number>(0);
  const rawRecords = liveRecords || [];
  const [clientSearch, setClientSearch] = useState<string>("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedEngineer, setSelectedEngineer] = useState<string>("All");
  const [selectedDecision, setSelectedDecision] = useState<string>("All");
  const [valueMin, setValueMin] = useState<string>("");
  const [valueMax, setValueMax] = useState<string>("");
  const [priceBasisFilter, setPriceBasisFilter] = useState<string>("All");
  const [aluminiumMin, setAluminiumMin] = useState<string>("");
  const [aluminiumMax, setAluminiumMax] = useState<string>("");
  const [copperMin, setCopperMin] = useState<string>("");
  const [copperMax, setCopperMax] = useState<string>("");

  const calculations = useMemo(() => new TenderCalculations(rawRecords, referenceDate), [rawRecords, referenceDate]);
  const primaryDataset = useMemo(() => calculations.getPrimaryDataset(), [calculations]);
  const engineersList = useMemo(() => {
    const list = primaryDataset.map(r => r.tenderPrepareBy).filter(name => name && name.trim() !== "");
    return Array.from(new Set(list)).sort();
  }, [primaryDataset]);
  const uniqueStatuses = useMemo(() => {
    const list = primaryDataset.map(r => r.currentStatus || "");
    return Array.from(new Set(list)).sort();
  }, [primaryDataset]);

  const activeDataset = useMemo(() => {
    return primaryDataset.filter(record => {
      if (clientSearch.trim() !== "") {
        if (!record.nameOfTheClient.toLowerCase().includes(clientSearch.toLowerCase().trim())) return false;
      }
      if (selectedStatuses.length > 0) {
        if (!selectedStatuses.includes(record.currentStatus || "")) return false;
      }
      if (selectedEngineer !== "All") {
        if (record.tenderPrepareBy !== selectedEngineer) return false;
      }
      if (selectedDecision !== "All") {
        if (record.managementDecision !== selectedDecision) return false;
      }
      if (record.estimatedCostRs !== null) {
        if (valueMin.trim() !== "") {
          const minRs = parseFloat(valueMin) * 10000000;
          if (record.estimatedCostRs < minRs) return false;
        }
        if (valueMax.trim() !== "") {
          const maxRs = parseFloat(valueMax) * 10000000;
          if (record.estimatedCostRs > maxRs) return false;
        }
      } else if (valueMin.trim() !== "" || valueMax.trim() !== "") {
        return false;
      }
      if (priceBasisFilter !== "All") {
        const basis = (record.priceBasis || "Firm").toString().toLowerCase();
        if (basis !== priceBasisFilter.toLowerCase()) return false;
      }
      if (aluminiumMin.trim() !== "" || aluminiumMax.trim() !== "") {
        if (record.aluminiumPrice === null || record.aluminiumPrice === undefined) return false;
        const minAl = aluminiumMin.trim() !== "" ? parseFloat(aluminiumMin) : Number.NEGATIVE_INFINITY;
        const maxAl = aluminiumMax.trim() !== "" ? parseFloat(aluminiumMax) : Number.POSITIVE_INFINITY;
        if (record.aluminiumPrice < minAl || record.aluminiumPrice > maxAl) return false;
      }
      if (copperMin.trim() !== "" || copperMax.trim() !== "") {
        if (record.copperTapePrice === null || record.copperTapePrice === undefined) return false;
        const minCu = copperMin.trim() !== "" ? parseFloat(copperMin) : Number.NEGATIVE_INFINITY;
        const maxCu = copperMax.trim() !== "" ? parseFloat(copperMax) : Number.POSITIVE_INFINITY;
        if (record.copperTapePrice < minCu || record.copperTapePrice > maxCu) return false;
      }
      return true;
    });
  }, [primaryDataset, clientSearch, selectedStatuses, selectedEngineer, selectedDecision, valueMin, valueMax, priceBasisFilter, aluminiumMin, aluminiumMax, copperMin, copperMax]);

  const alertData = useMemo(() => calculations.generateAlerts(activeDataset), [calculations, activeDataset]);

  const handleRefresh = async () => {
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) {
        const body = await res.json();
        if (body?.details !== "Already running") {
          console.warn("[Refresh] Sync pipeline returned:", body);
        }
      }
    } catch (err) {
      console.warn("[Refresh] Sync pipeline failed, continuing with data refresh:", err);
    }
    await liveRefresh();
  };
  const handleClearAllFilters = () => {
    setClientSearch("");
    setSelectedStatuses([]);
    setSelectedEngineer("All");
    setSelectedDecision("All");
    setValueMin(""); setValueMax("");
    setPriceBasisFilter("All");
    setAluminiumMin(""); setAluminiumMax("");
    setCopperMin(""); setCopperMax("");
    setClearTrigger(prev => prev + 1);
  };

  return (
    <div className="dashboard-layout-container">
      <div className="dashboard-sidebar-wrapper">
        <FilterSidebar
          clientSearch={clientSearch} setClientSearch={setClientSearch}
          selectedStatuses={selectedStatuses} setSelectedStatuses={setSelectedStatuses} uniqueStatuses={uniqueStatuses}
          selectedEngineer={selectedEngineer} setSelectedEngineer={setSelectedEngineer} engineersList={engineersList}
          selectedDecision={selectedDecision} setSelectedDecision={setSelectedDecision}
          valueMin={valueMin} setValueMin={setValueMin} valueMax={valueMax} setValueMax={setValueMax}
          priceBasisFilter={priceBasisFilter} setPriceBasisFilter={setPriceBasisFilter}
          aluminiumMin={aluminiumMin} setAluminiumMin={setAluminiumMin} aluminiumMax={aluminiumMax} setAluminiumMax={setAluminiumMax}
          copperMin={copperMin} setCopperMin={setCopperMin} copperMax={copperMax} setCopperMax={setCopperMax}
          onRefresh={handleRefresh}
        />
      </div>
      <div className="dashboard-workspace">
        <header className="dashboard-top-header">
          <div className="header-brand">
            <h1 className="brand-logo-text">LASERPOWER <span>PARTICIPATION</span></h1>
            <div className="brand-divider"></div>
            <span className="brand-title">Executive Tender Dashboard</span>
          </div>
          <div className="header-actions">
            <button className="clear-filters-btn" onClick={handleClearAllFilters} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><Eraser size={14} /> Clear Filters</button>
            <button className="erp-sync-btn" onClick={handleRefresh} disabled={liveLoading} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {liveLoading ? <><RefreshCw size={14} /> Syncing...</> : <><RefreshCw size={14} /> Sync Sheet Data</>}
            </button>
          </div>
        </header>
        <main className="dashboard-body">
          {liveLoading ? (
            <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", minHeight: "500px", color: "#0a2540", fontWeight: 700, flexDirection: "column", gap: "15px" }}>
              <div style={{ width: "40px", height: "40px", border: "4px solid #e1e6eb", borderTopColor: "#1a73e8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}></div>
              <span style={{ fontSize: "16px", letterSpacing: "0.5px" }}>Syncing Live Google Sheet Database...</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : liveError && rawRecords.length === 0 ? (
            <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", minHeight: "400px", color: "#c5221f", fontWeight: 700, flexDirection: "column", gap: "15px", padding: "40px", textAlign: "center", backgroundColor: "#fdf6f6", border: "1px solid #fcdcdc", borderRadius: "8px", margin: "20px" }}>
              <span style={{ fontSize: "40px", display: "inline-flex", alignItems: "center" }}><AlertTriangle size={40} /></span>
              <h3 style={{ margin: 0, fontSize: "20px" }}>Database Connection Failed</h3>
              <p style={{ color: "#5f6368", fontWeight: 500, maxWidth: "500px", margin: 0, fontSize: "14px", lineHeight: "1.5" }}>
                Could not connect to the live Google Sheet. Ensure your server proxy is running on port 3001, your credentials in the <code>.env</code> file are correct, and the spreadsheet is shared with your Service Account email.
              </p>
              <div style={{ backgroundColor: "#ffffff", padding: "10px 15px", border: "1px solid #fcdcdc", borderRadius: "4px", fontSize: "12px", fontFamily: "monospace", color: "#c5221f", maxWidth: "100%", overflowX: "auto" }}>
                {liveError.message}
              </div>
              <button onClick={handleRefresh} style={{ backgroundColor: "#c5221f", color: "#ffffff", border: "none", padding: "10px 20px", borderRadius: "4px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#b01e1a"}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = "#c5221f"}>
                Retry Connection
              </button>
            </div>
          ) : (
            <>
              <AlertPanel alerts={alertData} />
              <TenderTable records={activeDataset} clearTrigger={clearTrigger} />
            </>
          )}
        </main>
        <footer className="dashboard-status-bar">
          <div className="status-left">
            <div className="sync-live-tag" style={{ color: "#137333" }}>
              <span className="sync-pulse-dot" style={{ backgroundColor: "#34a853" }}></span>
              <span>DATABASE LIVE (SYNC: ACTIVE)</span>
            </div>
          </div>
          <div className="status-center">LASERPOWER LIVE GOOGLE SHEET PIPELINE ACTIVE</div>
          <div className="status-right">
            <a className="status-link">SYSTEM DOCUMENTATION</a>
            <span>•</span>
            <a className="status-link">AUDIT LOGS</a>
            <span className="version-badge">LASERPOWER ERP V2.1 PRO</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
