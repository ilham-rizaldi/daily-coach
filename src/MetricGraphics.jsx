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

export const isScore = value => Number.isFinite(value) && value >= 0 && value <= 100;
const fractionFilled = (value, count, index) => Math.max(0, Math.min(1, value / 100 * count - index));

export function ScoreMeter({ value, color = palette.blue, label }) {
  if (!isScore(value)) return null;
  const count = 32;
  return <div className="score-meter" role="img" aria-label={`${label}: ${decimal(value)} / 100`}
    style={{ "--score-color": color, "--score-count": count }}>
    {Array.from({ length: count }, (_, i) => <span key={i} aria-hidden="true"
      style={{ "--filled": `${fractionFilled(value, count, i) * 100}%` }} />)}
  </div>;
}

export function ScoreRing({ value, color, label, caption = label, className = "" }) {
  const recorded = isScore(value);
  return <div className={`score-ring ${className}`} role="img"
    aria-label={recorded ? `${label} ${decimal(value)} out of 100` : `${label} unavailable`}
    style={{ "--score-color": color, "--score-progress": `${recorded ? value : 0}%` }}>
    <div aria-hidden="true"><strong>{recorded ? decimal(value, 0) : "—"}</strong><span>{caption}</span></div>
  </div>;
}

export function ScoreArc({ value, color, label }) {
  if (!isScore(value)) return null;
  const count = 13;
  return <svg viewBox="0 0 120 64" className="score-arc" role="img" aria-label={`${label} ${decimal(value)}%`}
    style={{ "--score-color": color }}>
    {Array.from({ length: count }, (_, i) => {
      const rotation = -84 + i * 168 / (count - 1);
      return <g key={i} transform={`rotate(${rotation} 60 57)`}>
        <rect x="56.8" y="5" width="6.4" height="15" rx="2" className="score-arc-track" />
        <rect x="56.8" y="5" width="6.4" height="15" rx="2" className="score-arc-fill"
          opacity={fractionFilled(value, count, i)} />
      </g>;
    })}
    <text x="60" y="55" textAnchor="middle">{decimal(value, 0)}<tspan className="score-arc-unit">%</tspan></text>
  </svg>;
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
