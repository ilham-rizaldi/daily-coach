import { useState } from "react";
import { DataCard, DetailFacts, DetailTable } from "./CardDetails.jsx";
import { datedHistory } from "./cardHistory.js";
import { MetricValue } from "./Readout.jsx";
import { decimal, duration, formatDate } from "./report.js";
import { paceClock } from "./pacing.js";
import { parseScenarioPace, predictHeartRate, predictionDataset, predictionModes, suggestedEffort } from "./prediction.js";
import "./predictions.css";

const dateText = date => formatDate(date, { year: "numeric" });
const paceMode = key => key === "running";
const effortText = (value, key) => paceMode(key) ? paceClock(value) : decimal(value);
const observedEffort = (value, key) => `${effortText(value, key)} ${predictionModes[key].unit}`;

function EvidenceDetails({ result, dataset, cohort, mode }) {
  const validation = result.validation;
  const matches = result.matched || [];
  return <>
    <DetailFacts rows={[
      ["Confidence", result.confidence],
      ["Basis", result.reason],
      ["Window", `${dateText(dataset.first)} – ${dateText(dataset.last)}`],
      ["Recording", cohort && `${cohort.device} · ${cohort.environment} · ${cohort.source}`],
      ["Eligible blocks", cohort?.rows.length ?? 0],
      ["Eligible dates", cohort?.dates ?? 0],
      ["Later sessions checked", validation?.tests || "Awaiting more comparable sessions"],
      ["Average test error", validation?.tests >= 4 ? `${decimal(validation.meanError)} bpm` : null],
      ["Recent HR median error", validation?.tests >= 4 ? `${decimal(validation.baselineError)} bpm` : null],
    ]} />
    {matches.length > 0 && <DetailTable caption="Comparable blocks · one per date"
      columns={["Date", "Effort", "Final 5 min · bpm", "Source"]}
      rows={matches.map(row => [dateText(row.date), observedEffort(row.value, mode), decimal(row.hrBpm),
        row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noreferrer">{row.source}</a> : row.source])} />}
    <DetailTable caption="Whole-session averages for context" columns={["Date", "Effort", "Avg HR · bpm", "Duration", "Source"]}
      rows={dataset.context.map(row => [dateText(row.date), observedEffort(row.value, mode), row.hrBpm,
        Number.isFinite(row.durationSeconds) ? duration(row.durationSeconds) : null, row.source])}
      empty="No whole-session averages with this metric and HR in the selected report." />
  </>;
}

function PredictionCard({ report, name, modes }) {
  const [mode, setMode] = useState(modes[0]);
  const [selected, setSelected] = useState("");
  const [input, setInput] = useState(null);
  const profile = predictionModes[mode];
  const data = predictionDataset(report, mode);
  const cohort = data.groups.find(group => group.id === selected) || data.groups[0];
  const defaultEffort = suggestedEffort(report, mode, cohort);
  const defaultInput = paceMode(mode) ? paceClock(defaultEffort) : String(Math.round(defaultEffort * 10) / 10);
  const text = input ?? defaultInput;
  const effort = paceMode(mode) ? parseScenarioPace(text) : text.trim() ? Number(text) : NaN;
  const result = predictHeartRate(cohort, mode, effort);
  const enough = Number.isFinite(result.bpm);
  const matches = [...(result.matched || [])].sort((a, b) => a.date.localeCompare(b.date));
  const evidence = matches.length ? matches : cohort?.rows;
  const sourceDates = evidence?.length ? [...new Set(evidence.map(row => row.date))] : [];
  const sourcePeriod = sourceDates.length === 1 ? dateText(sourceDates[0]) :
    sourceDates.length > 1 ? `${dateText(sourceDates[0])} – ${dateText(sourceDates.at(-1))}` : null;
  const history = datedHistory("Eligible steady blocks · final 5 min HR", ["Effort", "HR · bpm", "Device", "Source"], cohort?.rows,
    row => [observedEffort(row.value, mode), decimal(row.hrBpm), row.device, row.source], { chart: [
      ["Final 5 min HR · bpm", row => row.hrBpm],
      [paceMode(mode) ? "Pace · sec/km" : "Power · W", row => row.value],
    ] });
  return <DataCard className="prediction-card" title={`${name} prediction`} history={history}
    data-sport={name} detail={<EvidenceDetails result={result} dataset={data} cohort={cohort} mode={mode} />}>
    <header><h2>{name}</h2>
      <span className="prediction-confidence" data-confidence={result.confidence}>
        {result.confidence === "Insufficient" ? "Insufficient data" : `${result.confidence} confidence`}
      </span>
    </header>
    {modes.length > 1 && <div className="prediction-mode card-history-controls" role="group" aria-label="Running effort metric">
      {modes.map(key => <button className="report-action" type="button" key={key} aria-pressed={key === mode}
        onClick={() => { setMode(key); setSelected(""); setInput(null); }}>{paceMode(key) ? "Pace" : "Watch power"}</button>)}
    </div>}
    {data.groups.length > 1 && <label className="prediction-input prediction-context">Recording context
      <select value={cohort.id} onChange={event => { setSelected(event.target.value); setInput(null); }}>
        {data.groups.map(group => <option key={group.id} value={group.id}>{group.source} · {group.device} · {group.environment} · {group.dates}d</option>)}
      </select>
    </label>}
    <label className="prediction-input">
      <span>{profile.label} <small>{paceMode(mode) ? "min:sec/km" : "W"}</small></span>
      <input value={text} onChange={event => setInput(event.target.value)}
        type={paceMode(mode) ? "text" : "number"} inputMode={paceMode(mode) ? "text" : "decimal"}
        min={paceMode(mode) ? undefined : 1} step={paceMode(mode) ? undefined : "any"} />
    </label>
    <div className="prediction-readout" aria-live="polite">
      <span>Estimated steady HR</span>
      {enough ? <MetricValue as="strong" value={decimal(result.bpm, 0)} unit="bpm" /> : <strong className="prediction-unavailable">Unavailable</strong>}
      {enough && <small>{result.range.map(value => decimal(value, 0)).join("–")} bpm observed · {matches.length} days</small>}
    </div>
    <p className="prediction-reason">{result.reason}</p>
    <p className="prediction-source">
      {sourcePeriod ? <>{cohort.source} · {sourcePeriod} · {sourceDates.length} {sourceDates.length === 1 ? "day" : "days"}</>
          : "No eligible steady blocks in this report"}
    </p>
  </DataCard>;
}

export default function PerformancePrediction({ report }) {
  return <section className="prediction-page" aria-labelledby="prediction-title">
    <div className="page-title"><h1 id="prediction-title">Performance predictions</h1></div>
    <p className="prediction-intro">Estimated heart rate for an eight-minute steady effort, using the latest 42 days in this report.</p>
    <div className="prediction-grid">
      <PredictionCard report={report} name="Cycling" modes={["cycling"]} />
      <PredictionCard report={report} name="Running" modes={["running", "runningPower"]} />
    </div>
  </section>;
}
