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

    setAnalysisProgress({ done: 0, total: targets.length });
    setOpen(false);

    for (let i = 0; i < targets.length; i++) {
      if (abortRef.current) break;

      const row = targets[i];
      const brief = String(row.tenderBrief ?? "");

      try {
        const result = await dispatch(analyzeTender({
          id: Number(row.id),
          type: row.type as "Gem" | "Non-Gem",
          brief,
        })).unwrap();

        if (result.valid === "true" && row.type === "Gem") {
          const gemId = row.referenceNo as string | undefined;
          if (gemId) {
            try {
              const dlResult = await dispatch(downloadTenderPdf({
                id: Number(row.id),
                gemId,
              })).unwrap();

              if (dlResult.tenderFileUrl) {
                await dispatch(parseTenderPdf({
                  id: Number(row.id),
                })).unwrap();
              }
            } catch {
              console.error("Download or parse failed");
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message === "rate_limit") {
          abortRef.current = true;
          break;
        }
        console.error("Analysis failed");
      }

      setAnalysisProgress(prev => ({ ...prev, done: prev.done + 1 }));
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
