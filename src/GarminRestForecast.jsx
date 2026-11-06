import { decimal, formatDate, jakartaDate, shiftDate } from "./report.js";
import { projectGarminRest } from "./garminForecast.js";

export function GarminRestForecast({ report }) {
  const result = projectGarminRest(report);
  const historical = report.date !== jakartaDate() && !report.preview;
  const nextDate = result.date || shiftDate(report.date, 1);
  const displayedRatio = result.baseline?.displayRatio ?? report.wellness.garminLoadRatio;
  return (
    <section className="garmin-rest" aria-labelledby="garmin-rest-heading">
      <div className="forecast-heading"><div><p className="eyebrow">Garmin · no new training</p><h2 id="garmin-rest-heading">{historical ? "Next day if I rest" : "Tomorrow if I rest"}</h2><p className="quiet">{formatDate(nextDate, { weekday: "long", year: "numeric", month: "long" })} · {report.preview ? "illustrative history" : "estimated from your recorded history"}</p></div><span className="forecast-tag">Rough estimate · low confidence</span></div>
      <p className="forecast-intro">Old workouts lose influence as the days pass. This estimates how your Garmin acute load, chronic load and ratio could change with no more training today or tomorrow.</p>
      {historical && <p className="condition">This is the day after the report’s historical snapshot, not tomorrow from live readings.</p>}
      <div className="garmin-rest-grid">
        <div><span>Current Garmin ratio</span><strong>{decimal(displayedRatio, 1)}</strong><small>Acute {decimal(result.baseline?.acute ?? report.wellness.garminAcuteLoad, 0)} · chronic {decimal(result.baseline?.chronic ?? report.wellness.garminChronicLoad, 0)}</small></div>
        <div><span>{historical ? "Next day with no new training" : "Tomorrow with no new training"}</span><strong className={result.available ? undefined : "garmin-missing"}>{result.available ? `≈ ${decimal(result.estimate.ratio, 1)}` : "Needs history"}</strong><small>{result.available ? `Acute ≈ ${decimal(result.estimate.acute, 0)} · chronic ≈ ${decimal(result.estimate.chronic, 0)}` : "Daily load history needed"}</small></div>
      </div>
      {result.available ? <>
        <p className="forecast-help">Historical scenarios: ratio {decimal(result.range.ratio.low, 2)}–{decimal(result.range.ratio.high, 2)}. Derived from {result.n} completed days with no recorded activity. This spread is not a confidence interval, and tomorrow can fall outside it.</p>
        <p className="condition">{result.extrapolation ? "Your current load balance is outside the historical sample’s range, so this estimate is an extrapolation. " : "The age and mix of your recent workouts can differ from the sample. "}This is an empirical estimate, not Garmin’s own forecast. Do not use it as clearance to add intensity.</p>
      </> : <p className="condition" role="status">{result.error} Open a new report containing dated Garmin load history. An old emailed snapshot cannot gain new source data by refreshing.</p>}
      <details className="forecast-details"><summary>How the rest-day estimate works</summary>
        <p className="forecast-help">Garmin uses weighted recent activity load and a longer chronic-load history. Both values change, so the ratio is not guaranteed to decrease during rest. A simple average or a fixed daily percentage cannot reproduce Garmin’s calculation.</p>
        {result.available && <>
          <p className="forecast-help">The chart anchor is {formatDate(result.baseline.date, { year: "numeric" })}. Garmin displays {decimal(displayedRatio, 1)}; the calculation uses acute ÷ chronic = {decimal(result.baseline.ratio, 2)}. The estimate applies paired day-to-day changes in acute and chronic load from your history. It uses one representative observed pair near the median projected ratio, keeping both components consistent.</p>
          <p className="forecast-help">Only consecutive completed dates covered by the activity capture qualify. Any recording, including one excluded from training totals, prevents that date being treated as a no-new-load day. Today’s partial date is excluded. No recording is not proof of complete rest or complete device syncing.</p>
          <div className="table-scroll"><table><caption>Observed no-recorded-activity transitions used in this estimate</caption><thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Acute change</th><th scope="col">Chronic change</th><th scope="col">Projected ratio</th></tr></thead><tbody>{result.samples.map(sample => <tr key={sample.date}><th scope="row">{formatDate(sample.fromDate)}</th><td>{formatDate(sample.date)}</td><td>{decimal((sample.acuteFactor - 1) * 100, 1)}%</td><td>{decimal((sample.chronicFactor - 1) * 100, 1)}%</td><td>{decimal(sample.projected.ratio, 2)}</td></tr>)}</tbody></table></div>
        </>}
        <p className="forecast-help">Source: Garmin’s dated acute/chronic chart{report.garminLoadHistory?.observedAt ? `, captured ${new Date(report.garminLoadHistory.observedAt).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })} WIB` : "; not included in this snapshot"}. Planned-workout simulations below remain on the separate Intervals scale.</p>
        <a className="forecast-help" href="https://www.garmin.com/en-US/garmin-technology/cycling-science/physiological-measurements/training-load/" target="_blank" rel="noreferrer">Garmin’s load definition</a>
      </details>
    </section>
  );
}
