"use client";

import { ChartPoint } from "@/lib/types";

type Props = {
  title: string;
  points: ChartPoint[];
  height?: number;
  selectedStart?: string;
  selectedEnd?: string;
};

function formatValue(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function PerformanceChart({ title, points, height = 240, selectedStart, selectedEnd }: Props) {
  if (points.length < 2) {
    return null;
  }

  const width = 920;
  const padding = 28;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const valueRange = Math.max(max - min, 1);

  const getX = (index: number) => padding + (index / (points.length - 1)) * (width - padding * 2);
  const getY = (value: number) => height - padding - ((value - min) / valueRange) * (height - padding * 2);

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${getX(index).toFixed(2)} ${getY(point.value).toFixed(2)}`)
    .join(" ");

  const lastHistoricalIndex = points.map((point) => point.kind).lastIndexOf("historical");
  const historicalPoints = lastHistoricalIndex >= 0 ? points.slice(0, lastHistoricalIndex + 1) : points;
  const forecastPoints =
    lastHistoricalIndex >= 0 && lastHistoricalIndex < points.length - 1
      ? points.slice(lastHistoricalIndex, points.length)
      : [];

  const historicalPath = historicalPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${getX(index).toFixed(2)} ${getY(point.value).toFixed(2)}`)
    .join(" ");

  const forecastPath = forecastPoints
    .map((point, index) => {
      const globalIndex = lastHistoricalIndex + index;
      return `${index === 0 ? "M" : "L"} ${getX(globalIndex).toFixed(2)} ${getY(point.value).toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="chart-card">
      <div className="chart-head">
        <strong>{title}</strong>
        <span>
          {(selectedStart || points[0]?.date) ?? ""} to {(selectedEnd || points.at(-1)?.date) ?? ""}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label={title}>
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} className="axis" />
        <line x1={padding} x2={padding} y1={padding} y2={height - padding} className="axis" />
        <path d={historicalPath || linePath} className="chart-line" />
        {forecastPath ? <path d={forecastPath} className="chart-line forecast-line" /> : null}
      </svg>
      <div className="chart-footer">
        <span>{formatValue(points[0].value)}</span>
        <span>{formatValue(points.at(-1)?.value || 0)}</span>
      </div>
    </div>
  );
}
