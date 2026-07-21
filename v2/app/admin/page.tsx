"use client";
import React, { useState } from "react";
import Link from "next/link";
import { RefreshCw, Columns, ListOrdered, GitMerge } from "lucide-react";

export default function AdminPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const handleRefreshAll = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/refresh-all", { method: "POST" });
      const data = await res.json();
      setSyncResult(data.success ? "Sync completed successfully!" : `Sync failed: ${data.error}`);
    } catch (err) {
      setSyncResult(`Error: ${(err as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ padding: "24px", maxWidth: "900px", margin: "0 auto" }}>
      <h1 style={{ color: "#0a2540", marginBottom: "24px" }}>Admin Panel</h1>

      <div style={{ display: "flex", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
        <Link href="/admin/mappings" style={{ textDecoration: "none", flex: "1", minWidth: "200px" }}>
          <div style={{
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            padding: "20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            transition: "box-shadow 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <Columns size={24} style={{ color: "#0a2540" }} />
            <div>
              <div style={{ fontWeight: 600, color: "#0a2540", fontSize: "14px" }}>Column Mappings</div>
              <div style={{ color: "#888", fontSize: "12px" }}>Map Excel headers to DB fields</div>
            </div>
          </div>
        </Link>
        <Link href="/admin/indices" style={{ textDecoration: "none", flex: "1", minWidth: "200px" }}>
          <div style={{
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            padding: "20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            transition: "box-shadow 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <ListOrdered size={24} style={{ color: "#0a2540" }} />
            <div>
              <div style={{ fontWeight: 600, color: "#0a2540", fontSize: "14px" }}>Column Order</div>
              <div style={{ color: "#888", fontSize: "12px" }}>Reorder & configure columns</div>
            </div>
          </div>
        </Link>
        <Link href="/admin/merging" style={{ textDecoration: "none", flex: "1", minWidth: "200px" }}>
          <div style={{
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            padding: "20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            transition: "box-shadow 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <GitMerge size={24} style={{ color: "#0a2540" }} />
            <div>
              <div style={{ fontWeight: 600, color: "#0a2540", fontSize: "14px" }}>Column Merging</div>
              <div style={{ color: "#888", fontSize: "12px" }}>Merge multiple fields into one</div>
            </div>
          </div>
        </Link>
      </div>
      <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "24px" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "18px", color: "#333" }}>Data Synchronization</h2>
        <p style={{ color: "#666", fontSize: "14px", marginBottom: "16px" }}>
          Trigger a full refresh from all data sources (Google Sheets, Smartsheet, Supply History).
          This will pull the latest data and update the database.
        </p>
          <button
          onClick={handleRefreshAll}
          disabled={syncing}
          style={{
            padding: "10px 24px",
            background: syncing ? "#999" : "#0a2540",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: syncing ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {syncing ? <><RefreshCw size={14} /> Syncing All Sources...</> : <><RefreshCw size={14} /> Refresh All Data</>}
        </button>
        {syncResult && (
          <div style={{ marginTop: "16px", padding: "12px", background: syncResult.startsWith("Sync completed") ? "#e6f4ea" : "#fce8e6", borderRadius: "4px", fontSize: "14px" }}>
            {syncResult}
          </div>
        )}
      </div>
    </div>
  );
}
