import { useState } from "react";
import { dailyChartRuns, historyChartSeries } from "./cardHistory.js";
import { smoothLinePath } from "./chart-lines.js";
import { DAY, decimal, formatDate } from "./report.js";

const frame = { width: 560, height: 160, left: 46, right: 547, top: 13, bottom: 140 };
const yAt = (value, low, high) => frame.bottom - (value - low) / (high - low) * (frame.bottom - frame.top);

function HistoryAxis({ low, high, first, last, label, children }) {
  const expanded = Date.parse(last) - Date.parse(first) >= 300 * DAY;
  const dateLabel = date => formatDate(date, expanded ? { month: "short", year: "numeric" } : {});
  return <>
    <svg viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-label={label}>
      {[high, (high + low) / 2, low].map(value => {
        const y = yAt(value, low, high);
        return <g key={value}>
          <line x1={frame.left} x2={frame.right} y1={y} y2={y} className="card-history-grid" />
          <text x={frame.left - 7} y={y + 4} textAnchor="end">{decimal(value, 1)}</text>
        </g>;
      })}
      {children}
    </svg>
    <div className="card-history-dates"><span>{dateLabel(first)}</span>{last !== first && <span>{dateLabel(last)}</span>}</div>
  </>;
}

function dateAxis(first, last) {
  const start = Date.parse(first), span = Date.parse(last) - start;
  return date => span ? frame.left + (Date.parse(date) - start) / span * (frame.right - frame.left) :
    (frame.left + frame.right) / 2;
}

function BatteryHistory({ rows, first, last }) {
  const ranges = rows.filter(({ values: [low, high] }) => Number.isFinite(low) && Number.isFinite(high) && low >= 0 && low <= high && high <= 100);
  if (!ranges.length) return <p>No daily Body Battery ranges in this period.</p>;
  const xAt = dateAxis(first, last);
  const thin = ranges.length > 90;
  return <figure className="card-history-plot">
    <figcaption>Daily low–high · Body Battery</figcaption>
    <HistoryAxis low={0} high={100} first={first} last={last} label={`Daily Body Battery low and high · ${ranges.length} recorded days`}>
      {ranges.map(({ date, values: [low, high] }, index) => {
        const x = xAt(date), y1 = yAt(low, 0, 100), y2 = yAt(high, 0, 100);
        return <g key={`${date}-${index}`} className="card-history-battery">
          <title>{`${formatDate(date, { year: "numeric" })} · Low ${low} · High ${high}`}</title>
          <line x1={x} x2={x} y1={y1} y2={y2} strokeWidth={thin ? 1.15 : 3} />
          <circle cx={x} cy={y1} r={thin ? 0.9 : 2.6} />
          <circle cx={x} cy={y2} r={thin ? 0.9 : 2.6} />
        </g>;
      })}
    </HistoryAxis>
  </figure>;
}

export function CardHistoryChart({ history, rows, first, last, battery }) {
  const [choice, setChoice] = useState("");
  if (!rows.length) return null;
  if (battery) return <BatteryHistory rows={rows} first={first} last={last} />;
  const series = historyChartSeries(history, rows);
  const picked = series.find(item => item.label === choice) || series[0];
  if (!picked) return <p>No numeric readings to chart in this period.</p>;
  const values = picked.points.map(point => point.value);
  const min = Math.min(...values), max = Math.max(...values);
  const padding = Math.max((max - min) * 0.12, 0.5);
  const low = min >= 0 ? Math.max(0, min - padding) : min - padding, high = max + padding;
  const xAt = dateAxis(first, last);
  const position = point => [xAt(point.date), yAt(point.value, low, high)];
  const paths = history.daily ? dailyChartRuns(picked.points).map(run => smoothLinePath(run.map(position))) : [];
  return <figure className="card-history-plot">
    {series.length > 1 ? <figcaption><label className="card-history-select">Chart metric
      <select value={picked.label} onChange={event => setChoice(event.target.value)}>
        {series.map(item => <option key={item.label}>{item.label}</option>)}
      </select>
    </label></figcaption> : <figcaption>{picked.label}</figcaption>}
    <HistoryAxis low={low} high={high} first={first} last={last} label={`${picked.label} · ${picked.points.length} recorded readings`}>
      {paths.map((path, index) => <path key={index} className="card-history-line" d={path} />)}
      {picked.points.map((point, index) => {
        const [cx, cy] = position(point);
        const dateOptions = point.precision === "month" ? { day: undefined, year: "numeric" } : { year: "numeric" };
        return <circle key={index} className="card-history-point" cx={cx} cy={cy} r={picked.points.length > 90 ? 1.5 : 3}>
          <title>{`${formatDate(point.date, dateOptions)} · ${picked.label} ${decimal(point.value, 2)}`}</title>
        </circle>;
      })}
    </HistoryAxis>
  </figure>;
}
