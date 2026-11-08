import { useState } from "react";
import { palette } from "./MetricGraphics.jsx";
import { decimal, formatDate } from "./report.js";
import { contributionWeights, historicalLoadRate } from "./forecast.js";
import { projectGarminRest } from "./garminForecast.js";

const glossary = [
  ["RHR Δ", "Recovery trend", "bpm", "Daily RHR minus the median of the preceding 28 calendar days. At least seven prior readings are required; the current day is excluded from its baseline."],
  ["Sleep gap", "Recovery trend", "min", "Captured sleep duration minus captured Garmin sleep need on the same date. A negative value is a shortfall."],
  ["Body Battery range", "Recovery trend", "0–100", "Recorded daily minimum and maximum. The capture date is partial; the range is distinct from current level or overnight charge."],
  ["Cycling progression", "Training exposure", "h / TL / min", "Six completed trailing seven-day blocks. Cycling duration, Intervals TL and longest ride use separate scales. Any missing cycling TL makes the block total unavailable; recorded subtotals remain in Data."],
  ["sRPE load", "Session check-in", "AU", "Actual session timer in minutes multiplied by recorded session RPE. This subjective load is separate from Intervals HRSS and Garmin exercise load."],
  ["Leg soreness / fatigue", "Session check-in", "0–10", "Self-reported check-in at its saved timestamp. Blank means unrated; zero is a valid recorded rating."],
  ["Training readiness", "Garmin", "0–100", "Recovery-based readiness score; retain the source status and update time."],
  ["Body Battery", "Garmin", "0–100", "Recorded energy reserve. Current level, daily range and charged/drained changes are separate readings."],
  ["Overnight HRV", "Recovery", "ms", "Average heart-rate variability during sleep."],
  ["7d HRV / HRV status", "Recovery", "ms", "Seven-day HRV average assessed against the personal baseline. Distinct from overnight HRV."],
  ["HRV baseline", "Recovery", "ms", "Personal reference range used for HRV status."],
  ["RHR", "Recovery", "bpm", "Resting heart rate. Daily value and seven-day average remain separate."],
  ["Overnight HR", "Recovery", "bpm", "Average heart rate during the recorded sleep period."],
  ["Recovery time", "Garmin", "h", "Remaining recovery time at the source update; displayed as a snapshot."],
  ["Sleep duration / score", "Sleep", "h / 0–100", "Recorded sleep time and Garmin sleep-quality score."],
  ["Sleep stages", "Sleep", "min", "Deep, light and REM sleep. Awake time is separate from total sleep time."],
  ["SpO₂", "Vitals", "%", "Recorded oxygen saturation; mean and minimum are separate watch readings."],
  ["RR / Respiration", "Vitals", "br/min", "Respiratory rate; mean and minimum are separate readings."],
  ["VO₂ max", "Fitness", "ml/kg/min", "Estimated maximal oxygen uptake relative to body mass."],
  ["Personal record (PR)", "Performance", "Source unit", "Best result confirmed by the provider. Sport, record date and capture time are tracked separately."],
  ["Average speed / pace", "Performance", "km/h / min/km", "Recorded averages and values calculated from distance and timer or moving time are separate series. Comparisons match activity scope and timing basis."],
  ["Next sleep need", "Sleep", "h", "Garmin's upcoming-night recommendation. Historical sleep gap uses the need for the completed night."],
  ["Heat acclimation", "Adaptation", "%", "Garmin's estimated heat-adaptation level."],
  ["Training status", "Garmin", "Category", "Source classification of training-load and fitness context."],
  ["Load Focus", "Garmin", "Load points", "Garmin's dated low-aerobic, high-aerobic and anaerobic totals. The gap is the distance to the nearest target edge. Chart-derived bands come from the rendered scale and describe the training mix over that window."],
  ["Acute load", "Garmin", "Load points", "Weighted recent exercise load on Garmin's scale."],
  ["Chronic load", "Garmin", "Load points", "Longer-term load reference on Garmin's scale."],
  ["Load ratio", "Garmin", "Ratio", "Reported acute-to-chronic load ratio. The source display may round the underlying quotient."],
  ["CTL / Fitness", "Intervals", "Load/day", "Exponentially weighted fitness-load model. Planner default time constant: 42 days."],
  ["ATL / Fatigue", "Intervals", "Load/day", "Exponentially weighted fatigue-load model. Planner default time constant: 7 days."],
  ["TSB / Form", "Intervals", "Load/day", "Planner raw form = CTL − ATL at the projected end of day. Source form retains its captured value."],
  ["ATL/CTL", "Intervals", "Ratio", "Planner fatigue-to-fitness ratio; a separate model from Garmin load ratio."],
  ["HRSS", "Training load", "Load points", "Heart-rate stress score. In this source, HR-based load uses normalized TRIMP."],
  ["RPE", "Intensity", "0–10", "Rating of perceived exertion used in session prescriptions."],
  ["FTP", "Cycling", "W", "Functional threshold power. A measured estimate and a configured account setting are different data types."],
  ["Threshold HR / pace", "Intensity", "bpm / min/km", "Sport-specific threshold estimate or configured setting; retain its source and measurement date."],
  ["Session duration", "Volume", "min", "Canonical session timer, including pauses and strength rest. Provider moving and elapsed times remain separate."],
  ["WU / CD", "Session", "min", "Warm-up and cool-down phases of the prescribed session."],
  ["TL", "Training load", "Load points", "Activity training-load value on the named provider's scale."],
  ["τ", "Load model", "days", "Exponential time constant for CTL or ATL."],
  ["EOD", "Forecast", "Time", "End of the projected calendar day."],
  ["Training mix", "Volume", "%", "Each sport's share of recorded session duration in the selected window."],
  ["HR time in zone", "Training mix", "min / %", "Intervals.icu minutes and shares of captured heart-rate time by sport. Session counts show coverage. Zone boundaries can differ by sport."],
  ["Segment benchmark", "Performance", "Elapsed time", "Repeated efforts use the same provider segment ID. A single verified effort has no historical delta."],
  ["Lap splits", "Performance", "min/km / bpm", "Full recorded laps from the source activity. Lap times and best-effort times use their own boundaries."],
  ["7d mean", "Volume", "min/day", "Recorded duration over the current date and preceding six dates, divided by seven."],
  ["P25 / P50 / P75", "Load estimate", "Load/h", "Lower quartile, median and upper quartile of same-sport historical load rates."],
  ["Scenario range", "Forecast", "Load / ratio", "Historical variation propagated through the model; displayed bounds are scenario extrema."],
  ["Extrapolation", "Forecast", "Status", "A planned duration or current load state outside the captured calibration range."],
];

const methodLinks = [
  { title: "Intervals daily calculation", url: "https://forum.intervals.icu/t/change-fatigue-atl-and-fitness-ctl-factors/300?page=2" },
  { title: "Sport contributions", url: "https://forum.intervals.icu/t/fitness-and-fatigue-for-different-activity-types/652" },
  { title: "Garmin training load", url: "https://www.garmin.com/en-US/garmin-technology/cycling-science/physiological-measurements/training-load/" },
  { title: "Garmin readiness colors", url: "https://www8.garmin.com/manuals-apac/webhelp/forerunner265series/EN-SG/GUID-35D1273C-4F9C-4029-9B8F-F997F4D7C3A8-7793.html" },
];

function ColorKey({ items }) {
  return <span className="reference-color-key">{items.map(([label, color]) => <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginRight: 12 }}><i aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color }} />{label}</span>)}</span>;
}

function timestamp(value) {
  if (!value) return "—";
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) return value;
  return new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) + " WIB";
}

function date(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) ? formatDate(value) : "—";
}

function valueWithUnit(value, unit) {
  return Number.isFinite(value) ? `${decimal(value)} ${unit}` : "—";
}

const positive = value => Number.isFinite(value) && value > 0;
const capturedStatuses = new Set(["accepted", "confirmed", "current", "recorded", "verified", "official"]);
const sportLabels = { Ride: "Cycling", Run: "Running" };

function evidenceDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null;
}

function EvidenceDate({ day }) {
  return day ? <time dateTime={day}>{formatDate(day, { year: "numeric" })}</time> : "Date not recorded";
}

const captureTime = value => value ? timestamp(value) : "Time not recorded";

function EvidenceSource({ row }) {
  let link;
  try {
    const url = new URL(row.sourceUrl || row.url);
    if (url.protocol === "https:" && !url.username && !url.password) link = url.href;
  } catch { /* A source can be captured without a direct link. */ }
  return link ? <a href={link} target="_blank" rel="noreferrer">{row.source}</a> : row.source;
}

function PerformanceEvidence({ report }) {
  const history = Array.isArray(report.performance?.vo2History) ? report.performance.vo2History : [];
  const records = Array.isArray(report.performance?.records) ? report.performance.records : [];
  const groups = new Map();
  for (const row of history) {
    const day = evidenceDay(row?.date);
    if (!day || day > report.date || !row.sport || !row.source || !positive(row.value)) continue;
    const key = JSON.stringify([row.sport, row.source]);
    if (!groups.has(key)) groups.set(key, new Map());
    const days = groups.get(key);
    if (!days.has(day)) days.set(day, row);
    else if (days.get(day)?.value !== row.value) days.set(day, null);
  }
  const series = [...groups.entries()].map(([key, days]) => ({
    key,
    points: [...days.values()].filter(Boolean).sort((a, b) => a.date.localeCompare(b.date)),
  })).filter(group => group.points.length);
  const captured = new Map();
  for (const row of records) {
    if (!row?.sport || !row.source || !row.label || !row.unit || !positive(row.value)) continue;
    if (row.status && !capturedStatuses.has(String(row.status).trim().toLowerCase())) continue;
    const day = evidenceDay(row.date);
    if (row.date && (!day || day > report.date)) continue;
    const key = JSON.stringify([row.sport, row.source, row.label, day, row.value, row.unit]);
    captured.set(key, row);
  }
  const recordRows = [...captured].sort(([, a], [, b]) => (b.date || "").localeCompare(a.date || ""));

  return <details><summary>Performance evidence</summary>
    {!series.length ? <p>VO₂ max history: not captured.</p> : <div className="table-scroll"><table className="source-table">
      <caption>VO₂ max history · ml/kg/min</caption>
      <thead><tr><th scope="col">Sport</th><th scope="col">Source</th><th scope="col">Coverage</th><th scope="col">Latest</th><th scope="col">Captured</th></tr></thead>
      <tbody>{series.map(({ key, points }) => {
        const first = points[0], latest = points.at(-1);
        return <tr key={key}><th scope="row">{sportLabels[latest.sport] || latest.sport}</th><td><EvidenceSource row={latest} /></td>
          <td>{points.length} {points.length === 1 ? "reading" : "readings"}{points.length > 1 && <small><EvidenceDate day={first.date} />–<EvidenceDate day={latest.date} /></small>}</td>
          <td>{decimal(latest.value)} <small><EvidenceDate day={latest.date} /></small></td><td>{captureTime(latest.observedAt)}</td></tr>;
      })}</tbody>
    </table></div>}
    {!recordRows.length ? <p>Personal records: not captured.</p> : <div className="table-scroll"><table className="source-table">
      <caption>Personal records</caption>
      <thead><tr><th scope="col">Record</th><th scope="col">Result</th><th scope="col">Source</th><th scope="col">Record date</th><th scope="col">Captured</th></tr></thead>
      <tbody>{recordRows.map(([key, row]) => <tr key={key}><th scope="row">{row.label}<small>{sportLabels[row.sport] || row.sport}</small></th>
        <td>{decimal(row.value, 3)} {row.unit}</td><td><EvidenceSource row={row} /></td><td><EvidenceDate day={row.date} /></td><td>{captureTime(row.observedAt)}</td></tr>)}</tbody>
    </table></div>}
  </details>;
}

function coverageLabel(value) {
  const label = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
    .replace(/\b(hrv|rhr|ctl|atl|tsb|ftp)\b/gi, acronym => acronym.toUpperCase())
    .replace(/\bvo2\b/gi, "VO₂").replace(/\bspo2\b/gi, "SpO₂");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function MetricCoverage({ availability }) {
  const categories = Object.entries(availability?.categories || {});
  if (!categories.length) return null;
  return <details><summary>Metric coverage</summary>
    <div className="table-scroll"><table className="source-table">
      <caption className="sr-only">Captured and missing metrics</caption>
      <thead><tr><th scope="col">Category</th><th scope="col">Available</th><th scope="col">Missing</th></tr></thead>
      <tbody>{categories.map(([category, entry]) => {
        const available = Array.isArray(entry?.available) ? entry.available : [];
        const missing = Object.entries(entry?.missing || {});
        return <tr key={category}><th scope="row">{coverageLabel(category)}</th><td>{available.length}</td><td>
          {missing.length ? missing.map(([field, item]) => <div key={field}>
            {item?.label || coverageLabel(field)} · {typeof item?.status === "string" ? coverageLabel(item.status) : "Not recorded"}
          </div>) : "None"}
        </td></tr>;
      })}</tbody>
    </table></div>
  </details>;
}

function CoachingResearch({ coaching, open }) {
  const ids = new Set(Array.isArray(coaching?.actionPlan?.referenceIds) ? coaching.actionPlan.referenceIds : []);
  const references = Array.isArray(coaching?.research) ? coaching.research.filter(row => ids.has(row?.id)
    && typeof row.citation === "string" && typeof row.application === "string" && /^https:\/\/doi\.org\/10\./.test(row.url)) : [];
  if (!references.length) return null;
  return <div className="reference-methods">
    <details open={open}>
      <summary>Coaching research</summary>
      <dl className="coach-research">{references.map(row => <div key={row.id}>
        <dt><a href={row.url} target="_blank" rel="noopener noreferrer">{row.citation}</a></dt>
        <dd>{row.application}</dd>
      </div>)}</dl>
    </details>
  </div>;
}

export function Reference({ report, researchOpen = false }) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const terms = glossary.filter(row => row.some(cell => cell.toLowerCase().includes(search)));
  const w = report.wellness || {};
  const r = w.provenance?.datedRecovery || {};
  const load = w.provenance?.currentLoadContext || {};
  const evidence = w.provenance?.fields || {};
  const captured = reading => reading?.observedAt ?? (reading?.observationWindow ? `${timestamp(reading.observationWindow.start)} – ${timestamp(reading.observationWindow.end)}` : null);
  const loadRows = (report.garminLoadHistory?.rows || []).filter(row => row?.date === report.date && row.acute === w.garminAcuteLoad && row.chronic === w.garminChronicLoad);
  const pair = loadRows.length === 1 ? loadRows[0] : null;
  const chronicDated = load.chronic?.date || load.chronic?.metricDate;
  const readingDates = [
    ["Readiness / recovery", w.date || r.date, r.readiness?.observedAt, w.readinessUpdatedAtLocal ? `${w.readinessUpdatedAtLocal} WIB` : "—"],
    ["Body Battery", w.date || r.date, captured(evidence.bodyBattery ?? evidence.bodyBatteryDailyHigh ?? r.bodyBattery), "—"],
    ["Sleep / overnight vitals", w.date || r.date, captured(r.sleep), "—"],
    ["HRV", w.date || r.date, captured(evidence.rawHrvMs ?? r.hrv), "—"],
    ["RHR", w.date || r.date, captured(evidence.restingHr ?? r.heartRate), "—"],
    ["Garmin acute", load.acute?.date || load.acute?.metricDate || pair?.date, captured(load.acute), "—"],
    ["Garmin chronic", chronicDated || pair?.date, captured(load.chronic) ?? (pair ? report.garminLoadHistory?.observedAt : null), "—"],
    ["Garmin ratio", load.ratio?.date || load.ratio?.metricDate, captured(load.ratio), load.ratio?.basis || "—"],
    ["Training status", w.trainingStatusSince, captured(evidence.trainingStatus) ?? load.trainingStatusObservedAt, "—"],
    ["VO₂ max", evidence.vo2Max?.measurementDate, captured(evidence.vo2Max), "—"],
    ["Heat acclimation", evidence.heatAcclimationPercent?.measurementDate, captured(evidence.heatAcclimationPercent), "—"],
    ["Intervals CTL / ATL / Form", report.intervals?.date, report.intervals?.provenance?.observedAt, "—"],
  ];
  const rates = ["Ride", "Run", "Weight Training"].map(sport => ({ sport, history: historicalLoadRate(report, sport), weights: contributionWeights(report, sport) }));
  const rest = projectGarminRest(report);
  const settings = report.intervals?.settings || {};
  const rideSettings = settings.ride || {};
  const runSettings = settings.run || {};
  const cyclingThreshold = report.thresholdCapture?.cycling || {};
  const runningThreshold = report.thresholdCapture?.runningLactateThreshold || w.runningLactateThresholdEstimate || {};
  const cyclingFtp = cyclingThreshold.ftpWatts ?? w.garminCyclingFtpWatts;
  const cyclingDate = cyclingThreshold.measurementDate;
  const runningDate = runningThreshold.estimateDate;
  const thresholdRows = [
    ["Cycling FTP", valueWithUnit(cyclingFtp, "W"), valueWithUnit(rideSettings.ftpWatts, "W"), cyclingDate ? date(cyclingDate) : cyclingThreshold.status || w.garminCyclingFtpStatus || "Undated"],
    ["Cycling threshold HR", "—", valueWithUnit(rideSettings.thresholdHr, "bpm"), "Configured"],
    ["Running LT · HR", valueWithUnit(runningThreshold.heartRateBpm, "bpm"), valueWithUnit(runSettings.thresholdHr, "bpm"), runningDate ? date(runningDate) : "Undated"],
    ["Running LT · pace", runningThreshold.pace || "—", runSettings.thresholdPace ?? "—", runningDate ? date(runningDate) : "Undated"],
    ["Running LT · power", valueWithUnit(runningThreshold.runningPowerWatts, "W"), valueWithUnit(runSettings.runningFtpWatts, "W"), runningDate ? date(runningDate) : "Undated"],
    ...(Number.isFinite(runningThreshold.runningPowerWattsPerKg) ? [["Running LT · relative power", `${decimal(runningThreshold.runningPowerWattsPerKg, 2)}W/kg`, "—", runningDate ? date(runningDate) : "Undated"]] : []),
  ];
  const links = [...new Map([...methodLinks, ...(report.coaching?.references || [])].map(link => [link.url, link])).values()];

  return <section className="reference-page" aria-labelledby="reference-title">
    <div className="page-title"><h1 id="reference-title">Reference</h1></div>
    <CoachingResearch coaching={report.coaching} open={researchOpen} />
    <label className="reference-search">Search terms<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="CTL, RPE, HRV…" /></label>
    <div className="table-scroll"><table className="reference-table">
      <caption className="sr-only">Training terminology</caption>
      <thead><tr><th scope="col">Term</th><th scope="col">Unit</th><th scope="col">Definition</th></tr></thead>
      <tbody>{terms.map(([term, category, unit, definition]) => <tr key={term}><th scope="row">{term}<small>{category}</small></th><td>{unit}</td><td>{definition}</td></tr>)}</tbody>
    </table></div>
    {!terms.length && <p className="quiet" role="status">No matching terms.</p>}

    <div className="reference-methods">
      <details><summary>Recovery & progression</summary>
        <p>Recovery charts use dated native Garmin exports, preserving missing days and values. HRV baseline limits and the seven-day HRV average are captured source values. RHR Δ uses only prior readings; sleep gap uses same-date sleep need. Load, recovery scores and performance are distinct measurements.</p>
        <p>Cycling blocks end before the report date. Duration uses session timers, with canonical duration as a legacy fallback. Strength placement includes recorded sessions without converting strength time into cycling volume. Open Data for dates, counts, coverage and missing values.</p>
        <dl className="reference-metadata"><div><dt>Recovery history</dt><dd>{report.wellnessHistory?.rows?.length || 0} dates</dd></div><div><dt>Captured</dt><dd>{timestamp(report.wellnessHistory?.observedAt)}</dd></div></dl>
      </details>
      <details><summary>7-day scenarios</summary>
        <p>The Plan page is a user-edited scenario, starting with rest. Each day's TL is estimated from sport, duration and relative historical effort. The dated Intervals snapshot includes today's decay and recorded load; additional unrecorded work adds a weighted delta before advancing seven calendar days. CTL, ATL and raw TSB use the same model as the tomorrow simulator.</p>
        <p>The displayed range propagates each session's load endpoints across the week. Raw TSB bounds retain each load's paired fitness/fatigue contributions. Future recovery is not forecast. The all-rest curve uses the same baseline and remaining-today assumptions.</p>
      </details>
      <details><summary>Session check-in</summary>
        <p>RPE, leg soreness and fatigue are self-reported. sRPE load is duration × RPE in arbitrary units; it does not change Intervals or Garmin load. Check-ins are encrypted using the report access key before browser storage. Saved entries remain on this browser; preview entries are temporary.</p>
      </details>
      <details><summary>Coaching analysis</summary>
        <p>{report.coaching.rationale}</p>
        <div className="findings">{report.coaching.findings.map(finding => <article key={finding.title}><h3>{finding.title}</h3><p>{finding.evidence}</p><p className="quiet">{finding.implication}</p></article>)}</div>
      </details>
      <details><summary>Color key</summary>
        <div className="table-scroll"><table className="reference-table"><caption className="sr-only">Metric color key</caption><thead><tr><th scope="col">Metric</th><th scope="col">Colors</th></tr></thead><tbody>
          <tr><th scope="row">Readiness</th><td><ColorKey items={[["Poor", palette.red], ["Low", palette.orange], ["Moderate", palette.green], ["High", palette.blue], ["Prime", palette.purple]]} /></td></tr>
          <tr><th scope="row">Sleep</th><td><ColorKey items={[["Deep", palette.deep], ["Light", palette.light], ["REM", palette.rem]]} /></td></tr>
          <tr><th scope="row">Garmin load</th><td><ColorKey items={[["Acute", palette.blue], ["Chronic", palette.orange]]} /></td></tr>
          <tr><th scope="row">Recovery trends</th><td><ColorKey items={[["7d HRV", palette.blue], ["Overnight HRV", palette.gray], ["HRV baseline", palette.green], ["RHR Δ", palette.red]]} /></td></tr>
          <tr><th scope="row">Cycling / plan</th><td><ColorKey items={[["Hours / CTL", palette.blue], ["TL / ATL", palette.purple], ["Longest ride / TSB", palette.orange], ["Rest scenario", palette.gray]]} /></td></tr>
          <tr><th scope="row">Source status</th><td><ColorKey items={[["Green", palette.green], ["Orange", palette.orange], ["Red", palette.red]]} /><small>Recorded metric category. Garmin ratio categories use the source label.</small></td></tr>
        </tbody></table></div>
      </details>
      <details><summary>Load estimation & projection</summary>
        <div className="reference-formulas">
          <p><code>Session load = duration (h) × same-sport load rate</code></p>
          <p><code>Next = current × exp(−1/τ) + weighted load × (1 − exp(−1/τ))</code></p>
          <p><code>Raw form = CTL − ATL · Model ratio = ATL / CTL</code></p>
        </div>
        <div className="table-scroll"><table className="reference-table"><caption className="sr-only">Effort calibration</caption><thead><tr><th scope="col">Effort</th><th scope="col">Rate</th><th scope="col">Range</th></tr></thead><tbody><tr><th scope="row">Easy</th><td>P25</td><td>Minimum–P50</td></tr><tr><th scope="row">Moderate</th><td>P50</td><td>P25–P75</td></tr><tr><th scope="row">Hard</th><td>P75</td><td>P50–maximum</td></tr></tbody></table></div>
        <p>Calibration: previous 42 completed days, same sport, sessions ≥15 min, recorded load and timer. Effort uses relative historical rates. Planned load, time constants and sport weights remain model inputs.</p>
        <p>Remaining-today load adds its weighted delta to the dated anchor. Tomorrow advances once. The output range varies tomorrow's load while holding today's estimate fixed. Default τ: CTL 42d / ATL 7d.</p>
        <div className="table-scroll"><table className="reference-table"><caption>Report calibration</caption><thead><tr><th scope="col">Sport</th><th scope="col">n</th><th scope="col">P25 / P50 / P75 · load/h</th><th scope="col">CTL / ATL contribution</th></tr></thead><tbody>{rates.map(({ sport, history, weights }) => <tr key={sport}><th scope="row">{sport}</th><td>{history.n}</td><td>{history.available ? [history.low, history.median, history.high].map(value => decimal(value, 1)).join(" / ") : "—"}</td><td>{decimal(weights.fitness * 100, 0)}% / {decimal(weights.fatigue * 100, 0)}%<small>{weights.assumed ? "Assumed" : "Captured"}</small></td></tr>)}</tbody></table></div>
      </details>
      <details><summary>Garmin rest projection</summary>
        <p>Paired day-to-day acute/chronic change factors from consecutive completed dates with no recorded activity. Window: previous 56 days; minimum n = 3. The representative pair is closest to the median projected ratio.</p>
        <p>Acute and chronic factors stay paired. Range = minimum–maximum historical scenarios. Confidence: low. Current partial dates and every recorded activity date are excluded, including locally excluded recordings.</p>
        <dl className="reference-metadata"><div><dt>Calibration</dt><dd>{rest.available ? `n = ${rest.n}${rest.extrapolation ? " · Extrapolation" : ""}` : `n = ${rest.n} · Unavailable`}</dd></div><div><dt>History capture</dt><dd>{timestamp(report.garminLoadHistory?.observedAt)}</dd></div><div><dt>Method</dt><dd>Empirical paired transitions</dd></div></dl>
        {!rest.available && <p>{rest.error}</p>}
      </details>
      <details><summary>Field verification</summary>
        <div className="table-scroll"><table className="reference-table"><caption>Garmin estimates / Intervals settings</caption><thead><tr><th scope="col">Metric</th><th scope="col">Recorded estimate</th><th scope="col">Configured</th><th scope="col">Date / status</th></tr></thead><tbody>{thresholdRows.map(([metric, recorded, configured, status]) => <tr key={metric}><th scope="row">{metric}</th><td>{recorded}</td><td>{configured}</td><td>{status}</td></tr>)}</tbody></table></div>
        <dl className="reference-metadata"><div><dt>Physiological validation</dt><dd>{settings.validatedPhysiologicalThresholds === false ? "Not validated" : settings.validatedPhysiologicalThresholds === true ? "Validated" : "—"}</dd></div><div><dt>Settings capture</dt><dd>{settings.observedAt ? timestamp(settings.observedAt) : date(settings.observedDate)}</dd></div></dl>
      </details>
      <PerformanceEvidence report={report} />
      <details><summary>Data & capture</summary>
        <dl className="reference-metadata"><div><dt>Coverage</dt><dd>{date(report.coverage?.start)}–{date(report.coverage?.end)} · {report.coverage?.complete ? "Complete captured window" : "Partial coverage"}</dd></div><div><dt>Report capture</dt><dd>{timestamp(report.capturedAt)}</dd></div>{report.compiledAt && <div><dt>Compiled</dt><dd>{timestamp(report.compiledAt)}</dd></div>}</dl>
        <div className="table-scroll"><table className="source-table"><caption className="sr-only">Source capture</caption><thead><tr><th scope="col">Source</th><th scope="col">Captured</th><th scope="col">Status</th></tr></thead><tbody>{(report.sources || []).map(source => <tr key={source.name}><th scope="row">{source.name}</th><td>{timestamp(source.observedAt)}</td><td>{source.status}</td></tr>)}</tbody></table></div>
        <div className="table-scroll"><table className="source-table"><caption>Snapshot provenance · — = unrecorded</caption><thead><tr><th scope="col">Metric</th><th scope="col">Reading date</th><th scope="col">Captured</th><th scope="col">Source update</th></tr></thead><tbody>{readingDates.map(([metric, metricDate, captured, updated]) => <tr key={metric}><th scope="row">{metric}</th><td>{date(metricDate)}</td><td>{timestamp(captured)}</td><td>{updated}</td></tr>)}</tbody></table></div>
        <MetricCoverage availability={report.metricAvailability} />
        <p>Totals use deduplicated canonical session timers. Excluded recordings contribute no local training totals. Missing fields remain null; zero training requires complete captured coverage.</p>
        <p>Weekly comparisons use completed calendar days. Daily charts include the capture date so far. Provider load models retain their source totals and settings. Capture, measurement and compilation times remain separate.</p>
        {(report.sources || []).map(source => source.detail && <details key={source.name}><summary>{source.name} capture notes</summary><p>{source.detail}</p>{source.syncAge && <p>{source.syncAge}</p>}</details>)}
      </details>
      <details><summary>Sources</summary><div className="forecast-references">{links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.title}</a>)}</div></details>
    </div>
  </section>;
}
