import { useState } from "react";
import { decimal, formatDate, jakartaDate, shiftDate } from "./report.js";
import { contributionWeights, estimateSessionLoad, projectTomorrow } from "./forecast.js";
import { GarminRestForecast } from "./GarminRestForecast.jsx";
import { ForecastBars, forecastColors } from "./ForecastGraphics.jsx";

const sports = [["Rest", "Rest"], ["Ride", "Cycling"], ["Run", "Running"], ["Weight Training", "Strength"]];
const number = value => String(value).trim() === "" ? NaN : Number(value);
const signed = value => Number.isFinite(value) ? `${value > 0 ? "+" : ""}${decimal(value, 1)}` : "—";
const effortLabels = { easy: "Easy", moderate: "Moderate", hard: "Hard" };
const initialPlan = (sport = "Ride", minutes = "30", effort = "easy") => ({ sport, minutes: sport === "Rest" ? "0" : minutes, effort });

function statusLabel(report, plan, weights) {
  if (plan.sport === "Rest") return "Rest";
  if (Number.isFinite(report.wellness.readiness) && report.wellness.readiness < 50) return "Recovery priority";
  if (plan.effort === "hard") return "Readiness review";
  if (weights.fitness === 0 && weights.fatigue > 0) return "ATL contribution only";
  return "Training scenario";
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
  const date = forecast.date || shiftDate(report.date, 1);
  const historical = report.date !== jakartaDate() && !report.preview;
  const invalidDuration = plan.sport !== "Rest" && (!Number.isFinite(number(plan.minutes)) || number(plan.minutes) <= 0 || number(plan.minutes) > 600);
  const invalidToday = todayEnabled && (!Number.isFinite(number(todayPlan.minutes)) || number(todayPlan.minutes) <= 0 || number(todayPlan.minutes) > 600);
  const available = forecast.available && estimate.available && todayEstimate.available && !invalidDuration && !invalidToday;
  const invalidConstants = ![number(fitnessDays), number(fatigueDays)].every(value => Number.isFinite(value) && value >= 1 && value <= 365);
  const unavailable = invalidDuration || invalidToday ? "Duration: 1–600 min" : invalidConstants ? "Time constants: 1–365 d" : !estimate.available || !todayEstimate.available ? "Sport load history unavailable" : "Dated Intervals baseline required";
  function changePlan(sport, minutes = plan.minutes) {
    setPlan(initialPlan(sport, sport === "Rest" ? "0" : number(minutes) > 0 ? minutes : "30", plan.effort));
  }
  const comparisons = [["Rest", "0", "Rest"], ["Ride", "30", "Ride 30′"], ["Ride", "45", "Ride 45′"], ["Run", "30", "Run 30′"], ["Weight Training", "30", "Strength 30′"]].map(([sport, minutes, label]) => {
    const load = estimateSessionLoad(report, { sport, minutes: number(minutes), effort: plan.effort });
    const w = contributionWeights(report, sport);
    const projected = projectTomorrow(report, { ...options, load: load.mid, loadLow: load.low, loadHigh: load.high, fitnessWeight: w.fitness, fatigueWeight: w.fatigue });
    return { sport, minutes, label, load, projected };
  });
  return <>
    <GarminRestForecast report={report} />
    <section className="load-forecast" aria-labelledby="forecast-heading">
      <div className="forecast-heading">
        <div><p className="eyebrow">Intervals.icu · EOD</p><h2 id="forecast-heading">Load simulator <span className="quiet">{formatDate(date)}</span></h2></div>
        <div className="forecast-calibration"><span title="Estimated from relative same-sport historical effort">Est.</span>{historical && <span>Snapshot {formatDate(report.date)}</span>}{estimate.history?.sparse && <span>Sparse</span>}{estimate.available && plan.sport !== "Rest" && estimate.hasVariation === false && <span>No effort separation</span>}{estimate.durationExtrapolated && <span>Extrapolated</span>}</div>
      </div>
      <div className="forecast-controls">
        <label>Sport<select value={plan.sport} onChange={event => changePlan(event.target.value)}>{sports.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label>Duration · min<input type="number" inputMode="decimal" min="0" max="600" step="1" value={plan.minutes} disabled={plan.sport === "Rest"} onChange={event => setPlan({ ...plan, minutes: event.target.value })} /></label>
        <label>Effort<select value={plan.effort} disabled={plan.sport === "Rest"} onChange={event => setPlan({ ...plan, effort: event.target.value })}><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard / intervals</option></select></label>
        <div className="forecast-auto-load"><span id="auto-load-label">TL · pts</span><output aria-labelledby="auto-load-label" aria-live="polite">{estimate.available && !invalidDuration ? decimal(estimate.mid, 1) : "—"}</output>{estimate.available && !invalidDuration && <small>{decimal(estimate.low, 1)}–{decimal(estimate.high, 1)}</small>}</div>
      </div>
      {!available ? <p className="forecast-compact-status" role="status">{unavailable}</p> : <div className="forecast-output" aria-live="polite" aria-atomic="true">
        <div className="forecast-results forecast-results-compact">
          <div className="forecast-stat"><span>ATL / CTL</span><strong>{decimal(forecast.mid.ratio, 2)}</strong><small>{decimal(forecast.range.ratio.low, 2)}–{decimal(forecast.range.ratio.high, 2)}</small><ForecastBars title="Intervals ATL to CTL projection" rows={[{ label: "Current", value: forecast.baseline.ratio, color: forecastColors.current }, { label: "Rest", value: forecast.rest.ratio, color: forecastColors.rest }, { label: "Session", value: forecast.mid.ratio, low: forecast.range.ratio.low, high: forecast.range.ratio.high, color: forecastColors.session }]} /></div>
          <div className="forecast-stat"><div className="forecast-state-values"><div><span>CTL</span><strong style={{ color: forecastColors.fitness }}>{decimal(forecast.mid.fitness, 1)}</strong></div><div><span>ATL</span><strong style={{ color: forecastColors.fatigue }}>{decimal(forecast.mid.fatigue, 1)}</strong></div><div><span>TSB</span><strong>{signed(forecast.mid.form)}</strong></div></div><ForecastBars title="Projected Intervals CTL and ATL" places={1} rows={[{ label: "CTL", value: forecast.mid.fitness, low: forecast.range.fitness.low, high: forecast.range.fitness.high, color: forecastColors.fitness }, { label: "ATL", value: forecast.mid.fatigue, low: forecast.range.fatigue.low, high: forecast.range.fatigue.high, color: forecastColors.fatigue }]} /><small>Current {decimal(forecast.baseline.fitness, 1)} / {decimal(forecast.baseline.fatigue, 1)} · rest TSB {signed(forecast.rest.form)}</small></div>
        </div>
        <div className="forecast-compact-status"><span>{statusLabel(report, plan, weights)}</span>{Number.isFinite(report.wellness.readiness) && <span>Readiness {report.wellness.readiness}</span>}</div>
      </div>}
      <details className="forecast-details"><summary>Compare sessions</summary>
        <div className="table-scroll"><table><caption>{formatDate(date)} · {effortLabels[plan.effort]}</caption><thead><tr><th scope="col">Session</th><th scope="col">Load</th><th scope="col">ATL / CTL</th><th scope="col">TSB</th><th scope="col">Select</th></tr></thead><tbody>{comparisons.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.load.available ? `${decimal(row.load.low, 1)}–${decimal(row.load.high, 1)}` : "—"}</td><td>{row.projected.available && !invalidToday ? decimal(row.projected.mid.ratio, 2) : "—"}</td><td>{row.projected.available && !invalidToday ? signed(row.projected.mid.form) : "—"}</td><td><button className="forecast-use" aria-label={`Use ${row.label}`} onClick={() => changePlan(row.sport, row.minutes)}>Use</button></td></tr>)}</tbody></table></div>
      </details>
      <details className="forecast-details"><summary>Model settings</summary>
        <label className="forecast-today-toggle"><input type="checkbox" checked={todayEnabled} onChange={event => setTodayEnabled(event.target.checked)} />Additional session today</label>
        {todayEnabled && <div className="forecast-controls forecast-today-controls">
          <label>Today · sport<select value={todayPlan.sport} onChange={event => setTodayPlan({ ...todayPlan, sport: event.target.value })}>{sports.filter(([value]) => value !== "Rest").map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label>Today · duration min<input type="number" min="1" max="600" step="1" value={todayPlan.minutes} onChange={event => setTodayPlan({ ...todayPlan, minutes: event.target.value })} /></label>
          <label>Today · effort<select value={todayPlan.effort} onChange={event => setTodayPlan({ ...todayPlan, effort: event.target.value })}><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard / intervals</option></select></label>
          <div className="forecast-auto-load"><span>Today · load pts</span><output aria-label="Today’s calculated extra load">{todayEstimate.available && !invalidToday ? decimal(todayEstimate.mid, 1) : "—"}</output></div>
        </div>}
        <div className="forecast-controls forecast-advanced">
          <label>CTL τ · d<input type="number" min="1" max="365" step="1" value={fitnessDays} onChange={event => setFitnessDays(event.target.value)} /></label>
          <label>ATL τ · d<input type="number" min="1" max="365" step="1" value={fatigueDays} onChange={event => setFatigueDays(event.target.value)} /></label>
        </div>
        <div className="forecast-config-meta"><span>CTL / ATL {decimal(weights.fitness * 100, 0)}% / {decimal(weights.fatigue * 100, 0)}%{weights.assumed ? " · assumed" : ""}</span><span>Baseline {forecast.baseline?.date ? formatDate(forecast.baseline.date) : "—"}{forecast.baseline && !forecast.baseline.dateVerified ? " · assumed date" : ""}</span>{estimate.history?.window && <span>Calibration {formatDate(estimate.history.window.start)}–{formatDate(estimate.history.window.end)} · n={estimate.history.n}</span>}<span>τ user-defined</span></div>
      </details>
    </section>
  </>;
}
