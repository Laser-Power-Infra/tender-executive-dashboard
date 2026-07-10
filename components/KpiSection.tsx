import React from "react";
import "./KpiSection.css";

export interface KpiSectionProps {
  totalSubmittedTenders: number;
  totalSubmittedValueRs: number;
  wonTendersCount: number;
  winPercentage: number;
  underEvaluationCount: number;
  loiReceivedMtdRs: number;
  reverseAuctionsCount: number;
  emdExposureRs: number;
  avgDiffPercentFromL1: number | null;
  avgDiffPercentFromL2: number | null;
}

export const KpiSection: React.FC<KpiSectionProps> = ({
  totalSubmittedTenders,
  totalSubmittedValueRs,
  wonTendersCount,
  winPercentage,
  underEvaluationCount,
  loiReceivedMtdRs,
  reverseAuctionsCount,
  emdExposureRs,
  avgDiffPercentFromL1,
  avgDiffPercentFromL2
}) => {
  
  // Format numbers with Indian numbering system (commas)
  const formatCount = (value: number): string => {
    return new Intl.NumberFormat("en-IN").format(value);
  };

  // Convert large currency values to Crores (1 Cr = 10,000,000 Rs)
  const formatCurrency = (value: number): string => {
    const crores = value / 10000000;
    if (crores >= 0.1) { // Show in Crores if value is >= 10 Lakhs (0.1 Cr)
      return `₹${crores.toFixed(1)}Cr`;
    }
    const lakhs = value / 100000;
    if (lakhs >= 1) {
      return `₹${lakhs.toFixed(1)} Lakh`;
    }
    return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;
  };

  // Format bid variance percentages (+x.x% or -x.x%)
  const formatVariance = (value: number | null): string => {
    if (value === null) return "-";
    const percent = value * 100;
    const prefix = percent > 0 ? "+" : "";
    return `${prefix}${percent.toFixed(1)}%`;
  };

  return (
    <div className="kpi-grid-container">
      {/* 1. Total Submitted Tenders */}
      <div className="kpi-card theme-blue">
        <h3 className="kpi-title">Submitted Tenders</h3>
        <p className="kpi-value">{formatCount(totalSubmittedTenders)}</p>
        <div className="kpi-trend neutral">Primary Dataset</div>
      </div>

      {/* 2. Total Submitted Value */}
      <div className="kpi-card theme-blue">
        <h3 className="kpi-title">Submitted Value</h3>
        <p className="kpi-value">{formatCurrency(totalSubmittedValueRs)}</p>
        <div className="kpi-trend">Est. Project Budget</div>
      </div>

      {/* 3. Won Tenders */}
      <div className="kpi-card theme-green">
        <h3 className="kpi-title">Won Tenders</h3>
        <p className="kpi-value">{formatCount(wonTendersCount)}</p>
        <div className="kpi-trend positive">LOI / PO Issued</div>
      </div>

      {/* 4. Win Percentage */}
      <div className="kpi-card theme-green">
        <h3 className="kpi-title">Win % (Count)</h3>
        <p className="kpi-value">{winPercentage.toFixed(1)}%</p>
        <div className="kpi-trend positive">Tenders Won / Total</div>
      </div>

      {/* 5. LOI Received (MTD) */}
      <div className="kpi-card theme-blue">
        <h3 className="kpi-title">LOI Received (MTD)</h3>
        <p className="kpi-value">{formatCurrency(loiReceivedMtdRs)}</p>
        <div className="kpi-trend">Current Calendar Month</div>
      </div>

      {/* 6. Under Evaluation */}
      <div className="kpi-card theme-orange">
        <h3 className="kpi-title">Under Eval</h3>
        <p className="kpi-value">{formatCount(underEvaluationCount)}</p>
        <div className="kpi-trend">Pending Client Decision</div>
      </div>

      {/* 7. Reverse Auctions */}
      <div className="kpi-card theme-purple">
        <h3 className="kpi-title">Reverse Auctions</h3>
        <p className="kpi-value">{formatCount(reverseAuctionsCount)}</p>
        <div className="kpi-trend">RA Applicable Cases</div>
      </div>

      {/* 8. EMD Exposure */}
      <div className="kpi-card theme-red">
        <h3 className="kpi-title">EMD Exposure</h3>
        <p className="kpi-value">{formatCurrency(emdExposureRs)}</p>
        <div className="kpi-trend negative">Active / Locked Deposits</div>
      </div>

      {/* 9. Average Diff from L1 */}
      <div className="kpi-card theme-gray">
        <h3 className="kpi-title">Avg. Diff L1 (%)</h3>
        <p className="kpi-value">{formatVariance(avgDiffPercentFromL1)}</p>
        <div className={`kpi-trend ${(avgDiffPercentFromL1 || 0) <= 0 ? "positive" : "negative"}`}>
          Variance from Lowest Bid
        </div>
      </div>

      {/* 10. Average Diff from L2 */}
      <div className="kpi-card theme-gray">
        <h3 className="kpi-title">Avg. Diff L2 (%)</h3>
        <p className="kpi-value">{formatVariance(avgDiffPercentFromL2)}</p>
        <div className="kpi-trend">Variance from 2nd Bid</div>
      </div>
    </div>
  );
};
