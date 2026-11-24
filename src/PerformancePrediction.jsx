import { useMemo, useState } from "react";
import { DataCard, DetailFacts, DetailTable } from "./CardDetails.jsx";
import { datedHistory } from "./cardHistory.js";
import { PredictionChart } from "./PredictionChart.jsx";
import { MetricValue } from "./Readout.jsx";
import { WorkoutAdvice } from "./WorkoutAdvice.jsx";
import { decimal, duration, formatDate } from "./report.js";
import { paceClock } from "./pacing.js";
import { EvidenceMeta } from "./EvidenceMeta.jsx";
import { HR_CEILING_MIN, HR_CEILING_MAX, EXTENDED_PREDICTION_DAYS, parseScenarioPace, automaticCeiling,
  automaticHeartRate, automaticPredictionDataset, predictionModes, suggestedEffort } from "./prediction.js";
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
      ["Method", result.method, result.reason],
      ["Evidence search window", `${dateText(data.first)} – ${dateText(data.last)}`],
      ["Matched profile", cohort && `${cohort.device} · ${cohort.environment}`, cohort?.conditions],
      ["Eligible days in window", cohort?.dates ?? 0],
      [inverse ? "Later ceiling checks at highest effort" : "Later sessions tested", validation?.tests ?? 0],
      [inverse ? "Later sessions above ceiling" : "Typical test error", inverse ? validation?.overshoots
        : validation?.tests > 0 ? `${decimal(validation.meanError)} bpm` : null],
      ["Recent HR median error", !inverse && validation?.tests > 0 ? `${decimal(validation.baselineError)} bpm` : null],
    ]} />
    <DetailTable caption={inverse ? "Evidence for the HR ceiling" : "Matched days near target effort"}
      columns={["Date", "Effort", inverse ? "Peak HR · bpm" : "HR · bpm", "Evidence", "Source"]}
      rows={matches.map(row => [dateText(row.date), withUnit(row.value, mode), decimal(inverse ? row.peakHrBpm : row.hrBpm),
        row.pairedFraction == null ? "Session average" : `${duration(row.durationSeconds)} block`, row.source])}
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

function PredictionEstimate({ name, mode, data, cohort, history, inverse = false, result, children }) {
  const profile = predictionModes[mode];
  const metric = paceMode(mode) ? "pace" : "power";
  const title = inverse ? `${metric === "pace" ? "Pace" : "Power"} at HR ceiling` : `HR at target ${metric}`;
  const reference = result.kind === "reference";
  const efforts = inverse ? result.effortRange ?? (reference && Number.isFinite(result.value) ? [result.value] : null) : null;
  const value = efforts ? [...new Set(efforts.map(v => effortText(v, mode)))].join("–")
    : !inverse && Number.isFinite(result.bpm) ? decimal(result.bpm, 0) : null;
  const observed = result.range && value != null ? [...new Set(result.range.map(v => decimal(v, 0)))].join("–") : "";
  const matches = result.matched ?? [];
  const dates = [...new Set(matches.map(row => row.date))].sort();
  const sources = [...new Set(matches.map(row => row.source).filter(Boolean))];
  return <DataCard className="prediction-estimate" data-axis={inverse ? "effort" : "hr"}
    title={`${name} · ${title}`} history={history} detailExpanded
    detail={<EvidenceDetails result={result} data={data} cohort={cohort} mode={mode} inverse={inverse} />}>
    <h3>{title}</h3>
    {children}
    <div className="prediction-output" aria-live="polite">
      {value != null && <small className="prediction-reading-type">{reference ? "Recorded reference" : "Estimate"}</small>}
      {value != null ? <MetricValue as="strong" value={value} unit={inverse ? profile.unit : "bpm"} />
        : <strong className="prediction-unavailable">No estimate</strong>}
      {observed && <small>{observed} bpm {inverse ? "peak HR" : "recorded"}</small>}
      <EvidenceMeta className="evidence-inset" source={sources.join(" + ")} from={dates[0]} date={dates.at(-1)}
        dateLabel={dates.length ? `${dates.length} comparable ${dates.length === 1 ? "day" : "days"}` : null} />
    </div>
    {result.reason && <p className="prediction-reason">{result.reason}</p>}
  </DataCard>;
}

function SportPrediction({ report, name, modes }) {
  const [mode, setMode] = useState(modes[0]);
  const [entry, setEntry] = useState(null);
  const plan = report.coaching?.pacing?.[name.toLowerCase()];
  const [capEntry, setCapEntry] = useState(() => Number.isFinite(plan?.hrCeiling) ? String(plan.hrCeiling) : "");
  const data = useMemo(() => automaticPredictionDataset(report, mode), [report, mode]);
  const cohort = data.cohort;
  const defaultEffort = suggestedEffort(report, mode, cohort && { rows: cohort.recent });
  const text = entry ?? (paceMode(mode) ? paceClock(defaultEffort) : String(Math.round(defaultEffort * 10) / 10));
  const effort = paceMode(mode) ? parseScenarioPace(text) : asNumber(text);
  const ceiling = asNumber(capEntry);
  const hr = useMemo(() => automaticHeartRate(data, mode, effort), [data, mode, effort]);
  const target = useMemo(() => automaticCeiling(data, mode, ceiling), [data, mode, ceiling]);
  const history = useMemo(() => {
    const effortMetric = [paceMode(mode) ? "Pace · sec/km" : "Power · W", row => row.value];
    if (cohort?.historyRows.length) return datedHistory("Recorded steady blocks", ["Effort", "HR · bpm", "Peak HR · bpm", "Block", "Source"],
      cohort.historyRows, row => [withUnit(row.value, mode), decimal(row.hrBpm), row.peakHrBpm, duration(row.durationSeconds), row.source],
      { chart: [["End-block HR · bpm", row => row.hrBpm], ["Peak HR · bpm", row => row.peakHrBpm], effortMetric] });
    return datedHistory("Whole-session averages for context", ["Effort", "Avg HR · bpm", "Source"],
      data.context, row => [withUnit(row.value, mode), decimal(row.hrBpm), row.source],
      { chart: [["Average HR · bpm", row => row.hrBpm], effortMetric] });
  }, [cohort, data.context, mode]);
  const profile = predictionModes[mode];

  return <section className="prediction-sport" data-sport={name} aria-label={`${name} predictions`}>
    <header className="prediction-sport-header">
      <div><h2>{name}</h2>
        <p>{cohort ? `${cohort.dates} ${cohort.dates === 1 ? "day" : "days"} of paired effort and HR` : "No paired steady efforts"}</p>
      </div>
      {modes.length > 1 && <div className="prediction-mode" role="group" aria-label="Running effort metric">
        {modes.map(key => <button type="button" key={key} aria-pressed={key === mode}
          onClick={() => { setMode(key); setEntry(null); }}>{paceMode(key) ? "Pace" : "Watch power"}</button>)}
      </div>}
    </header>
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
    <PredictionChart rows={cohort?.historyRows || []} pace={paceMode(mode)} effort={effort} ceiling={ceiling}
      target={target.effortRange} forwardMatches={hr.matched} ceilingMatches={target.matched} />
  </section>;
}

export default function PerformancePrediction({ report, advice }) {
  return <section className="prediction-page" aria-labelledby="view-title">
    <header className="prediction-heading">
      <p>Measured steady efforts · up to {EXTENDED_PREDICTION_DAYS} days</p>
    </header>
    <WorkoutAdvice advice={advice} />
    <div className="prediction-grid">
      <SportPrediction report={report} name="Cycling" modes={["cycling"]} />
      <SportPrediction report={report} name="Running" modes={["running", "runningPower"]} />
    </div>
  </section>;
}
