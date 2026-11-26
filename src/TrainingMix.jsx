import { useState } from "react";
import { DataCard, DetailFacts, DetailTable } from "./CardDetails.jsx";
import { datedHistory } from "./cardHistory.js";
import { DurationValue, MetricValue } from "./Readout.jsx";
import { EvidenceMeta } from "./EvidenceMeta.jsx";
import { loadFocusAction, loadFocusGuide, loadFocusGuideMethod, loadFocusGuideSources } from "./loadFocusGuide.js";
import { loadFocusReadings } from "./loadFocusReadings.js";
import { paceClock, rangeFor, targetEvidence } from "./pacing.js";
import { DAY, decimal, formatDate, jakartaDate, shiftDate } from "./report.js";
import { workoutAdvice } from "./workoutAdvice.js";
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
  return <DataCard className="mix-card" title="Heart rate time in zone"
    history={group && datedHistory(`Recorded time in zone · ${group.source}`, ["Zone", "Minutes", "Low · bpm", "High · bpm"],
      (report.trainingMix?.heartRateZones || []).filter(row => row.sport === group.sport && row.source === group.source),
      row => [row.zone, Number.isFinite(row.seconds) ? decimal(row.seconds / 60) : null, row.lowerBpm, row.upperBpm], {
        chart: zoneOrder.map(zone => [`${zone} · min`, row => row.zone === zone && Number.isFinite(row.seconds) ? row.seconds / 60 : null]),
      })} detail={<>
    <DetailFacts rows={[["Source", group?.source], ["Sport", group && (sportLabel[group.sport] || group.sport)], ["Latest activity", latest?.sourceUrl && <a href={latest.sourceUrl} target="_blank" rel="noopener noreferrer">Open source</a>]]} />
    <DetailTable columns={["Period", "Captured sessions", ...zones.map(zone => `${zone} · min`)]}
      rows={periods.map(period => [`${period.label}${period.today ? " · Partial day" : ""}`, period.listed == null ? period.tracked : `${period.tracked} / ${period.listed}`,
        ...zones.map(zone => period.zones[zone] == null ? null : decimal(period.zones[zone] / 60))])} />
  </>}>
    <div className="mix-card-heading"><div><h3>HR time in zone</h3><EvidenceMeta source={group?.source} /></div>
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
      </div>)}</div>
      <div className="mix-zone-key" aria-label="Latest observed zone shares">{zoneOrder.filter(zone => latest.zones[zone] > 0).map(zone => <span key={zone}><i data-zone={zone} aria-hidden="true" />{zone} <b>{decimal(100 * latest.zones[zone] / latest.total)}%</b></span>)}</div>
      <details className="performance-data mix-data"><summary>Zone data</summary><div className="table-scroll"><table>
        <caption className="sr-only">Captured HR time in zone by period</caption>
        <thead><tr><th scope="col">Period</th>{zones.map(zone => <th scope="col" key={zone}>{zone} · min</th>)}</tr></thead>
        <tbody>{periods.map(period => <tr key={period.end}><th scope="row">{period.label}</th>{zones.map(zone => <td key={zone}>{period.zones[zone] != null ? decimal(period.zones[zone] / 60) : "—"}</td>)}</tr>)}</tbody>
      </table></div>{latest.sourceUrl && <a href={latest.sourceUrl} target="_blank" rel="noopener noreferrer">Open activity source</a>}</details>
    </> : <p className="mix-empty">HR zones not captured</p>}
  </DataCard>;
}

function easyPacingLines(report) {
  const metrics = [
    ["cycling", "Cycling power", "powerWatts", "W", decimal],
    ["cycling", "Cycling HR", "hrBpm", "bpm", decimal],
    ["running", "Run–walk pace", "paceSecondsPerKm", "min/km", paceClock],
    ["running", "Running HR", "hrBpm", "bpm", decimal],
  ];
  return metrics.flatMap(([sport, label, key, unit, format]) => {
    const plan = report.coaching?.pacing?.[sport];
    const range = rangeFor(plan?.[key]), evidence = targetEvidence(plan?.evidence?.[key]);
    if (!range || !evidence || !dateOnly(evidence.date) || evidence.date > report.date) return [];
    const [low, high] = range;
    return [[label, `${format(low)}–${format(high)} ${unit}`, evidence.source, formatDate(evidence.date, { year: "numeric" })]];
  });
}

const focusSportNames = { cycling: "Cycling", running: "Running" };
const focusScopeNames = { steady: "Recorded steady blocks", "easy-match": "Recorded easy HR match", "short-rep": "Recorded short reps" };

function focusValue(range, format) {
  if (!range) return null;
  const [low, high] = range.map(format);
  return low === high ? low : `${low}–${high}`;
}

function FocusSport({ sport, guide, reading, bucket }) {
  const [zone, session] = guide;
  const format = sport === "cycling" ? Math.round : paceClock;
  return <div className="mix-focus-sport">
    <span className="mix-guide-sport">{focusSportNames[sport]}</span>
    <span className="mix-guide-zone">{zone}</span>
    {reading ? <>
      <div className="mix-guide-readings">
        <MetricValue as="strong" value={focusValue(reading.value, format)} unit={sport === "cycling" ? "W" : "min/km"} />
        {reading.hr && <MetricValue as="strong" value={focusValue(reading.hr, Math.round)} unit="bpm" />}
      </div>
    </> : <small className="mix-guide-missing">{bucket === "anaerobic" ? "No verified short reps" : "No matched effort recorded"}</small>}
    <small>{session}</small>
  </div>;
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
  const advice = items.length && workoutAdvice(report, jakartaDate(new Date()));
  const easyTargets = items.length ? easyPacingLines(report) : [];
  const readings = items.length ? loadFocusReadings(report, start, end) : {};
  const aboveTarget = items.filter(item => item.status === "above").map(item => item.label.toLowerCase());
  const belowTarget = items.filter(item => item.status === "below").map(item => item.label.toLowerCase());
  const readingRows = items.flatMap(({ key, label }) => Object.entries(readings[key] || {}).flatMap(([sport, reading]) =>
    reading.rows.map(row => [
      label, focusSportNames[sport], formatDate(row.date, { year: "numeric" }), minutes(row.durationSeconds), focusScopeNames[reading.scope], row.environment,
      sport === "cycling" ? `${Math.round(row.value)} W` : `${paceClock(row.value)} min/km`,
      Number.isFinite(row.hrBpm) ? `${Math.round(row.hrBpm)} bpm` : null,
      Number.isFinite(row.peakHrBpm) ? `${Math.round(row.peakHrBpm)} bpm` : null,
      sourceLink(row.sourceUrl) ? <a href={sourceLink(row.sourceUrl)} target="_blank" rel="noreferrer">{row.source}</a> : row.source,
    ])));
  const recoveryNote = {
    rest: "Recovery check favors rest.",
    easy: "Recovery check favors easy effort.",
    recheck: "Check your latest recovery before choosing an effort.",
  }[advice?.state];
  return <DataCard className="mix-card" title="Garmin Load Focus" history="load-focus" detail={<>
    <DetailFacts rows={[["Source", report.preview ? "Illustrative data" : url ? <a href={url} target="_blank" rel="noopener noreferrer">Garmin Connect</a> : "Garmin Connect"],
      ["Period", items.length ? labelRange(start, end) : null]]} />
    <DetailTable columns={["Bucket", "Points", "Target", "Status"]} rows={items.map(item => [
      item.label, decimal(item.points), item.target ? `${item.approximate ? "≈ " : ""}${decimal(item.targetLow)}–${decimal(item.targetHigh)}` : null, focusStatusLabels[item.status],
    ])} />
    {!!items.length && <>
      <DetailTable columns={["Training focus", "Cycling", "Running"]} rows={items.map(({ key, label }) => {
        const { cycling, running } = loadFocusGuide[key];
        return [label, cycling.join(" · "), running.join(" · ")];
      })} />
      {!!readingRows.length && <>
        <h3>Recorded efforts in this window</h3>
        <DetailTable columns={["Focus", "Sport", "Date", "Duration", "Basis", "Environment", "Power or pace", "Recorded HR", "Peak HR", "Source"]} rows={readingRows} />
      </>}
      {!!easyTargets.length && <>
        <h3>Easy pacing after recovery</h3>
        <DetailTable columns={["Target", "Pacing guide", "Source", "Evidence date"]} rows={easyTargets} />
      </>}
      <p>{loadFocusGuideMethod}</p>
      <p>Load Focus compares the recent distribution of exercise load across easy endurance, harder aerobic work and short high-intensity work with Garmin’s target bands. Targets describe the training mix over the period. Recovery and the next session’s purpose guide the next workout.</p>
      {items.some(item => item.target && item.approximate) && <p>Dashed bands show chart-derived targets.</p>}
      <p>Recorded ranges show the strongest eligible block per day in one comparable recording group. Aerobic blocks last 8 to under 12 minutes and use HR from the end of the block. Easy HR matches use the report’s dated easy HR guardrails when a matching Garmin category is unavailable. Anaerobic readings require labelled work reps of 10–120 seconds and use average rep HR when recorded.</p>
      <div className="forecast-references">{loadFocusGuideSources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>
    </>}
  </>}>
    <div className="mix-card-heading"><div><h3>Load Focus</h3>
      <EvidenceMeta source={report.preview ? "Illustrative Garmin data" : "Garmin Connect"} href={items.length ? url : null}
        from={items.length ? start : null} date={items.length ? end : null} />
    </div></div>
    {items.length ? <div className="mix-load-buckets">
      {(aboveTarget.length > 0 || belowTarget.length > 0) && <p className="mix-focus-summary">
        {aboveTarget.length > 0 && <span><b>Above target</b> {aboveTarget.join(" and ")}.</span>}
        {belowTarget.length > 0 && <span><b>Below target</b> {belowTarget.join(" and ")}.</span>}
      </p>}
      {items.map(item => <div key={item.key} className="mix-bucket">
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
      <div className="mix-focus-guide" data-bucket={item.key}>
        {Object.entries(loadFocusGuide[item.key]).map(([sport, guide]) =>
          <FocusSport key={sport} sport={sport} guide={guide} reading={readings[item.key]?.[sport]} bucket={item.key} />)}
      </div>
      {item.status && <small className="mix-focus-action">{loadFocusAction(item.key, item.status)}</small>}
    </div>)}
      {recoveryNote && <small className="mix-recovery-note">{recoveryNote}</small>}
    </div> : <p className="mix-empty">Load Focus totals not captured</p>}
  </DataCard>;
}

export default function TrainingMix({ report }) {
  return <section className="training-mix" aria-labelledby="training-mix-title">
    <div className="performance-heading"><h2 id="training-mix-title">Training Mix</h2></div>
    <div className="mix-grid"><HeartRateMix report={report} /><GarminFocus report={report} /></div>
  </section>;
}
