import { useId } from "react";
import { DataCard } from "./CardDetails.jsx";
import { EvidenceMeta } from "./EvidenceMeta.jsx";
import { dailyChartRuns } from "./cardHistory.js";
import { connectLoadGuide, connectRatioRange, garminLoadReading, optimalAcuteRange, rangeLabel } from "./garminLoad.js";
import { smoothBandPath, smoothLinePath } from "./chart-lines.js";
import { DAY, decimal, formatDate, shiftDate } from "./report.js";

const frame = { left: 44, right: 919, top: 13, bottom: 232 };
const validLoad = value => Number.isFinite(value) && value >= 0;

export function DailyLoad({ report }) {
  const fill = useId();
  const start = shiftDate(report.date, -41);
  const rows = (report.garminLoadHistory?.rows || []).filter(row => row?.date >= start && row.date <= report.date
    && Number.isFinite(Date.parse(row.date)) && validLoad(row.acute) && validLoad(row.chronic))
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = rows.at(-1);
  const reading = garminLoadReading(report, latest);
  const rangeRuns = dailyChartRuns(rows.filter(optimalAcuteRange)).map(run => run.map(row => ({ ...row, ...optimalAcuteRange(row) })));
  const runs = [];
  for (const row of rows) {
    const run = runs.at(-1);
    if (run && shiftDate(run.at(-1).date, 1) === row.date) run.push(row);
    else runs.push([row]);
  }
  const peak = Math.max(1, ...rows.flatMap(row => [row.acute, row.chronic, row.optimalHigh ?? 0]));
  const top = Math.ceil(peak / 4 / 25) * 25 * 4;
  const x = date => frame.left + ((Date.parse(date) - Date.parse(start)) / DAY / 41) * (frame.right - frame.left);
  const y = value => frame.bottom - value / top * (frame.bottom - frame.top);
  const ticks = [0, 7, 14, 21, 28, 35, 41].map(offset => shiftDate(start, offset));

  return <DataCard className="daily-load" title="Training Load" history="garmin-load" aria-labelledby="daily-load-title">
    <header className="daily-load-heading">
      <div>
        <h2 id="daily-load-title">Training Load</h2>
        {latest ? <EvidenceMeta source={report.preview ? "Illustrative Garmin data" : "Garmin Connect"} date={latest.date} dateLabel="Latest">
          <span>{rows.length} / 42 days</span>
        </EvidenceMeta> : <p>Past 42 days</p>}
      </div>
      {latest && <dl className="daily-load-key">
        <div><dt>Acute</dt><dd>{decimal(latest.acute, 0)}</dd>{reading.acuteStatus && <small data-attention={Boolean(reading.acuteNote)}>{reading.acuteStatus}</small>}</div>
        <div><dt>Chronic</dt><dd>{decimal(latest.chronic, 0)}</dd></div>
        {Number.isFinite(reading.ratio) && <div><dt>Ratio</dt><dd>{decimal(reading.ratio)}</dd>{reading.ratioStatus && <small data-attention={Boolean(reading.ratioNote)}>{reading.ratioStatus}</small>}</div>}
      </dl>}
    </header>
    {latest && <div className="load-range-readout">
      {reading.range && <span><i /> Acute optimal range <b>≈{rangeLabel(reading.range)}</b></span>}
      <span><i /> Ratio optimal range <b>{rangeLabel(connectRatioRange)}</b></span>
    </div>}
    {latest ? <figure className="daily-load-plot">
      <svg viewBox="0 0 934 246" preserveAspectRatio="none" role="img" aria-label={`Daily Garmin acute and chronic load from ${formatDate(start)} to ${formatDate(report.date)}. Cyan marks show acute load and amber marks show chronic load. Green shows the dated optimal acute range where captured.`}>
        <defs>
          <linearGradient id={fill} x1="0" x2="0" y1="0" y2="1">
            <stop stopColor="var(--blue)" stopOpacity=".18" />
            <stop offset="1" stopColor="var(--blue)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: 42 }, (_, i) => shiftDate(start, i)).map(date =>
          <line key={date} className="daily-grid-line" x1={x(date)} x2={x(date)} y1={frame.top} y2={frame.bottom} />)}
        {[0, .25, .5, .75, 1].map(ratio => <g key={ratio}>
          <line className="daily-grid-line" x1={frame.left} x2={frame.right} y1={y(top * ratio)} y2={y(top * ratio)} />
          <text x={frame.left - 9} y={y(top * ratio) + 4} textAnchor="end">{decimal(top * ratio, 0)}</text>
        </g>)}
        {rangeRuns.map(run => {
          const high = run.map(row => [x(row.date), y(row.high)]);
          const low = run.map(row => [x(row.date), y(row.low)]);
          return <path key={run[0].date} className="load-optimal-band" d={smoothBandPath(high, low)} />;
        })}
        {runs.filter(run => run.length > 1).map((run, index) => {
          const points = run.map(row => [x(row.date), y(row.acute)]);
          const boundary = `L${points.at(-1)[0]},${frame.bottom}L${points[0][0]},${frame.bottom}Z`;
          return <path key={index} d={smoothLinePath(points) + boundary} fill={`url(#${fill})`} />;
        })}
        {["chronic", "acute"].map(metric => <g key={metric} data-load-series={metric}>
          {runs.map(run => <path key={run[0].date}
            d={smoothLinePath(run.map(row => [x(row.date), y(row[metric])]))} />)}
          {rows.map(row => <circle key={row.date} cx={x(row.date)} cy={y(row[metric])} r={row === latest ? 4.6 : 2.65}
            data-latest={row === latest}>
            <title>{formatDate(row.date)} · {metric} {decimal(row[metric])}</title>
          </circle>)}
        </g>)}
      </svg>
      <figcaption>{ticks.map(date => <time key={date} dateTime={date}>{formatDate(date)}</time>)}</figcaption>
    </figure> : <p className="daily-load-empty">Daily load history is unavailable for this report.</p>}
    {(reading.acuteNote || reading.ratioNote) && <div className="load-attention">
      <strong>Above optimal</strong>
      <div>{reading.acuteNote && <p>{reading.acuteNote}</p>}{reading.ratioNote && <p>{reading.ratioNote}</p>}</div>
      {!report.preview && <a href={connectLoadGuide} target="_blank" rel="noreferrer">Garmin guide</a>}
    </div>}
  </DataCard>;
}
