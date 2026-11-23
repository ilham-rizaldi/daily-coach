import { useId, useState } from "react";
import { dailyChartRuns, historyChartSeries } from "./cardHistory.js";
import { smoothLinePath } from "./chart-lines.js";
import { DAY, decimal, formatDate } from "./report.js";

const frame = { width: 560, height: 160, left: 46, right: 547, top: 13, bottom: 140 };
const yAt = (value, low, high) => frame.bottom - (value - low) / (high - low) * (frame.bottom - frame.top);
const compactTick = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });

function HistoryAxis({ low, high, first, last, label, compact = false, children }) {
  const expanded = Date.parse(last) - Date.parse(first) >= 300 * DAY;
  const dateLabel = date => formatDate(date, expanded ? { month: "short", year: "numeric" } : {});
  return <>
    <svg viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-label={label}>
      {[1, 0.75, 0.5, 0.25, 0].map((step, index) => {
        const value = low + (high - low) * step;
        const y = yAt(value, low, high);
        return <g key={step}>
          <line x1={frame.left} x2={frame.right} y1={y} y2={y} className="card-history-grid" />
          {index % 2 === 0 && <text x={frame.left - 7} y={y + 4} textAnchor="end">{compact ? compactTick.format(value) : decimal(value, 1)}</text>}
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

function PlotHeading({ label, value, date, monthly = false, children }) {
  return <figcaption className="card-history-heading">
    <div className="card-history-label">{children || label}</div>
    <div className="card-history-reading">
      <strong>{value}</strong>
      <time dateTime={date}>{formatDate(date, monthly ? { day: undefined, year: "numeric" } : {})}</time>
    </div>
  </figcaption>;
}

function BatteryHistory({ rows, first, last }) {
  const ranges = rows.filter(({ values: [low, high] }) => Number.isFinite(low) && Number.isFinite(high) && low >= 0 && low <= high && high <= 100);
  if (!ranges.length) return <p>No daily Body Battery ranges in this period.</p>;
  const xAt = dateAxis(first, last);
  const thin = ranges.length > 90;
  const latest = ranges[0];
  return <figure className="card-history-plot">
    <PlotHeading label="Daily low–high · Body Battery" value={latest.values.slice(0, 2).join("–")} date={latest.date} />
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
  const fill = useId();
  if (!rows.length) return null;
  if (battery) return <BatteryHistory rows={rows} first={first} last={last} />;
  const series = historyChartSeries(history, rows);
  const picked = series.find(item => item.label === choice) || series[0];
  if (!picked) return <p>No numeric readings to chart in this period.</p>;
  const values = picked.points.map(point => point.value);
  const bars = history.display === "bars";
  const min = Math.min(...values), max = Math.max(...values);
  const padding = Math.max((max - min) * 0.12, 0.5);
  const low = bars ? 0 : min >= 0 ? Math.max(0, min - padding) : min - padding;
  const high = bars ? Math.max(1, max + padding) : max + padding;
  const xAt = dateAxis(first, last);
  const position = point => [xAt(point.date), yAt(point.value, low, high)];
  const runs = history.daily ? dailyChartRuns(picked.points).map(run => run.map(position)) : [];
  const latest = picked.points.at(-1);
  const recent = picked.points.filter(point => point.date === latest.date).map(point => point.value);
  const recentLow = Math.min(...recent), recentHigh = Math.max(...recent);
  const readout = recentLow === recentHigh ? decimal(recentLow) : [recentLow, recentHigh].map(v => decimal(v)).join("–");
  const barWidth = Math.max(2, Math.min(12, (frame.right - frame.left) / picked.points.length / 2));
  const barsByDate = new Map();
  if (bars) for (const point of picked.points) {
    if (!barsByDate.has(point.date)) barsByDate.set(point.date, []);
    barsByDate.get(point.date).push(point);
  }
  return <figure className="card-history-plot" data-series-style={history.display}>
    <PlotHeading label={picked.label} value={readout} date={latest.date} monthly={latest.precision === "month"}>
      {series.length > 1 && <select className="card-history-select" aria-label="Chart metric"
        value={picked.label} onChange={event => setChoice(event.target.value)}>
        {series.map(item => <option key={item.label}>{item.label}</option>)}
      </select>}
    </PlotHeading>
    <HistoryAxis low={low} high={high} first={first} last={last} compact={bars} label={`${picked.label} · ${picked.points.length} recorded readings`}>
      <defs>
        <linearGradient id={fill} x1="0" x2="0" y1="0" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="var(--blue)" stopOpacity=".18" /><stop offset="1" stopColor="var(--blue)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {runs.map((run, index) => {
        const path = smoothLinePath(run);
        const firstX = run[0][0], lastX = run.at(-1)[0];
        return <g key={index}>
          <path d={`${path}L${lastX},${frame.bottom}L${firstX},${frame.bottom}Z`} fill={`url(#${fill})`} />
          <path className="card-history-line" d={path} />
        </g>;
      })}
      {picked.points.map((point, index) => {
        const [cx, cy] = position(point);
        const dateOptions = point.precision === "month" ? { day: undefined, year: "numeric" } : { year: "numeric" };
        const detail = `${formatDate(point.date, dateOptions)} · ${picked.label} ${decimal(point.value, 2)}`;
        if (bars) {
          const group = barsByDate.get(point.date);
          const offset = (group.indexOf(point) - (group.length - 1) / 2) * (barWidth + 1);
          return <rect key={index} className="card-history-volume-bar" x={cx + offset - barWidth / 2} y={Math.min(cy, frame.bottom - 1)}
            width={barWidth} height={Math.max(1, frame.bottom - cy)} rx={2} data-latest={point === latest}><title>{detail}</title></rect>;
        }
        return <circle key={index} className="card-history-point" cx={cx} cy={cy} r={point.date === latest.date ? 3.8 : picked.points.length > 90 ? 1.5 : 2.7}>
          <title>{detail}</title>
        </circle>;
      })}
    </HistoryAxis>
  </figure>;
}
