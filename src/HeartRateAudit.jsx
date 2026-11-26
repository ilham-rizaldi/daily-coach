import { useState } from "react";
import { DataCard, DetailTable } from "./CardDetails.jsx";
import { DAY, decimal, duration, formatDate } from "./report.js";

const bounds = { left: 36, right: 439, top: 10, bottom: 117 };
const bpm = value => Number.isFinite(value) ? decimal(value, 1) : null;
const shortDate = date => formatDate(date);

function AuditPlot({ audit, ceiling, effortLabel }) {
  const { rows, validCeiling } = audit;
  const [selected, setSelected] = useState(null);
  if (!rows.length) return <p className="prediction-audit-note">No steady blocks in this duration range.</p>;
  const active = rows.findIndex(row => row.date === selected);
  const index = active < 0 ? rows.length - 1 : active;
  const current = rows[index];
  const values = rows.flatMap(row => [row.hrBpm, row.estimate, row.baseline, row.peak].filter(Number.isFinite));
  const step = Math.max(5, Math.ceil((Math.max(...values) - Math.min(...values)) / 20) * 5);
  const low = Math.floor((Math.min(...values) - 2) / step) * step;
  const high = Math.ceil((Math.max(...values) + 2) / step) * step;
  const y = value => bounds.bottom - (value - low) / (high - low) * (bounds.bottom - bounds.top);
  const first = Date.parse(rows[0].date), last = Date.parse(rows.at(-1).date);
  const x = value => first === last ? (bounds.left + bounds.right) / 2
    : bounds.left + (value - first) / (last - first) * (bounds.right - bounds.left);
  const dates = rows.length === 1 ? [first] : [first, ...(last - first > 7 * DAY ? [(first + last) / 2] : []), last];
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, at) => low + at * step);
  const ceilingInView = validCeiling && ceiling >= low && ceiling <= high;
  function keyDown(event) {
    const shift = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!shift && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1
      : Math.max(0, Math.min(index + shift, rows.length - 1));
    setSelected(rows[next].date);
  }
  return <div className="prediction-audit-plot">
    <div className="prediction-audit-point" aria-live="polite">
      <strong>{shortDate(current.date)} · {effortLabel(current.value)}</strong>
      <span>Actual <b>{bpm(current.hrBpm)} bpm</b></span>
      <span>Predicted <b>{current.estimate == null ? "—" : `${bpm(current.estimate)} bpm`}</b></span>
      {current.baseline != null && <span>Baseline <b>{bpm(current.baseline)} bpm</b></span>}
      {current.peak != null && <span data-over={current.over === true}>Day peak <b>{bpm(current.peak)} bpm</b></span>}
    </div>
    <svg viewBox="0 0 454 146" role="img" tabIndex={0} aria-label="Predicted and actual heart rate by recorded date. Use the arrow keys to inspect days."
      onKeyDown={keyDown} onClick={event => event.stopPropagation()}>
      {ticks.map(value => <g key={value}>
        <line className="prediction-grid-line" x1={bounds.left} x2={bounds.right} y1={y(value)} y2={y(value)} />
        <text x={bounds.left - 7} y={y(value) + 4} textAnchor="end">{value}</text>
      </g>)}
      {dates.map(value => <text key={value} x={x(value)} y={bounds.bottom + 19} textAnchor="middle">
        {shortDate(new Date(value).toISOString().slice(0, 10))}
      </text>)}
      {ceilingInView && <line className="prediction-ceiling-line" x1={bounds.left} x2={bounds.right} y1={y(ceiling)} y2={y(ceiling)} />}
      <line className="prediction-audit-selected" x1={x(Date.parse(current.date))} x2={x(Date.parse(current.date))} y1={bounds.top} y2={bounds.bottom} />
      {rows.map((row, i) => {
        const position = x(Date.parse(row.date));
        const left = i ? (position + x(Date.parse(rows[i - 1].date))) / 2 : bounds.left - 8;
        const right = i < rows.length - 1 ? (position + x(Date.parse(rows[i + 1].date))) / 2 : bounds.right + 8;
        return <g key={row.date} onPointerEnter={() => setSelected(row.date)} onPointerDown={() => setSelected(row.date)}>
          {row.over && <circle className="prediction-audit-over" cx={position} cy={y(row.peak)} r="4" />}
          {row.baseline != null && <rect className="prediction-audit-baseline" x={position - 3} y={y(row.baseline) - 3} width="6" height="6" />}
          {row.estimate != null && <>
            <line className="prediction-audit-error" x1={position} x2={position} y1={y(row.hrBpm)} y2={y(row.estimate)} />
            <circle className="prediction-audit-estimate" cx={position} cy={y(row.estimate)} r="5.5" />
          </>}
          <circle className="prediction-audit-actual" cx={position} cy={y(row.hrBpm)} r={row === current ? 4.8 : 3.6} />
          <rect x={left} y={bounds.top - 4} width={right - left} height={bounds.bottom - bounds.top + 8} fill="transparent" />
        </g>;
      })}
    </svg>
    <div className="prediction-legend prediction-audit-legend">
      <span>Actual end-block HR</span>
      {audit.compared > 0 && <span className="audit-key-estimate">Predicted HR</span>}
      {audit.baselineError != null && <span className="audit-key-baseline">Earlier HR median</span>}
      {audit.overshoots > 0 && <span className="audit-key-over">Day peak over ceiling</span>}
      {ceilingInView && <span className="prediction-legend-cap">{ceiling} bpm ceiling</span>}
    </div>
  </div>;
}

export function HeartRateAudit({ name, audit, ceiling, effortLabel, automatic }) {
  const { rows, validCeiling, measured, overshoots, compared, meanError } = audit;
  const renderPlot = () => <AuditPlot audit={audit} ceiling={ceiling} effortLabel={effortLabel} />;
  return <DataCard className="prediction-chart prediction-audit" title={`${name} predicted vs actual HR`}
    detail={<>
      {renderPlot()}
      <DetailTable caption="Recorded days and estimates from earlier dates"
        columns={["Date", "Effort", "Block", "Predicted · bpm", "Prior matches", "Earlier median · bpm", "Actual · bpm", "Day peak · bpm", "Peak coverage", "Ceiling", "Source"]}
        rows={rows.slice().reverse().map(row => [
          formatDate(row.date, { year: "numeric" }), effortLabel(row.value), duration(row.durationSeconds),
          bpm(row.estimate), row.matchedDays || null, bpm(row.baseline), bpm(row.hrBpm), bpm(row.peak), `${row.measuredPeaks} / ${row.blocks}`,
          row.over == null ? null : row.over ? "Over" : "At or below", row.source,
        ])} />
      <p className="prediction-audit-note">Each day uses a representative recorded effort. The model trains only on earlier dates in the same duration band and recording profile. The earlier HR median gives a baseline using recent comparable-duration days. Day peak is the highest measured HR across all eligible blocks that day.</p>
    </>}>
    <div className="prediction-audit-heading"><h3>Predicted vs actual HR</h3><small>{automatic && "Auto · "}{audit.band.label}</small></div>
    <div className="prediction-audit-summary" aria-live="polite">
      <div><span>Above HR ceiling{validCeiling && ` · ${ceiling} bpm`}</span>
        <strong>{validCeiling && measured ? `${overshoots} / ${measured} days` : "—"}</strong>
        <small>{!validCeiling ? "Enter a ceiling in the calculator." : !measured ? "No measured peaks." : "Days with measured peaks"}</small>
      </div>
      <div><span>Model error</span><strong>{meanError == null ? "—" : `${bpm(meanError)} bpm`}</strong>
        <small>{compared ? `Mean absolute error · ${compared} ${compared === 1 ? "day" : "days"}` : "No days with enough earlier matches"}</small>
      </div>
    </div>
    {renderPlot()}
  </DataCard>;
}
