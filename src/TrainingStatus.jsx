import { DataCard, DetailFacts } from "./CardDetails.jsx";
import { EvidenceMeta } from "./EvidenceMeta.jsx";
import { statusColor } from "./MetricGraphics.jsx";
import { decimal, formatDate } from "./report.js";

export function TrainingStatus({ report }) {
  const w = report.wellness || {};
  const fitness = w.provenance?.datedRecovery?.fitness;
  const date = fitness?.metricDate || fitness?.date || w.date;
  const source = report.preview ? "Illustrative Garmin data" : "Garmin Connect";
  const values = [
    ["VO₂ max", Number.isFinite(w.vo2Max) ? decimal(w.vo2Max) : null, w.vo2MaxCategory],
    ["HRV · 7-day", Number.isFinite(w.hrv7dMs) ? `${decimal(w.hrv7dMs)} ms` : null, w.hrvStatus],
    ["Acute load", Number.isFinite(w.garminAcuteLoad) ? decimal(w.garminAcuteLoad) : null, w.garminAcuteLoadStatus],
    ["Heat acclimation", Number.isFinite(w.heatAcclimationPercent) ? `${decimal(w.heatAcclimationPercent)}%` : null, w.heatAcclimationTrend],
  ];
  const summary = w.trainingStatus
    ? `${w.trainingStatus}${w.trainingStatusSince ? ` since ${formatDate(w.trainingStatusSince)}` : ""}` : null;
  return <DataCard as="section" className="training-status-panel" title="Training Status" history="training-status"
    detail={<DetailFacts rows={[
      ["Garmin classification", summary, w.trainingStatusBasis], ["Load Focus", w.loadFocus],
      ...values, ["Source", source],
    ]} />}>
    <header>
      <h2>Training Status</h2>
      <EvidenceMeta source={source} date={date} dateLabel="Reading" observedAt={fitness?.observedAt} />
    </header>
    {summary ? <>
      <div className="training-status-summary">
        <strong className="status-dot" style={{ color: statusColor(w.trainingStatus) }}>{w.trainingStatus}</strong>
        {w.trainingStatusSince && <span>Since {formatDate(w.trainingStatusSince)}</span>}
        {w.loadFocus && <span>Load Focus · {w.loadFocus}</span>}
      </div>
      {w.trainingStatusBasis && <p className="training-status-basis">{w.trainingStatusBasis}</p>}
    </> : <p>Training Status was unavailable in this report.</p>}
    <dl className="training-status-factors">{values.filter(([, value]) => value != null).map(([label, value, status]) =>
      <div key={label}><dt>{label}</dt><dd>{value}{status && <small style={{ color: statusColor(status) }}>{status}</small>}</dd></div>)}</dl>
  </DataCard>;
}
