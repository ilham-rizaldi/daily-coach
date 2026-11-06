import { useState } from "react";
import { decimal, formatDate, jakartaDate, shiftDate } from "./report.js";
import { contributionWeights, estimateSessionLoad, projectTomorrow } from "./forecast.js";

const sports = [["Rest", "Rest"], ["Ride", "Cycling"], ["Run", "Running"], ["Weight Training", "Strength"]];
const number = value => String(value).trim() === "" ? NaN : Number(value);
const rounded = value => Number.isFinite(value) ? String(Math.round(value * 10) / 10) : "";
const signed = value => Number.isFinite(value) ? `${value > 0 ? "+" : ""}${decimal(value, 1)}` : "Unavailable";

function initialPlan(report, sport = "Ride", minutes = "30") {
  const estimate = estimateSessionLoad(report, { sport, minutes: number(minutes) });
  return { sport, minutes: sport === "Rest" ? "0" : minutes, effort: "easy", load: rounded(estimate.mid), low: rounded(estimate.low), high: rounded(estimate.high), manual: false };
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
  const [plan, setPlan] = useState(() => initialPlan(report));
  const [todayLoad, setTodayLoad] = useState("0");
  const [todaySport, setTodaySport] = useState("Ride");
  const [fitnessDays, setFitnessDays] = useState("42");
  const [fatigueDays, setFatigueDays] = useState("7");
  const estimate = estimateSessionLoad(report, { sport: plan.sport, minutes: number(plan.minutes) });
  const weights = contributionWeights(report, plan.sport);
  const todayWeights = contributionWeights(report, todaySport);
  const options = { todayLoad: number(todayLoad), todayFitnessWeight: todayWeights.fitness, todayFatigueWeight: todayWeights.fatigue, fitnessDays: number(fitnessDays), fatigueDays: number(fatigueDays) };
  const forecast = projectTomorrow(report, { ...options, load: number(plan.load), loadLow: number(plan.low), loadHigh: number(plan.high), fitnessWeight: weights.fitness, fatigueWeight: weights.fatigue });
  const fit = fitMessage(report, plan, weights);
  const date = forecast.date || shiftDate(report.date, 1);
  const historical = report.date !== jakartaDate() && !report.preview;
  const invalidDuration = plan.sport !== "Rest" && (!Number.isFinite(number(plan.minutes)) || number(plan.minutes) <= 0 || number(plan.minutes) > 600);
  const available = forecast.available && !invalidDuration;
  const ready = report.wellness.readiness;

  function changePlan(sport, minutes = plan.minutes) {
    setPlan(initialPlan(report, sport, sport === "Rest" ? "0" : number(minutes) > 0 ? minutes : "30"));
  }
  function editLoad(value) {
    setPlan({ ...plan, load: value, low: value, high: value, manual: true });
  }
  const comparisons = [["Rest", "0", "Rest"], ["Ride", "30", "30-minute ride"], ["Ride", "45", "45-minute ride"], ["Run", "30", "30-minute run"], ["Weight Training", "30", "30-minute strength"]].map(([sport, minutes, label]) => {
    const load = estimateSessionLoad(report, { sport, minutes: number(minutes) });
    const w = contributionWeights(report, sport);
    const projected = projectTomorrow(report, { ...options, load: load.mid, loadLow: load.low, loadHigh: load.high, fitnessWeight: w.fitness, fatigueWeight: w.fatigue });
    return { sport, minutes, label, load, projected };
  });

  return (
    <section className="load-forecast" aria-labelledby="forecast-heading">
      <div className="forecast-heading">
        <div><p className="eyebrow">Plan the next day</p><h2 id="forecast-heading">{historical ? "Next-day training fit" : "Tomorrow’s training fit"}</h2><p className="quiet">{formatDate(date, { weekday: "long", year: "numeric", month: "long" })} · end-of-day scenario</p></div>
        <span className="forecast-tag">Estimate · Intervals model</span>
      </div>
      {historical && <p className="condition">Historical snapshot from {formatDate(report.date)}. This does not predict tomorrow from live data. Open a current report for a current forecast.</p>}
      <p className="forecast-intro">Compare a session with rest before deciding what to do. Sport and duration suggest a load range; your actual effort can change it substantially.</p>
      <div className="forecast-controls">
        <label>Training type<select value={plan.sport} onChange={event => changePlan(event.target.value)}>{sports.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label>Duration · minutes<input type="number" inputMode="decimal" min="0" max="600" step="1" value={plan.minutes} disabled={plan.sport === "Rest"} onChange={event => setPlan({ ...initialPlan(report, plan.sport, event.target.value), effort: plan.effort })} /></label>
        <label>Intended effort<select value={plan.effort} disabled={plan.sport === "Rest"} onChange={event => setPlan({ ...plan, effort: event.target.value })}><option value="easy">Easy / conversational</option><option value="moderate">Moderate</option><option value="hard">Hard / intervals</option></select></label>
        <label>Expected load · points<input type="number" inputMode="decimal" min="0" max="2000" step="0.1" value={plan.load} disabled={plan.sport === "Rest"} aria-describedby="forecast-estimate-help" onChange={event => editLoad(event.target.value)} /></label>
      </div>
      <p id="forecast-estimate-help" className="forecast-help">
        {plan.sport === "Rest" ? "Rest adds zero planned load." : plan.manual ? "Manual load and range scenario. Edit the lower and upper bounds below to explore uncertainty; a single load entry starts with equal bounds." : estimate.available ? `Estimated from ${estimate.history.n} same-sport sessions of at least 15 minutes in the previous 42 completed days. The range is their middle 50%, not a confidence interval or an effort-specific estimate.` : "No usable same-sport load history. Enter an expected Intervals load to explore this session."}
        {plan.sport !== "Rest" && " Effort changes the coaching check, not the load estimate. Enter a planned load from a comparable workout when available."}
        {estimate.history?.sparse && " Fewer than three usable sessions: the historical range is especially uncertain."}
        {plan.manual && estimate.available && <button className="text-button" onClick={() => setPlan({ ...initialPlan(report, plan.sport, plan.minutes), effort: plan.effort })}>Use historical estimate</button>}
      </p>
      {!available ? <p className="condition" role="status">{invalidDuration ? "Enter a duration between 1 and 600 minutes." : forecast.error || "A dated Intervals fitness/fatigue baseline and a planned load are needed for this forecast."}</p> : (
        <div className="forecast-output" aria-live="polite" aria-atomic="true">
          <div className="forecast-results">
            <div className="forecast-stat"><span>Planned load</span><strong>{decimal(number(plan.load), 1)}</strong><small>Scenario range {decimal(number(plan.low), 1)}–{decimal(number(plan.high), 1)} points</small></div>
            <div className="forecast-stat"><span>Model fatigue / fitness</span><strong>{decimal(forecast.mid.ratio, 2)}</strong><small>Current {decimal(forecast.baseline.ratio, 2)} · rest {decimal(forecast.rest.ratio, 2)}</small><small>Range {decimal(forecast.range.ratio.low, 2)}–{decimal(forecast.range.ratio.high, 2)}</small></div>
            <div className="forecast-stat"><span>Fitness / fatigue</span><strong>{decimal(forecast.mid.fitness, 1)} / {decimal(forecast.mid.fatigue, 1)}</strong><small>Current {decimal(forecast.baseline.fitness, 1)} / {decimal(forecast.baseline.fatigue, 1)}</small><small>Raw form {signed(forecast.mid.form)} · rest {signed(forecast.rest.form)}</small></div>
          </div>
          <div className="forecast-fit"><h3>{fit.title}</h3><p>{fit.text}</p><p className="forecast-help">Fitness contribution {decimal(weights.fitness * 100, 0)}% · fatigue contribution {decimal(weights.fatigue * 100, 0)}%. {weights.assumed ? "Contribution settings assumed; verify them in Intervals." : "Uses captured contribution settings or named source contributions."}</p></div>
        </div>
      )}
      <div className="forecast-garmin"><div><span>Garmin · observed only</span><strong>Load ratio {decimal(report.wellness.garminLoadRatio, 1)}</strong><small>Acute {decimal(report.wellness.garminAcuteLoad, 0)} · chronic {decimal(report.wellness.garminChronicLoad, 0)}{Number.isFinite(ready) ? ` · readiness ${ready}/100` : ""}</small></div><p>Garmin’s next ratio is unavailable from this snapshot. Its weighted load model differs from Intervals. The forecast above uses ATL/CTL and does not predict your watch’s ratio or aerobic/anaerobic load-focus bars.</p></div>

      <details className="forecast-details"><summary>Compare rest and training types</summary>
        <p className="forecast-help">Same baseline and remaining-today assumptions. Estimates use each sport’s history and captured or explicitly assumed contribution settings; these are comparisons, not ranked recommendations.</p>
        <div className="table-scroll"><table><caption>Projected end of {formatDate(date)} · Intervals model</caption><thead><tr><th scope="col">Session</th><th scope="col">Load range</th><th scope="col">Model ratio</th><th scope="col">Raw form</th><th scope="col">Select</th></tr></thead><tbody>{comparisons.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.load.available ? `${decimal(row.load.low, 1)}–${decimal(row.load.high, 1)}` : "Enter load"}</td><td>{row.projected.available ? decimal(row.projected.mid.ratio, 2) : "Unavailable"}</td><td>{row.projected.available ? signed(row.projected.mid.form) : "Unavailable"}</td><td><button className="forecast-use" onClick={() => changePlan(row.sport, row.minutes)}>Use {row.label.toLowerCase()}</button></td></tr>)}</tbody></table></div>
      </details>

      <details className="forecast-details"><summary>Adjust assumptions and inspect the calculation</summary>
        <div className="forecast-controls forecast-advanced">
          <label>Lower planned load<input type="number" min="0" max="2000" step="0.1" value={plan.low} disabled={plan.sport === "Rest"} onChange={event => setPlan({ ...plan, low: event.target.value, manual: true })} /></label>
          <label>Upper planned load<input type="number" min="0" max="2000" step="0.1" value={plan.high} disabled={plan.sport === "Rest"} onChange={event => setPlan({ ...plan, high: event.target.value, manual: true })} /></label>
          <label>Remaining-today training<select value={todaySport} onChange={event => setTodaySport(event.target.value)}>{sports.filter(([value]) => value !== "Rest").map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label>Extra load still to do today<input type="number" min="0" max="2000" step="0.1" value={todayLoad} onChange={event => setTodayLoad(event.target.value)} /></label>
          <label>Fitness time constant · days<input type="number" min="1" max="365" step="1" value={fitnessDays} onChange={event => setFitnessDays(event.target.value)} /></label>
          <label>Fatigue time constant · days<input type="number" min="1" max="365" step="1" value={fatigueDays} onChange={event => setFatigueDays(event.target.value)} /></label>
        </div>
        <p className="forecast-help">The default assumes no more training today. Enter only load not already included in the source baseline, for one training type. Time constants start at assumed 42/7 days; this snapshot does not verify your account’s time constants. Changing them explores a scenario from the current anchor, without rebuilding its past.</p>
        <p className="forecast-help">Baseline: {forecast.baseline?.date ? formatDate(forecast.baseline.date, { year: "numeric" }) : "date unavailable"} · fitness {decimal(forecast.baseline?.fitness, 1)}, fatigue {decimal(forecast.baseline?.fatigue, 1)}. {forecast.baseline?.dateVerified ? "Source date captured." : "Baseline date assumed to match the report; verify before using."} Rounded source scores and imperfect load estimates add uncertainty beyond the displayed range. The forecast is held in this page only.</p>
        <p className="forecast-help">Daily update: next = current × exp(−1 / days) + daily load × (1 − exp(−1 / days)). Extra load today adds its contribution without repeating today’s decay. Tomorrow advances once. Raw form = fitness − fatigue; model ratio = fatigue / fitness. A zero fitness denominator makes the ratio unavailable.</p>
        {estimate.available && plan.sport !== "Rest" && <p className="forecast-help">Calibration: {formatDate(estimate.history.window.start)}–{formatDate(estimate.history.window.end)} · {estimate.history.n} usable sessions · {decimal(estimate.history.low, 1)}–{decimal(estimate.history.high, 1)} load points/hour, middle 50%. Uses recorded session timers, including rests and pauses. Different effort, terrain, temperature, threshold settings or duration can invalidate this comparison.</p>}
        <p className="forecast-help">Estimates inherit your source’s threshold settings. Incorrect or undated thresholds can bias the load. Do not train to fill a ratio: load models do not measure muscular fatigue, illness or pain, and cannot prescribe intensity on their own.</p>
        <div className="forecast-references"><a href="https://forum.intervals.icu/t/change-fatigue-atl-and-fitness-ctl-factors/300?page=2" target="_blank" rel="noreferrer">Intervals calculation</a><a href="https://forum.intervals.icu/t/fitness-and-fatigue-for-different-activity-types/652" target="_blank" rel="noreferrer">Sport contributions</a><a href="https://support.garmin.com/en-SG/?faq=SEkNpdGyhR917js0qQL3Q6" target="_blank" rel="noreferrer">Garmin load definitions</a></div>
      </details>
    </section>
  );
}
