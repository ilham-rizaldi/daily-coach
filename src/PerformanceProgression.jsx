import { useState } from "react";
import { palette } from "./MetricGraphics.jsx";
import { MetricValue } from "./Readout.jsx";
import { decimal, formatDate } from "./report.js";
import "./progression.css";

const text = value => typeof value === "string" ? value.trim() : "";
const token = value => text(value).toLowerCase().replace(/[ _]+/g, "-");
const positive = value => Number.isFinite(value) && value > 0;
function dayOf(value) {
  const date = text(value).slice(0, 10), timestamp = Date.parse(`${date}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === date ? date : null;
}

function sportOf(value) {
  if (["cycling", "ride", "bike", "biking"].includes(token(value))) return "Cycling";
  if (["running", "run"].includes(token(value))) return "Running";
  return null;
}

const sportColor = sport => sport === "Cycling" ? palette.blue : sport === "Running" ? palette.green : palette.purple;
const notFuture = (date, report) => date && dayOf(report.date) && date <= report.date;
const scopes = new Map(Object.entries({
  outdoor: "Outdoor", "outdoor-ride": "Outdoor", "outdoor-run": "Outdoor",
  "road-cycling": "Road", "road-biking": "Road", "road-running": "Road",
  "mountain-biking": "MTB", "gravel-cycling": "Gravel", "gravel-biking": "Gravel",
  "trail-running": "Trail", "trail-run": "Trail", "track-running": "Track", "track-run": "Track",
  indoor: "Indoor", "indoor-cycling": "Indoor", "indoor-ride": "Indoor", "indoor-running": "Indoor",
  treadmill: "Treadmill", "treadmill-running": "Treadmill",
  "virtual-ride": "Virtual", "virtual-cycling": "Virtual", "virtual-run": "Virtual",
}));
const indoorScopes = new Set(["Indoor", "Treadmill", "Virtual"]);
function scopeOf(activity) {
  const raw = activity.providerActivityTypes;
  const types = typeof raw === "string" ? [raw] : Object.values(raw ?? {});
  const evidence = [activity.environment, activity.courseType, activity.activityType, ...types];
  const matches = [...new Set(evidence.map(type => scopes.get(token(type?.typeKey ?? type))).filter(Boolean))];
  const specific = matches.filter(value => value !== "Outdoor" && value !== "Indoor");
  if (specific.length > 1 || new Set(matches.map(scope => indoorScopes.has(scope))).size > 1) return null;
  return specific[0] ?? matches[0] ?? null;
}

function completed(activity, report) {
  if (activity.classification === "non-training" || activity.planned === true
    || ["planned", "scheduled", "future", "in-progress", "cancelled", "excluded"].includes(token(activity.status))) return false;
  const captured = Date.parse(report.capturedAt);
  return !Number.isFinite(captured) || [activity.startedAt, activity.endedAt].every(value => {
    const time = Date.parse(value);
    return !Number.isFinite(time) || time <= captured;
  });
}

const speedMethods = { recorded: "Recorded avg", timer: "Calculated · timer", moving: "Calculated · moving" };
const methodOrder = Object.keys(speedMethods);
export function activitySpeedSeries(report) {
  const groups = new Map(), unscoped = new Map();
  for (const activity of Array.isArray(report.activities) ? report.activities : []) {
    const sport = sportOf(activity.sport), source = text(activity.source), date = dayOf(activity.date);
    if (!sport || !source || !notFuture(date, report) || !completed(activity, report)) continue;
    const scope = scopeOf(activity), started = Date.parse(activity.startedAt);
    const at = Number.isFinite(started) ? started : Date.parse(`${date}T12:00:00Z`);
    const distance = token(activity.distanceKind) === "recorded" && positive(activity.distanceKm) ? activity.distanceKm : null;
    const candidates = [];
    if (positive(activity.averageSpeedKph)) candidates.push(["recorded", activity.averageSpeedKph]);
    if (distance && positive(activity.timerSeconds)) candidates.push(["timer", distance * 3600 / activity.timerSeconds]);
    else if (distance && positive(activity.providerMovingSeconds)) candidates.push(["moving", distance * 3600 / activity.providerMovingSeconds]);

    for (const [basis, value] of candidates) {
      if (!positive(value)) continue;
      const key = JSON.stringify([sport, scope, source, basis]), point = { date, at, distance, value };
      if (scope) {
        if (!groups.has(key)) groups.set(key, { key, sport, scope, source, basis, points: [] });
        groups.get(key).points.push(point);
      } else {
        const previous = unscoped.get(sport);
        if (!previous || at > previous.points[0].at) {
          unscoped.set(sport, { key, sport, scope, source, basis, points: [point] });
        }
      }
    }
  }
  const all = [...groups.values(), ...unscoped.values()];
  for (const group of all) group.points.sort((a, b) => a.at - b.at);
  return all.sort((a, b) => Number(b.points.length > 1) - Number(a.points.length > 1)
    || b.points.at(-1).at - a.points.at(-1).at || methodOrder.indexOf(a.basis) - methodOrder.indexOf(b.basis));
}

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
    records.set(key, { key, sport, source, label, date, value, unit, url: sourceUrl(row.url ?? row.sourceUrl) });
  }
  return [...records.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function sourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function clock(value) {
  const seconds = Math.round(value), hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60, tail = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${tail}` : `${minutes}:${tail}`;
}

const pace = speed => clock(3600 / speed);

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
        {connect && <polyline points={coords.map(point => point.join(",")).join(" ")} fill="none" stroke={color} strokeWidth="1.7" vectorEffect="non-scaling-stroke" />}
        {points.map((point, i) => <circle key={i} cx={coords[i][0]} cy={coords[i][1]} r={i === points.length - 1 ? 3 : 2} fill={point.precision === "month" ? "#20262c" : color} stroke={color} strokeWidth={point.precision === "month" ? 1 : 0}><title>{[pointDate(point, true), display(point.value), point.distance ? `${decimal(point.distance)} km` : null].filter(Boolean).join(" · ")}</title></circle>)}
      </svg>
      <div className="progression-axis"><time dateTime={pointDateTime(start)}>{pointDate(start, acrossYears)}</time><time dateTime={pointDateTime(end)}>{pointDate(end, acrossYears)}</time></div>
    </div>
  </div>;
}

function Vo2Card({ series }) {
  const { sport, source, points } = series, latest = points.at(-1), color = sportColor(sport);
  const hasMonthly = points.some(point => point.precision === "month"), hasDaily = points.some(point => point.precision === "day");
  return <article className="progression-card">
    <div className="progression-readout"><div><h4>{sport}</h4><small>{source} · {pointDate(latest)}</small></div><MetricValue as="strong" value={decimal(latest.value)} unit="mL/kg/min" style={{ color }} /></div>
    <Sparkline label={`${sport} VO₂ max · ${source}`} points={points} color={color} />
    {hasMonthly && points.length > 1 && <div className="progression-card-meta"><span>○ Monthly{hasDaily ? " · ● Daily" : ""}</span></div>}
  </article>;
}

function speedOption(group, groups) {
  const matches = groups.filter(item => item.scope === group.scope);
  return [group.scope ?? "Scope unknown", matches.length > 1 ? speedMethods[group.basis] : null,
    matches.filter(item => item.basis === group.basis).length > 1 ? group.source : null].filter(Boolean).join(" · ");
}

function SpeedCard({ sport, groups }) {
  const [selection, setSelection] = useState("");
  const group = groups.find(row => row.key === selection) ?? groups[0];
  const { scope, source, basis, points } = group, latest = points.at(-1), color = sportColor(sport);
  const running = sport === "Running", display = running ? pace : decimal;
  const label = running ? "Run pace" : "Ride speed", unit = running ? "min/km" : "km/h";
  const recordedGroup = groups.filter(row => row.basis === "recorded")
    .sort((a, b) => b.points.at(-1).at - a.points.at(-1).at)[0];
  const recorded = recordedGroup?.points.at(-1);
  return <article className="progression-card">
    <div className="progression-readout"><div><h4>{label}</h4><small>{speedMethods[basis]} · {source}</small></div><MetricValue as="strong" value={display(latest.value)} unit={unit} style={{ color }} /></div>
    <div className="progression-card-meta">{groups.length > 1
      ? <select aria-label={`${label} comparison scope`} value={group.key} onChange={event => setSelection(event.target.value)}>{groups.map(row => <option key={row.key} value={row.key}>{speedOption(row, groups)}</option>)}</select>
      : <span>{scope ?? "Scope unknown"}</span>}
    <span>{latest.distance ? `${decimal(latest.distance)} km · ` : ""}{formatDate(latest.date)}</span></div>
    {basis !== "recorded" && recorded && <div className="progression-card-meta"><span>Recorded avg · {recordedGroup.scope ?? "Scope unknown"} · {formatDate(recorded.date)}</span><MetricValue as="strong" value={display(recorded.value)} unit={unit} /></div>}
    <Sparkline label={`${label} · ${scope} · ${speedMethods[basis]} · ${unit}`} points={points} color={color} display={display} connect={false} />
  </article>;
}

function RecordCard({ record }) {
  const { sport, source, label, value, unit, date, url } = record;
  const timed = Number.isFinite(value) && unit === "s";
  return <article className="progression-card progression-record">
    <div className="progression-record-sport" style={{ color: sportColor(sport) }}>{sport}</div>
    <h4>{label}</h4>
    <MetricValue as="strong" value={timed ? clock(value) : typeof value === "number" ? decimal(value, 2) : value} unit={timed ? undefined : unit} />
    <div className="progression-card-meta">{url ? <a href={url} target="_blank" rel="noopener noreferrer">{source}</a> : <span>{source}</span>}<time dateTime={date}>{formatDate(date, { year: "numeric" })}</time></div>
  </article>;
}

export default function PerformanceProgression({ report }) {
  const vo2 = vo2Series(report), speed = activitySpeedSeries(report), records = personalRecords(report);
  const observed = dayOf(report.performance?.observedAt);
  return <section className="progression" aria-labelledby="progression-title">
    <div className="performance-heading"><h2 id="progression-title">Performance progression</h2>{notFuture(observed, report) && <span className="quiet">Captured {formatDate(observed)}</span>}</div>
    <div className="progression-block">
      <h3>VO₂ max</h3>
      {vo2.length ? <div className="progression-grid">{vo2.map(series => <Vo2Card key={series.key} series={series} />)}</div> : <p className="progression-empty">VO₂ max not captured</p>}
    </div>
    <div className="progression-block">
      <h3>Average speed &amp; pace</h3>
      {speed.length ? <div className="progression-grid">{["Cycling", "Running"].map(sport => {
        const groups = speed.filter(row => row.sport === sport);
        return groups.length ? <SpeedCard key={sport} sport={sport} groups={groups} /> : null;
      })}</div> : <p className="progression-empty">Speed and pace not captured</p>}
    </div>
    <div className="progression-block">
      <h3>Personal records</h3>
      {records.length ? <div className="progression-grid progression-records">{records.map(record => <RecordCard key={record.key} record={record} />)}</div>
        : <p className="progression-empty">Provider PRs not captured</p>}
    </div>
  </section>;
}
