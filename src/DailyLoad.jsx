import { useId } from "react";
import { DataCard } from "./CardDetails.jsx";
import { smoothLinePath } from "./chart-lines.js";
import { DAY, decimal, formatDate, shiftDate } from "./report.js";

const frame = { left: 44, right: 919, top: 13, bottom: 232 };
const validLoad = value => Number.isFinite(value) && value >= 0;

export function DailyLoad({ report }) {
  const pattern = useId();
  const start = shiftDate(report.date, -41);
  const rows = (report.garminLoadHistory?.rows || []).filter(row => row?.date >= start && row.date <= report.date
    && Number.isFinite(Date.parse(row.date)) && validLoad(row.acute) && validLoad(row.chronic))
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = rows.at(-1);
  const runs = [];
  for (const row of rows) {
    const run = runs.at(-1);
    if (run && shiftDate(run.at(-1).date, 1) === row.date) run.push(row);
    else runs.push([row]);
  }
  const peak = Math.max(1, ...rows.flatMap(row => [row.acute, row.chronic]));
  const top = Math.ceil(peak / 4 / 25) * 25 * 4;
  const x = date => frame.left + ((Date.parse(date) - Date.parse(start)) / DAY / 41) * (frame.right - frame.left);
  const y = value => frame.bottom - value / top * (frame.bottom - frame.top);
  const ticks = [0, 7, 14, 21, 28, 35, 41].map(offset => shiftDate(start, offset));

  return <DataCard className="daily-load" title="Garmin training load" history="garmin-load" aria-labelledby="daily-load-title">
    <header className="daily-load-heading">
      <div>
        <h2 id="daily-load-title">Garmin training load</h2>
        <p>{latest ? `${rows.length} / 42 days · Latest ${formatDate(latest.date)}` : "Past 42 days"}</p>
      </div>
      {latest && <dl className="daily-load-key">
        <div><dt>Acute</dt><dd>{decimal(latest.acute, 0)}</dd></div>
        <div><dt>Chronic</dt><dd>{decimal(latest.chronic, 0)}</dd></div>
      </dl>}
    </header>
    {latest ? <figure className="daily-load-plot">
      <svg viewBox="0 0 934 246" preserveAspectRatio="none" role="img" aria-label={`Daily Garmin acute and chronic load from ${formatDate(start)} to ${formatDate(report.date)}. White marks show acute load and gray marks show chronic load.`}>
        <defs>
          <pattern id={pattern} width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1.5" r=".85" fill="var(--muted)" opacity=".55" />
            <circle cx="5.5" cy="5" r=".62" fill="var(--text)" opacity=".32" />
          </pattern>
        </defs>
        {Array.from({ length: 42 }, (_, i) => shiftDate(start, i)).map(date =>
          <line key={date} className="daily-grid-line" x1={x(date)} x2={x(date)} y1={frame.top} y2={frame.bottom} />)}
        {[0, .25, .5, .75, 1].map(ratio => <g key={ratio}>
          <line className="daily-grid-line" x1={frame.left} x2={frame.right} y1={y(top * ratio)} y2={y(top * ratio)} />
          <text x={frame.left - 9} y={y(top * ratio) + 4} textAnchor="end">{decimal(top * ratio, 0)}</text>
        </g>)}
        {runs.filter(run => run.length > 1).map((run, index) => {
          const border = [...run.map(row => [x(row.date), y(row.acute)]),
            ...run.slice().reverse().map(row => [x(row.date), y(row.chronic)])];
          return <polygon key={index} points={border.map(point => point.join(",")).join(" ")} fill={`url(#${pattern})`} />;
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
  </DataCard>;
}
