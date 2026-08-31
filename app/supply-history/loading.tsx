export default function Loading() {
  return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", minHeight: "400px", flexDirection: "column", gap: 12, color: "#0a2540" }}>
      <div style={{ width: 36, height: 36, border: "3px solid #e1e6eb", borderTopColor: "#1a73e8", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <span style={{ fontSize: 14, fontWeight: 600 }}>Loading supply history...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
