import { decimal } from "./report.js";
import { paceClock } from "./pacing.js";
import { HR_CEILING_MAX, HR_CEILING_MIN } from "./prediction.js";

const plot = { left: 39, right: 439, top: 13, bottom: 127 };
const scale = (value, [low, high], start, end) => start + (value - low) / (high - low) * (end - start);
const within = (value, [low, high]) => Number.isFinite(value) && low <= value && value <= high;
const pointKey = row => `${row.date}:${row.activityId}:${row.startSeconds ?? 0}`;

function axis(values, minimumStep) {
  const low = Math.min(...values), high = Math.max(...values);
  const step = Math.max(minimumStep, Math.ceil((high - low) / (minimumStep * 3)) * minimumStep);
  const start = Math.floor((low - 0.45 * step) / step) * step;
  const end = Math.ceil((high + 0.45 * step) / step) * step;
  const count = Math.round((end - start) / step);
  return { domain: [start, end], ticks: Array.from({ length: count + 1 }, (_, index) => start + index * step) };
}

export function PredictionChart({ rows, pace, effort, ceiling, target, forwardMatches, ceilingMatches }) {
  if (!rows.length) return <p className="prediction-chart-empty">No eligible steady blocks in the prediction window.</p>;
  const hr = axis(rows.flatMap(row => [row.hrBpm, row.peakHrBpm].filter(Number.isFinite)), 5);
  const effortAxis = axis(rows.map(row => row.value), pace ? 15 : 5);
  const x = value => scale(value, effortAxis.domain, pace ? plot.right : plot.left, pace ? plot.left : plot.right);
  const y = value => scale(value, hr.domain, plot.bottom, plot.top);
  const effortMark = within(effort, effortAxis.domain);
  const ceilingMark = within(ceiling, hr.domain);
  const [a, b] = target || [];
  const effortLabel = pace ? "Pace · min/km" : "Power · W";
  const match = new Set([...(forwardMatches || []), ...(ceilingMatches || [])].map(pointKey));
  const label = pace ? paceClock : value => decimal(value, 0);
  return <figure className="prediction-chart">
    <figcaption><strong>Recorded steady efforts</strong><span>End-block HR and measured peaks</span></figcaption>
    <svg viewBox="0 0 454 155" role="img" aria-label={`Recorded ${effortLabel.toLowerCase()} and heart rate for ${rows.length} steady blocks`}>
      {hr.ticks.map(value => <g key={value}>
        <line className="prediction-grid-line" x1={plot.left} x2={plot.right} y1={y(value)} y2={y(value)} />
        <text x={plot.left - 7} y={y(value) + 4} textAnchor="end">{value}</text>
      </g>)}
      {effortAxis.ticks.map(value => <g key={value}>
        <line className="prediction-grid-line" x1={x(value)} x2={x(value)} y1={plot.top} y2={plot.bottom} />
        <text x={x(value)} y={plot.bottom + 17} textAnchor="middle">{label(value)}</text>
      </g>)}
      {target && <rect className="prediction-target-band"
        x={Math.min(x(a), x(b))} y={plot.top} width={Math.max(1, Math.abs(x(a) - x(b)))} height={plot.bottom - plot.top} />}
      {effortMark && <line className="prediction-effort-line" x1={x(effort)} x2={x(effort)} y1={plot.top} y2={plot.bottom} />}
      {ceilingMark && <line className="prediction-ceiling-line" x1={plot.left} x2={plot.right} y1={y(ceiling)} y2={y(ceiling)} />}
      {rows.map((row, index) => {
        const marked = match.has(pointKey(row));
        const peak = Number.isFinite(row.peakHrBpm);
        return <g key={index}>
          {peak && <line className="prediction-peak-mark" x1={x(row.value)} x2={x(row.value)}
            y1={y(row.hrBpm)} y2={y(row.peakHrBpm)} />}
          <circle className="prediction-point" data-matched={marked}
            cx={x(row.value)} cy={y(row.hrBpm)} r={marked ? 4.6 : 3.5}>
            <title>{row.date} · {label(row.value)} {pace ? "/km" : "W"} · {decimal(row.hrBpm)} bpm{peak && ` · peak ${row.peakHrBpm} bpm`}</title>
          </circle>
        </g>;
      })}
    </svg>
    <div className="prediction-plot-footer">
      <div className="prediction-legend">
        <span className="prediction-legend-days">Recorded</span>
        {match.size > 0 && <span className="prediction-legend-matched">Matched</span>}
        {ceilingMark && <span className="prediction-legend-cap">HR ceiling</span>}
        {!ceilingMark && within(ceiling, [HR_CEILING_MIN, HR_CEILING_MAX]) &&
          <span className="prediction-legend-cap">{ceiling} bpm ceiling {ceiling < hr.domain[0] ? "below scale" : "above scale"}</span>}
        {target && <span className="prediction-legend-target">Target band</span>}
      </div>
      <span>{effortLabel}</span>
    </div>
  </figure>;
}
