"use client";

import { useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  toggleParticipationFilter,
  type ParticipationFilter,
} from "@/lib/slices/filtersSlice";
import { resetSelectedDateRange } from "@/lib/slices/filesSlice";
import { deadlineMatchesRange } from "@/components/tender-viewer/participation-cards";
import { dedupeByDocketNo } from "@/lib/docket";

interface ParticipationFlowChartProps {
  rows: Record<string, unknown>[];
  onClearAssociation?: () => void;
}

function VerticalConnector() {
  return (
    <svg width="100%" height="10" className="block">
      <line
        x1="50%"
        y1="0"
        x2="50%"
        y2="10"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1"
      />
    </svg>
  );
}

function BranchConnector() {
  return (
    <svg
      width="100%"
      height="12"
      viewBox="0 0 200 12"
      preserveAspectRatio="none"
      className="block"
    >
      <circle cx="100" cy="0" r="2.5" fill="rgba(255,255,255,0.35)" />
      <line
        x1="100"
        y1="0"
        x2="100"
        y2="2"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1"
      />
      <line
        x1="50"
        y1="2"
        x2="150"
        y2="2"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1"
      />
      <line
        x1="50"
        y1="2"
        x2="50"
        y2="12"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1"
      />
      <line
        x1="150"
        y1="2"
        x2="150"
        y2="12"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1"
      />
    </svg>
  );
}

export function ParticipationFlowChart({
  rows,
  onClearAssociation,
}: ParticipationFlowChartProps) {
  const dispatch = useAppDispatch();
  const participationFilters = useAppSelector(
    (s) => s.filters.participationFilters,
  );
  const participatedDateRange = useAppSelector(
    (s) => s.filters.participatedDateRange,
  );

  const counts = useMemo(() => {
    const participatedRaw = rows.filter(
      (r) =>
        r.apm === "YES" &&
        r.participated === "true" &&
        deadlineMatchesRange(
          r,
          participatedDateRange?.from,
          participatedDateRange?.to,
        ),
    );
    // Deduplicate by docketNo: same docket counts as single tender
    const participated = dedupeByDocketNo(participatedRaw as unknown as (Record<string, unknown> & { id?: unknown })[]) as unknown as typeof participatedRaw;

    const withRa = participated.filter(
      (r) => r.reverseAuctionApplicable === "true",
    );
    const withoutRa = participated.filter(
      (r) => r.reverseAuctionApplicable !== "true",
    );
    const raDone = withRa.filter(
      (r) => !!r.reverseAuctionStartDate && !!r.reverseAuctionEndDate,
    );
    const raPending = withRa.filter(
      (r) => !r.reverseAuctionStartDate || !r.reverseAuctionEndDate,
    );
    const technicalOpen = withoutRa.filter((r) =>
      ["AWARDED", "FINANCIAL EVALUATION", "TENDER CANCELLED", "TECHNICAL BID OPENED"].includes(
        String(r.currentStatus ?? "").toUpperCase(),
      ),
    );
    const technicalNotOpen = withoutRa.filter((r) => {
      if (r.currentStatus == null) return true;
      const s = String(r.currentStatus).trim();
      return s === "" || s.toUpperCase() === "NOT EVALUATED";
    });
    const weL1 = raDone.filter(
      (r) => String(r.ourRank ?? "").trim() === "1",
    );
    const weLost = raDone.filter(
      (r) => String(r.ourRank ?? "").trim() !== "1",
    );
    const expRaDate = raPending.filter(
      (r) =>
        r.expectedRaDate != null &&
        String(r.expectedRaDate).trim() !== "",
    );
    const contractReceived = weL1.filter(
      (r) => r.contractNo != null && String(r.contractNo).trim() !== "",
    );
    const contractPending = weL1.filter(
      (r) => r.contractNo == null || String(r.contractNo).trim() === "",
    );
    const financialOpen = technicalOpen.filter((r) =>
      ["AWARDED", "FINANCIAL EVALUATION", "TENDER CANCELLED"].includes(
        String(r.currentStatus ?? "").trim().toUpperCase(),
      ),
    );
    const financialNotOpen = technicalOpen.filter(
      (r) =>
        !["AWARDED", "FINANCIAL EVALUATION", "TENDER CANCELLED"].includes(
          String(r.currentStatus ?? "").trim().toUpperCase(),
        ),
    );
    const financialWeL1 = financialOpen.filter(
      (r) => String(r.ourRank ?? "").trim() === "1",
    );
    const financialWeLost = financialOpen.filter(
      (r) => String(r.ourRank ?? "").trim() !== "1",
    );
    const financialContractReceived = financialWeL1.filter(
      (r) => r.contractNo != null && String(r.contractNo).trim() !== "",
    );
    const financialContractPending = financialWeL1.filter(
      (r) => r.contractNo == null || String(r.contractNo).trim() === "",
    );
    return {
      withRa: withRa.length,
      withoutRa: withoutRa.length,
      raDone: raDone.length,
      raPending: raPending.length,
      technicalOpen: technicalOpen.length,
      technicalNotOpen: technicalNotOpen.length,
      weL1: weL1.length,
      weLost: weLost.length,
      expRaDate: expRaDate.length,
      contractReceived: contractReceived.length,
      contractPending: contractPending.length,
      financialOpen: financialOpen.length,
      financialNotOpen: financialNotOpen.length,
      financialWeL1: financialWeL1.length,
      financialWeLost: financialWeLost.length,
      financialContractReceived: financialContractReceived.length,
      financialContractPending: financialContractPending.length,
    };
  }, [rows, participatedDateRange]);

  const handleNodeClick = (filter: ParticipationFilter) => {
    const isActiveCurrently = participationFilters.includes(filter);

    const parentMap: Partial<Record<ParticipationFilter, ParticipationFilter>> = {
      raDone: "participatedWithRa",
      raPending: "participatedWithRa",
      technicalOpen: "participatedWithoutRa",
      technicalNotOpen: "participatedWithoutRa",
      weL1: "raDone",
      weLost: "raDone",
      expRaDate: "raPending",
      contractReceived: "weL1",
      contractPending: "weL1",
      financialOpen: "technicalOpen",
      financialNotOpen: "technicalOpen",
    };

    const childrenMap: Partial<Record<ParticipationFilter, ParticipationFilter[]>> = {
      participatedWithRa: ["raDone", "raPending"],
      participatedWithoutRa: ["technicalOpen", "technicalNotOpen"],
      raDone: ["weL1", "weLost"],
      raPending: ["expRaDate"],
      weL1: ["contractReceived", "contractPending"],
      technicalOpen: ["financialOpen", "financialNotOpen"],
      financialOpen: ["weL1", "weLost"],
    };

    // Deactivating parent → deactivate children first
    if (!isActiveCurrently && childrenMap[filter]) {
      for (const child of childrenMap[filter]) {
        if (participationFilters.includes(child)) {
          dispatch(toggleParticipationFilter(child));
        }
      }
    }

    // Activating child → ensure parent is active
    const parent = parentMap[filter];
    if (!isActiveCurrently && parent && !participationFilters.includes(parent)) {
      dispatch(toggleParticipationFilter(parent));
    }

    // Always ensure participated base filter is active when any node is activated
    if (!isActiveCurrently && !participationFilters.includes("participatedTotal")) {
      dispatch(toggleParticipationFilter("participatedTotal"));
    }

    dispatch(toggleParticipationFilter(filter));
    dispatch(resetSelectedDateRange());
    onClearAssociation?.();
  };

  const handleFinancialWeClick = (filter: ParticipationFilter) => {
    const isActiveCurrently = participationFilters.includes(filter);
    if (!isActiveCurrently) {
      // Ensure financial We L1 parent chain for contract children
      if (
        (filter === "contractReceived" || filter === "contractPending") &&
        !participationFilters.includes("weL1")
      ) {
        if (!participationFilters.includes("financialOpen")) {
          if (!participationFilters.includes("technicalOpen")) {
            if (!participationFilters.includes("participatedWithoutRa")) {
              dispatch(toggleParticipationFilter("participatedWithoutRa"));
            }
            dispatch(toggleParticipationFilter("technicalOpen"));
          }
          dispatch(toggleParticipationFilter("financialOpen"));
        }
        dispatch(toggleParticipationFilter("weL1"));
      }
      if (
        (filter === "weL1" || filter === "weLost") &&
        !participationFilters.includes("financialOpen")
      ) {
        if (!participationFilters.includes("technicalOpen")) {
          if (!participationFilters.includes("participatedWithoutRa")) {
            dispatch(toggleParticipationFilter("participatedWithoutRa"));
          }
          dispatch(toggleParticipationFilter("technicalOpen"));
        }
        dispatch(toggleParticipationFilter("financialOpen"));
      }
    }
    if (!isActiveCurrently && !participationFilters.includes("participatedTotal")) {
      dispatch(toggleParticipationFilter("participatedTotal"));
    }
    dispatch(toggleParticipationFilter(filter));
    dispatch(resetSelectedDateRange());
    onClearAssociation?.();
  };

  const isActive = (filter: ParticipationFilter) =>
    participationFilters.includes(filter);

  const nodeClass = (active: boolean) =>
    `w-full h-fit self-start rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer border ${
      active
        ? "bg-blue-500/20 border-blue-400/50"
        : "bg-white/10 border-white/10 hover:bg-white/20"
    }`;

  return (
    <div className="space-y-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/50 mb-1">
        Participation Flow
      </div>

      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/80">
          With RA
        </div>
        <button
          type="button"
          onClick={() => handleNodeClick("participatedWithRa")}
          className={nodeClass(isActive("participatedWithRa"))}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
            With RA
          </div>
          <div className="text-lg font-bold text-violet-400 leading-tight">
            {counts.withRa}
          </div>
        </button>

        <VerticalConnector />
        <BranchConnector />

        <div className="grid grid-cols-2 gap-2 items-start">
          <div>
            <button
              type="button"
              onClick={() => handleNodeClick("raDone")}
              className={nodeClass(isActive("raDone"))}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                RA Done
              </div>
              <div className="text-lg font-bold text-green-400 leading-tight">
                {counts.raDone}
              </div>
            </button>

            <VerticalConnector />
            <BranchConnector />

            <div className="grid grid-cols-2 gap-2 items-start">
              <div>
                <button
                  type="button"
                  onClick={() => handleNodeClick("weL1")}
                  className={nodeClass(isActive("weL1"))}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                    We L1
                  </div>
                  <div className="text-lg font-bold text-emerald-400 leading-tight">
                    {counts.weL1}
                  </div>
                </button>

                <VerticalConnector />
                <BranchConnector />

                <div className="grid grid-cols-2 gap-2 items-start">
                  <button
                    type="button"
                    onClick={() => handleNodeClick("contractReceived")}
                    className={nodeClass(isActive("contractReceived"))}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                      Contract Received
                    </div>
                    <div className="text-lg font-bold text-emerald-300 leading-tight">
                      {counts.contractReceived}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNodeClick("contractPending")}
                    className={nodeClass(isActive("contractPending"))}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                      Contract Pending
                    </div>
                    <div className="text-lg font-bold text-orange-400 leading-tight">
                      {counts.contractPending}
                    </div>
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleNodeClick("weLost")}
                className={nodeClass(isActive("weLost"))}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                  We Lost
                </div>
                <div className="text-lg font-bold text-rose-400 leading-tight">
                  {counts.weLost}
                </div>
              </button>
            </div>
          </div>
          <div>
            <button
              type="button"
              onClick={() => handleNodeClick("raPending")}
              className={nodeClass(isActive("raPending"))}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                RA Pending
              </div>
              <div className="text-lg font-bold text-amber-400 leading-tight">
                {counts.raPending}
              </div>
            </button>

            <VerticalConnector />

            <button
              type="button"
              onClick={() => handleNodeClick("expRaDate")}
              className={nodeClass(isActive("expRaDate"))}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                Exp RA Date
              </div>
              <div className="text-lg font-bold text-sky-400 leading-tight">
                {counts.expRaDate}
              </div>
            </button>
          </div>
        </div>
        </div>

      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300/80">
          Without RA
        </div>
        <button
          type="button"
          onClick={() => handleNodeClick("participatedWithoutRa")}
          className={nodeClass(isActive("participatedWithoutRa"))}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
            Without RA
          </div>
          <div className="text-lg font-bold text-cyan-400 leading-tight">
            {counts.withoutRa}
          </div>
        </button>

        <VerticalConnector />
        <BranchConnector />

        <div className="grid grid-cols-2 gap-2 items-start">
          <div>
            <button
              type="button"
              onClick={() => handleNodeClick("technicalOpen")}
              className={nodeClass(isActive("technicalOpen"))}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                Technical Open
              </div>
              <div className="text-lg font-bold text-green-400 leading-tight">
                {counts.technicalOpen}
              </div>
            </button>

            <VerticalConnector />
            <BranchConnector />

            <div className="grid grid-cols-2 gap-2 items-start">
              <div>
                <button
                  type="button"
                  onClick={() => handleNodeClick("financialOpen")}
                  className={nodeClass(isActive("financialOpen"))}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                    Financial Open
                  </div>
                  <div className="text-lg font-bold text-amber-400 leading-tight">
                    {counts.financialOpen}
                  </div>
                </button>

                <VerticalConnector />
                <BranchConnector />

                <div className="grid grid-cols-2 gap-2 items-start">
                  <div>
                    <button
                      type="button"
                      onClick={() => handleFinancialWeClick("weL1")}
                      className={nodeClass(isActive("weL1"))}
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                        We L1
                      </div>
                      <div className="text-lg font-bold text-emerald-400 leading-tight">
                        {counts.financialWeL1}
                      </div>
                    </button>

                    <VerticalConnector />
                    <BranchConnector />

                    <div className="grid grid-cols-2 gap-2 items-start">
                      <button
                        type="button"
                        onClick={() => handleFinancialWeClick("contractReceived")}
                        className={nodeClass(isActive("contractReceived"))}
                      >
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                          Contract Received
                        </div>
                        <div className="text-lg font-bold text-emerald-300 leading-tight">
                          {counts.financialContractReceived}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFinancialWeClick("contractPending")}
                        className={nodeClass(isActive("contractPending"))}
                      >
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                          Contract Pending
                        </div>
                        <div className="text-lg font-bold text-orange-400 leading-tight">
                          {counts.financialContractPending}
                        </div>
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFinancialWeClick("weLost")}
                    className={nodeClass(isActive("weLost"))}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                      We Lost
                    </div>
                    <div className="text-lg font-bold text-rose-400 leading-tight">
                      {counts.financialWeLost}
                    </div>
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleNodeClick("financialNotOpen")}
                className={nodeClass(isActive("financialNotOpen"))}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                  Financial Not Open
                </div>
                <div className="text-lg font-bold text-slate-300 leading-tight">
                  {counts.financialNotOpen}
                </div>
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleNodeClick("technicalNotOpen")}
            className={nodeClass(isActive("technicalNotOpen"))}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1">
              Technical Not Open
            </div>
            <div className="text-lg font-bold text-red-400 leading-tight">
              {counts.technicalNotOpen}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
