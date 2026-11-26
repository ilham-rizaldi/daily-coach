import { useContext } from "react";
import { DataCard, DetailFacts, HistoryContext } from "./CardDetails.jsx";
import { CardHistoryChart } from "./CardHistoryChart.jsx";
import { filterCardHistory, resolveCardHistory } from "./cardHistory.js";
import { palette, statusColor, trainingTrendColor } from "./MetricGraphics.jsx";
import { MetricValue } from "./Readout.jsx";
import { decimal, formatDate, shiftDate } from "./report.js";

function TrainingFactor({ report, reports, source, factor: [metric, label, value, unit, status, color] }) {
  const history = { ...resolveCardHistory(report, reports, { kind: "training-status", metric }), color,
    overlay: { unit: metric === "vo2" ? "mL/kg/min" : unit,
      rangeLabel: metric === "hrv7d" ? "Baseline" : "Optimal range", approximate: metric === "acute" } };
  const recent = filterCardHistory(history.rows, report.date, 28);
  const rows = recent.length ? recent : filterCardHistory(history.rows, report.date, null);
  const first = recent.length ? shiftDate(report.date, -27) : rows.at(-1)?.date;
  return <DataCard as="div" definition className="training-status-factor" title={label} history={history}
    detail={<DetailFacts rows={[["Source", source]]} />}>
    <dt>{label}</dt>
    <dd>
      <MetricValue as="strong" value={Number.isFinite(value) ? decimal(value) : "—"} unit={Number.isFinite(value) ? unit : null} style={{ color }} />
      {status && <small className="training-factor-status" style={{ color: statusColor(status) }}>{status}</small>}
      {rows.length ? <CardHistoryChart history={history} rows={rows} first={first} last={report.date} mini />
        : <p className="training-factor-empty">No dated readings</p>}
    </dd>
  </DataCard>;
}

export function TrainingStatus({ report }) {
  const { reports } = useContext(HistoryContext) || {};
  const w = report.wellness || {};
  const fitness = w.provenance?.datedRecovery?.fitness;
  const date = fitness?.metricDate || fitness?.date || w.date;
  const source = report.preview ? "Illustrative Garmin data" : "Garmin Connect";
  const values = [
    ["vo2", "VO₂ max", w.vo2Max, "", w.vo2MaxCategory, palette.blue],
    ["hrv7d", "HRV · 7-day", w.hrv7dMs, "ms", w.hrvStatus, statusColor(w.hrvStatus)],
    ["acute", "Acute load", w.garminAcuteLoad, "", w.garminAcuteLoadStatus, palette.blue],
    ["heat", "Heat acclimation", w.heatAcclimationPercent, "%", w.heatAcclimationTrend, palette.orange],
  ];
  const summary = w.trainingStatus
    ? `${w.trainingStatus}${w.trainingStatusSince ? ` since ${formatDate(w.trainingStatusSince)}` : ""}` : null;
  const statusHistory = resolveCardHistory(report, reports, "training-status");
  const statuses = new Map(filterCardHistory(statusHistory.rows, report.date, 28).map(row => [row.date, row.values[0]]));
  return <DataCard as="section" className="training-status-panel" title="Training Status" history="training-status" aria-labelledby="training-status-title"
    detail={<DetailFacts rows={[
      ["Garmin classification", summary, w.trainingStatusBasis], ["Load Focus", w.loadFocus],
      ...values.filter(([, , value]) => Number.isFinite(value))
        .map(([, label, value, unit, status]) => [label, <MetricValue value={decimal(value)} unit={unit} />, status]),
      ["Source", source], ["Reading", date ? formatDate(date, { year: "numeric" }) : null, fitness?.observedAt],
      ["Training Status guide", <a href="https://www.garmin.com/en-US/garmin-technology/running-science/physiological-measurements/training-status/" target="_blank" rel="noreferrer">Garmin</a>],
    ]} />}>
    <header>
      <h2 id="training-status-title">Training Status</h2>
    </header>
    {summary ? <>
      <div className="training-status-summary">
        <strong className="status-dot" style={{ color: trainingTrendColor(w.trainingStatus) }}>{w.trainingStatus}</strong>
        {w.trainingStatusSince && <span>Since {formatDate(w.trainingStatusSince)}</span>}
        {w.loadFocus && <span>Load Focus · {w.loadFocus}</span>}
      </div>
      {statuses.size > 1 && <div className="training-status-timeline" role="img" aria-label="Training Status over the past four weeks. Blank segments have no verified status.">
        {Array.from({ length: 28 }, (_, index) => {
          const day = shiftDate(report.date, index - 27);
          const status = statuses.get(day);
          return <span key={day} title={`${formatDate(day)} · ${status || "No reading"}`} style={{ background: status ? trainingTrendColor(status) : undefined }} />;
        })}
      </div>}
    </> : <p>Training Status was unavailable in this report.</p>}
    <dl className="body-stat-row training-status-factors">
      {values.map(factor => <TrainingFactor key={factor[0]} report={report} reports={reports} source={source} factor={factor} />)}
    </dl>
  </DataCard>;
}
