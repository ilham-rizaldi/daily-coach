import { useState } from "react";
import { DurationValue, MetricValue } from "./Readout.jsx";
import { DAY, decimal, formatDate, shiftDate } from "./report.js";
import "./training-mix.css";

const zoneOrder = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7"];
const buckets = [["lowAerobic", "Low aerobic"], ["highAerobic", "High aerobic"], ["anaerobic", "Anaerobic"]];
const sportLabel = { Ride: "Cycling", Run: "Running", Swim: "Swimming" };
const focusStatusLabels = { below: "Below target", within: "Within target", above: "Above target" };

function dateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function sourceLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

const labelRange = (start, end) => start === end ? formatDate(end) : `${formatDate(start)}–${formatDate(end)}`;
const minutes = seconds => `${decimal(seconds / 60)} min`;

function zoneGroups(report) {
  const groups = new Map();
  for (const row of Array.isArray(report.trainingMix?.heartRateZones) ? report.trainingMix.heartRateZones : []) {
    const { sport, date, activityId, seconds } = row ?? {};
    const zone = String(row?.zone ?? "").toUpperCase().replace(/^(\d)$/, "Z$1");
    if (!sport || activityId == null || !String(activityId).trim() || !dateOnly(date) || date > report.date
      || !zoneOrder.includes(zone) || !Number.isFinite(seconds) || seconds < 0) continue;
    const source = row.source || "Intervals.icu", key = JSON.stringify([sport, source]);
    if (!groups.has(key)) groups.set(key, { key, sport, source, sessions: new Map() });
    const group = groups.get(key), id = String(activityId);
    if (!group.sessions.has(id)) group.sessions.set(id, { id, date, zones: {}, url: sourceLink(row.sourceUrl), conflict: false });
    const session = group.sessions.get(id);
    if (session.date !== date || (session.zones[zone] != null && session.zones[zone] !== seconds)) session.conflict = true;
    session.zones[zone] = seconds;
  }
  return [...groups.values()].map(group => ({ ...group, sessions: [...group.sessions.values()].filter(session =>
    !session.conflict && Object.values(session.zones).some(seconds => seconds > 0)) }))
    .filter(group => group.sessions.length).sort((a, b) => Number(b.sport === "Ride") - Number(a.sport === "Ride"));
}

function zonePeriods(report, group) {
  if (!dateOnly(report.date)) return [];
  const end = shiftDate(report.date, -1), blocks = new Map();
  for (const session of group.sessions) {
    const today = session.date === report.date;
    const blockEnd = today ? report.date : shiftDate(end, -7 * Math.floor((Date.parse(end) - Date.parse(session.date)) / (7 * DAY)));
    if (!blocks.has(blockEnd)) blocks.set(blockEnd, { start: today ? report.date : shiftDate(blockEnd, -6), end: blockEnd, today, sessions: [], zones: {} });
    const block = blocks.get(blockEnd);
    block.sessions.push(session);
    for (const [zone, seconds] of Object.entries(session.zones)) block.zones[zone] = (block.zones[zone] ?? 0) + seconds;
  }
  return [...blocks.values()].sort((a, b) => b.end.localeCompare(a.end)).slice(0, 4).map(block => {
    const tracked = block.sessions.length;
    const activities = (report.activities || []).filter(row => row.sport === group.sport && row.date >= block.start
      && row.date <= block.end && row.classification !== "non-training" && !row.planned);
    const matched = new Set(block.sessions.map(session => activities.find(activity => session.date === activity.date &&
      [activity.id, ...Object.values(activity.externalIds || {})].some(id => id != null && String(id) === session.id))));
    const listed = matched.size === tracked && !matched.has(undefined) ? activities.length : null;
    return { ...block, tracked, listed, total: Object.values(block.zones).reduce((sum, seconds) => sum + seconds, 0),
      label: labelRange(block.start, block.end), sourceUrl: block.sessions.length === 1 ? block.sessions[0].url : null };
  });
}

function HeartRateMix({ report }) {
  const [selection, setSelection] = useState("");
  const groups = zoneGroups(report), group = groups.find(item => item.key === selection) || groups[0];
  const periods = group ? zonePeriods(report, group) : [], latest = periods[0];
  const zones = zoneOrder.filter(zone => periods.some(period => period.zones[zone] != null));
  return <article className="mix-card">
    <div className="mix-card-heading"><div><h3>HR time in zone</h3><small>{group?.source || "Intervals.icu"}</small></div>
      {groups.length > 1 ? <select aria-label="HR zone sport" value={group.key} onChange={event => setSelection(event.target.value)}>
        {groups.map(item => <option value={item.key} key={item.key}>{sportLabel[item.sport] || item.sport}{groups.some(other => other.sport === item.sport && other.key !== item.key) ? ` · ${item.source}` : ""}</option>)}
      </select> : group && <small className="mix-sport">{sportLabel[group.sport] || group.sport}</small>}
    </div>
    {latest ? <>
      <div className="mix-periods">{periods.map(period => <div key={period.end} className="mix-period">
        <div className="mix-row"><span>{period.label}{period.today && " · Partial day"}</span><DurationValue as="strong" seconds={period.total} /></div>
        <div className="mix-track mix-zone-track" role="img" aria-label={`${period.label}. ${zoneOrder.filter(zone => period.zones[zone] != null).map(zone => `${zone}: ${minutes(period.zones[zone])}`).join(", ")}`}>
          {zoneOrder.filter(zone => period.zones[zone] > 0).map(zone => <span key={zone} className="mix-fill" data-zone={zone}
            style={{ width: `${100 * period.zones[zone] / period.total}%` }} title={`${zone} · ${minutes(period.zones[zone])}`} />)}
        </div>
        <small className="mix-coverage">{period.listed != null && period.listed !== period.tracked ? `${period.tracked}/${period.listed}` : period.tracked} {period.tracked === 1 && (period.listed == null || period.listed === 1) ? "session" : "sessions"} captured</small>
      </div>)}</div>
      <div className="mix-zone-key" aria-label="Latest observed zone shares">{zoneOrder.filter(zone => latest.zones[zone] > 0).map(zone => <span key={zone}><i data-zone={zone} aria-hidden="true" />{zone} <b>{decimal(100 * latest.zones[zone] / latest.total)}%</b></span>)}</div>
      <details className="performance-data mix-data"><summary>Zone data</summary><div className="table-scroll"><table>
        <caption className="sr-only">Captured HR time in zone by period</caption>
        <thead><tr><th scope="col">Period</th>{zones.map(zone => <th scope="col" key={zone}>{zone} · min</th>)}</tr></thead>
        <tbody>{periods.map(period => <tr key={period.end}><th scope="row">{period.label}</th>{zones.map(zone => <td key={zone}>{period.zones[zone] != null ? decimal(period.zones[zone] / 60) : "—"}</td>)}</tr>)}</tbody>
      </table></div>{latest.sourceUrl && <a href={latest.sourceUrl} target="_blank" rel="noopener noreferrer">Open activity source</a>}</details>
    </> : <p className="mix-empty">HR zones not captured</p>}
  </article>;
}

function GarminFocus({ report }) {
  const focus = report.trainingMix?.garminLoadFocus;
  const start = dateOnly(focus?.start), end = dateOnly(focus?.end);
  const items = Array.isArray(focus?.buckets) && start && end && start <= end && end <= report.date ? buckets.flatMap(([key, label]) => {
    const row = focus.buckets.find(item => item?.key === key);
    if (!Number.isFinite(row?.points) || row.points < 0) return [];
    const target = Number.isFinite(row.targetLow) && Number.isFinite(row.targetHigh) && row.targetLow >= 0 && row.targetHigh >= row.targetLow;
    const approximate = row.targetBasis === "charted" || row.targetApproximate === true;
    const verifiedStatus = Object.hasOwn(focusStatusLabels, row.status) ? row.status : null;
    const numericStatus = target && (row.points < row.targetLow ? "below" : row.points > row.targetHigh ? "above" : "within");
    const status = (approximate && verifiedStatus) || numericStatus || verifiedStatus;
    const delta = status !== numericStatus ? 0 : status === "below" ? row.targetLow - row.points : status === "above" ? row.points - row.targetHigh : 0;
    return [{ ...row, label, target, approximate, status, delta }];
  }) : [];
  const max = Math.max(1, ...items.map(item => Math.max(item.points, item.target ? item.targetHigh : 0)));
  const url = sourceLink(focus?.sourceUrl);
  return <article className="mix-card">
    <div className="mix-card-heading"><div><h3>Load Focus</h3><small>{report.preview ? "Illustrative" : url && items.length ? <a href={url} target="_blank" rel="noopener noreferrer">Garmin</a> : "Garmin"}{items.length > 0 && ` · ${labelRange(start, end)}`}</small></div></div>
    {items.length ? <div className="mix-load-buckets">{items.map(item => <div key={item.key} className="mix-bucket">
      <div className="mix-row"><span>{item.label}</span><MetricValue as="strong" value={decimal(item.points, 0)} unit="pts" /></div>
      <div className="mix-track mix-focus-track" aria-hidden="true">
        <span className="mix-fill" data-bucket={item.key} style={{ width: `${100 * item.points / max}%` }} />
        {item.target && <span className="mix-target" data-approximate={item.approximate} style={{
          left: `min(${100 * item.targetLow / max}%, calc(100% - 2px))`, width: `max(2px, ${100 * (item.targetHigh - item.targetLow) / max}%)`,
        }} />}
      </div>
      <div className="mix-focus-meta">
        <small>{item.target ? <>Target <span className="mix-focus-value">{item.targetLow === item.targetHigh ? decimal(item.targetLow) : `${decimal(item.targetLow)}–${decimal(item.targetHigh)}`} pts</span></> : "Target range unavailable"}</small>
        {item.status && <small className="mix-focus-status" data-status={item.status}>{item.delta > 0
          ? <><span className="mix-focus-value">{decimal(item.delta)} pts</span> {item.status === "below" ? "short" : "over"}</>
          : focusStatusLabels[item.status]}</small>}
      </div>
    </div>)}{items.some(item => item.target && item.approximate) && <small className="mix-target-note">Dashed bands show chart-derived targets.</small>}</div> : <p className="mix-empty">Load Focus totals not captured</p>}
  </article>;
}

export default function TrainingMix({ report }) {
  return <section className="training-mix" aria-labelledby="training-mix-title">
    <div className="performance-heading"><h2 id="training-mix-title">Training Mix</h2></div>
    <div className="mix-grid"><HeartRateMix report={report} /><GarminFocus report={report} /></div>
  </section>;
}
