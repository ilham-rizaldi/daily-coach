import { Component, lazy, Suspense, useState } from "react";
import { compareWeeks, coversWindow, decimal, duration, filterActivities, formatDate, jakartaDate, shiftDate, summarize } from "./report.js";

const LazyChart = lazy(() => import("./TrainingChart.jsx"));

class ChartBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="chart-loading" role="status"><p>The chart could not load. Your session plan and activity data are still available.</p><button className="text-button" onClick={() => location.reload()}>Reload report</button></div> : this.props.children;
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
      <h2 id="session-title">{historical ? "Planned session" : "Next session"} <span className="quiet">{report.preview ? "" : formatDate(session.date)}</span></h2>
      <div className="session-summary">
        <span className="session-type">{session.name}</span>
        <strong className="session-duration">{session.minutes} minutes</strong>
        <p>{session.target}</p>
        <p className="alternative"><span>Lower-effort alternative</span> {session.alternative}</p>
      </div>
      <p className="condition">{session.condition}</p>
      <button className="primary" onClick={onExpand} aria-expanded={expanded} aria-controls="coaching-detail">{expanded ? "Hide steps and coach notes" : "View steps and coach notes"}</button>
      {expanded && (
        <div id="coaching-detail" className="coaching-detail">
          <ol className="session-steps">{session.steps.map(step => (
            <li key={step.name}><div><strong>{step.name}</strong><span>{step.minutes} min</span></div><p>{step.detail}</p></li>
          ))}</ol>
          <div className="findings">{report.coaching.findings.map(finding => (
            <article key={finding.title}><h3>{finding.title}</h3><p>{finding.evidence}</p><p className="quiet">{finding.implication}</p></article>
          ))}</div>
          <h3>Adjust the plan</h3>
          <ul>{report.coaching.adjustments.map(item => <li key={item}>{item}</li>)}</ul>
          <p className="feedback">{report.coaching.feedback}</p>
        </div>
      )}
    </section>
  );
}

export function ActivityTable({ report }) {
  const [sport, setSport] = useState("All");
  const [days, setDays] = useState("7");
  const [query, setQuery] = useState("");
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [limit, setLimit] = useState(10);
  const rows = filterActivities(report, { sport, days, query, includeExcluded });
  const visible = rows.slice(0, limit);
  const start = days === "all" ? report.coverage.start : shiftDate(report.date, 1 - Number(days));
  const sports = [...new Set(report.activities.map(activity => activity.sport))];
  const excluded = report.activities.some(activity => activity.classification === "non-training");
  const update = (setter, value) => { setter(value); setLimit(10); };
  function clearFilters() { setSport("All"); setDays("all"); setQuery(""); setIncludeExcluded(false); setLimit(10); }
  return (
    <section className="activity-section" aria-labelledby="activities-title">
      <div className="section-title"><div><h2 id="activities-title">Activity history</h2><p className="quiet">Explore the sessions behind your coaching report.</p></div></div>
      <div className="activity-controls">
        <label className="filter" htmlFor="activity-window">Window<select id="activity-window" value={days} onChange={event => update(setDays, event.target.value)}><option value="7">7 days</option><option value="28">28 days</option><option value="all">All available</option></select></label>
        <label className="filter" htmlFor="activity-sport">Sport<select id="activity-sport" value={sport} onChange={event => update(setSport, event.target.value)}><option>All</option>{sports.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="activity-search" htmlFor="activity-search">Search sessions<input id="activity-search" type="search" placeholder="Name, sport or date" value={query} onChange={event => update(setQuery, event.target.value)} /></label>
      </div>
      {excluded && <label className="check-filter"><input type="checkbox" checked={includeExcluded} onChange={event => update(setIncludeExcluded, event.target.checked)} />Show excluded recordings</label>}
      <p className="results-count" role="status">{visible.length} of {rows.length} matching recordings · {formatDate(start)} to {formatDate(report.date)} · Through report capture</p>
      <div className="table-scroll"><table>
        <caption className="sr-only">Activity history. Excluded recordings contribute no training time or load.</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Session</th><th scope="col">Moving time</th><th scope="col">Distance</th><th scope="col">Avg HR</th><th scope="col">Intervals load</th></tr></thead>
        <tbody>{visible.map((activity, index) => (
          <tr key={`${activity.source}-${Object.values(activity.externalIds || {}).join("-")}-${index}`} className={activity.classification === "non-training" ? "activity-excluded" : undefined}>
            <td>{formatDate(activity.date)}</td>
            <td>{activity.externalIds?.strava ? <a href={`https://www.strava.com/activities/${activity.externalIds.strava}`} target="_blank" rel="noreferrer">{activity.name}</a> : activity.name}<small>{activity.sport}{activity.classification === "non-training" ? " · Excluded from training" : ""}</small></td>
            <td>{duration(activity.movingSeconds)}</td>
            <td>{Number.isFinite(activity.distanceKm) ? `${decimal(activity.distanceKm, 2)} km` : "Unavailable"}</td>
            <td>{Number.isFinite(activity.averageHr) ? `${activity.averageHr} bpm` : "Unavailable"}</td>
            <td>{Number.isFinite(activity.intervalsLoad) ? activity.intervalsLoad : "Unavailable"}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {!rows.length && <div className="empty-state"><p>{report.activities.length ? "No sessions match these filters." : "No activities were included in this report."}</p>{report.activities.length > 0 && <button className="text-button" onClick={clearFilters}>Clear filters</button>}</div>}
      {rows.length > 10 && <div className="table-actions">{visible.length < rows.length && <button className="text-button" onClick={() => setLimit(limit + 10)}>Show {Math.min(10, rows.length - visible.length)} more</button>}{limit > 10 && <button className="text-button" onClick={() => setLimit(10)}>Show fewer</button>}</div>}
    </section>
  );
}

function changeLabel(value, unit) {
  if (value == null) return "Comparison unavailable";
  if (value === 0) return "Same as previous 7 days";
  const noun = Math.abs(value) === 1 ? unit.replace(/s$/, "") : unit;
  return `${value > 0 ? "+" : ""}${decimal(value, 0)} ${noun} vs previous 7 days`;
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
  const timeLabel = timeChange == null ? "Comparison unavailable" : timeChange === 0 ? "Same as previous 7 days" : `${decimal(Math.abs(timeChange), 1)}% ${timeChange > 0 ? "more" : "less"} recorded time`;
  return (
    <>
      <div className="page-title"><div><p className="eyebrow">Progress over time</p><h1>Your training, in context.</h1></div><div className="trend-controls"><label className="filter" htmlFor="trend-sport">Sport<select id="trend-sport" value={sport} onChange={event => setSport(event.target.value)}><option>All</option>{sports.map(value => <option key={value}>{value}</option>)}</select></label><label className="filter" htmlFor="trend-window">Chart window<select id="trend-window" value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>7 days</option><option value={28}>28 days</option><option value={42}>42 days</option></select></label></div></div>
      <section className="week-comparison" aria-labelledby="comparison-title">
        <h2 id="comparison-title">Last 7 complete days</h2>
        <p className="quiet">{formatDate(current.start)} to {formatDate(current.end)} · Compared with {formatDate(previous.start)} to {formatDate(previous.end)}. The capture day is excluded.</p>
        <div className="comparison-grid"><div><span>Recorded training</span><strong>{currentAvailable ? duration(current.seconds) : "Unavailable"}</strong><small>{timeLabel}</small></div><div><span>Sessions</span><strong>{currentAvailable ? current.sessions : "Unavailable"}</strong><small>{changeLabel(comparison.sessionChange, "sessions")}</small></div><div><span>Active days</span><strong>{currentAvailable ? current.activeDays : "Unavailable"}{currentAvailable && <small> / 7</small>}</strong><small>{changeLabel(comparison.activeDayChange, "days")}</small></div></div>
        {!comparison.comparable && <p className="quiet comparison-limit">Both seven-day windows need complete source coverage before a change can be calculated. Totals show available recordings.</p>}
        <p className="comparison-limit">Changes describe recorded training volume. They do not establish a fitness improvement.</p>
      </section>
      <TrainingChart report={report} days={days} sport={sport} />
      <div className="table-scroll"><table>
        <caption>Aligned seven-day windows ending on the report date. The latest window includes the capture day so far.</caption>
        <thead><tr><th scope="col">Window</th><th scope="col">Sessions</th><th scope="col">Active days</th><th scope="col">Training</th><th scope="col">Recorded distance</th><th scope="col">Known Intervals load</th></tr></thead>
        <tbody>{windows.map(window => <tr key={window.end}><td>{formatDate(window.start)} to {formatDate(window.end)}{!window.complete && <small>Partial coverage</small>}</td><td>{window.sessions || window.complete ? window.sessions : "Unavailable"}</td><td>{window.activeDays || window.complete ? window.activeDays : "Unavailable"}</td><td>{window.sessions || window.complete ? duration(window.seconds) : "Unavailable"}</td><td>{window.sessions || window.complete ? `${decimal(window.distanceKm, 2)} km` : "Unavailable"}{window.missingDistance ? ` · ${window.missingDistance} missing` : ""}</td><td>{window.sessions || window.complete ? window.knownLoad : "Unavailable"}{window.missingLoad ? ` · ${window.missingLoad} missing` : ""}</td></tr>)}</tbody>
      </table></div>
      <h2 className="mix-title">Training mix · latest 28 days</h2>
      <div className="sport-mix">{summarize(activities, shiftDate(report.date, -27), report.date).bySport.map(row => <div key={row.sport}><h3>{row.sport}</h3><strong>{duration(row.seconds)}</strong><p>{row.sessions} recorded sessions{["Ride", "Run"].includes(row.sport) ? ` · ${decimal(row.distanceKm, 2)} recorded km` : ""}</p></div>)}</div>
      <div className="report-notes"><h2>What the numbers can support</h2>{report.coaching.findings.map(finding => <article key={finding.title}><h3>{finding.title}</h3><p>{finding.evidence}</p><p className="quiet">{finding.implication}</p></article>)}</div>
    </>
  );
}

export function Sources({ report }) {
  return (
    <>
      <div className="page-title"><div><p className="eyebrow">Evidence and definitions</p><h1>Know what each number means.</h1></div></div>
      <div className="source-list">{report.sources.map(source => <article key={source.name}><div><h2>{source.name}</h2><span className="source-status">{source.status}</span></div><p>{source.detail}</p><p className="quiet">Observed {source.observedAt}{source.syncAge ? ` · Last device sync ${source.syncAge}` : ""}</p></article>)}</div>
      <h2>Data checks</h2><ul className="quality-list">{report.quality.map(item => <li key={item}>{item}</li>)}</ul>
      <div className="definitions">
        <h2>Calculations and limits</h2>
        <p>Duration totals sum moving time for deduplicated completed training. Distance totals sum available distances, with missing distances counted separately. A zero in the chart means zero recorded training in a complete checked source window. Unavailable means the source coverage is incomplete.</p>
        <p>The 7-day mean equals recorded training minutes over the current day and preceding six days, divided by seven. The capture day is partial. Weekly comparisons exclude that day and require complete coverage for both windows.</p>
        <p>Intervals form equals its displayed fitness minus fatigue. Garmin acute/chronic load and Intervals load use different models and remain on their own scales. Strength assessment also needs exercise, set, repetition, load, effort, and soreness context.</p>
        <p>Power targets require measured power and a validated threshold. Session titles and configured FTP values provide context. Device estimates remain estimates.</p>
        <h3>Guidance references</h3>{report.coaching.references.map(reference => <p key={reference.url}><a href={reference.url} target="_blank" rel="noreferrer">{reference.title}</a></p>)}
      </div>
    </>
  );
}
