import { useState } from "react";
import { decimal, duration, formatDate } from "./report.js";
import { compareWorkBlock, garminPacingWorkout, paceClock, pacingMetrics, pacingSports, rangeFor, reviewMetrics, targetEvidence } from "./pacing.js";
import { DataCard, DetailFacts, DetailTable } from "./CardDetails.jsx";
import { activityMetrics } from "./components.jsx";

const shownDate = date => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))
  ? formatDate(date, { year: "numeric" }) : "Date unavailable";
const numericValue = (value, unit) => unit === "/km" ? paceClock(value) : decimal(value);
const rangeLabel = ([low, high], unit) => `${numericValue(low, unit)}–${numericValue(high, unit)}`;

function Readout({ value, unit, tone }) {
  return <strong className="training-number" data-signal={tone}>
    {value}<small>{unit}</small>
  </strong>;
}

function Evidence({ evidence }) {
  return evidence ? <div className="target-evidence">
    <span>{evidence.source}</span>
    <span>{evidence.dateLabel || "Dated"} <time dateTime={evidence.date}>{shownDate(evidence.date)}</time></span>
    <span className="target-confidence" data-confidence={evidence.confidence}>{evidence.confidence} confidence</span>
    {evidence.reason && <span>{evidence.reason}</span>}
  </div> : <p className="target-evidence">Source, date and confidence unavailable for this snapshot.</p>;
}

function PacingCard({ definition, plan }) {
  const phases = plan?.stepsMinutes;
  const garmin = garminPacingWorkout(plan, definition.sport);
  const hasTimeline = Array.isArray(phases) && phases.length === 3 && phases.every(value => Number.isFinite(value) && value > 0);
  const phaseNames = ["Warm-up", "Steady work", "Cool-down"];
  const targets = pacingMetrics.filter(metric => metric.key !== "paceSecondsPerKm" || definition.key === "running")
    .map(metric => ({ ...metric, range: rangeFor(plan?.[metric.key]), evidence: targetEvidence(plan?.evidence?.[metric.key]) }));
  return <DataCard className="pacing-card" title={`${definition.label} pacing`} data-signal={definition.key === "cycling" ? "power" : "pace"} detail={plan && <>
    <DetailFacts rows={[
      ...hasTimeline ? phaseNames.map((name, index) => [name, `${phases[index]} min`]) : [],
      ["HR ceiling", Number.isFinite(plan.hrCeiling) ? `${plan.hrCeiling} bpm` : null],
      ["RPE", rangeFor(plan.rpe) ? `${rangeLabel(plan.rpe)} / 10` : null], ["Adjustment", plan.adjustment],
      ["Garmin workout", garmin && <a href={garmin.url} target="_blank" rel="noopener noreferrer">{garmin.name}</a>],
    ]} />
    <DetailTable columns={["Target", "Range", "Source", "Date", "Confidence"]} rows={targets.map(metric =>
      [metric.label, metric.range ? `${rangeLabel(metric.range, metric.unit)} ${metric.unit}` : null,
        metric.evidence?.source, metric.evidence ? shownDate(metric.evidence.date) : null, metric.evidence?.confidence])} />
  </>}>
    <header className="training-card-heading">
      <div><h3>{definition.label}</h3>{plan && <p>{plan.format === "run-walk" ? "Easy run–walk" : "Easy endurance"}</p>}</div>
      {Number.isFinite(plan?.minutes) && <Readout value={plan.minutes} unit="min" />}
    </header>
    {hasTimeline && <div className="pacing-timeline">
      {phaseNames.map((phase, index) =>
        <div key={phase} style={{ flexGrow: phases[index] }}>
          <b>{phases[index]} min</b><span>{phase}</span>
        </div>)}
    </div>}
    <dl className="pacing-metrics">
      {targets.map(({ range, evidence, ...metric }) =>
        <DataCard as="div" definition key={metric.key} className="pacing-target" data-signal={metric.tone} title={`${definition.label} ${metric.label.toLowerCase()}`}
          detail={<DetailFacts rows={[
            ["Steady-work range", range ? `${rangeLabel(range, metric.unit)} ${metric.unit}` : "Target unavailable"],
            ["Source", evidence?.source], [evidence?.dateLabel || "Evidence date", evidence ? shownDate(evidence.date) : null],
            ["Confidence", evidence?.confidence], ["Evidence", evidence?.reason],
            ["HR ceiling", metric.key === "hrBpm" && Number.isFinite(plan?.hrCeiling) ? `${plan.hrCeiling} bpm` : null],
          ]} />}>
          <dt>{metric.label}</dt>
          <dd>{range ? <>
            <Readout value={rangeLabel(range, metric.unit)} unit={metric.unit} />
            <Evidence evidence={evidence} />
          </> : <p className="target-evidence">Target unavailable</p>}</dd>
        </DataCard>)}
    </dl>
    {plan && <div className="pacing-controls">
      {Number.isFinite(plan.hrCeiling) && <span>HR ceiling <b>{plan.hrCeiling} bpm</b></span>}
      {rangeFor(plan.rpe) && <span>RPE <b>{rangeLabel(plan.rpe)} / 10</b></span>}
      {plan.adjustment && <p>{plan.adjustment}</p>}
    </div>}
    {garmin && <div className="pacing-garmin">
      <a className="report-action report-action-primary" href={garmin.url} target="_blank" rel="noopener noreferrer"
        aria-label={`Open ${definition.label.toLowerCase()} workout in Garmin Connect`}>Open in Garmin Connect <span aria-hidden="true">↗</span></a>
    </div>}
  </DataCard>;
}

export function TrainingPacing({ report, onThresholds }) {
  const pacing = report.coaching?.pacing;
  return <section className="training-section" aria-labelledby="pacing-heading">
    <div className="training-heading">
      <div><h2 id="pacing-heading">Pacing cards</h2><p>{pacing?.status || "Pacing guidance for this report."}</p></div>
      <button className="report-action" onClick={onThresholds}>Threshold & data checks</button>
    </div>
    <div className="pacing-grid">{pacingSports.map(definition =>
      <PacingCard key={definition.key} definition={definition} plan={pacing?.[definition.key]} />)}</div>
  </section>;
}

export function ThresholdChecks({ report }) {
  const checks = report.thresholdReview;
  const comparisons = checks?.powerComparison?.rows || [];
  const wattages = comparisons.flatMap(row => [row.averageWatts, row.normalizedWatts]).filter(Number.isFinite);
  const maxWatts = Math.max(1, ...wattages);
  return <section className="training-section" aria-labelledby="threshold-review-heading">
    <div className="training-heading">
      <div><h2 id="threshold-review-heading">Threshold & data checks</h2>
        <p>{checks ? `Checked ${shownDate(checks.date)} · ${checks.decision}` : "Threshold review unavailable for this snapshot."}</p></div>
    </div>
    {checks && <div className="threshold-grid">
      {checks.rows.map(row => <DataCard key={row.title} className="training-panel" data-signal={row.tone} title={row.title}
        detail={<><DetailFacts rows={[["Value", `${row.value} ${row.unit || ""}`], ["Status", row.status], ["Account settings", row.detail], ["Decision", checks.decision]]} />
          <Evidence evidence={targetEvidence(row.evidence)} /></>}>
        <h3>{row.title}</h3>
        <Readout value={row.value} unit={row.unit} />
        <p className="threshold-status">{row.status}</p>
        <p>{row.detail}</p>
        <Evidence evidence={targetEvidence(row.evidence)} />
      </DataCard>)}
    </div>}
    {comparisons.length > 0 && <DataCard className="training-panel power-check" data-signal="power" title="Power by provider"
      detail={<><p>{shownDate(checks.powerComparison.date)} · {checks.powerComparison.note}</p><DetailTable columns={["Provider", "Average power", "Provider effort metric"]}
        rows={comparisons.map(row => [row.provider, Number.isFinite(row.averageWatts) ? `${row.averageWatts} W` : null,
          Number.isFinite(row.normalizedWatts) ? `${row.normalizedWatts} W NP` : row.effort])} /></>}>
      <h3>Same ride, different power summaries</h3>
      <p>{shownDate(checks.powerComparison.date)} · {checks.powerComparison.note}</p>
      <div className="table-scroll"><table className="reference-table">
        <thead><tr><th scope="col">Provider</th><th scope="col">Average</th><th scope="col">Provider effort metric</th></tr></thead>
        <tbody>{comparisons.map(row => <tr key={row.provider}><th scope="row">{row.provider}</th>
          <td><PowerMark watts={row.averageWatts} max={maxWatts} /></td>
          <td>{Number.isFinite(row.normalizedWatts) ? <PowerMark watts={row.normalizedWatts} max={maxWatts} label="NP" /> : row.effort || "—"}</td>
        </tr>)}</tbody>
      </table></div>
    </DataCard>}
  </section>;
}

function PowerMark({ watts, max, label }) {
  return Number.isFinite(watts) ? <div className="power-mark">
    <span>{watts} W {label}</span>
    <i aria-hidden="true" style={{ width: `${100 * watts / max}%` }} />
  </div> : "—";
}

export function WorkoutReview({ report }) {
  const [sport, setSport] = useState("Ride");
  const [pick, setPick] = useState(0);
  const activities = (report.activities || []).filter(activity => activity.sport === sport && activity.classification !== "non-training")
    .sort((a, b) => (b.startedAt || b.date).localeCompare(a.startedAt || a.date));
  const selected = activities[pick] || activities[0];
  const review = selected && compareWorkBlock(selected, report.coaching?.workoutReviews);
  const rows = selected ? reviewMetrics(selected) : [];
  const comparisons = review?.rows.map(row => [row.label, `${rangeLabel(row.target, row.unit)} ${row.unit}`, `${numericValue(row.value, row.unit)} ${row.unit}`, row.status]) || [];
  return <section className="training-section" aria-labelledby="workout-review-heading">
    <div className="training-heading">
      <div><h2 id="workout-review-heading">Workout review</h2><p>Recorded session and matched work-block targets</p></div>
      <div className="review-filters">
        <label>Sport<select value={sport} onChange={event => { setSport(event.target.value); setPick(0); }}>
          {pacingSports.map(item => <option key={item.sport} value={item.sport}>{item.label}</option>)}
        </select></label>
        {selected && <label>Workout<select value={activities.indexOf(selected)} onChange={event => setPick(Number(event.target.value))}>
          {activities.map((activity, index) => <option key={index} value={index}>{shownDate(activity.date)} · {activity.name || sport}</option>)}
        </select></label>}
      </div>
    </div>
    {selected ? <DataCard className="training-panel workout-review" title={selected.name || sport} detail={<>
      <DetailFacts rows={[
        ["Date", shownDate(selected.date)], ["Source", selected.source], ["Average HR", Number.isFinite(selected.averageHr) ? `${selected.averageHr} bpm` : null],
        ["Distance", Number.isFinite(selected.distanceKm) ? `${decimal(selected.distanceKm, 2)} km` : null],
        ["Average pace", sport === "Run" && Number.isFinite(selected.averagePaceSeconds) ? `${paceClock(selected.averagePaceSeconds)} /km` : null],
        ...activityMetrics(selected).map(metric => [metric.label, metric.value]),
        ["Intervals.icu VI", Number.isFinite(selected.intervalsVariabilityIndex) ? decimal(selected.intervalsVariabilityIndex, 2) : null],
        ["Coasting", Number.isFinite(selected.coastingPercent) ? `${decimal(selected.coastingPercent)}%` : null],
        ["Power processing", selected.powerProcessing],
      ]} />
      <DetailTable caption="Planned vs actual" columns={["Metric", "Target", "Recorded", "Result"]} rows={comparisons}
        empty="No comparable work block is linked to a dated plan for this workout." />
    </>}>
      <header className="training-card-heading">
        <div><h3>{selected.name || sport}</h3><p>{shownDate(selected.date)} · {selected.source || "Source unavailable"} · {duration(selected.timerSeconds ?? selected.movingSeconds)}</p></div>
      </header>
      <dl className="review-metrics">{rows.map(([label, value, unit, tone]) => <div key={label}>
        <dt>{label}</dt><dd><Readout value={numericValue(value, unit)} unit={unit} tone={tone} /></dd>
      </div>)}</dl>
      {selected.powerProcessing && <p>{selected.powerProcessing}</p>}
      {Number.isFinite(selected.intervalsVariabilityIndex) && <p>Intervals.icu · VI {decimal(selected.intervalsVariabilityIndex, 2)}
        {Number.isFinite(selected.coastingPercent) && ` · Coasting ${decimal(selected.coastingPercent)}%`}</p>}
      <div className="review-comparison">
        <h4>Planned vs actual</h4>
        {review?.rows.length ? <>
          <p>Plan {shownDate(review.plan.date)} · {review.workBlock.source} · {duration(review.workBlock.seconds)} steady work</p>
          <div className="table-scroll"><table className="reference-table"><thead>
            <tr><th scope="col">Metric</th><th scope="col">Target</th><th scope="col">Recorded</th><th scope="col">Result</th></tr>
          </thead><tbody>{review.rows.map(row => <tr key={row.key}>
            <th scope="row">{row.label}</th><td>{rangeLabel(row.target, row.unit)} {row.unit}</td>
            <td>{numericValue(row.value, row.unit)} {row.unit}</td><td>{row.status}</td>
          </tr>)}</tbody></table></div>
        </> : <p>No comparable work block is linked to a dated plan for this workout.</p>}
      </div>
    </DataCard> : <p className="quiet">No recorded workouts for this sport.</p>}
  </section>;
}

export function RecoveryProgression({ report }) {
  const plan = report.coaching?.progression;
  const w = report.wellness;
  const readings = [
    ["Training readiness", w?.readiness, "/100", "hr"],
    ["Sleep", Number.isFinite(w?.sleepMinutes) ? duration(w.sleepMinutes * 60) : null, "", "pace"],
    ["Recovery time", Number.isFinite(w?.recoveryTimeMinutes) ? duration(w.recoveryTimeMinutes * 60) : null, "", "alert"],
  ];
  return <section className="training-section" aria-labelledby="progression-heading">
    <div className="training-heading">
      <div><h2 id="progression-heading">Recovery & progression</h2><p>{report.coaching?.actionPlan?.reassess}</p></div>
    </div>
    <DataCard as="div" className="training-panel progression-check" title="Recovery & progression" detail={<>
      <DetailFacts rows={[["Source", report.preview ? "Illustrative Garmin data" : "Garmin Connect"], ["Snapshot", w?.date ? shownDate(w.date) : null],
        ...readings.map(([label, value, unit]) => [label, value == null ? null : `${value}${unit}`]), ["Readiness status", w?.readinessStatus],
        ["Recovery status", w?.recoveryTimeStatus], ["Reassess", report.coaching?.actionPlan?.reassess]]} />
      {plan && <><h3>{plan.decision}</h3><ol>{plan.steps.map(step => <li key={step}>{step}</li>)}</ol></>}
    </>}>
      <div className="review-metrics">
        {readings.map(([label, value, unit, tone]) => <div key={label}>
          <span>{label}</span><Readout value={value ?? "—"} unit={value == null ? "" : unit} tone={tone} />
        </div>)}
      </div>
      {w?.date && <p>Garmin Connect · Snapshot {shownDate(w.date)}</p>}
      {plan ? <div className="progression-next">
        <h3>{plan.decision}</h3>
        <ol>{plan.steps.map(step => <li key={step}>{step}</li>)}</ol>
      </div> : <p>Progression criteria unavailable for this snapshot.</p>}
    </DataCard>
  </section>;
}
