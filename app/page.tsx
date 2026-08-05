"use client";
import React, { useState, useMemo } from "react";
import { FilterSidebar } from "@/components/FilterSidebar";
import { TenderTable } from "@/components/TenderTable";
import { AlertPanel } from "@/components/AlertPanel";
import { useAppSelector, useAppDispatch } from "@/lib/hooks";
import { TenderCalculations } from "@/services/tenderCalculations";
import { mapTenderSliceToEpcRecords } from "@/lib/mapTenderSliceToEpcRecords";
import { matchesRawMaterialRange } from "@/lib/rawMaterials";
import { syncSheetToMerged } from "@/lib/slices/tendersSlice";
import { Eraser, ExternalLink, Database, RefreshCw, Loader2, Landmark, Building2 } from "lucide-react";
import { toast } from "sonner";
import { queueAllCvaParsing } from "@/actions/queueCvaParsing";
import { useSession } from "next-auth/react";
import "./Dashboard.css";

export default function Home() {
  const referenceDate = useMemo(() => new Date("2026-06-25T12:00:00"), []);
  const dispatch = useAppDispatch();
  const { data: session } = useSession();
  const canSync = session?.user?.role === "admin" || session?.user?.role === "developer";
  const tenderSliceData = useAppSelector((s) => s.tenders.data);
  const loadingTenders = useAppSelector((s) => s.tenders.loading);
  const preFilteredData = useMemo(() => {
    if (!tenderSliceData) return null;
    return {
      ...tenderSliceData,
      rows: tenderSliceData.rows.filter(
        (r) => (r.apm === "YES" ) && !r.participated ,
      ),
    };
  }, [tenderSliceData]);
  const mappedRecords = useMemo(() => mapTenderSliceToEpcRecords(preFilteredData), [preFilteredData]);
  const [clearTrigger, setClearTrigger] = useState<number>(0);
  const [cvaLoading, setCvaLoading] = useState(false);
  const [syncBankLoading, setSyncBankLoading] = useState(false);
  const [syncOrgLoading, setSyncOrgLoading] = useState(false);
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

  const calculations = useMemo(() => new TenderCalculations(mappedRecords, referenceDate), [mappedRecords, referenceDate]);
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
        const basis = (record.price || "Firm").toString().toLowerCase();
        if (basis !== priceBasisFilter.toLowerCase()) return false;
      }
      if (!matchesRawMaterialRange(record, { aluMin: aluminiumMin, aluMax: aluminiumMax, cuMin: copperMin, cuMax: copperMax })) return false;
      return true;
    });
  }, [primaryDataset, clientSearch, selectedStatuses, selectedEngineer, selectedDecision, valueMin, valueMax, priceBasisFilter, aluminiumMin, aluminiumMax, copperMin, copperMax]);

  const alertData = useMemo(() => calculations.generateAlerts(activeDataset), [calculations, activeDataset]);

  const handleRefresh = async () => {
    const result = await dispatch(syncSheetToMerged());
    if (syncSheetToMerged.rejected.match(result)) {
      console.warn("[Sync] Failed:", result.payload);
    }
  };
  const handleEnrichCva = async () => {
    setCvaLoading(true);
    try {
      const { queued } = await queueAllCvaParsing();
      toast.success(`Queued ${queued} tenders for CVA parsing`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Queue failed");
    } finally {
      setCvaLoading(false);
    }
  };
  const handleSyncBankDetails = async () => {
    setSyncBankLoading(true);
    try {
      const res = await fetch("/api/sync-bank-details", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        toast.error(`Bank sync failed: ${data.error}`);
      } else {
        toast.success(`Bank details synced: ${data.updated} updated, ${data.notFound} not found, ${data.errors} errors`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bank sync failed");
    } finally {
      setSyncBankLoading(false);
    }
  };
  const handleSyncOrganization = async () => {
    setSyncOrgLoading(true);
    try {
      const res = await fetch("/api/sync-organization", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        toast.error(`Organization sync failed: ${data.error}`);
      } else {
        toast.success(`Organizations synced: ${data.updated} updated, ${data.notFound} not found`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Organization sync failed");
    } finally {
      setSyncOrgLoading(false);
    }
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
            {canSync && (
              <button className="erp-sync-btn" onClick={handleRefresh} disabled={loadingTenders} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                {loadingTenders ? <><RefreshCw size={14} /> Refreshing...</> : <><RefreshCw size={14} /> Refresh Dashboard</>}
              </button>
            )}
            <button
              className="erp-sync-btn"
              onClick={() => window.open("https://docs.google.com/spreadsheets/d/1GTwzxMgViohbCimXqfiBZBJsKbCSr7hCgbcHF_En1VE", "_blank", "noopener,noreferrer")}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <ExternalLink size={14} /> Open Sheet
            </button>
            <button
              className="erp-sync-btn"
              onClick={handleEnrichCva}
              disabled={cvaLoading}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              {cvaLoading ? <><RefreshCw size={14} className="spin" /> Queuing...</> : <><Database size={14} /> Parse CVA</>}
            </button>
            {/* {canSync && (
              <button
                className="erp-sync-btn"
                onClick={handleSyncBankDetails}
                disabled={syncBankLoading}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                {syncBankLoading ? <><RefreshCw size={14} className="spin" /> Syncing Bank...</> : <><Landmark size={14} /> Sync Bank Details</>}
              </button>
            )} */}
            {/* {canSync && (
              <button
                className="erp-sync-btn"
                onClick={handleSyncOrganization}
                disabled={syncOrgLoading}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                {syncOrgLoading ? <><RefreshCw size={14} className="spin" /> Syncing Org...</> : <><Building2 size={14} /> Sync Organization</>}
              </button>
            )} */}
          </div>
        </header>
        <main className="dashboard-body">
          {loadingTenders && !tenderSliceData ? (
            <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", minHeight: "500px", color: "#0a2540", fontWeight: 700, flexDirection: "column", gap: "15px" }}>
              <div style={{ width: "40px", height: "40px", border: "4px solid #e1e6eb", borderTopColor: "#1a73e8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}></div>
              <span style={{ fontSize: "16px", letterSpacing: "0.5px" }}>Loading tender data...</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            <>
              {/* <AlertPanel alerts={alertData} /> */}
              <TenderTable records={activeDataset} clearTrigger={clearTrigger}
                aluminiumMin={aluminiumMin} setAluminiumMin={setAluminiumMin} aluminiumMax={aluminiumMax} setAluminiumMax={setAluminiumMax}
                copperMin={copperMin} setCopperMin={setCopperMin} copperMax={copperMax} setCopperMax={setCopperMax}
              />
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
