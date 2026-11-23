import { useState } from "react";
import { DataCard, DetailFacts, DetailTable } from "./CardDetails.jsx";
import { datedHistory } from "./cardHistory.js";
import { smoothLinePath } from "./chart-lines.js";
import { palette } from "./MetricGraphics.jsx";
import { MetricValue } from "./Readout.jsx";
import { decimal, formatDate, shiftDate } from "./report.js";
import { activityEnvironments, activitySpeedSeries, dayOf, paceSeconds, speedMethods, sportOf } from "./activityProgression.js";
import "./progression.css";

const text = value => typeof value === "string" ? value.trim() : "";
const token = value => text(value).toLowerCase().replace(/[ _]+/g, "-");
const positive = value => Number.isFinite(value) && value > 0;
const sportColor = sport => sport === "Cycling" ? palette.blue : sport === "Running" ? palette.green : palette.purple;
const notFuture = (date, report) => date && dayOf(report.date) && date <= report.date;

export function vo2Series(report) {
  const groups = new Map();
  for (const row of Array.isArray(report.performance?.vo2History) ? report.performance.vo2History : []) {
    const sport = sportOf(row?.sport) ?? (token(row?.sport) === "general" ? "General" : null);
    const precision = row?.precision === "month" ? "month" : "day", source = text(row?.source), value = row?.value;
    const date = dayOf(precision === "month" ? `${text(row?.date).slice(0, 7)}-01` : row?.date);
    if (!sport || !source || !notFuture(date, report) || !positive(value)) continue;
    const key = JSON.stringify([sport, source]);
    if (!groups.has(key)) groups.set(key, { key, sport, source, byDate: new Map() });
    const dates = groups.get(key).byDate, pointKey = `${precision}:${date}`;
    const point = { date, precision, at: Date.parse(`${date}T12:00:00Z`), value };
    dates.set(pointKey, !dates.has(pointKey) || dates.get(pointKey)?.value === value ? point : null);
  }
  return [...groups.values()].map(({ byDate, ...group }) => {
    const points = [...byDate.values()].filter(Boolean);
    const dailyMonths = new Set(points.filter(point => point.precision === "day").map(point => point.date.slice(0, 7)));
    return { ...group, points: points.filter(point => point.precision === "day" || !dailyMonths.has(point.date.slice(0, 7)))
      .sort((a, b) => a.at - b.at) };
  }).filter(group => group.points.length);
}

const accepted = new Set(["accepted", "confirmed", "current", "recorded", "verified", "official"]);
export function personalRecords(report) {
  const records = new Map();
  for (const row of Array.isArray(report.performance?.records) ? report.performance.records : []) {
    const sport = sportOf(row?.sport) ?? text(row?.sport), source = text(row?.source), label = text(row?.label);
    const unit = text(row?.unit), date = dayOf(row?.date), value = positive(row?.value) ? row.value : text(row?.value);
    if (!sport || !source || !label || !notFuture(date, report) || !accepted.has(token(row?.status))) continue;
    if (!positive(value) && !/\d/.test(value)) continue;
    const key = JSON.stringify([sport, source, label, date, value, unit]);
    records.set(key, { key, sport, source, label, date, value, unit, kind: token(row.type), url: sourceUrl(row.url ?? row.sourceUrl) });
  }
  return [...records.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function sourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function effortClock(value) {
  const seconds = Math.round(value), hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60, tail = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${tail}` : `${minutes}:${tail}`;
}

const pace = speed => effortClock(paceSeconds(speed));

function pointDate(point, year = false) {
  if (point.precision === "month") return formatDate(point.date, { day: undefined, year: "numeric" });
  return formatDate(point.date, year ? { year: "numeric" } : {});
}

const pointDateTime = point => point.precision === "month" ? point.date.slice(0, 7) : point.date;

function Sparkline({ label, points, color, display = decimal, connect = true }) {
  if (points.length < 2) return null;
  const values = points.map(point => point.value);
  const min = Math.min(...values), max = Math.max(...values);
  const start = points[0], end = points.at(-1), acrossYears = start.date.slice(0, 4) !== end.date.slice(0, 4);
  const coords = points.map((point, i) => [
    5 + (end.at === start.at ? i / (points.length - 1) : (point.at - start.at) / (end.at - start.at)) * 290,
    max === min ? 31 : 51 - (point.value - min) / (max - min) * 40,
  ]);
  return <div className="progression-spark">
    <div className="progression-plot">
      <div className="progression-values" aria-hidden="true">{min === max
        ? <span>{display(max)}</span>
        : <><span>{display(max)}</span><span>{display(min)}</span></>}</div>
      <svg viewBox="0 0 300 60" role="img" aria-label={`${label}, ${points.length} observations, ${display(max)} to ${display(min)}`}>
        {min === max
          ? <line x1="5" x2="295" y1="31" y2="31" className="progression-guide" />
          : <><line x1="5" x2="295" y1="11" y2="11" className="progression-guide" /><line x1="5" x2="295" y1="51" y2="51" className="progression-guide" /></>}
        {connect && <path d={smoothLinePath(coords)} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {points.map((point, i) => <circle key={i} cx={coords[i][0]} cy={coords[i][1]} r={i === points.length - 1 ? 3 : 2} fill={point.precision === "month" ? "#20262c" : color} stroke={color} strokeWidth={point.precision === "month" ? 1 : 0}><title>{[pointDate(point, true), display(point.value), point.distance ? `${decimal(point.distance)} km` : null].filter(Boolean).join(" · ")}</title></circle>)}
      </svg>
      <div className="progression-axis"><time dateTime={pointDateTime(start)}>{pointDate(start, acrossYears)}</time><time dateTime={pointDateTime(end)}>{pointDate(end, acrossYears)}</time></div>
    </div>
  </div>;
}

function Vo2Card({ series }) {
  const { sport, source, points } = series, latest = points.at(-1), color = sportColor(sport);
  const hasMonthly = points.some(point => point.precision === "month"), hasDaily = points.some(point => point.precision === "day");
  return <DataCard className="progression-card" title={`${sport} VO₂ max`}
    history={datedHistory(`VO₂ max · ${source}`, ["mL/kg/min", "Date precision"], points, row => [row.value, row.precision === "month" ? "Monthly" : "Daily"])} detail={<>
    <DetailFacts rows={[["Source", source]]} />
    <DetailTable columns={["Date", "VO₂ max · mL/kg/min", "Date precision"]} rows={[...points].reverse().map(point =>
      [pointDate(point, true), decimal(point.value), point.precision === "month" ? "Monthly" : "Daily"])} />
  </>}>
    <div className="progression-readout"><div><h4>{sport}</h4><small>{source} · {pointDate(latest)}</small></div><MetricValue as="strong" value={decimal(latest.value)} unit="mL/kg/min" style={{ color }} /></div>
    <Sparkline label={`${sport} VO₂ max · ${source}`} points={points} color={color} />
    {hasMonthly && points.length > 1 && <div className="progression-card-meta"><span>○ Monthly{hasDaily ? " · ● Daily" : ""}</span></div>}
  </DataCard>;
}

function SpeedCard({ sport, groups }) {
  const [selection, setSelection] = useState(() => groups.some(row => row.scope === "Outdoor") ? "Outdoor" : "Indoor");
  const group = groups.find(row => row.scope === selection);
  const { source, basis, points = [] } = group ?? {};
  const latest = points.at(-1), color = sportColor(sport);
  const running = sport === "Running", display = running ? pace : decimal;
  const label = running ? "Run pace" : "Ride speed", unit = running ? "min/km" : "km/h";
  const metric = `${label} · ${unit}`;
  const recent = latest ? points.filter(row => row.date >= shiftDate(latest.date, -89)) : [];
  const history = datedHistory(`${selection} · ${label}`, [metric, "Distance · km", "Activity"], points,
    row => [display(row.value), Number.isFinite(row.distance) ? decimal(row.distance, 2) : null, row.name], {
      chart: [[metric, row => running ? paceSeconds(row.value) : row.value], ["Distance · km", row => row.distance]],
    });
  if (running) history.chartFormats = { [metric]: { format: effortClock, reverse: true } };
  return <DataCard className="progression-card" title={label} history={history} initialHistoryDays={90} detail={<DetailFacts rows={[
    ["Environment", selection], ["Source", source], ["Timing basis", basis && speedMethods[basis]],
    ["Records", latest && `${points.length} sessions through ${pointDate(latest, true)}`],
  ]} />}>
    <div className="progression-readout">
      <div><h4>{label}</h4>{group && <small>{source} · {basis === "timer" ? "Distance / timer" : speedMethods[basis]}</small>}</div>
      {latest && <MetricValue as="strong" value={display(latest.value)} unit={unit} style={{ color }} />}
    </div>
    <div className="progression-card-meta">
      <select aria-label={`${label} environment`} value={selection} onChange={event => setSelection(event.target.value)}>
        {activityEnvironments.map(scope => <option key={scope}>{scope}</option>)}
      </select>
      {latest && <span>{latest.distance ? `${decimal(latest.distance, 2)} km · ` : ""}{pointDate(latest, true)}</span>}
    </div>
    {latest ? <>
      <Sparkline label={`${label} · ${selection} · ${unit}`} points={recent} color={color} display={display} connect={false} />
      <div className="progression-card-meta">
        <span>{recent.length} {recent.length === 1 ? "session" : "sessions"}{recent.length < points.length ? " · Last 90 days" : ""}</span>
      </div>
    </> : <p className="progression-card-meta">No verified {selection.toLowerCase()} sessions in this report.</p>}
  </DataCard>;
}

export function SportSpeedCards({ groups }) {
  return ["Cycling", "Running"].map(sport => {
    const matching = groups.filter(row => row.sport === sport);
    return matching.length ? <SpeedCard key={sport} sport={sport} groups={matching} /> : null;
  });
}

function RecordCard({ record }) {
  const { sport, source, label, value, unit, date, url } = record;
  const timed = Number.isFinite(value) && unit === "s";
  const result = timed ? effortClock(value) : typeof value === "number" ? decimal(value, 2) : value;
  return <DataCard className="progression-card progression-record" title={label}
    history={datedHistory("Verified record", ["Result", "Source"], [record], () => [timed ? result : `${result} ${unit || ""}`.trim(), source], {
      chart: [[unit ? `Result · ${unit}` : "Result", row => row.value]],
    })} detail={<DetailFacts rows={[
    ["Sport", sport], ["Result", <MetricValue value={result} unit={timed ? undefined : unit} />], ["Date", formatDate(date, { year: "numeric" })],
    ["Source", url ? <a href={url} target="_blank" rel="noopener noreferrer">{source}</a> : source],
  ]} />}>
    <div className="progression-record-sport" style={{ color: sportColor(sport) }}>{sport}</div>
    <h4>{label}</h4>
    <MetricValue as="strong" value={timed ? effortClock(value) : typeof value === "number" ? decimal(value, 2) : value} unit={timed ? undefined : unit} />
    <div className="progression-card-meta">{url ? <a href={url} target="_blank" rel="noopener noreferrer">{source}</a> : <span>{source}</span>}<time dateTime={date}>{formatDate(date, { year: "numeric" })}</time></div>
  </DataCard>;
}

export default function PerformanceProgression({ report, segmentRecordKeys, compactRecords = false }) {
  const vo2 = vo2Series(report), speed = activitySpeedSeries(report), records = personalRecords(report).filter(record => !segmentRecordKeys?.has(record.key));
  const observed = dayOf(report.performance?.observedAt);
  const recordGrid = records.length
    ? <div className="progression-grid progression-records">{records.map(record => <RecordCard key={record.key} record={record} />)}</div>
    : <p className="progression-empty">Provider PRs not captured</p>;
  return <section className="progression" aria-labelledby="progression-title">
    <div className="performance-heading"><h2 id="progression-title">Performance progression</h2>{notFuture(observed, report) && <span className="quiet">Captured {formatDate(observed)}</span>}</div>
    <div className="progression-block">
      <h3>VO₂ max</h3>
      {vo2.length ? <div className="progression-grid">{vo2.map(series => <Vo2Card key={series.key} series={series} />)}</div> : <p className="progression-empty">VO₂ max not captured</p>}
    </div>
    <div className="progression-block">
      <h3>Average speed &amp; pace</h3>
      {speed.length ? <div className="progression-grid"><SportSpeedCards groups={speed} /></div>
        : <p className="progression-empty">Speed and pace not captured</p>}
    </div>
    {compactRecords ? <details className="progression-block benchmark-records">
      <summary>Personal records {records.length > 0 && <span>{records.length}</span>}</summary>
      {recordGrid}
    </details> : <div className="progression-block">
      <h3>Personal records</h3>
      {recordGrid}
    </div>}
  </section>;
}
