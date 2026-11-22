import { DataCard, DetailFacts } from "./CardDetails.jsx";
import { DurationValue, MetricValue } from "./Readout.jsx";
import { conditionStamp } from "./condition.js";
import { duration } from "./report.js";
import "./workout-advice.css";

export function WorkoutAdvice({ advice }) {
  const { title, reason, state, source, date, observedAt, observationWindow, readiness, readinessStatus, recoveryMinutes, hrv, sleep } = advice;
  const stamp = observedAt || observationWindow ? conditionStamp(date, observedAt, observationWindow) : null;
  return <DataCard className="workout-advice" data-workout-state={state} title="Recovery and workout suggestion" history="readiness"
    detail={<DetailFacts rows={[
      ["Suggestion", title, reason], ["Source", source, stamp],
      ["Readiness", Number.isFinite(readiness) ? `${readiness}/100` : null, readinessStatus],
      ["Remaining recovery", Number.isFinite(recoveryMinutes) ? duration(60 * recoveryMinutes) : null],
      ["HRV status", hrv], ["Sleep score", sleep],
    ]} />}>
    <div className="workout-advice-main">
      <span>Workout suggestion</span>
      <h2>{title}</h2>
      <p>{reason}</p>
    </div>
    {(stamp || Number.isFinite(readiness)) && <div className="workout-advice-evidence">
      <dl>
        {Number.isFinite(readiness) && <div><dt>Readiness</dt><dd><MetricValue value={readiness} unit="/100" /></dd></div>}
        {Number.isFinite(recoveryMinutes) && <div><dt>Recovery</dt><dd><DurationValue seconds={60 * recoveryMinutes} /></dd></div>}
        {hrv && <div><dt>HRV</dt><dd>{hrv}</dd></div>}
      </dl>
      {stamp && <small>{source} · {stamp}</small>}
    </div>}
  </DataCard>;
}
