import { useId } from "react";
import { decimal } from "./report.js";
import { palette } from "./MetricGraphics.jsx";

export const forecastColors = { current: "#aab1b8", rest: palette.blue, session: palette.orange, fitness: palette.blue, fatigue: palette.purple };

export function ForecastBars({ title, rows, places = 2 }) {
  const id = useId();
  const valid = rows.filter(row => Number.isFinite(row.value) && row.value >= 0);
  const maximum = Math.max(1, ...valid.flatMap(row => [row.value, Number.isFinite(row.high) ? row.high : row.value])) * 1.08;
  const start = 64;
  const width = 196;
  const x = value => start + value / maximum * width;
  const height = rows.length * 26 + 8;
  const description = `${title}. ${rows.map(row => `${row.label}: ${decimal(row.value, places)}${Number.isFinite(row.low) && Number.isFinite(row.high) ? `, range ${decimal(row.low, places)} to ${decimal(row.high, places)}` : ""}`).join(". ")}`;
  return <svg className="forecast-mini-chart" viewBox={`0 0 310 ${height}`} role="img" aria-labelledby={id}>
    <title id={id}>{description}</title>
    {rows.map((row, index) => {
      const y = index * 26 + 13;
      const available = Number.isFinite(row.value) && row.value >= 0;
      return <g key={row.label}>
        <text x="0" y={y + 4} className="forecast-chart-label">{row.label}</text>
        <line x1={start} x2={start + width} y1={y} y2={y} stroke="#3c4248" strokeWidth="7" strokeLinecap="round" />
        {available && <>
          <line x1={start} x2={x(row.value)} y1={y} y2={y} stroke={row.color || forecastColors.current} strokeWidth="7" strokeLinecap="round" />
          {Number.isFinite(row.low) && Number.isFinite(row.high) && <g stroke={row.color || forecastColors.current} strokeWidth="1.5">
            <line x1={x(row.low)} x2={x(row.high)} y1={y} y2={y} />
            <line x1={x(row.low)} x2={x(row.low)} y1={y - 7} y2={y + 7} />
            <line x1={x(row.high)} x2={x(row.high)} y1={y - 7} y2={y + 7} />
          </g>}
          <circle cx={x(row.value)} cy={y} r="4" fill={row.color || forecastColors.current} stroke="#1b1e22" strokeWidth="1.5" />
        </>}
        <text x="310" y={y + 4} textAnchor="end" className="forecast-chart-value">{available ? decimal(row.value, places) : "—"}</text>
      </g>;
    })}
  </svg>;
}
