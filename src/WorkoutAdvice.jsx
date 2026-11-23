import { DataCard, DetailFacts } from "./CardDetails.jsx";
import { DurationValue, MetricValue } from "./Readout.jsx";
import { conditionStamp } from "./condition.js";
import { duration, formatDate } from "./report.js";
import { BaselineMeter, ScoreMeter, ScoreRing, palette, statusColor } from "./MetricGraphics.jsx";
import "./workout-advice.css";

function RecoverySnapshots({ rows = [] }) {
  const captured = rows.filter(row => Number.isFinite(row.minutes));
  if (!captured.length) return null;
  const high = Math.max(1, ...captured.map(row => row.minutes));
  return <div className="workout-recovery-plot">
    <div className="workout-recovery-bars" role="img" aria-label={`Remaining recovery over seven days. ${captured.map(row =>
      `${formatDate(row.date)}: ${duration(row.minutes * 60)}`).join(", ")}`}>
      {rows.map(row => <span key={row.date} aria-hidden="true"
        title={Number.isFinite(row.minutes) ? `${formatDate(row.date)} · ${duration(row.minutes * 60)}` : `${formatDate(row.date)} · no reading`}>
        {Number.isFinite(row.minutes) && <i style={{ "--recovery-height": `${row.minutes / high * 100}%` }} />}
      </span>)}
    </div>
    <div className="workout-signal-meta"><span>{formatDate(rows[0].date)}</span><span>{formatDate(rows.at(-1).date)}</span></div>
  </div>;
}

export function WorkoutAdvice({ advice }) {
  const { title, reason, state, source, date, observedAt, observationWindow, readiness, readinessStatus, readinessUpdatedAtLocal,
    recoveryMinutes, recoveryStatus, recoveryHistory, hrv, hrv7d, hrvLow, hrvHigh, sleep, sleepStatus } = advice;
  const stamp = observedAt || observationWindow ? conditionStamp(date, observedAt, observationWindow) : null;
  const readinessColor = statusColor(readinessStatus, "readiness");
  const hasHrv = hrv || Number.isFinite(hrv7d);
  const hasBaseline = [hrvLow, hrvHigh, hrv7d].every(Number.isFinite) && hrvHigh > hrvLow;
  const hasSignals = [readiness, recoveryMinutes, sleep].some(Number.isFinite) || hasHrv;
  return <DataCard className="workout-advice" data-workout-state={state} title="Recovery and workout suggestion" history="readiness"
    detail={<DetailFacts rows={[
      ["Suggestion", title, reason], ["Source", source, stamp],
      ["Readiness", Number.isFinite(readiness) ? `${readiness}/100` : null, readinessStatus],
      ["Remaining recovery", Number.isFinite(recoveryMinutes) ? duration(60 * recoveryMinutes) : null, recoveryStatus],
      ["HRV status", hrv], ["Sleep score", sleep],
    ]} />}>
    <div className="workout-advice-main">
      <span>Workout suggestion</span>
      <h2>{title}</h2>
      <p>{reason}</p>
    </div>
    {(stamp || hasSignals) && <div className="workout-advice-evidence">
      {hasSignals && <dl>
        {Number.isFinite(readiness) && <div className="workout-signal" style={{ "--signal-color": readinessColor }}>
          <dt>Readiness</dt><dd>
            <MetricValue value={readiness} unit="/100" />
            <ScoreMeter value={readiness} color={readinessColor} label="Workout readiness" />
            <div className="workout-signal-meta"><span>{readinessStatus}</span><span>{readinessUpdatedAtLocal}</span></div>
          </dd>
        </div>}
        {Number.isFinite(recoveryMinutes) && <div className="workout-signal" style={{ "--signal-color": palette.blue }}>
          <dt>Recovery time</dt><dd>
            <DurationValue seconds={60 * recoveryMinutes} />
            <RecoverySnapshots rows={recoveryHistory} />
          </dd>
        </div>}
        {hasHrv && <div className="workout-signal" style={{ "--signal-color": statusColor(hrv) }}>
          <dt>HRV · 7-day</dt><dd>
            {Number.isFinite(hrv7d) ? <MetricValue value={hrv7d} unit="ms" /> : hrv}
            {hasBaseline && <BaselineMeter low={hrvLow} high={hrvHigh} value={hrv7d} status={hrv} />}
            {hrv && Number.isFinite(hrv7d) && <div className="workout-signal-meta"><span>{hrv}</span></div>}
          </dd>
        </div>}
        {Number.isFinite(sleep) && <div className="workout-signal" style={{ "--signal-color": statusColor(sleepStatus) }}>
          <dt>Sleep score</dt><dd className="workout-sleep-readout">
            <ScoreRing label="Sleep score" caption="/100" value={sleep} color={statusColor(sleepStatus)} />
            {sleepStatus && <span>{sleepStatus}</span>}
          </dd>
        </div>}
      </dl>}
      {stamp && <small>{source} · {stamp}</small>}
    </div>}
  </DataCard>;
}
