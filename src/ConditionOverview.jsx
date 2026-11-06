import { conditionOverview } from "./condition.js";

function Metric({ metric, compact = false }) {
  return <div className={`condition-metric${compact ? " compact" : ""}`} data-metric={metric.id}>
    <dt>{metric.label}</dt>
    <dd className={metric.attention ? "amber" : undefined}>
      <strong className={metric.value === "Unavailable" ? "condition-unavailable" : undefined}>{metric.value}</strong>
      {metric.unit && <span className="condition-unit">{metric.unit}</span>}
      {!compact && <p className="condition-context">{metric.context}</p>}
      {compact && metric.status && <p className="condition-context">{metric.status}</p>}
      {metric.stamp && <p className="condition-stamp">{metric.stamp}</p>}
    </dd>
  </div>;
}

function Rows({ rows }) {
  if (!rows.length) return <p className="condition-empty">Not recorded in this report.</p>;
  return <dl className="condition-rows">{rows.map(row => <div key={row.label}>
    <dt>{row.label}</dt><dd>{row.value}{row.context && <small>{row.context}</small>}</dd>
  </div>)}</dl>;
}

export function ConditionOverview({ report }) {
  const data = conditionOverview(report);
  return <section className="condition-overview" aria-labelledby="condition-title">
    <div className="condition-heading">
      <div><p className="eyebrow">Body condition</p><h2 id="condition-title">Your body at a glance</h2></div>
      <span className="condition-snapshot">{report.preview ? "Illustrative snapshot" : "Recorded in this report"}</span>
    </div>
    <dl className="condition-primary">{data.primary.map(metric => <Metric key={metric.id} metric={metric} />)}</dl>
    <div className="condition-panels">
      <section className="condition-panel" aria-labelledby="condition-overnight">
        <div className="condition-panel-heading"><h3 id="condition-overnight">Sleep & overnight vitals</h3><span>Garmin</span></div>
        <Rows rows={data.overnight} />
        <p className="condition-stamp">{data.overnightStamp}</p>
        {data.overnight.some(row => row.label === "Oxygen saturation") && <p className="condition-footnote">Oxygen and respiration are recorded watch readings.</p>}
      </section>
      <section className="condition-panel condition-load" aria-labelledby="condition-load">
        <div className="condition-panel-heading"><h3 id="condition-load">Training load</h3><span>Separate models</span></div>
        <h4>Garmin</h4>
        <dl className="condition-load-values">{data.garminLoad.map(metric => <Metric key={metric.id} metric={metric} compact />)}</dl>
        <p className="condition-stamp">Acute: {data.garminLoadStamp}</p>
        <p className="condition-footnote">{data.garminLoadContext}</p>
        <h4>Intervals.icu</h4>
        <dl className="condition-load-values">{data.intervals.map(metric => <Metric key={metric.id} metric={metric} compact />)}</dl>
        <p className="condition-stamp">{data.intervalsStamp}</p>
      </section>
      <section className="condition-panel" aria-labelledby="condition-fitness">
        <div className="condition-panel-heading"><h3 id="condition-fitness">Fitness & adaptation</h3><span>Garmin</span></div>
        <Rows rows={data.fitness} />
        <p className="condition-stamp">Training status: {data.fitnessStamp}</p>
        <p className="condition-footnote">VO₂ max and heat acclimation measurement dates are unrecorded.</p>
      </section>
    </div>
    <div className="condition-bottom">
      <p>Garmin recovery readings above. Recovery time is a captured snapshot, not a live countdown.</p>
      {data.more.length > 0 && <details><summary>More recorded detail</summary><Rows rows={data.more} /></details>}
    </div>
  </section>;
}
