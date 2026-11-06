import { useState } from "react";
import { decimal, formatDate, jakartaDate, shiftDate } from "./report.js";
import { contributionWeights, estimateSessionLoad, projectTomorrow } from "./forecast.js";
import { GarminRestForecast } from "./GarminRestForecast.jsx";

const sports = [["Rest", "Rest"], ["Ride", "Cycling"], ["Run", "Running"], ["Weight Training", "Strength"]];
const number = value => String(value).trim() === "" ? NaN : Number(value);
const signed = value => Number.isFinite(value) ? `${value > 0 ? "+" : ""}${decimal(value, 1)}` : "Unavailable";
const effortLabels = { easy: "Easy", moderate: "Moderate", hard: "Hard" };

function initialPlan(sport = "Ride", minutes = "30", effort = "easy") {
  return { sport, minutes: sport === "Rest" ? "0" : minutes, effort };
}

function fitMessage(report, plan, weights) {
  if (plan.sport === "Rest") return { title: "Recovery option", text: "No new planned load. A falling load score is expected on a rest day; it is not a missed target." };
  const lowReadiness = Number.isFinite(report.wellness.readiness) && report.wellness.readiness < 50;
  if (lowReadiness && plan.effort !== "easy") return { title: "Recovery takes priority", text: "This report records low Garmin readiness. Moderate or hard work needs a fresh recovery review even if the model ratio looks balanced." };
  if (plan.effort === "hard") return { title: "Review before hard training", text: "Load totals cannot clear a hard session. Check tomorrow’s sleep, energy, soreness and sport-specific targets before choosing intensity." };
  if (weights.fitness === 0 && weights.fatigue > 0) return { title: "Strength adds fatigue in this model", text: "These contribution settings give strength no cardiovascular-fitness credit. That does not mean strength has no benefit or no muscular recovery cost." };
  return { title: "Conditional training option", text: `${lowReadiness ? "Keep recovery first with the readiness recorded in this report. " : ""}Use this scenario only if tomorrow’s energy, soreness and easy warm-up feel normal. The ratio alone does not establish that a session fits.` };
}

export function LoadForecast({ report }) {
  const [plan, setPlan] = useState(() => initialPlan());
  const [todayEnabled, setTodayEnabled] = useState(false);
  const [todayPlan, setTodayPlan] = useState(() => initialPlan());
  const [fitnessDays, setFitnessDays] = useState("42");
  const [fatigueDays, setFatigueDays] = useState("7");
  const estimate = estimateSessionLoad(report, { sport: plan.sport, minutes: number(plan.minutes), effort: plan.effort });
  const weights = contributionWeights(report, plan.sport);
  const todayEstimate = estimateSessionLoad(report, { sport: todayEnabled ? todayPlan.sport : "Rest", minutes: todayEnabled ? number(todayPlan.minutes) : 0, effort: todayPlan.effort });
  const todayWeights = contributionWeights(report, todayEnabled ? todayPlan.sport : "Rest");
  const options = { todayLoad: todayEstimate.mid, todayFitnessWeight: todayWeights.fitness, todayFatigueWeight: todayWeights.fatigue, fitnessDays: number(fitnessDays), fatigueDays: number(fatigueDays) };
  const forecast = projectTomorrow(report, { ...options, load: estimate.mid, loadLow: estimate.low, loadHigh: estimate.high, fitnessWeight: weights.fitness, fatigueWeight: weights.fatigue });
  const fit = fitMessage(report, plan, weights);
  const date = forecast.date || shiftDate(report.date, 1);
  const historical = report.date !== jakartaDate() && !report.preview;
  const invalidDuration = plan.sport !== "Rest" && (!Number.isFinite(number(plan.minutes)) || number(plan.minutes) <= 0 || number(plan.minutes) > 600);
  const invalidToday = todayEnabled && (!Number.isFinite(number(todayPlan.minutes)) || number(todayPlan.minutes) <= 0 || number(todayPlan.minutes) > 600);
  const available = forecast.available && estimate.available && todayEstimate.available && !invalidDuration && !invalidToday;

  function changePlan(sport, minutes = plan.minutes) {
    setPlan(initialPlan(sport, sport === "Rest" ? "0" : number(minutes) > 0 ? minutes : "30", plan.effort));
  }
  const comparisons = [["Rest", "0", "Rest"], ["Ride", "30", "30-minute ride"], ["Ride", "45", "45-minute ride"], ["Run", "30", "30-minute run"], ["Weight Training", "30", "30-minute strength"]].map(([sport, minutes, label]) => {
    const load = estimateSessionLoad(report, { sport, minutes: number(minutes), effort: plan.effort });
    const w = contributionWeights(report, sport);
    const projected = projectTomorrow(report, { ...options, load: load.mid, loadLow: load.low, loadHigh: load.high, fitnessWeight: w.fitness, fatigueWeight: w.fatigue });
    return { sport, minutes, label, load, projected };
  });

  return (
    <>
    <GarminRestForecast report={report} />
    <section className="load-forecast" aria-labelledby="forecast-heading">
      <div className="forecast-heading">
        <div><p className="eyebrow">Plan the next day</p><h2 id="forecast-heading">{historical ? "Next-day training fit" : "Tomorrow’s training fit"}</h2><p className="quiet">{formatDate(date, { weekday: "long", year: "numeric", month: "long" })} · end-of-day scenario</p></div>
        <span className="forecast-tag">Estimate · Intervals model</span>
      </div>
      {historical && <p className="condition">Historical snapshot from {formatDate(report.date)}. This does not predict tomorrow from live data. Open a current report for a current forecast.</p>}
      <p className="forecast-intro">Choose your activity, duration and intended effort. Expected load and tomorrow’s model ratio update automatically.</p>
      <div className="forecast-controls">
        <label>Training type<select value={plan.sport} onChange={event => changePlan(event.target.value)}>{sports.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label>Duration · minutes<input type="number" inputMode="decimal" min="0" max="600" step="1" value={plan.minutes} disabled={plan.sport === "Rest"} onChange={event => setPlan({ ...plan, minutes: event.target.value })} /></label>
        <label>Intended effort<select value={plan.effort} disabled={plan.sport === "Rest"} onChange={event => setPlan({ ...plan, effort: event.target.value })}><option value="easy">Easy / conversational</option><option value="moderate">Moderate</option><option value="hard">Hard / intervals</option></select></label>
        <div className="forecast-auto-load"><span id="auto-load-label">Expected load · calculated</span><output aria-labelledby="auto-load-label" aria-describedby="forecast-estimate-help" aria-live="polite">{estimate.available && !invalidDuration ? `${decimal(estimate.mid, 1)} points` : "Unavailable"}</output><small>Updates from activity × time × effort</small></div>
      </div>
      <p id="forecast-estimate-help" className="forecast-help">
        {plan.sport === "Rest" ? "Rest adds zero planned load." : estimate.available ? `Estimated from ${estimate.history.n} same-sport sessions of at least 15 minutes in the previous 42 completed days. Easy uses a lower historical load rate, moderate the typical rate, and hard a higher rate. Duration scales the selected rate automatically.` : "No usable same-sport load history. A report with recorded load data is needed to calculate this activity."}
        {plan.sport !== "Rest" && " These are relative effort scenarios, not measured RPE or validated training zones. The displayed range is historical variation, not a confidence interval."}
        {estimate.history?.sparse && " Fewer than three usable sessions: the historical range is especially uncertain."}
        {estimate.available && plan.sport !== "Rest" && estimate.hasVariation === false && " The captured rates have too little variation to distinguish effort levels reliably."}
        {estimate.durationExtrapolated && " This duration is outside your captured same-sport session range, so the estimate extrapolates beyond that history."}
      </p>
      {!available ? <p className="condition" role="status">{invalidDuration || invalidToday ? "Enter a duration between 1 and 600 minutes for each selected session." : estimate.error || todayEstimate.error || forecast.error || "A dated Intervals baseline and recorded same-sport load history are needed for this forecast."}</p> : (
        <div className="forecast-output" aria-live="polite" aria-atomic="true">
          <div className="forecast-results">
            <div className="forecast-stat"><span>Expected load · automatic</span><strong>{decimal(estimate.mid, 1)}</strong><small>Scenario range {decimal(estimate.low, 1)}–{decimal(estimate.high, 1)} points</small></div>
            <div className="forecast-stat"><span>Model fatigue / fitness</span><strong>{decimal(forecast.mid.ratio, 2)}</strong><small>Current {decimal(forecast.baseline.ratio, 2)} · rest {decimal(forecast.rest.ratio, 2)}</small><small>Range {decimal(forecast.range.ratio.low, 2)}–{decimal(forecast.range.ratio.high, 2)}</small></div>
            <div className="forecast-stat"><span>Fitness / fatigue</span><strong>{decimal(forecast.mid.fitness, 1)} / {decimal(forecast.mid.fatigue, 1)}</strong><small>Current {decimal(forecast.baseline.fitness, 1)} / {decimal(forecast.baseline.fatigue, 1)}</small><small>Raw form {signed(forecast.mid.form)} · rest {signed(forecast.rest.form)}</small></div>
          </div>
          <div className="forecast-fit"><h3>{fit.title}</h3><p>{fit.text}</p><p className="forecast-help">Fitness contribution {decimal(weights.fitness * 100, 0)}% · fatigue contribution {decimal(weights.fatigue * 100, 0)}%. {weights.assumed ? "Contribution settings assumed; verify them in Intervals." : "Uses captured contribution settings or named source contributions."}</p></div>
        </div>
      )}
      <p className="forecast-help">The workout simulator above uses the Intervals model. Garmin’s no-new-training estimate is shown separately at the top. Neither model predicts aerobic/anaerobic load-focus bars or tomorrow’s readiness.</p>

      <details className="forecast-details"><summary>Compare rest and training types</summary>
        <p className="forecast-help">Same baseline, remaining-today assumptions and {effortLabels[plan.effort].toLowerCase()} relative effort for each active session. Estimates use each sport’s history and captured or explicitly assumed contribution settings; these are comparisons, not ranked recommendations.</p>
        <div className="table-scroll"><table><caption>Projected end of {formatDate(date)} · Intervals model</caption><thead><tr><th scope="col">Session</th><th scope="col">Load range</th><th scope="col">Model ratio</th><th scope="col">Raw form</th><th scope="col">Select</th></tr></thead><tbody>{comparisons.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.load.available ? `${decimal(row.load.low, 1)}–${decimal(row.load.high, 1)}` : "Needs history"}</td><td>{row.projected.available && !invalidToday ? decimal(row.projected.mid.ratio, 2) : "Unavailable"}</td><td>{row.projected.available && !invalidToday ? signed(row.projected.mid.form) : "Unavailable"}</td><td><button className="forecast-use" onClick={() => changePlan(row.sport, row.minutes)}>Use {row.label.toLowerCase()}</button></td></tr>)}</tbody></table></div>
      </details>

      <details className="forecast-details"><summary>Adjust assumptions and inspect the calculation</summary>
        <label className="forecast-today-toggle"><input type="checkbox" checked={todayEnabled} onChange={event => setTodayEnabled(event.target.checked)} />I also plan another session today</label>
        {todayEnabled && <div className="forecast-controls forecast-today-controls">
          <label>Today’s remaining activity<select value={todayPlan.sport} onChange={event => setTodayPlan({ ...todayPlan, sport: event.target.value })}>{sports.filter(([value]) => value !== "Rest").map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label>Today’s remaining duration · minutes<input type="number" min="1" max="600" step="1" value={todayPlan.minutes} onChange={event => setTodayPlan({ ...todayPlan, minutes: event.target.value })} /></label>
          <label>Today’s intended effort<select value={todayPlan.effort} onChange={event => setTodayPlan({ ...todayPlan, effort: event.target.value })}><option value="easy">Easy / conversational</option><option value="moderate">Moderate</option><option value="hard">Hard / intervals</option></select></label>
          <div className="forecast-auto-load"><span>Today’s extra load · calculated</span><output aria-label="Today’s calculated extra load">{todayEstimate.available && !invalidToday ? `${decimal(todayEstimate.mid, 1)} points` : "Unavailable"}</output></div>
        </div>}
        <div className="forecast-controls forecast-advanced">
          <label>Fitness time constant · days<input type="number" min="1" max="365" step="1" value={fitnessDays} onChange={event => setFitnessDays(event.target.value)} /></label>
          <label>Fatigue time constant · days<input type="number" min="1" max="365" step="1" value={fatigueDays} onChange={event => setFatigueDays(event.target.value)} /></label>
        </div>
        <p className="forecast-help">The default assumes no more training today. Add only a session not already recorded in the source baseline; its load is calculated automatically too. The projection range varies tomorrow’s estimated load while holding today’s estimate at its central value. Time constants start at assumed 42/7 days; this snapshot does not verify your account’s time constants. Changing them explores a scenario from the current anchor, without rebuilding its past.</p>
        <p className="forecast-help">Baseline: {forecast.baseline?.date ? formatDate(forecast.baseline.date, { year: "numeric" }) : "date unavailable"} · fitness {decimal(forecast.baseline?.fitness, 1)}, fatigue {decimal(forecast.baseline?.fatigue, 1)}. {forecast.baseline?.dateVerified ? "Source date captured." : "Baseline date assumed to match the report; verify before using."} Rounded source scores and imperfect load estimates add uncertainty beyond the displayed range. The forecast is held in this page only.</p>
        <p className="forecast-help">Daily update: next = current × exp(−1 / days) + daily load × (1 − exp(−1 / days)). Extra load today adds its contribution without repeating today’s decay. Tomorrow advances once. Raw form = fitness − fatigue; model ratio = fatigue / fitness. A zero fitness denominator makes the ratio unavailable.</p>
        {estimate.available && plan.sport !== "Rest" && <p className="forecast-help">Calibration: {formatDate(estimate.history.window.start)}–{formatDate(estimate.history.window.end)} · {estimate.history.n} usable sessions. Easy selects the 25th-percentile load/hour rate with minimum-to-median variation; moderate the median with 25th-to-75th-percentile variation; hard the 75th-percentile rate with median-to-maximum variation. Load = duration in hours × selected same-sport rate. Uses recorded session timers, including rests and pauses. This is a relative effort proxy because session RPE and verified power are not available. Different effort, terrain, temperature, threshold settings or duration can invalidate the comparison.</p>}
        <p className="forecast-help">Estimates inherit your source’s threshold settings. Incorrect or undated thresholds can bias the load. Do not train to fill a ratio: load models do not measure muscular fatigue, illness or pain, and cannot prescribe intensity on their own.</p>
        <div className="forecast-references"><a href="https://forum.intervals.icu/t/change-fatigue-atl-and-fitness-ctl-factors/300?page=2" target="_blank" rel="noreferrer">Intervals calculation</a><a href="https://forum.intervals.icu/t/fitness-and-fatigue-for-different-activity-types/652" target="_blank" rel="noreferrer">Sport contributions</a><a href="https://support.garmin.com/en-SG/?faq=SEkNpdGyhR917js0qQL3Q6" target="_blank" rel="noreferrer">Garmin load definitions</a></div>
      </details>
    </section>
    </>
  );
}
