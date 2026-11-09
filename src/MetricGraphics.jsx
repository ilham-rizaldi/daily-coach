import { decimal, formatDate } from "./report.js";

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
  const data = rows.filter(row=>row && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.acute) && Number.isFinite(row.chronic)).sort((a,b)=>a.date.localeCompare(b.date));
  if (data.length < 2) return null;
  const start = Date.parse(data[0].date), end = Date.parse(data.at(-1).date);
  if (end <= start) return null;
  const max = Math.max(1,...data.flatMap(row=>[row.acute,row.chronic])) * 1.1;
  const x = date => 5 + (Date.parse(date) - start)/(end-start)*290;
  const y = value => 48 - value/max*43;
  const path = key => data.map((row,index)=>`${!index || Date.parse(row.date)-Date.parse(data[index-1].date)>86400000 ? "M":"L"}${x(row.date).toFixed(1)},${y(row[key]).toFixed(1)}`).join(" ");
  return <div className="load-history"><svg viewBox="0 0 300 53" role="img" aria-label={`Garmin acute and chronic load, ${formatDate(data[0].date)} to ${formatDate(data.at(-1).date)}`}><line x1="5" x2="295" y1="48" y2="48" stroke="var(--rule)" /><path d={path("acute")} fill="none" stroke={palette.blue} strokeWidth="2" /><path d={path("chronic")} fill="none" stroke={palette.orange} strokeWidth="2" /></svg><div><span>{formatDate(data[0].date)}</span><span>{formatDate(data.at(-1).date)}</span></div></div>;
}
