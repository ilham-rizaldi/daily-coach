import { Component, Fragment, lazy, Suspense, useId, useState } from "react";
import { compareWeeks, coversWindow, decimal, duration, filterActivities, formatDate, jakartaDate, shiftDate, summarize } from "./report.js";
import { palette } from "./MetricGraphics.jsx";
import { DurationValue } from "./Readout.jsx";

const LazyChart = lazy(() => import("./TrainingChart.jsx"));

export class ChartBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="chart-loading" role="status"><p>Chart unavailable</p><button className="text-button" onClick={() => location.reload()}>Reload</button></div> : this.props.children;
  }
}

export function TrainingChart(props) {
  return <ChartBoundary key={`${props.report.date}-${props.days || 28}-${props.sport || "All"}`}><Suspense fallback={<div className="chart-loading" role="status">Loading training history…</div>}><LazyChart {...props} /></Suspense></ChartBoundary>;
}

export function Session({ report, expanded, onExpand }) {
  const session = report.coaching.nextSession;
  const historical = !report.preview && report.date < jakartaDate();
  return (
    <section className="session-section" aria-labelledby="session-title">
      <h2 id="session-title">{historical ? "Planned session" : "Session"} <span className="quiet">{report.preview ? "" : formatDate(session.date)}</span></h2>
      <div className="session-summary">
        <span className="session-type">{session.name}</span>
        <DurationValue as="strong" className="session-duration" seconds={session.minutes * 60} />
        <p>{session.target.split(". ")[0]}</p>
      </div>
      <div className="workout-timeline" role="img" aria-label={session.steps.map(step=>`${step.name}, ${step.minutes} minutes`).join("; ")}>{session.steps.map((step,index)=><div key={`${step.name}-${index}`} style={{flex:step.minutes,borderColor:[palette.light,palette.blue,palette.purple][Math.min(index,2)]}}><strong>{step.name.replace(/Warm-up/i,"WU").replace(/Cool-down/i,"CD")}</strong><span>{step.minutes}′</span></div>)}</div>
      <button className="text-button session-detail-toggle" onClick={onExpand} aria-expanded={expanded} aria-controls="coaching-detail">{expanded ? "Hide detail" : "Session detail"}</button>
      {expanded && (
        <div id="coaching-detail" className="coaching-detail">
          <p><span className="quiet">Target · </span>{session.target}</p>
          <ol className="session-steps">{session.steps.map((step,index) => (
            <li key={`${step.name}-${index}`}><div><strong>{step.name}</strong><span>{step.minutes} min</span></div><p>{step.detail}</p></li>
          ))}</ol>
          <p>{session.condition}</p><p><span className="quiet">Alternative · </span>{session.alternative}</p>
          {report.coaching.adjustments?.length > 0 && <details className="session-adjustments"><summary>Adjustment rules</summary><ul>{report.coaching.adjustments.map(item => <li key={item}>{item}</li>)}</ul></details>}

        </div>
      )}
    </section>
  );
}

function activityClock(seconds) {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600), minutes = Math.floor(rounded % 3600 / 60);
  return `${hours ? `${hours}h ` : ""}${minutes}m ${String(rounded % 60).padStart(2, "0")}s`;
}

const firstRecorded = (...values) => values.find(Number.isFinite);

function activityMetrics(activity) {
  const metrics = [];
  function add(label, value, unit, places = 0, minimum = 0) {
    if (!Number.isFinite(value) || value < minimum) return;
    const gap = unit === "%" || unit.startsWith("/") ? "" : " ";
    metrics.push({ label, value: `${decimal(value, places)}${gap}${unit}` });
  }
  function addTime(label, value) {
    if (Number.isFinite(value) && value >= 0) metrics.push({ label, value: activityClock(value) });
  }
  addTime("Timer", activity.timerSeconds);
  addTime("Moving time", activity.providerMovingSeconds);
  addTime("Elapsed time", activity.elapsedSeconds);
  add("HR max", activity.maxHr, "bpm", 0, 1);
  add("Speed avg", activity.averageSpeedKph, "km/h", 1);
  add("Moving speed avg", activity.averageMovingSpeedKph, "km/h", 1);
  add("Speed max", firstRecorded(activity.maximumSpeedKph, activity.maxSpeedKph), "km/h", 1);
  add("Elevation gain", activity.elevationMeters, "m");
  add("Elevation loss", activity.descentMeters, "m");
  add("Elevation min", activity.minElevationMeters, "m", 0, -Infinity);
  add("Elevation max", activity.maxElevationMeters, "m", 0, -Infinity);
  add("Aerobic TE · Garmin", activity.garminAerobicTrainingEffect, "/5", 1);
  add("Anaerobic TE · Garmin", activity.garminAnaerobicTrainingEffect, "/5", 1);
  add("Exercise Load · Garmin", activity.garminExerciseLoad, "pts");
  add("TSS · Garmin", activity.garminTrainingStressScore, "pts", 1, 0.1);
  add("TRIMP · Intervals", activity.intervalsTrimp, "AU", 1);
  add("Intensity · Intervals", activity.intervalsIntensityPercent, "%");
  if (activity.intervalsListLoad !== activity.intervalsLoad) add("List TL · Intervals", activity.intervalsListLoad, "pts", 1);
  add("HR avg · Intervals", activity.intervalsAverageHr, "bpm", 0, 1);
  if (activity.sport !== "Run") {
    add("Power avg", firstRecorded(activity.averagePowerWatts, activity.averageCyclingPowerWatts), "W");
    add("Power max", firstRecorded(activity.maximumPowerWatts, activity.maxPowerWatts, activity.maximumCyclingPowerWatts), "W");
    add("Normalized power", firstRecorded(activity.normalizedPowerWatts, activity.normalizedCyclingPowerWatts), "W");
  }
  add("Power avg · Strava est.", activity.stravaEstimatedPowerWatts, "W");
  add("Run power avg · est.", activity.averageRunningPowerWatts, "W");
  add("Run power max · est.", activity.maximumRunningPowerWatts, "W");
  add("Run power normalized · est.", activity.normalizedRunningPowerWatts, "W");
  add("Cadence avg", firstRecorded(activity.averageCadenceRpm, activity.averageBikeCadenceRpm), "rpm");
  add("Cadence max", firstRecorded(activity.maximumCadenceRpm, activity.maximumBikeCadenceRpm), "rpm");
  add("Run cadence avg", activity.averageRunCadence, "spm");
  add("Run cadence max", activity.maxRunCadence, "spm");
  add("Stride length", activity.averageStrideLengthMeters, "m", 2);
  add("Vertical ratio", activity.averageVerticalRatioPercent, "%", 1);
  add("Vertical oscillation", activity.averageVerticalOscillationCm, "cm", 1);
  add("Ground contact time", activity.averageGroundContactTimeMs, "ms");
  add("Respiration avg", activity.averageRespiration, "breaths/min", 1);
  add("Respiration min", activity.minimumRespiration, "breaths/min", 1);
  add("Respiration max", activity.maximumRespiration, "breaths/min", 1);
  add("Temperature avg", activity.averageTempC, "°C", 1, -Infinity);
  add("Temperature min", activity.minTempC, "°C", 1, -Infinity);
  add("Temperature max", activity.maxTempC, "°C", 1, -Infinity);
  add("Energy total", activity.caloriesKcal, "kcal");
  add("Energy active", activity.activeCaloriesKcal, "kcal");
  add("Energy resting", activity.restingCaloriesKcal, "kcal");
  add("Sweat loss · est.", activity.estimatedSweatLossMl, "mL");
  add("Moderate intensity", activity.moderateIntensityMinutes, "min");
  add("Vigorous intensity", activity.vigorousIntensityMinutes, "min");
  add("Intensity total · Garmin", activity.totalIntensityMinutes, "min");
  add("Body Battery drain", activity.bodyBatteryDrain, "pts", 0, -Infinity);
  add("Lap count", activity.laps, "laps");
  add("Step count", activity.totalSteps, "steps");
  add("Stroke count", activity.totalStrokes, "strokes");
  addTime("Work time", activity.workSeconds);
  addTime("Rest time", activity.restSeconds);
  add("Total sets", activity.totalSets, "sets");
  add("Total reps", activity.totalReps, "reps");
  add("Strength volume", activity.strengthVolumeKg, "kg");
  const deadlift = activity.exerciseDetailCheck?.deadlift;
  if (deadlift && [deadlift.sets, deadlift.repsPerSet, deadlift.recordedWeightKg].every(value => Number.isFinite(value) && value > 0)) {
    metrics.push({ label: deadlift.recordedName || "Deadlift", value: `${deadlift.sets} × ${deadlift.repsPerSet} · ${decimal(deadlift.recordedWeightKg, 1)} kg` });
  }
  return metrics;
}

const detailLayout = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,112px),1fr))",
  gap: "9px 14px", margin: 0, padding: "10px 12px",
  boxSizing: "border-box", width: "min(100%, calc(100vw - 48px))",
  whiteSpace: "normal", background: "#20262c", border: "1px solid #39444f", borderRadius: 5,
  position: "sticky", left: 0,
};

function ActivityDetails({ metrics }) {
  return <dl style={detailLayout}>{metrics.map(({ label, value }) => <div key={label}>
    <dt className="quiet" style={{ fontSize: 11 }}>{label}</dt>
    <dd style={{ margin: 0, fontWeight: 600 }}>{value}</dd>
  </div>)}</dl>;
}

export function ActivityTable({ report }) {
  const [sport, setSport] = useState("All");
  const [days, setDays] = useState("all");
  const [query, setQuery] = useState("");
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [limit, setLimit] = useState(10);
  const [selected, setSelected] = useState(null);
  const detailId = useId();
  const rows = filterActivities(report, { sport, days, query, includeExcluded });
  const visible = rows.slice(0, limit);
  const start = days === "all" ? report.coverage.start : shiftDate(report.date, 1 - Number(days));
  const sports = [...new Set(report.activities.map(activity => activity.sport))];
  const excluded = report.activities.some(activity => activity.classification === "non-training");
  const update = (setter, value) => { setter(value); setLimit(10); setSelected(null); };
  function clearFilters() { setSport("All"); setDays("all"); setQuery(""); setIncludeExcluded(false); setLimit(10); setSelected(null); }
  return (
    <section className="activity-section" aria-labelledby="activities-title">
      <div className="section-title"><h2 id="activities-title">Activities</h2></div>
      <div className="activity-controls">
        <label className="filter" htmlFor="activity-window">Window<select id="activity-window" value={days} onChange={event => update(setDays, event.target.value)}><option value="7">7 days</option><option value="28">28 days</option><option value="all">All</option></select></label>
        <label className="filter" htmlFor="activity-sport">Sport<select id="activity-sport" value={sport} onChange={event => update(setSport, event.target.value)}><option>All</option>{sports.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="activity-search" htmlFor="activity-search">Search<input id="activity-search" type="search" placeholder="Name, sport or date" value={query} onChange={event => update(setQuery, event.target.value)} /></label>
      </div>
      {excluded && <label className="check-filter"><input type="checkbox" checked={includeExcluded} onChange={event => update(setIncludeExcluded, event.target.checked)} />Show excluded recordings</label>}
      <p className="results-count" role="status">{visible.length}/{rows.length} · {formatDate(start)}–{formatDate(report.date)}</p>
      <div className="table-scroll"><table>
        <caption className="sr-only">Activity history. Excluded recordings contribute no training time or load.</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Session</th><th scope="col">Duration</th><th scope="col">Distance</th><th scope="col">HR avg</th><th scope="col">TL · Intervals</th></tr></thead>
        <tbody>{visible.map((activity, index) => {
          const metrics = activityMetrics(activity), open = selected === activity;
          const rowDetailId = `${detailId}-${index}`;
          return <Fragment key={`${activity.source}-${Object.values(activity.externalIds || {}).join("-")}-${index}`}>
            <tr className={activity.classification === "non-training" ? "activity-excluded" : undefined}>
              <td>{formatDate(activity.date)}</td>
              <td>
                {activity.externalIds?.strava ? <a href={`https://www.strava.com/activities/${activity.externalIds.strava}`} target="_blank" rel="noreferrer">{activity.name}</a> : activity.name}
                <small>
                  {activity.sport}{activity.classification === "non-training" ? " · Excluded from training" : ""}
                  {metrics.length > 0 && <button type="button" onClick={() => setSelected(open ? null : activity)}
                    aria-expanded={open} aria-controls={open ? rowDetailId : undefined}
                    aria-label={`${open ? "Hide" : "Show"} details for ${activity.name}`}
                    style={{ padding: "3px 0", marginInlineStart: 8, fontSize: 11, color: palette.light, minHeight: 28 }}>
                    {open ? "− Details" : "+ Details"}
                  </button>}
                </small>
              </td>
              <td>{duration(activity.movingSeconds)}</td>
              <td>{Number.isFinite(activity.distanceKm) ? `${decimal(activity.distanceKm, 2)} km` : "—"}</td>
              <td>{Number.isFinite(activity.averageHr) ? `${activity.averageHr} bpm` : "—"}</td>
              <td>{Number.isFinite(activity.intervalsLoad) ? activity.intervalsLoad : "—"}</td>
            </tr>
            {open && <tr id={rowDetailId}><td colSpan={6} style={{ padding: "0 0 10px" }}><ActivityDetails metrics={metrics} /></td></tr>}
          </Fragment>;
        })}</tbody>
      </table></div>
      {!rows.length && <div className="empty-state"><p>{report.activities.length ? "No sessions match these filters." : "No activities were included in this report."}</p>{report.activities.length > 0 && <button className="text-button" onClick={clearFilters}>Clear filters</button>}</div>}
      {rows.length > 10 && <div className="table-actions">{visible.length < rows.length && <button className="text-button" onClick={() => setLimit(limit + 10)}>Show {Math.min(10, rows.length - visible.length)} more</button>}{limit > 10 && <button className="text-button" onClick={() => { setLimit(10); setSelected(null); }}>Show fewer</button>}</div>}
    </section>
  );
}

function changeLabel(value, unit) {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${decimal(value, 0)} ${unit}`;
}

function PeriodBars({ current, previous, label, format = value => decimal(value, 0) }) {
  const max = Math.max(1, current || 0, previous || 0);
  return <div className="period-bars" role="img" aria-label={`${label}: current ${current ?? "missing"}, previous ${previous ?? "missing"}`}>
    <div><span>Current</span><i style={{ width: `${Number.isFinite(current) ? current / max * 100 : 0}%`, background: palette.blue }} /></div>
    <div><span>Previous</span><i style={{ width: `${Number.isFinite(previous) ? previous / max * 100 : 0}%`, background: palette.gray }} /><b>{Number.isFinite(previous) ? format(previous) : "—"}</b></div>
  </div>;
}

export function Trends({ report }) {
  const [days, setDays] = useState(28);
  const [sport, setSport] = useState("All");
  const activities = report.activities.filter(activity => sport === "All" || activity.sport === sport);
  const sports = [...new Set(report.activities.filter(activity => activity.classification !== "non-training").map(activity => activity.sport))];
  const comparison = compareWeeks(report, sport);
  const { current, previous } = comparison;
  const currentAvailable = current.sessions > 0 || coversWindow(report, current.start, current.end);
  const windows = [0, 1, 2, 3].map(index => {
    const end = shiftDate(report.date, -index * 7);
    const window = summarize(activities, shiftDate(end, -6), end);
    return { ...window, complete: coversWindow(report, window.start, window.end) };
  });
  const timeChange = comparison.timeChangePercent;
  const timeLabel = timeChange == null ? "—" : `${timeChange > 0 ? "+" : ""}${decimal(timeChange, 1)}%`;
  const previousAvailable = previous.sessions > 0 || coversWindow(report, previous.start, previous.end);
  const mixStart = shiftDate(report.date, -27);
  const mix = summarize(activities, mixStart, report.date).bySport.map(row => ({
    ...row,
    distanceAvailable: activities.some(activity => activity.sport === row.sport && activity.classification !== "non-training" && activity.date >= mixStart && activity.date <= report.date && Number.isFinite(activity.distanceKm)),
  }));
  const mixSeconds = mix.reduce((sum,row)=>sum+row.seconds,0);
  const sportColors = { Ride: palette.blue, Run: palette.orange, "Weight Training": palette.purple, Other: palette.green };
  return (
    <>
      <div className="page-title"><h1>Trends</h1><div className="trend-controls"><label className="filter" htmlFor="trend-sport">Sport<select id="trend-sport" value={sport} onChange={event => setSport(event.target.value)}><option>All</option>{sports.map(value => <option key={value}>{value}</option>)}</select></label><label className="filter" htmlFor="trend-window">Period<select id="trend-window" value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>7d</option><option value={28}>28d</option><option value={42}>42d</option></select></label></div></div>
      <section className="week-comparison" aria-labelledby="comparison-title">
        <h2 id="comparison-title">7d comparison {!comparison.comparable && <small className="quiet">Partial</small>}</h2>
        <p className="quiet period-dates">{formatDate(current.start)}–{formatDate(current.end)} / {formatDate(previous.start)}–{formatDate(previous.end)}</p>
        <div className="comparison-grid"><div><span>Duration</span><DurationValue as="strong" seconds={currentAvailable ? current.seconds : NaN} /><small>{timeLabel}</small><PeriodBars label="Duration in seconds" format={duration} current={currentAvailable?current.seconds:null} previous={previousAvailable?previous.seconds:null} /></div><div><span>Sessions</span><strong>{currentAvailable ? current.sessions : "—"}</strong><small>{changeLabel(comparison.sessionChange, "sessions")}</small><PeriodBars label="Sessions" current={currentAvailable?current.sessions:null} previous={previousAvailable?previous.sessions:null} /></div><div><span>Active days</span><strong className="metric-value"><span className="metric-number">{currentAvailable ? current.activeDays : "—"}</span>{currentAvailable && <small className="metric-unit metric-unit-tight">/7</small>}</strong><small>{changeLabel(comparison.activeDayChange, "days")}</small><PeriodBars label="Active days" current={currentAvailable?current.activeDays:null} previous={previousAvailable?previous.activeDays:null} /></div></div>
      </section>
      <TrainingChart report={report} days={days} sport={sport} />
      <details className="trend-blocks"><summary>Weekly totals</summary><div className="table-scroll"><table>
        <caption>7d blocks · {formatDate(report.date)} partial</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Sessions</th><th scope="col">Days</th><th scope="col">Duration</th><th scope="col">Distance · known</th><th scope="col">TL · Intervals</th></tr></thead>
        <tbody>{windows.map(window => <tr key={window.end}><td>{formatDate(window.start)} to {formatDate(window.end)}{!window.complete && <small>Partial coverage</small>}</td><td>{window.sessions || window.complete ? window.sessions : "Unavailable"}</td><td>{window.activeDays || window.complete ? window.activeDays : "Unavailable"}</td><td>{window.sessions || window.complete ? duration(window.seconds) : "Unavailable"}</td><td>{window.sessions || window.complete ? `${decimal(window.distanceKm, 2)} km` : "Unavailable"}{window.missingDistance ? ` · ${window.missingDistance} missing` : ""}</td><td>{window.sessions || window.complete ? window.knownLoad : "Unavailable"}{window.missingLoad ? ` · ${window.missingLoad} missing` : ""}</td></tr>)}</tbody>
      </table></div></details>
      <h2 className="mix-title">Sport mix · 28d</h2>
      {mixSeconds>0 && <div className="sport-mix-bar" role="img" aria-label={mix.map(row=>`${row.sport} ${decimal(row.seconds/mixSeconds*100,0)}%`).join(", ")}>{mix.map(row=><span key={row.sport} style={{width:`${row.seconds/mixSeconds*100}%`,background:sportColors[row.sport] ?? palette.green}} />)}</div>}
      <div className="sport-mix">{mix.map(row => <div key={row.sport}><h3><i style={{background:sportColors[row.sport] ?? palette.green}} />{row.sport}</h3><DurationValue as="strong" seconds={row.seconds} /><p>{row.sessions} sessions · {mixSeconds>0?`${decimal(row.seconds/mixSeconds*100,0)}%`:"—"}{["Ride", "Run"].includes(row.sport) ? ` · ${row.distanceAvailable ? decimal(row.distanceKm, 2) : "—"} km` : ""}</p></div>)}</div>
    </>
  );
}

