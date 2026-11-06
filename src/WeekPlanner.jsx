import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { decimal, duration, formatDate } from "./report.js";
import { estimateSessionLoad } from "./forecast.js";
import { palette } from "./MetricGraphics.jsx";
import { projectWeek, restWeek } from "./planner.js";
import "./planner.css";
import { DurationValue } from "./Readout.jsx";

const sports = [["Rest", "Rest"], ["Ride", "Cycling"], ["Run", "Running"], ["Weight Training", "Strength"]];
const metrics = { fitness: { label: "CTL", color: palette.blue }, fatigue: { label: "ATL", color: palette.purple }, form: { label: "TSB", color: palette.orange } };
const numeric = value => String(value).trim() === "" ? NaN : Number(value);
const display = value => Number.isFinite(value) ? decimal(value, 1) : "—";

function ChartTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return <div className="week-chart-tooltip"><strong>{label}</strong><span>{metrics[metric].label} {display(row.value)}</span><span>Rest {display(row.rest)}</span>{row.range && <small>Scenario {display(row.range[0])}–{display(row.range[1])}</small>}</div>;
}

export default function WeekPlanner({ report }) {
  const [plans, setPlans] = useState(() => restWeek(report));
  const [metric, setMetric] = useState("form");
  const [fitnessDays, setFitnessDays] = useState("42");
  const [fatigueDays, setFatigueDays] = useState("7");
  const [todayEnabled, setTodayEnabled] = useState(false);
  const [todayPlan, setTodayPlan] = useState({ sport: "Ride", minutes: "30", effort: "easy" });
  const result = projectWeek(report, plans.map(plan => ({ ...plan, minutes: numeric(plan.minutes) })), {
    fitnessDays: numeric(fitnessDays), fatigueDays: numeric(fatigueDays),
    todayPlan: todayEnabled ? { ...todayPlan, minutes: numeric(todayPlan.minutes) } : null,
  });
  const selected = metrics[metric];
  const end = result.rows?.at(-1);
  const activePlans = [...plans.filter(plan => plan.sport !== "Rest"), ...(todayEnabled ? [todayPlan] : [])];
  const activeEstimates = activePlans.map(plan => estimateSessionLoad(report, { ...plan, minutes: numeric(plan.minutes) }));
  const hardSessions = activePlans.filter(plan => plan.effort === "hard").length;
  const readiness = report.wellness?.readiness;
  const recoveryReview = Number.isFinite(readiness) && readiness < 50 && hardSessions > 0;
  const scenarioFlags = [
    activeEstimates.some(estimate => estimate.durationExtrapolated) && "Extrapolated",
    activeEstimates.some(estimate => estimate.history?.sparse) && "Sparse",
    activeEstimates.some(estimate => estimate.available && estimate.hasVariation === false) && "No effort separation",
    activeEstimates.some(estimate => estimate.weights?.assumed) && "Assumed weights",
  ].filter(Boolean);
  const chart = result.available ? [{ date: result.baseline.date, label: formatDate(result.baseline.date), value: result.todayAdjusted[metric], rest: result.todayAdjusted[metric], range: [result.todayRange[metric].low, result.todayRange[metric].high] },
    ...result.rows.map(row => ({ date: row.date, label: formatDate(row.date), value: row.mid[metric], rest: row.rest[metric], range: [row.range[metric].low, row.range[metric].high] }))] : [];
  function update(index, changes) {
    setPlans(previous => previous.map((plan, current) => current === index ? { ...plan, ...changes } : plan));
  }
  function sportChange(index, sport) {
    update(index, { sport, minutes: sport === "Rest" ? 0 : numeric(plans[index].minutes) > 0 ? plans[index].minutes : "30" });
  }
  return <section className="week-planner" aria-labelledby="week-plan-title">
    <div className="week-plan-heading"><div><h1 id="week-plan-title">7-day plan</h1><span>Intervals.icu · EOD · Est.</span></div><div className="week-plan-actions"><span>{plans.length ? `${formatDate(plans[0].date)}–${formatDate(plans.at(-1).date)}` : "—"}</span><button onClick={() => setPlans(restWeek(report))}>Reset rest</button></div></div>
    <div className="week-plan-grid">{plans.map((plan, index) => {
      const estimate = estimateSessionLoad(report, { sport: plan.sport, minutes: numeric(plan.minutes), effort: plan.effort });
      const valid = plan.sport === "Rest" || (numeric(plan.minutes) > 0 && numeric(plan.minutes) <= 600);
      return <fieldset className={`week-day ${plan.sport === "Rest" ? "week-day-rest" : ""}`} key={plan.date}>
        <legend><span>{formatDate(plan.date, { weekday: "short" }).split(",")[0]}</span><time dateTime={plan.date}>{formatDate(plan.date)}</time></legend>
        <label><span className="sr-only">{plan.date} sport</span><select value={plan.sport} onChange={event => sportChange(index, event.target.value)}>{sports.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label><span>min</span><input type="number" min="1" max="600" step="1" inputMode="numeric" aria-label={`${plan.date} duration in minutes`} value={plan.minutes} disabled={plan.sport === "Rest"} onChange={event => update(index, { minutes: event.target.value })} /></label>
        <label><span className="sr-only">{plan.date} effort</span><select value={plan.effort} disabled={plan.sport === "Rest"} onChange={event => update(index, { effort: event.target.value })}><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard</option></select></label>
        <div className="week-day-load"><span>TL</span><output aria-label={`${plan.date} estimated load`}>{valid && estimate.available ? display(estimate.mid) : "—"}</output></div>
        <small>{valid && estimate.available ? `${display(estimate.low)}–${display(estimate.high)}` : valid ? "History unavailable" : "1–600 min"}</small>
      </fieldset>;
    })}</div>
    {(Number.isFinite(readiness) || hardSessions > 0 || scenarioFlags.length > 0) && <div className={`week-scenario-status${recoveryReview ? " week-scenario-caution" : ""}`} aria-live="polite">
      {Number.isFinite(readiness) && <span>Baseline readiness {display(readiness)}</span>}
      {hardSessions > 0 && <span>{hardSessions} hard {hardSessions === 1 ? "session" : "sessions"}</span>}
      {scenarioFlags.map(flag => <small key={flag}>{flag}</small>)}
    </div>}
    {!result.available && <p className="week-plan-status" role="status">{result.error}</p>}
    {result.available && <>
      <dl className="week-plan-summary"><div><dt>Volume</dt><dd><DurationValue seconds={result.totals.minutes * 60} /></dd><small>{result.totals.sessions} sessions</small></div><div><dt>TL · Est.</dt><dd>{display(result.totals.load)}</dd><small>{display(result.totals.low)}–{display(result.totals.high)}</small></div>{Object.entries(metrics).map(([key, { label, color }]) => <div key={key}><dt>{label} · {formatDate(end.date)}</dt><dd style={{ color }}>{display(end.mid[key])}</dd><small>{display(end.range[key].low)}–{display(end.range[key].high)}</small></div>)}</dl>
      <div className="week-chart-heading"><div className="week-metric-switch" role="group" aria-label="Projection metric">{Object.entries(metrics).map(([key, { label }]) => <button key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{label}</button>)}</div><div className="week-chart-key"><span style={{ color: selected.color }}>● Plan</span><span>┄ Rest</span><span>Scenario range</span></div></div>
      <div className="week-plan-chart" role="group" aria-label={`Estimated seven-day ${selected.label} with historical scenario range and rest comparison`}>
        <ResponsiveContainer width="100%" height="100%"><ComposedChart data={chart} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="#3d454e" />
          <XAxis dataKey="label" tick={{ fill: "#b9c4ce", fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={{ fill: "#b9c4ce", fontSize: 12 }} axisLine={false} tickLine={false} width={40} domain={["auto", "auto"]} />
          <Tooltip content={<ChartTooltip metric={metric} />} />
          {metric === "form" && <ReferenceLine y={0} stroke="#68727d" />}
          <Area type="linear" dataKey="range" fill={selected.color} fillOpacity={0.14} stroke="none" isAnimationActive={false} />
          <Line type="linear" dataKey="rest" stroke="#9ba6b0" strokeDasharray="4 4" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          <Line type="linear" dataKey="value" stroke={selected.color} dot={{ r: 2 }} strokeWidth={2.5} isAnimationActive={false} />
        </ComposedChart></ResponsiveContainer>
      </div>
      <details className="week-plan-data"><summary>Daily outputs</summary><div className="table-scroll"><table><caption className="sr-only">Estimated Intervals daily plan and rest projection</caption><thead><tr><th>Date</th><th>Session</th><th>TL</th><th>CTL</th><th>ATL</th><th>TSB</th><th>Rest TSB</th></tr></thead><tbody>{result.rows.map(row => <tr key={row.date}><td>{formatDate(row.date)}</td><td>{sports.find(([value]) => value === row.plan.sport)?.[1]}{row.plan.sport !== "Rest" ? ` · ${row.plan.minutes}′` : ""}</td><td>{display(row.estimate.mid)}</td><td>{display(row.mid.fitness)}</td><td>{display(row.mid.fatigue)}</td><td>{display(row.mid.form)}</td><td>{display(row.rest.form)}</td></tr>)}</tbody></table></div></details>
    </>}
    <details className="week-plan-settings"><summary>Model settings</summary>
      <div className="week-tau"><label>CTL τ · d<input type="number" min="1" max="365" value={fitnessDays} onChange={event => setFitnessDays(event.target.value)} /></label><label>ATL τ · d<input type="number" min="1" max="365" value={fatigueDays} onChange={event => setFatigueDays(event.target.value)} /></label></div>
      <label className="week-today-toggle"><input type="checkbox" checked={todayEnabled} onChange={event => setTodayEnabled(event.target.checked)} />Additional session today</label>
      {todayEnabled && <div className="week-today-controls"><label>Sport<select value={todayPlan.sport} onChange={event => setTodayPlan({ ...todayPlan, sport: event.target.value })}>{sports.filter(([value]) => value !== "Rest").map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><label>min<input type="number" min="1" max="600" value={todayPlan.minutes} onChange={event => setTodayPlan({ ...todayPlan, minutes: event.target.value })} /></label><label>Effort<select value={todayPlan.effort} onChange={event => setTodayPlan({ ...todayPlan, effort: event.target.value })}><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard</option></select></label><div><span>TL · Est.</span><output>{result.today?.available ? display(result.today.mid) : "—"}</output></div></div>}
      <span className="week-settings-meta">Baseline {report.intervals?.date ? formatDate(report.intervals.date) : "—"} · calibration and weights in Reference</span>
    </details>
  </section>;
}
