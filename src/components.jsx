import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dailySeries, decimal, duration, formatDate, shiftDate, summarize } from "./report.js";

export function TrainingChart({ report, days = 28 }) {
  const data = dailySeries(report, days);
  return (
    <div className="training-chart">
      <div className="chart-heading">
        <div>
          <h2>{report.preview ? "Illustrative training history" : `${days}-day training history`}</h2>
          <p>Daily training duration and 7-day mean{report.preview ? " (sample data)" : " · minutes"}</p>
        </div>
        <div className="legend"><span className="bar-key">Training duration</span><span className="line-key">7-day mean</span></div>
      </div>
      <div className="chart-canvas" role="img" aria-label={`Training minutes and seven-day mean for ${days} days ending ${formatDate(report.date)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 2, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="#414448" />
            <XAxis dataKey="label" tick={{ fill: "#d9dadd", fontSize: 12 }} axisLine={{ stroke: "#8a8d91" }} tickLine={false} interval={days === 7 ? 0 : "preserveStartEnd"} minTickGap={20} />
            <YAxis tick={{ fill: "#d9dadd", fontSize: 12 }} axisLine={false} tickLine={false} width={42} />
            <Tooltip contentStyle={{ background: "#24272a", border: "1px solid #65696f", borderRadius: 6, color: "#f5f5f5" }} formatter={(value, name) => [`${decimal(value)} min`, name === "minutes" ? "Training" : "7-day mean"]} />
            <Bar dataKey="minutes" fill="#7b9f51" maxBarSize={24} isAnimationActive={false} />
            <Line dataKey="mean" stroke="#c2f77b" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>View chart data</summary>
        <div className="table-scroll"><table>
          <caption>Zero means zero recorded training inside the checked source window.</caption>
          <thead><tr><th>Date</th><th>Recorded training</th><th>7-day mean</th></tr></thead>
          <tbody>{data.map(row => <tr key={row.date}><td>{formatDate(row.date)}</td><td>{decimal(row.minutes)} min</td><td>{decimal(row.mean)} min</td></tr>)}</tbody>
        </table></div>
      </details>
    </div>
  );
}

export function Session({ report, expanded, onExpand }) {
  const session = report.coaching.nextSession;
  return (
    <section className="session-section" aria-labelledby="session-title">
      <h2 id="session-title">Next session <span className="quiet">{report.preview ? "" : formatDate(session.date)}</span></h2>
      <div className="session-summary">
        <span className="session-type">{session.name}</span>
        <strong className="session-duration">{session.minutes} minutes</strong>
        <p>{session.target}</p>
        <p className="alternative"><span>Lower-effort alternative</span> {session.alternative}</p>
      </div>
      <button className="primary" onClick={onExpand} aria-expanded={expanded} aria-controls="coaching-detail">{expanded ? "Hide coaching detail" : "Read coaching detail"}</button>
      {expanded && (
        <div id="coaching-detail" className="coaching-detail">
          <p className="condition">{session.condition}</p>
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
  const recent = report.activities.filter(activity => activity.date >= shiftDate(report.date, -6));
  const rows = recent.filter(activity => sport === "All" || activity.sport === sport);
  return (
    <section className="activity-section">
      <div className="section-title">
        <h2>Recent activities</h2>
        <label className="filter">Sport <select value={sport} onChange={event => setSport(event.target.value)}><option>All</option>{[...new Set(recent.map(activity => activity.sport))].map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      <div className="table-scroll"><table>
        <caption>Latest seven days, through the report capture time.</caption>
        <thead><tr><th>Date</th><th>Session</th><th>Moving time</th><th>Distance</th><th>Avg HR</th><th>Intervals load</th></tr></thead>
        <tbody>{rows.map((activity, index) => (
          <tr key={`${activity.source}-${Object.values(activity.externalIds || {}).join("-")}-${index}`}>
            <td>{formatDate(activity.date)}</td>
            <td>{activity.externalIds?.strava ? <a href={`https://www.strava.com/activities/${activity.externalIds.strava}`} target="_blank" rel="noreferrer">{activity.name}</a> : activity.name}<small>{activity.sport}</small></td>
            <td>{duration(activity.movingSeconds)}</td>
            <td>{Number.isFinite(activity.distanceKm) ? `${decimal(activity.distanceKm, 2)} km` : "Unavailable"}</td>
            <td>{activity.averageHr ? `${activity.averageHr} bpm` : "Unavailable"}</td>
            <td>{Number.isFinite(activity.intervalsLoad) ? activity.intervalsLoad : "Unavailable"}</td>
          </tr>
        ))}</tbody>
      </table>{!rows.length && <p>No matching activities in this window.</p>}</div>
    </section>
  );
}

export function Trends({ report }) {
  const [days, setDays] = useState(28);
  const windows = [0, 1, 2, 3].map(index => {
    const end = shiftDate(report.date, -index * 7);
    return summarize(report.activities, shiftDate(end, -6), end);
  });
  return (
    <>
      <div className="page-title"><div><p className="eyebrow">Progress over time</p><h1>Consistency before intensity.</h1></div><label className="filter">Window <select value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>7 days</option><option value={28}>28 days</option><option value={42}>42 days</option></select></label></div>
      <TrainingChart report={report} days={days} />
      <div className="table-scroll"><table>
        <caption>Aligned seven-day windows. The latest window includes today so far.</caption>
        <thead><tr><th>Window</th><th>Sessions</th><th>Active days</th><th>Training</th><th>Recorded distance</th><th>Known Intervals load</th></tr></thead>
        <tbody>{windows.map(window => <tr key={window.end}><td>{formatDate(window.start)} to {formatDate(window.end)}</td><td>{window.sessions}</td><td>{window.activeDays}</td><td>{duration(window.seconds)}</td><td>{decimal(window.distanceKm, 2)} km{window.missingDistance ? ` · ${window.missingDistance} missing` : ""}</td><td>{window.knownLoad}{window.missingLoad ? ` · ${window.missingLoad} missing` : ""}</td></tr>)}</tbody>
      </table></div>
      <h2>Training mix · latest 28 days</h2>
      <div className="sport-mix">{summarize(report.activities, shiftDate(report.date, -27), report.date).bySport.map(row => <div key={row.sport}><h3>{row.sport}</h3><strong>{duration(row.seconds)}</strong><p>{row.sessions} sessions · {decimal(row.distanceKm, 2)} recorded km</p></div>)}</div>
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
        <p>Duration totals sum moving time for deduplicated completed training. Distance totals sum available distances, with missing distances counted separately. A zero in the chart means zero recorded training in the checked source window.</p>
        <p>The 7-day mean equals recorded training minutes over the current day and preceding six days, divided by seven. The current day is partial. Comparisons use aligned windows ending on the report date.</p>
        <p>Intervals form equals its displayed fitness minus fatigue. Garmin acute/chronic load and Intervals load use different models and remain on their own scales. Strength assessment also needs exercise, set, repetition, load, effort, and soreness context.</p>
        <p>Power targets require measured power and a validated threshold. Session titles and configured FTP values provide context. Device estimates remain estimates.</p>
        <h3>Guidance references</h3>{report.coaching.references.map(reference => <p key={reference.url}><a href={reference.url} target="_blank" rel="noreferrer">{reference.title}</a></p>)}
      </div>
    </>
  );
}
