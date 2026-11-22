import { useMemo, useState } from "react";
import { DataCard, DetailFacts, DetailTable } from "./CardDetails.jsx";
import { datedHistory } from "./cardHistory.js";
import { PredictionChart } from "./PredictionChart.jsx";
import { MetricValue } from "./Readout.jsx";
import { WorkoutAdvice } from "./WorkoutAdvice.jsx";
import { decimal, duration, formatDate } from "./report.js";
import { paceClock } from "./pacing.js";
import { HR_CEILING_MIN, HR_CEILING_MAX, PREDICTION_DAYS, parseScenarioPace, predictEffortAtCeiling,
  predictHeartRate, predictionDataset, predictionModes, suggestedEffort } from "./prediction.js";
import "./predictions.css";

const dateText = date => formatDate(date, { year: "numeric" });
const paceMode = mode => mode === "running";
const effortText = (value, mode) => paceMode(mode) ? paceClock(value) : decimal(value);
const withUnit = (value, mode) => `${effortText(value, mode)} ${predictionModes[mode].unit}`;
const asNumber = text => text.trim() ? Number(text) : NaN;

function EvidenceDetails({ result, data, cohort, mode, inverse }) {
  const validation = result.validation;
  const matches = (result.matched || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  return <>
    <DetailFacts rows={[
      ["Confidence", result.confidence === "Insufficient" ? "Insufficient data" : result.confidence, result.reason],
      ["Prediction window", `${dateText(data.first)} – ${dateText(data.last)}`],
      ["Recording", cohort && `${cohort.source} · ${cohort.device} · ${cohort.environment}`, cohort?.conditions],
      ["Eligible days in window", cohort?.dates ?? 0],
      [inverse ? "Later ceiling checks at highest effort" : "Later sessions tested", validation?.tests ?? 0],
      [inverse ? "Later sessions above ceiling" : "Typical test error", inverse ? validation?.overshoots
        : validation?.tests > 0 ? `${decimal(validation.meanError)} bpm` : null],
      ["Recent HR median error", !inverse && validation?.tests > 0 ? `${decimal(validation.baselineError)} bpm` : null],
    ]} />
    <DetailTable caption={inverse ? "Matched days at highest effort" : "Matched days near target effort"}
      columns={["Date", "Effort", "Final 5 min · bpm", "Source"]}
      rows={matches.map(row => [dateText(row.date), withUnit(row.value, mode), decimal(row.hrBpm), row.source])}
      empty="Comparable days for this input will appear here." />
    {validation?.tests > 0 && <DetailTable caption="Tests on later dates"
      columns={["Date", "Effort", inverse ? "Earlier high · bpm" : "Earlier estimate · bpm", "Recorded · bpm"]}
      rows={validation.rows.slice().reverse().map(row => [dateText(row.date), withUnit(row.value, mode),
        decimal(inverse ? row.maxHr : row.estimatedHr), decimal(row.hrBpm)])} />}
    {data.context.length > 0 && <details className="prediction-session-context">
      <summary>Whole-session averages</summary>
      <DetailTable columns={["Date", "Effort", "Avg HR · bpm", "Duration", "Source"]}
        rows={data.context.slice().sort((a, b) => b.date.localeCompare(a.date)).map(row => [dateText(row.date), withUnit(row.value, mode), row.hrBpm,
          Number.isFinite(row.durationSeconds) ? duration(row.durationSeconds) : null, row.source])} />
    </details>}
  </>;
}

function EvidenceSummary({ result }) {
  const dates = (result.matched || []).map(row => row.date).sort();
  if (!dates.length) return null;
  const first = formatDate(dates[0]), last = formatDate(dates.at(-1));
  return <small className="prediction-dates">{dates.length} {dates.length === 1 ? "day" : "days"} · {first === last ? first : `${first} – ${last}`}</small>;
}

function PredictionEstimate({ name, mode, data, cohort, history, inverse = false, result, children }) {
  const profile = predictionModes[mode];
  const metric = paceMode(mode) ? "pace" : "power";
  const title = inverse ? `${metric === "pace" ? "Pace" : "Power"} at HR ceiling` : `HR at target ${metric}`;
  const value = inverse && result.effortRange
    ? [...new Set(result.effortRange.map(v => effortText(v, mode)))].join("–")
    : Number.isFinite(result.bpm) ? decimal(result.bpm, 0) : null;
  const observed = result.range && value != null ? [...new Set(result.range.map(v => decimal(v, 0)))].join("–") : "";
  return <DataCard className="prediction-estimate" data-axis={inverse ? "effort" : "hr"}
    title={`${name} · ${title}`} history={history} detailExpanded
    detail={<EvidenceDetails result={result} data={data} cohort={cohort} mode={mode} inverse={inverse} />}>
    <h3>{title}</h3>
    {children}
    <div className="prediction-output" aria-live="polite">
      {value != null ? <MetricValue as="strong" value={value} unit={inverse ? profile.unit : "bpm"} />
        : <strong className="prediction-unavailable">Unavailable</strong>}
      <span className="prediction-confidence" data-confidence={result.confidence}>
        {result.confidence === "Insufficient" ? "Insufficient evidence" : `${result.confidence} confidence`}
      </span>
      {observed && <small>{observed} bpm {inverse ? "at top effort" : "recorded"}</small>}
      <EvidenceSummary result={result} />
    </div>
    {value == null && <p className="prediction-reason">{result.reason}</p>}
  </DataCard>;
}

function SportPrediction({ report, name, modes }) {
  const [mode, setMode] = useState(modes[0]);
  const [selected, setSelected] = useState("");
  const [entry, setEntry] = useState(null);
  const plan = report.coaching?.pacing?.[name.toLowerCase()];
  const [capEntry, setCapEntry] = useState(() => Number.isFinite(plan?.hrCeiling) ? String(plan.hrCeiling) : "");
  const data = useMemo(() => predictionDataset(report, mode), [report, mode]);
  const cohort = data.groups.find(group => group.id === selected) || data.groups[0];
  const defaultEffort = suggestedEffort(report, mode, cohort);
  const text = entry ?? (paceMode(mode) ? paceClock(defaultEffort) : String(Math.round(defaultEffort * 10) / 10));
  const effort = paceMode(mode) ? parseScenarioPace(text) : asNumber(text);
  const ceiling = asNumber(capEntry);
  const hr = useMemo(() => predictHeartRate(cohort, mode, effort), [cohort, mode, effort]);
  const target = useMemo(() => predictEffortAtCeiling(cohort, mode, ceiling), [cohort, mode, ceiling]);
  const history = useMemo(() => {
    const effortMetric = [paceMode(mode) ? "Pace · sec/km" : "Power · W", row => row.value];
    if (cohort?.historyRows.length) return datedHistory("Recorded steady blocks", ["Effort", "Final 5 min HR · bpm", "Device", "Source"],
      cohort.historyRows, row => [withUnit(row.value, mode), decimal(row.hrBpm), row.device, row.source],
      { chart: [["Final 5 min HR · bpm", row => row.hrBpm], effortMetric] });
    return datedHistory("Whole-session averages for context", ["Effort", "Avg HR · bpm", "Source"],
      data.context, row => [withUnit(row.value, mode), decimal(row.hrBpm), row.source],
      { chart: [["Average HR · bpm", row => row.hrBpm], effortMetric] });
  }, [cohort, data.context, mode]);
  const profile = predictionModes[mode];

  return <section className="prediction-sport" data-sport={name} aria-label={`${name} predictions`}>
    <header className="prediction-sport-header">
      <div><h2>{name}</h2>
        <p>{cohort ? `${cohort.source} · ${cohort.environment} · ${cohort.dates} ${cohort.dates === 1 ? "day" : "days"}` : "No eligible recording context"}</p>
      </div>
      {modes.length > 1 && <div className="prediction-mode" role="group" aria-label="Running effort metric">
        {modes.map(key => <button type="button" key={key} aria-pressed={key === mode}
          onClick={() => { setMode(key); setSelected(""); setEntry(null); }}>{paceMode(key) ? "Pace" : "Watch power"}</button>)}
      </div>}
    </header>
    {data.groups.length > 1 && <label className="prediction-context">Recording context
      <select value={cohort.id} onChange={event => { setSelected(event.target.value); setEntry(null); }}>
        {data.groups.map(group => <option key={group.id} value={group.id}>
          {group.source} · {group.device} · {group.environment}{group.conditions && ` · ${group.conditions}`} · {group.dates}d
        </option>)}
      </select>
    </label>}
    <div className="prediction-calculators">
      <PredictionEstimate name={name} mode={mode} data={data} cohort={cohort} history={history} result={hr}>
        <label className="prediction-input">
          <span>{profile.label}</span>
          <span className="prediction-control">
            <input value={text} onChange={event => setEntry(event.target.value)}
              type={paceMode(mode) ? "text" : "number"} inputMode={paceMode(mode) ? "text" : "decimal"}
              min={paceMode(mode) ? undefined : 1} step={paceMode(mode) ? undefined : "any"} />
            <small>{paceMode(mode) ? "min/km" : "W"}</small>
          </span>
        </label>
      </PredictionEstimate>
      <PredictionEstimate name={name} mode={mode} data={data} cohort={cohort} history={history} result={target} inverse>
        <label className="prediction-input">
          <span>HR ceiling</span>
          <span className="prediction-control">
            <input type="number" inputMode="numeric" min={HR_CEILING_MIN} max={HR_CEILING_MAX} step="1"
              placeholder="bpm" value={capEntry} onChange={event => setCapEntry(event.target.value)} />
            <small>bpm</small>
          </span>
        </label>
      </PredictionEstimate>
    </div>
    <PredictionChart rows={cohort?.rows || []} pace={paceMode(mode)} effort={effort} ceiling={ceiling}
      target={target.effortRange} forwardMatches={hr.matched} ceilingMatches={target.matched} />
  </section>;
}

export default function PerformancePrediction({ report, advice }) {
  return <section className="prediction-page" aria-labelledby="prediction-title">
    <header className="prediction-heading">
      <h1 id="prediction-title">Performance predictions</h1>
      <p>Eight-minute steady blocks · {PREDICTION_DAYS}-day evidence window</p>
    </header>
    <WorkoutAdvice advice={advice} />
    <div className="prediction-grid">
      <SportPrediction report={report} name="Cycling" modes={["cycling"]} />
      <SportPrediction report={report} name="Running" modes={["running", "runningPower"]} />
    </div>
  </section>;
}
