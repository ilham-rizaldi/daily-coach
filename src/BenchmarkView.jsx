import { useState } from "react";
import PerformanceProgression, { effortClock as clock, personalRecords } from "./PerformanceProgression.jsx";
import { MetricValue } from "./Readout.jsx";
import { decimal, formatDate } from "./report.js";
import "./benchmark.css";

const rows = value => Array.isArray(value) ? value : [];
const text = value => typeof value === "string" ? value.trim() : "";
const positive = value => Number.isFinite(value) && value > 0;
const identity = value => text(value) || (Number.isSafeInteger(value) && value > 0 ? String(value) : "");

function validDay(date, cutoff) {
  const time = Date.parse(date);
  return /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") && Number.isFinite(time)
    && new Date(time).toISOString().slice(0, 10) === date && date <= cutoff;
}

function link(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function segmentGroups(report, records) {
  const groups = new Map(), segmentRecordKeys = new Set();
  for (const row of rows(report.benchmarks?.segments)) {
    const segmentId = identity(row?.segmentId);
    const label = text(row?.label), source = text(row?.source), date = row?.date;
    if (!segmentId || !label || !validDay(date, report.date) || !positive(row.elapsedSeconds)) continue;
    const key = JSON.stringify([source, segmentId]);
    const group = groups.get(key) || { key, label, source, efforts: new Map() };
    const effortKey = JSON.stringify([date, identity(row.activityId), identity(row.effortId)]);
    const existing = group.efforts.get(effortKey);
    if (existing && existing.seconds !== row.elapsedSeconds) continue;
    group.efforts.set(effortKey, { key: effortKey, date, seconds: row.elapsedSeconds,
      hr: positive(row.averageHr) ? row.averageHr : existing?.hr, url: link(row.sourceUrl) ?? existing?.url,
      verifiedRecord: row.verifiedPr === true || existing?.verifiedRecord });
    groups.set(key, group);
  }

  for (const record of records) {
    if (record.kind !== "segment-pr" || record.unit !== "s" || !positive(record.value)) continue;
    const matches = [...groups.values()].filter(group => group.label === record.label && group.source === record.source);
    const exact = matches.length === 1 && [...matches[0].efforts.values()].find(effort => effort.date === record.date && effort.seconds === record.value);
    if (exact) {
      exact.verifiedRecord = true;
      exact.url ??= record.url;
    } else {
      // A recorded PR without a segment ID establishes one benchmark, not a matched series.
      groups.set(record.key, { key: record.key, label: record.label, source: record.source, efforts: new Map([[record.key,
        { key: record.key, date: record.date, seconds: record.value, url: record.url, verifiedRecord: true }]]) });
    }
    segmentRecordKeys.add(record.key);
  }

  const data = [...groups.values()].map(group => ({ ...group, efforts: [...group.efforts.values()].sort((a, b) => a.date.localeCompare(b.date)) }));
  return { data: data.sort((a, b) => b.efforts.length - a.efforts.length || b.efforts.at(-1).date.localeCompare(a.efforts.at(-1).date)), segmentRecordKeys };
}

function workoutRows(report) {
  const workouts = new Map();
  for (const row of rows(report.benchmarks?.workouts)) {
    const id = identity(row?.activityId), label = text(row?.label), source = text(row?.source), date = row?.date;
    if (!id || !label || !validDay(date, report.date)) continue;
    const intervals = rows(row.intervals).filter(interval => positive(interval?.seconds));
    if (!intervals.length) continue;
    const key = JSON.stringify([source, id]);
    workouts.set(key, { key, label, source, date, intervals, url: link(row.sourceUrl) });
  }
  return [...workouts.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function Source({ name, href, date }) {
  const dateLabel = <time dateTime={date}>{formatDate(date)}</time>;
  return <span className="benchmark-source">
    {name && (href ? <a href={href} target="_blank" rel="noopener noreferrer">{name}</a> : name)}
    {name && " · "}{!name && href ? <a href={href} target="_blank" rel="noopener noreferrer">{dateLabel}</a> : dateLabel}
  </span>;
}

function Selector({ label, data, active, change }) {
  if (data.length < 2) return null;
  return <select aria-label={label} className="benchmark-selector" value={active} onChange={event => change(event.target.value)}>
    {data.map(row => <option value={row.key} key={row.key}>{row.label}{row.date ? ` · ${formatDate(row.date)}` : ""}</option>)}
  </select>;
}

function SegmentPlot({ efforts, label }) {
  if (efforts[0].date === efforts.at(-1).date) return null;
  const days = efforts.map(effort => Date.parse(effort.date));
  const values = efforts.map(effort => effort.seconds);
  const [first, last] = [days[0], days.at(-1)];
  const [min, max] = [Math.min(...values), Math.max(...values)];
  const points = values.map((seconds, index) => [
    5 + 290 * (days[index] - first) / (last - first),
    max === min ? 30 : 48 - (max - seconds) * 36 / (max - min),
  ]);
  return <figure className="benchmark-plot">
    <svg viewBox="0 0 300 60" role="img" aria-label={`${label} elapsed time from ${formatDate(efforts[0].date)} to ${formatDate(efforts.at(-1).date)}`}>
      <line className="benchmark-guide" x1="5" y1="48" x2="295" y2="48" />
      <line className="benchmark-guide" x1="5" y1="12" x2="295" y2="12" />
      <polyline className="benchmark-line" points={points.map(point => point.join(",")).join(" ")} />
      {points.map(([cx, cy], i) => <circle key={efforts[i].key} cx={cx} cy={cy} r={i === points.length - 1 ? 3 : 2}><title>{`${formatDate(efforts[i].date)} · ${clock(efforts[i].seconds)}`}</title></circle>)}
    </svg>
    <figcaption><span>{formatDate(efforts[0].date)}</span><span>{formatDate(efforts.at(-1).date)}</span></figcaption>
  </figure>;
}

function SegmentPanel({ data }) {
  const [selection, setSelection] = useState("");
  const group = data.find(row => row.key === selection) ?? data[0];
  const latest = group?.efforts.at(-1);
  const previous = group?.efforts.findLast(effort => effort.date < latest.date);
  const delta = previous && group.efforts.at(-2).date !== latest.date ? latest.seconds - previous.seconds : null;
  const deltaLabel = delta == null ? null : delta === 0 ? "Same as prior" : `${clock(Math.abs(delta))} ${delta < 0 ? "faster" : "slower"}`;
  return <section className="benchmark-card" aria-labelledby="benchmark-segments-title">
    <div className="benchmark-card-heading">
      <h2 id="benchmark-segments-title">Segment benchmarks</h2>
      {group && <Selector label="Select segment benchmark" data={data} active={group.key} change={setSelection} />}
    </div>
    {group ? <>
      <div className="benchmark-readout">
        <div><h3>{group.label}</h3><Source name={group.source} href={latest.url} date={latest.date} /></div>
        <MetricValue as="strong" value={clock(latest.seconds)} />
      </div>
      <div className="benchmark-meta">
        <span>{latest.verifiedRecord ? "Verified PR" : "Elapsed time"} · {group.efforts.length} {group.efforts.length === 1 ? "effort" : "efforts"}</span>
        {positive(latest.hr) && <span>Avg HR <MetricValue value={decimal(latest.hr, 0)} unit="bpm" /></span>}
        {deltaLabel && <span className={delta < 0 ? "benchmark-improved" : ""}>{deltaLabel}</span>}
      </div>
      <SegmentPlot efforts={group.efforts} label={group.label} />
      {(group.efforts.length > 1 || positive(latest.hr)) && <details className="benchmark-data"><summary>Effort history</summary><div className="table-scroll">
        <table><thead><tr><th scope="col">Date</th><th scope="col">Elapsed</th><th scope="col">Avg HR</th></tr></thead>
          <tbody>{[...group.efforts].reverse().map(effort => <tr key={effort.key}><td><Source href={effort.url} date={effort.date} /></td><td>{clock(effort.seconds)}</td><td>{positive(effort.hr) ? <MetricValue value={decimal(effort.hr, 0)} unit="bpm" /> : "—"}</td></tr>)}</tbody>
        </table>
      </div></details>}
    </> : <p className="benchmark-empty">Segment efforts not captured</p>}
  </section>;
}

const subdued = new Set(["warmup", "warm-up", "cooldown", "cool-down", "recovery", "rest"]);

function WorkoutPanel({ data }) {
  const [selection, setSelection] = useState("");
  const workout = data.find(row => row.key === selection) ?? data[0];
  const lapPace = workout?.intervals.every(interval => interval.classification === "lap" && positive(interval.averagePaceSeconds));
  const maxPace = lapPace ? Math.max(...workout.intervals.map(interval => interval.averagePaceSeconds)) : 0;
  return <section className="benchmark-card" aria-labelledby="benchmark-workouts-title">
    <div className="benchmark-card-heading">
      <h2 id="benchmark-workouts-title">{lapPace ? "Lap splits" : "Workout execution"}</h2>
      {workout && <Selector label="Select recorded workout" data={data} active={workout.key} change={setSelection} />}
    </div>
    {workout ? <>
      <div className="benchmark-readout">
        <div><h3>{workout.label}</h3><Source name={workout.source} href={workout.url} date={workout.date} /></div>
        <MetricValue as="strong" value={workout.intervals.length} unit={lapPace ? "laps" : workout.intervals.length === 1 ? "interval" : "intervals"} />
      </div>
      {lapPace ? <div className="benchmark-laps" aria-label="Recorded full-lap pace in minutes per kilometer">
        {workout.intervals.map((interval, index) => <div key={index}>
          <small>{interval.label}</small>
          <MetricValue as="strong" value={clock(interval.averagePaceSeconds)} unit="/km" />
          <span className="benchmark-lap-track" aria-hidden="true"><i style={{ width: `${100 * interval.averagePaceSeconds / maxPace}%` }} /></span>
        </div>)}
      </div> : <div className="benchmark-intervals" role="img" aria-label={`${workout.intervals.length} recorded intervals sized by duration`}>
        {workout.intervals.map((interval, index) => <span key={index}
          className={subdued.has(text(interval.classification).toLowerCase()) ? "benchmark-interval-easy" : ""}
          style={{ flexGrow: interval.seconds }} title={`${text(interval.label) || `Interval ${index + 1}`} · ${clock(interval.seconds)}`} />)}
      </div>}
      <details className="benchmark-data"><summary>{lapPace ? "Lap details" : "Interval details"}</summary><div className="table-scroll">
        <table><thead><tr><th scope="col">{lapPace ? "Lap" : "Interval"}</th><th scope="col">Time</th><th scope="col">Avg HR</th><th scope="col">Max HR</th><th scope="col">Distance</th>{!lapPace && <th scope="col">Avg speed</th>}</tr></thead>
          <tbody>{workout.intervals.map((interval, index) => <tr key={index}>
            <td>{text(interval.label) || `Interval ${index + 1}`}</td><td>{clock(interval.seconds)}</td>
            <td>{positive(interval.averageHr) ? <MetricValue value={decimal(interval.averageHr, 0)} unit="bpm" /> : "—"}</td>
            <td>{positive(interval.maxHr) ? <MetricValue value={decimal(interval.maxHr, 0)} unit="bpm" /> : "—"}</td>
            <td>{positive(interval.distanceKm) ? <MetricValue value={decimal(interval.distanceKm, 2)} unit="km" /> : "—"}</td>
            {!lapPace && <td>{positive(interval.averageSpeedKph) ? <MetricValue value={decimal(interval.averageSpeedKph)} unit="km/h" /> : "—"}</td>}
          </tr>)}</tbody>
        </table>
      </div></details>
    </> : <p className="benchmark-empty">Workout intervals not captured</p>}
  </section>;
}

export default function BenchmarkView({ report }) {
  const { data, segmentRecordKeys } = segmentGroups(report, personalRecords(report));
  const workouts = workoutRows(report);
  return <div className="benchmark-view">
    <h1 className="sr-only">Benchmarks</h1>
    <div className="benchmark-grid">
      <SegmentPanel data={data} />
      <WorkoutPanel data={workouts} />
    </div>
    <PerformanceProgression report={report} segmentRecordKeys={segmentRecordKeys} compactRecords />
  </div>;
}

