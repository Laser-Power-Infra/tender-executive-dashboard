"use client";

import { useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Download, FileText, Upload } from "lucide-react";
import { type DateRange } from "react-day-picker";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import FileUpload from "@/components/upload/file-upload";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { clearFiles, clearResults } from "@/lib/slices/uploadSlice";
import { setSelectedDateRange } from "@/lib/slices/filesSlice";
import { importEpcGoTenders } from "@/lib/slices/tendersSlice";

interface TenderSidebarProps {
  rows?: Record<string, string>[];
  associations?: { id: number; name: string; email: string }[];
}

export default function TenderSidebar({
  rows = [],
  associations = [],
}: TenderSidebarProps) {
  const dispatch = useAppDispatch();
  const selectedDateFrom = useAppSelector((s) => s.files.selectedDateFrom);
  const selectedDateTo = useAppSelector((s) => s.files.selectedDateTo);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const analytics = useMemo(() => {
    if (rows.length === 0) return null;
    return {
      aiYes: rows.filter((r) => r.aiRelevanceValid === "true").length,
      aiYesUnallocated: rows.filter(
        (r) => r.aiRelevanceValid === "true" && !r.assignedTo,
      ).length,
      apmYesAllocated: rows.filter((r) => r.apm === "YES" && r.assignedTo)
        .length,
      apmYesUnallocated: rows.filter((r) => r.apm === "YES" && !r.assignedTo)
        .length,
      personCounts: associations
        .map((a) => ({
          ...a,
          count: rows.filter((r) => {
            const assignedIds = (r.assignedTo || "").split(",").filter(Boolean);
            return assignedIds.includes(String(a.id));
          }).length,
        }))
        .filter((p) => p.count > 0),
    };
  }, [rows, associations]);

  const selectedRange: DateRange | undefined = {
    from: new Date(selectedDateFrom),
    to: new Date(selectedDateTo),
  };

  const handleImportEpc = useCallback(async () => {
    const toastId = toast.loading(
      "Syncing tenders from executive dashboard...",
    );
    try {
      const result = await dispatch(importEpcGoTenders()).unwrap();
      toast.dismiss(toastId);
      const total = result.gemInserted + result.nonGemInserted;
      const merged = result.gemMerged + result.nonGemMerged;
      if (total === 0) {
        toast.info("No GO tenders to import");
      } else {
        toast.success(
          `Imported: ${result.gemInserted} GEM · ${result.nonGemInserted} Non-GEM`,
          {
            description: `${merged} merged (existing)${result.errors.length ? ` · ${result.errors.length} error(s)` : ""}`,
          },
        );
      }
      if (result.errors.length > 0) {
        for (const e of result.errors) {
          toast.error(`${e.referenceNo}: ${e.error}`);
        }
      }
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error("Import failed", {
        description: err.message ?? "Unknown error",
      });
    }
  }, [dispatch]);

  const closeDialog = useCallback(() => {
    dispatch(clearFiles());
    dispatch(clearResults());
    setShowUploadDialog(false);
  }, [dispatch]);

  return (
    <>
      <aside className="w-65 min-w-65 bg-linear-to-b from-[#0a2540] to-[#0d2f4f] flex flex-col overflow-y-auto shrink-0">
        <div className="px-5 py-4.5 pb-3.5 flex items-center gap-2 border-b border-white/10">
          <div className="flex items-center justify-center w-6 h-6 rounded-sm bg-white/10">
            <FileText size={14} className="text-white/80" />
          </div>
          <span className="text-xs font-bold text-white tracking-wider uppercase">
            Tender Dashboard
          </span>
        </div>

        <div className="flex-1 p-4 space-y-5 overflow-y-auto">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white mb-2.5">
              Upload Tenders
            </div>
            <button
              onClick={() => setShowUploadDialog(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-md bg-white/10 text-white/80 text-xs font-medium hover:bg-white/20 transition-colors border border-dashed border-white/20 cursor-pointer"
            >
              <Upload size={14} />
              Upload Files
            </button>
            <button
              onClick={handleImportEpc}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors border border-dashed border-green-400 cursor-pointer mt-2"
            >
              <Download size={14} />
              Sync Executive Dashboard
            </button>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white mb-2.5">
              Uploaded At
            </div>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 px-3 py-2 h-auto text-xs font-normal rounded-md bg-white/10 text-white/80 border-white/20 hover:bg-white/20 hover:text-white"
                  >
                    <CalendarIcon size={14} />
                    {selectedRange.from ? (
                      selectedRange.to ? (
                        <>
                          {format(selectedRange.from, "LLL dd, y")}
                          {" - "}
                          {format(selectedRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(selectedRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                }
              />
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  defaultMonth={selectedRange.from ?? undefined}
                  selected={selectedRange}
                  onSelect={(range) => {
                    if (range?.from && range?.to) {
                      const from = new Date(range.from);
                      const to = new Date(range.to);
                      from.setHours(0, 0, 0, 0);
                      to.setHours(0, 0, 0, 0);
                      dispatch(
                        setSelectedDateRange({
                          from: from.toISOString(),
                          to: to.toISOString(),
                        }),
                      );
                    }
                  }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>

          {analytics && (
            <>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white mb-1">
                  AI Relevance Yes
                </div>
                <div className="text-xl font-bold text-lime-500 leading-tight">
                  {analytics.aiYes}
                </div>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white mb-1">
                  AI Relevance Yes (Unallocated)
                </div>
                <div className="text-xl font-bold text-rose-500 leading-tight">
                  {analytics.aiYesUnallocated}
                </div>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white mb-1">
                  APM Yes (Allocated)
                </div>
                <div className="text-xl font-bold text-yellow-500 leading-tight">
                  {analytics.apmYesAllocated}
                </div>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white mb-1">
                  APM Yes (Unallocated)
                </div>
                <div className="text-xl font-bold text-blue-500 leading-tight">
                  {analytics.apmYesUnallocated}
                </div>
              </div>
              {analytics.personCounts.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-white mb-2.5">
                    Assigned Tenders by Person
                  </div>
                  <div className="space-y-1.5">
                    {analytics.personCounts.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between py-1.5 px-2.5 bg-white/10 rounded-lg"
                      >
                        <span className="text-xs text-white/70">{p.name}</span>
                        <span className="text-xs font-semibold text-white">
                          {p.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {showUploadDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={closeDialog}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">
                Upload Tenders
              </h3>
              <button
                onClick={closeDialog}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                ×
              </button>
            </div>
            <FileUpload />
          </div>
        </div>
      )}
    </>
  );
}
