import { useId } from "react";
import { decimal, formatDate } from "./report.js";
import { smoothLinePath } from "./chart-lines.js";

export const palette = {
  blue: "var(--blue)", green: "var(--green)", orange: "var(--amber)", red: "var(--red)", purple: "var(--purple)",
  light: "var(--sleep-light)", deep: "var(--sleep-deep)", rem: "var(--sleep-rem)", gray: "var(--metric-gray)",
};

export function statusColor(status, metric = "") {
  const text = String(status || "").toLowerCase();
  if (metric === "readiness") return ({ poor: palette.red, low: palette.orange, moderate: palette.green, high: palette.blue, prime: palette.purple })[text] || palette.gray;
  if (text === "low need") return palette.green;
  if (/very high|poor|unbalanced|strained/.test(text)) return palette.red;
  if (/shortage|high|low|fair|unproductive/.test(text)) return palette.orange;
  if (/balanced|optimal|productive|good|maintaining/.test(text)) return palette.green;
  return palette.gray;
}

export function ScoreMeter({ value, color = palette.blue, readiness = false, label }) {
  if (!Number.isFinite(value)) return null;
  return <div className="score-meter" role="img" aria-label={`${label}: ${decimal(value)} / 100`}>
    {readiness ? <div className="score-segments">{[[24,palette.red],[25,palette.orange],[25,palette.green],[20,palette.blue],[6,palette.purple]].map(([width,fill], index) => <span key={index} style={{ width: `${width}%`, background: fill }} />)}</div> : <span className="score-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />}
    {readiness && <i className="score-marker" style={{ left: `${Math.max(0, Math.min(100, value))}%` }} />}
  </div>;
}

export function BaselineMeter({ low, high, value, status }) {
  if (![low, high, value].every(Number.isFinite) || high <= low) return null;
  const min = Math.min(low - 10, value - 5), max = Math.max(high + 10, value + 5);
  const x = number => (number - min) / (max - min) * 100;
  return <div className="baseline-meter" role="img" aria-label={`7d HRV ${decimal(value)} ms; baseline ${decimal(low)} to ${decimal(high)} ms`}>
    <div><span style={{ left: `${x(low)}%`, width: `${x(high) - x(low)}%` }} /><i style={{ left: `${x(value)}%`, background: statusColor(status) }} /></div>
    <small>{decimal(low)}–{decimal(high)} ms <b>7d {decimal(value)}</b></small>
  </div>;
}

export function SleepStages({ wellness: w }) {
  const stages = [["Deep",w.deepSleepMinutes,palette.deep],["Light",w.lightSleepMinutes,palette.light],["REM",w.remSleepMinutes,palette.rem]];
  const available = stages.every(([,value])=>Number.isFinite(value) && value >= 0);
  const total = stages.reduce((sum,[,value])=>sum+(Number.isFinite(value)?value:0),0);
  if (!available || total <= 0) return null;
  return <div className="sleep-stages">
    <div className="sleep-stage-bar" role="img" aria-label={stages.map(([name,value])=>`${name} ${value} min`).join(", ")}>{stages.map(([name,value,color])=><span key={name} style={{width:`${value / total * 100}%`,background:color}} />)}</div>
    <div className="sleep-stage-key">{stages.map(([name,value,color])=><span key={name}><i style={{background:color}} />{name} <b>{decimal(value,0)}m</b></span>)}</div>
  </div>;
}

export function LoadHistory({ rows = [] }) {
  const fillId = useId();
  const data = rows.filter(row => row && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(Date.parse(row.date))
    && Number.isFinite(row.acute) && Number.isFinite(row.chronic)).sort((a, b) => a.date.localeCompare(b.date));
  if (data.length < 2) return null;
  const start = Date.parse(data[0].date), end = Date.parse(data.at(-1).date);
  if (end <= start) return null;
  const baseline = 66;
  const max = Math.max(1, ...data.flatMap(row => [row.acute, row.chronic])) * 1.12;
  const x = date => 5 + (Date.parse(date) - start) / (end - start) * 290;
  const y = value => baseline - value / max * 60;
  const runs = [];
  data.forEach(row => {
    const run = runs.at(-1);
    const gap = run ? Date.parse(row.date) - Date.parse(run.at(-1).date) : 0;
    if (!run || gap !== 86400000) runs.push([row]);
    else run.push(row);
  });
  const paths = key => runs.map(run => smoothLinePath(run.map(row => [x(row.date), y(row[key])])));
  const latest = data.at(-1);
  return <div className="load-history">
    <svg viewBox="0 0 300 72" role="img" aria-label={`Garmin acute and chronic load, ${formatDate(data[0].date)} to ${formatDate(latest.date)}`}>
      <defs><linearGradient id={fillId} x2="0" y2="1">
        <stop stopColor={palette.blue} stopOpacity=".35" /><stop offset="1" stopColor={palette.blue} stopOpacity="0" />
      </linearGradient></defs>
      <line x1="5" x2="295" y1={baseline} y2={baseline} stroke="var(--rule)" />
      {paths("acute").map((path, index) => {
        const run = runs[index];
        return run.length > 1 && <path key={index} fill={`url(#${fillId})`} d={`${path}L${x(run.at(-1).date)},${baseline}L${x(run[0].date)},${baseline}Z`} />;
      })}
      {[["acute", palette.blue], ["chronic", palette.orange]].map(([key, color]) => <g key={key}>
        <path d={paths(key).join(" ")} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {runs.filter(run => run.length === 1 || run.at(-1) === latest).map(run => {
          const point = run.at(-1);
          return <circle key={point.date} cx={x(point.date)} cy={y(point[key])} r="2.4" fill={color}><title>{`${formatDate(point.date)} · ${key} ${decimal(point[key])}`}</title></circle>;
        })}
      </g>)}
    </svg>
    <div><span>{formatDate(data[0].date)}</span><span>{formatDate(latest.date)}</span></div>
  </div>;
}

export function BatteryRangeChart({ rows = [], days }) {
  const captured = rows.filter(row => row.bodyBatteryRange);
  if (!captured.length) return <p className="battery-range-empty">No daily range recorded in this period.</p>;
  const [first, last] = [rows[0], rows.at(-1)];
  return <figure className="battery-range-chart">
    <div className="battery-range-track" role="img"
      aria-label={`Daily Body Battery low and high, ${captured.length} of ${days} days recorded`}>
      {rows.map(({ date, bodyBatteryRange }) => {
        const [low, high] = bodyBatteryRange || [];
        return <span key={date} className="battery-range-day" aria-hidden="true"
          title={bodyBatteryRange ? `${formatDate(date)} · low ${low} · high ${high}` : undefined}>
          {bodyBatteryRange && <i style={{ "--range-low": low, "--range-high": high }} />}
        </span>;
      })}
    </div>
    <figcaption><time dateTime={first.date}>{formatDate(first.date)}</time>
      <span>{captured.length}/{days} days</span><time dateTime={last.date}>{formatDate(last.date)}</time></figcaption>
  </figure>;
}
