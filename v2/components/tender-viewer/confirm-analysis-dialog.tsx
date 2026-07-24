"use client";

import { useState, useRef, useCallback } from "react";
import { useAppDispatch } from "@/lib/hooks";
import {
  analyzeTender,
  downloadTenderPdf,
  parseTenderPdf,
} from "@/lib/slices/tendersSlice";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Zap, Square } from "lucide-react";

interface ConfirmAnalysisDialogProps {
  filteredRows: Record<string, unknown>[];
}

export default function ConfirmAnalysisDialog({
  filteredRows,
}: ConfirmAnalysisDialogProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [reRunAll, setReRunAll] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ done: 0, total: 0 });
  const abortRef = useRef(false);

  const runAnalysis = useCallback(async (checked: boolean) => {
    abortRef.current = false;
    setIsAnalyzing(true);
    setAnalysisProgress({ done: 0, total: 0 });

    const targets = filteredRows.filter(r => {
      const brief = String(r.tenderBrief ?? "");
      if (!brief || brief === "\u2014") return false;
      if (!checked && r.aiRelevanceValid) return false;
      return true;
    });

    if (targets.length === 0) {
      toast.info("No tenders to analyze — all filtered tenders already have an AI result or are missing a tender brief");
      setIsAnalyzing(false);
      setOpen(false);
      return;
    }

    const toastId = toast.loading(`Analyzing ${targets.length} tender(s)...`);

    setAnalysisProgress({ done: 0, total: targets.length });
    setOpen(false);

    let successCount = 0;
    let failCount = 0;
    let stoppedByRateLimit = false;

    for (let i = 0; i < targets.length; i++) {
      if (abortRef.current) {
        toast.info(`Analysis stopped (${successCount} completed)`, { id: toastId });
        break;
      }

      const row = targets[i];
      const brief = String(row.tenderBrief ?? "");

      try {
        await dispatch(analyzeTender({
          tenderMergedId: Number(row.id),
          brief,
        })).unwrap();

        successCount++;
        toast.loading(`Analyzing ${targets.length} tender(s)... (${successCount}/${targets.length})`, { id: toastId });

        if (row.type === "Gem") {
          const gemId = row.referenceNo as string | undefined;
          if (gemId) {
            try {
              const dlResult = await dispatch(downloadTenderPdf({
                tenderMergedId: Number(row.id),
                gemId,
              })).unwrap();

              if (dlResult.tenderFileUrl) {
                await dispatch(parseTenderPdf({
                  tenderMergedId: Number(row.id),
                })).unwrap();
              }
            } catch {
              toast.error(`Failed to download/parse PDF for #${row.id}`);
            }
          }
        } else if (row.type === "Non-Gem") {
          const referenceNo = row.referenceNo as string | undefined;
          const website = row.website as string | undefined;

          if (referenceNo) {
            try {
              await dispatch(downloadTenderPdf({
                tenderMergedId: Number(row.id),
                referenceNo,
              })).unwrap();
            } catch {
              toast.error(`Failed to queue PDF download for #${row.id}`);
            }
          }

          if (referenceNo && website) {
            try {
              const res = await fetch(`${process.env.DJANGO_API_KEY}/api/search-tender/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ website, reference_no: referenceNo }),
              });
              const data = await res.json();
              console.log(`[Non-GEM] Django API result for ${referenceNo}:`, data);
            } catch (e) {
              toast.error(`Django search failed for #${row.id}`);
            }
          }
        }
      } catch (err) {
        failCount++;
        if (err instanceof Error && err.message === "rate_limit") {
          abortRef.current = true;
          stoppedByRateLimit = true;
          toast.error("OpenAI rate limit reached — analysis stopped");
          break;
        }
        toast.error(`Analysis failed for #${row.id}`);
      }

      setAnalysisProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }

    if (!abortRef.current && !stoppedByRateLimit) {
      if (failCount === 0) {
        toast.success(`Analysis complete — ${successCount} tender(s) analyzed`, { id: toastId });
      } else {
        toast.warning(`Analysis complete — ${successCount} succeeded, ${failCount} failed`, { id: toastId });
      }
    }

    setIsAnalyzing(false);
    setAnalysisProgress({ done: 0, total: 0 });
  }, [filteredRows, dispatch]);

  const handleStop = useCallback(() => {
    abortRef.current = true;
  }, []);

  if (isAnalyzing) {
    return (
      <button className="export-btn" onClick={handleStop} style={{ color: "#f87171" }}>
        <Square className="size-3.5 fill-current" />
        Stop ({analysisProgress.done}/{analysisProgress.total})
      </button>
    );
  }

  return (
    <>
      <button className="export-btn" onClick={() => setOpen(true)}>
        <Zap className="size-3.5" />
        AI Analysis
      </button>
      <AlertDialog open={open} onOpenChange={setOpen} >
        <AlertDialogContent className={`rounded-sm`}>
          <AlertDialogHeader>
            <AlertDialogTitle>Run AI Analysis</AlertDialogTitle>
            <AlertDialogDescription>
              Run AI analysis on {filteredRows.length} filtered tenders?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-sm pb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={reRunAll}
              onChange={(e) => setReRunAll(e.target.checked)}
              className="size-3.5"
            />
            <span className="text-muted-foreground">Re-analyze already analyzed tenders</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel className={`rounded-sm`}>Cancel</AlertDialogCancel>
            <AlertDialogAction className={`rounded-sm`} onClick={() => runAnalysis(reRunAll)}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
