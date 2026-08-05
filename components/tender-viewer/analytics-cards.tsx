"use client";

interface AnalyticsCardsProps {
  rows: Record<string, string>[];
  associations: { id: number; name: string; email: string }[];
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2.5 rounded-sm bg-slate-50 text-sm">
      <span className="text-slate-700">{label}</span>
      <span className="font-semibold text-primary">{value}</span>
    </div>
  );
}

export default function AnalyticsCards({ rows, associations }: AnalyticsCardsProps) {
  if (!rows || rows.length === 0) return null;

  const aiYes = rows.filter((r) => r.aiRelevanceValid === "true").length;
  const aiYesUnallocated = rows.filter((r) => r.aiRelevanceValid === "true" && !r.assignedTo).length;
  const apmYesAllocated = rows.filter((r) => r.apm === "YES" && r.assignedTo).length;
  const apmNoUnallocated = rows.filter((r) => r.apm === "YES" && !r.assignedTo).length;

  const personCounts = associations
    .map((a) => ({
      ...a,
      count: rows.filter((r) => {
        const assignedIds = (r.assignedTo || "").split(",").filter(Boolean);
        return assignedIds.includes(String(a.id));
      }).length,
    }))
    .filter((p) => p.count > 0);

  return (
    <div className="flex flex-col w-96 rounded-sm bg-white border border-slate-200 shadow-sm overflow-hidden h-full">
      <div className="bg-linear-to-r from-primary to-primary/80 px-4 py-3 flex items-center gap-2.5">
        <div className="flex items-center justify-center w-6 h-6 rounded-sm bg-white/10">
          <svg className="size-3.5 text-primary-foreground/80" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide">Analytics Dashboard</h3>
          <p className="text-[11px] text-primary-foreground/60">Key metrics at a glance</p>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1 overflow-auto">
        <div className="space-y-1">
          <MetricRow label="AI Relevance Yes" value={aiYes} />
          <MetricRow label="AI Relevance Yes (Unallocated)" value={aiYesUnallocated} />
          <MetricRow label="APM Yes (Allocated)" value={apmYesAllocated} />
          <MetricRow label="APM Yes (Unallocated)" value={apmNoUnallocated} />
        </div>

        {personCounts.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Assigned Tenders by Person
            </h4>
            <div className="space-y-1">
              {personCounts.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-sm bg-slate-50 text-sm">
                  <span className="text-slate-700">{p.name}</span>
                  <span className="font-semibold text-primary">{p.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
