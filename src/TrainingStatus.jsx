import { DataCard, DetailFacts } from "./CardDetails.jsx";
import { EvidenceMeta } from "./EvidenceMeta.jsx";
import { palette, statusColor } from "./MetricGraphics.jsx";
import { MetricValue } from "./Readout.jsx";
import { decimal, formatDate } from "./report.js";

export function TrainingStatus({ report }) {
  const w = report.wellness || {};
  const fitness = w.provenance?.datedRecovery?.fitness;
  const date = fitness?.metricDate || fitness?.date || w.date;
  const source = report.preview ? "Illustrative Garmin data" : "Garmin Connect";
  const values = [
    ["VO₂ max", w.vo2Max, "", w.vo2MaxCategory, palette.blue],
    ["HRV · 7-day", w.hrv7dMs, "ms", w.hrvStatus, statusColor(w.hrvStatus)],
    ["Acute load", w.garminAcuteLoad, "", w.garminAcuteLoadStatus, palette.blue],
    ["Heat acclimation", w.heatAcclimationPercent, "%", w.heatAcclimationTrend, palette.orange],
  ].filter(([, value]) => Number.isFinite(value));
  const summary = w.trainingStatus
    ? `${w.trainingStatus}${w.trainingStatusSince ? ` since ${formatDate(w.trainingStatusSince)}` : ""}` : null;
  return <DataCard as="section" className="training-status-panel" title="Training Status" history="training-status" aria-labelledby="training-status-title"
    detail={<DetailFacts rows={[
      ["Garmin classification", summary, w.trainingStatusBasis], ["Load Focus", w.loadFocus],
      ...values.map(([label, value, unit, status]) => [label, <MetricValue value={decimal(value)} unit={unit} />, status]),
      ["Source", source],
    ]} />}>
    <header>
      <h2 id="training-status-title">Training Status</h2>
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
    {values.length > 0 && <dl className="body-stat-row training-status-factors">
      {values.map(([label, value, unit, status, color]) => <div key={label}>
        <dt>{label}</dt>
        <dd>
          <MetricValue as="strong" value={decimal(value)} unit={unit} style={{ color }} />
          {status && <small className="training-factor-status" style={{ color: statusColor(status) }}>{status}</small>}
        </dd>
      </div>)}
    </dl>}
  </DataCard>;
}
