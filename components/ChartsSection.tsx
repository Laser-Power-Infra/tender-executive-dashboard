import React from "react";
import "./ChartsSection.css";

// 1. Chart Data Interfaces
export interface MonthlyTrendItem {
  monthLabel: string;
  count: number;
  valueRs: number;
}

export interface ClientItem {
  clientName: string;
  valueRs: number;
}

export interface DistributionItem {
  label: string;
  count: number;
  color: string;
}

interface ChartsSectionProps {
  monthlyTrend: MonthlyTrendItem[];
  averageMonthlyCount: number;
  topClients: ClientItem[];
}

export const ChartsSection: React.FC<ChartsSectionProps> = ({
  monthlyTrend,
  averageMonthlyCount,
  topClients
}) => {
  return (
    <div className="charts-section-container">
      {/* ROW 1: Trend Charts (Bar & Line) */}
      <div className="charts-row">
        {/* Chart 1: Monthly Submitted Tender Count */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Monthly Participation Trend</h3>
            <span className="chart-subtitle">Tender Count</span>
          </div>
          <SvgBarChart data={monthlyTrend} avgValue={averageMonthlyCount} />
        </div>

        {/* Chart 2: Monthly Submitted Tender Value */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Submitted Tender Value</h3>
            <span className="chart-subtitle">Financial Trend</span>
          </div>
          <SvgAreaChart data={monthlyTrend} />
        </div>
      </div>



      {/* ROW 3: Top Clients by Value */}
      <div className="chart-card">
        <div className="chart-header">
          <h3 className="chart-title">Top Clients by Tender Value</h3>
          <span className="chart-subtitle">Ranked by Est. Cost</span>
        </div>
        <HorizontalBarChart data={topClients} />
      </div>
    </div>
  );
};

// ==========================================
// 2. SUB-COMPONENTS: NATIVE SVG CHARTS
// ==========================================

// SVG Bar Chart (Tender Count)
const SvgBarChart: React.FC<{ data: MonthlyTrendItem[]; avgValue: number }> = ({ data, avgValue }) => {
  const maxVal = Math.max(...data.map(d => d.count), 1);
  const paddingLeft = 35;
  const paddingRight = 15;
  const paddingTop = 20;
  const paddingBottom = 25;
  const width = 500;
  const height = 200;

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const barSpacing = 12;
  const totalBars = data.length;
  const barWidth = (plotWidth - barSpacing * (totalBars - 1)) / totalBars;

  return (
    <div className="svg-chart-container">
      <svg className="svg-chart" viewBox={`0 0 ${width} ${height}`}>
        {/* Grid lines & Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = paddingTop + plotHeight * (1 - ratio);
          const gridVal = Math.round(maxVal * ratio);
          return (
            <g key={idx}>
              <line className="chart-grid-line" x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} />
              <text className="chart-axis-text" x={paddingLeft - 8} y={y + 3} textAnchor="end">
                {gridVal}
              </text>
            </g>
          );
        })}

        {/* X-axis line */}
        <line
          className="chart-axis-line"
          x1={paddingLeft}
          y1={height - paddingBottom}
          x2={width - paddingRight}
          y2={height - paddingBottom}
        />

        {/* Bars */}
        {data.map((item, index) => {
          const barHeight = (item.count / maxVal) * plotHeight;
          const x = paddingLeft + index * (barWidth + barSpacing);
          const y = height - paddingBottom - barHeight;

          return (
            <g key={index}>
              <rect
                className="chart-bar"
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 2)}
                fill="#1e3d59"
              />
              {item.count > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  textAnchor="middle"
                  className="chart-axis-text"
                  style={{ fill: "#0a2540", fontWeight: 700 }}
                >
                  {item.count}
                </text>
              )}
              <text
                className="chart-axis-text"
                x={x + barWidth / 2}
                y={height - paddingBottom + 14}
                textAnchor="middle"
                style={{ fontWeight: 700 }}
              >
                {item.monthLabel}
              </text>
            </g>
          );
        })}

        {/* Average Line */}
        {avgValue > 0 && (
          <g>
            {(() => {
              const avgY = height - paddingBottom - (avgValue / maxVal) * plotHeight;
              return (
                <>
                  <line
                    className="chart-avg-line"
                    x1={paddingLeft}
                    y1={avgY}
                    x2={width - paddingRight}
                    y2={avgY}
                  />
                  <text
                    x={width - paddingRight - 4}
                    y={avgY - 4}
                    className="chart-axis-text"
                    style={{ fill: "#c5221f", fontWeight: 700, textAnchor: "end" }}
                  >
                    AVG: {avgValue}
                  </text>
                </>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
};

// SVG Area & Line Chart (Tender Value)
const SvgAreaChart: React.FC<{ data: MonthlyTrendItem[] }> = ({ data }) => {
  const maxVal = Math.max(...data.map(d => d.valueRs), 1);
  const paddingLeft = 45;
  const paddingRight = 15;
  const paddingTop = 20;
  const paddingBottom = 25;
  const width = 500;
  const height = 200;

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const points = data.map((item, index) => {
    const x = paddingLeft + (index / (data.length - 1 || 1)) * plotWidth;
    const y = height - paddingBottom - (item.valueRs / maxVal) * plotHeight;
    return { x, y, value: item.valueRs, label: item.monthLabel };
  });

  const formatCurrencyLabel = (val: number): string => {
    const crores = val / 10000000;
    if (crores >= 1) return `₹${crores.toFixed(1)}Cr`;
    const lakhs = val / 100000;
    if (lakhs >= 1) return `₹${lakhs.toFixed(0)}L`;
    return `₹${(val / 1000).toFixed(0)}K`;
  };

  const linePath = points.length > 0
    ? `M ${points.map(p => `${p.x} ${p.y}`).join(" L ")}`
    : "";

  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`
    : "";

  return (
    <div className="svg-chart-container">
      <svg className="svg-chart" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a73e8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#1a73e8" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = paddingTop + plotHeight * (1 - ratio);
          const gridVal = maxVal * ratio;
          return (
            <g key={idx}>
              <line className="chart-grid-line" x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} />
              <text className="chart-axis-text" x={paddingLeft - 8} y={y + 3} textAnchor="end">
                {formatCurrencyLabel(gridVal)}
              </text>
            </g>
          );
        })}

        {/* X-axis line */}
        <line
          className="chart-axis-line"
          x1={paddingLeft}
          y1={height - paddingBottom}
          x2={width - paddingRight}
          y2={height - paddingBottom}
        />

        {/* Area Path */}
        {areaPath && <path className="chart-area-path" d={areaPath} />}

        {/* Line Stroke Path */}
        {linePath && <path className="chart-line-path" d={linePath} />}

        {/* Dots and Labels */}
        {points.map((pt, index) => (
          <g key={index}>
            <circle className="chart-line-dot" cx={pt.x} cy={pt.y} r="3.5" />
            {pt.value > 0 && (
              <text
                x={pt.x}
                y={pt.y - 8}
                textAnchor="middle"
                className="chart-axis-text"
                style={{ fill: "#1a73e8", fontWeight: 700 }}
              >
                {formatCurrencyLabel(pt.value)}
              </text>
            )}
            <text
              className="chart-axis-text"
              x={pt.x}
              y={height - paddingBottom + 14}
              textAnchor="middle"
              style={{ fontWeight: 700 }}
            >
              {pt.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};



// Horizontal Bar Chart (Top Clients)
const HorizontalBarChart: React.FC<{ data: ClientItem[] }> = ({ data }) => {
  const maxVal = Math.max(...data.map(d => d.valueRs), 1);

  const formatCurrency = (value: number): string => {
    const crores = value / 10000000;
    if (crores >= 1) return `₹${crores.toFixed(1)} Cr`;
    const lakhs = value / 100000;
    if (lakhs >= 1) return `₹${lakhs.toFixed(0)} L`;
    return `₹${new Intl.NumberFormat("en-IN").format(value)}`;
  };

  return (
    <div className="client-bars-container">
      {data.map((item, index) => {
        const percentWidth = (item.valueRs / maxVal) * 100;
        return (
          <div className="client-row" key={index}>
            <div className="client-name-label" title={item.clientName}>
              {index + 1}. {item.clientName}
            </div>
            <div className="client-bar-wrapper">
              <div className="client-bar-fill" style={{ width: `${percentWidth}%` }} />
            </div>
            <div className="client-value-label">{formatCurrency(item.valueRs)}</div>
          </div>
        );
      })}
    </div>
  );
};
