import { useId } from "react";
import { dailyChartRuns } from "./cardHistory.js";
import { smoothBandPath, smoothLinePath } from "./chart-lines.js";
import { connectRatioRange, garminLoadWindowDays, optimalAcuteRange, rangeLabel } from "./garminLoad.js";
import { DAY, decimal, formatDate, shiftDate } from "./report.js";

const valid = value => Number.isFinite(value) && value >= 0;
const loadFrame = { width: 934, height: 246, left: 44, right: 919, top: 13, bottom: 232 };
const compactFrame = { width: 560, height: 186, left: 39, right: 550, top: 12, bottom: 174 };
const ratioFrame = { ...compactFrame, height: 102, bottom: 92 };

function axes(frame, start, low, high) {
  return {
    x: date => frame.left + (Date.parse(date) - Date.parse(start)) / DAY / (garminLoadWindowDays - 1) * (frame.right - frame.left),
    y: value => frame.bottom - (value - low) / (high - low) * (frame.bottom - frame.top),
  };
}

function Grid({ frame, x, y, ticks, dates }) {
  return <>
    {dates.map(date => <line key={date} className="daily-grid-line"
      x1={x(date)} x2={x(date)} y1={frame.top} y2={frame.bottom} />)}
    {ticks.map(value => <g key={value}>
      <line className="daily-grid-line" x1={frame.left} x2={frame.right} y1={y(value)} y2={y(value)} />
      <text x={frame.left - 7} y={y(value) + 4} textAnchor="end">{decimal(value)}</text>
    </g>)}
  </>;
}

function Series({ rows, metric, x, y }) {
  const latest = rows.at(-1);
  return <g data-load-series={metric}>
    {dailyChartRuns(rows).map(run => <path key={run[0].date}
      d={smoothLinePath(run.map(row => [x(row.date), y(row[metric])]))} />)}
    {rows.map(row => <circle key={row.date} cx={x(row.date)} cy={y(row[metric])} r={row === latest ? 4.4 : 2.2}
      data-latest={row === latest}>
      <title>{formatDate(row.date)} · {metric} {decimal(row[metric])}</title>
    </circle>)}
  </g>;
}

function RatioPlot({ rows, start, dates }) {
  const frame = ratioFrame;
  const low = Math.min(0.5, Math.floor(Math.min(...rows.map(row => row.ratio)) * 2) / 2);
  const high = Math.max(2, Math.ceil(Math.max(...rows.map(row => row.ratio)) * 2) / 2);
  const { x, y } = axes(frame, start, low, high);
  return <>
    <div className="load-ratio-heading"><b>Load ratio</b><span>{rows.length} / {garminLoadWindowDays} days</span></div>
    <svg className="load-ratio-svg" viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="none" role="img"
      aria-label={`Garmin load ratio on ${rows.length} recorded days. Green shows the ${rangeLabel(connectRatioRange)} optimal range.`}>
      <rect className="load-optimal-band" x={frame.left} width={frame.right - frame.left}
        y={y(connectRatioRange.high)} height={y(connectRatioRange.low) - y(connectRatioRange.high)} />
      <Grid frame={frame} x={x} y={y} dates={dates} ticks={[low, 1, 1.5, high]} />
      <Series rows={rows} metric="ratio" x={x} y={y} />
    </svg>
  </>;
}

export function GarminLoadRanges({ range }) {
  return <div className="load-range-readout">
    {range && <span><i /> Acute optimal range <b>≈{rangeLabel(range)}</b></span>}
    <span><i /> Ratio optimal range <b>{rangeLabel(connectRatioRange)}</b></span>
  </div>;
}

export function GarminLoadChart({ window: history, compact = false }) {
  const fill = useId();
  const { rows, start, end, pairedDays, bandDays } = history;
  const acute = rows.filter(row => valid(row.acute));
  const chronic = rows.filter(row => valid(row.chronic));
  const ratios = compact ? rows.filter(row => valid(row.ratio)) : [];
  const bounds = rows.flatMap(row => {
    const range = optimalAcuteRange(row);
    return range ? [{ date: row.date, ...range }] : [];
  });
  const frame = compact ? compactFrame : loadFrame;
  const top = Math.ceil(Math.max(1, ...acute.map(row => row.acute), ...chronic.map(row => row.chronic), ...bounds.map(row => row.high)) / 100) * 100;
  const { x, y } = axes(frame, start, 0, top);
  const gridDates = Array.from({ length: garminLoadWindowDays }, (_, i) => shiftDate(start, i));
  const tickDates = [0, 7, 14, 21, 28, 35, garminLoadWindowDays - 1].map(offset => gridDates[offset]);
  const bandRuns = dailyChartRuns(bounds);
  const connected = new Set(bandRuns.flatMap(run => run.map(row => row.date)));
  if (!acute.length && !chronic.length && !ratios.length) return <p className="daily-load-empty">Daily load history is unavailable for this report.</p>;

  return <><figure className={compact ? "daily-load-plot daily-load-plot-compact" : "daily-load-plot"}>
    {(acute.length > 0 || chronic.length > 0) && <svg className="load-history-svg"
      viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="none" role="img"
      aria-label={`Garmin acute and chronic load, ${formatDate(start)} to ${formatDate(end)}. Cyan is acute, amber is chronic, and green shows the dated acute optimal range.`}>
      <defs>
        <linearGradient id={fill} x1="0" x2="0" y1="0" y2="1">
          <stop stopColor="var(--blue)" stopOpacity=".18" />
          <stop offset="1" stopColor="var(--blue)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <Grid frame={frame} x={x} y={y} dates={gridDates} ticks={[0, .25, .5, .75, 1].map(fraction => top * fraction)} />
      {bandRuns.map(run => <path key={run[0].date} className="load-optimal-band"
        d={smoothBandPath(run.map(row => [x(row.date), y(row.high)]), run.map(row => [x(row.date), y(row.low)]))} />)}
      {bounds.filter(row => !connected.has(row.date)).map(row => <line key={row.date} className="load-optimal-band load-band-point"
        x1={x(row.date)} x2={x(row.date)} y1={y(row.high)} y2={y(row.low)}>
        <title>{formatDate(row.date)} · Acute optimal range ≈{rangeLabel(row)}</title>
      </line>)}
      {dailyChartRuns(acute).map(run => {
        const points = run.map(row => [x(row.date), y(row.acute)]);
        const boundary = `L${points.at(-1)[0]},${frame.bottom}L${points[0][0]},${frame.bottom}Z`;
        return <path key={run[0].date} d={smoothLinePath(points) + boundary} fill={`url(#${fill})`} />;
      })}
      <Series rows={chronic} metric="chronic" x={x} y={y} />
      <Series rows={acute} metric="acute" x={x} y={y} />
    </svg>}
    {ratios.length > 0 && <RatioPlot rows={ratios} start={start} dates={tickDates} />}
    <figcaption>{tickDates.map(date => <time key={date} dateTime={date}>{formatDate(date)}</time>)}</figcaption>
  </figure>
    {compact && <div className="load-chart-coverage" aria-label="Garmin chart coverage">
      <span>Acute + chronic <b>{pairedDays} / {garminLoadWindowDays} days</b></span>
      <span>Acute optimal band <b>{bandDays} / {garminLoadWindowDays} days</b></span>
    </div>}
  </>;
}
