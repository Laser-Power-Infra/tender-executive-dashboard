"use client";
import React, { useState } from "react";
import { RefreshCw } from "lucide-react";

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
    <div style={{ padding: "24px", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ color: "#0a2540", marginBottom: "24px" }}>Admin Panel</h1>
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
