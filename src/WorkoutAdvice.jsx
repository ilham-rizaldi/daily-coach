import { DataCard, DetailFacts } from "./CardDetails.jsx";
import { DurationValue, MetricValue } from "./Readout.jsx";
import { conditionStamp } from "./condition.js";
import { decimal, duration, formatDate } from "./report.js";
import { BaselineMeter, ReadinessGauge, ScoreRing, palette, readinessColor, statusColor } from "./MetricGraphics.jsx";
import { paceClock } from "./pacing.js";
import { EvidenceMeta } from "./EvidenceMeta.jsx";
import "./workout-advice.css";

// Garmin's recovery timer ranges from zero to four days.
const maxRecoveryMinutes = 4 * 24 * 60;

function RecoverySnapshots({ rows = [] }) {
  const captured = rows.filter(row => Number.isFinite(row.minutes));
  if (!captured.length) return null;
  return <div className="workout-recovery-plot">
    <div className="workout-recovery-bars" role="img" aria-label={`Remaining recovery over seven days. The bar fills as time runs down and is full at zero. ${captured.map(row =>
      `${formatDate(row.date)}: ${duration(row.minutes * 60)}`).join(", ")}`}>
      {rows.map(row => <span key={row.date} aria-hidden="true"
        title={Number.isFinite(row.minutes) ? `${formatDate(row.date)} · ${duration(row.minutes * 60)}` : `${formatDate(row.date)} · no reading`}>
        {Number.isFinite(row.minutes) && <i data-cleared={row.minutes === 0}
          style={{ "--recovery-height": `${Math.max(0, 1 - row.minutes / maxRecoveryMinutes) * 100}%` }} />}
      </span>)}
    </div>
    <div className="workout-signal-meta"><span>{formatDate(rows[0].date)}</span><span>{formatDate(rows.at(-1).date)}</span></div>
  </div>;
}

function TomorrowOption({ label, option, unit, format = decimal }) {
  if (!option) return null;
  return <div className="tomorrow-option">
    <span>{label} · {option.minutes} min</span>
    <strong>{option.target.map(value => format(value)).join("–")} <small>{unit}</small></strong>
    <span>HR ceiling <b>{option.hrCeiling} bpm</b></span>
  </div>;
}

function TomorrowWorkout({ plan, projection }) {
  if (!plan) return null;
  return <section className="workout-tomorrow" aria-label={`Plan for ${formatDate(plan.date)}`}>
    <h3>Tomorrow · {formatDate(plan.date)}</h3>
    <p>{plan.condition}</p>
    <div className="tomorrow-options">
      <TomorrowOption label="Easy cycling" option={plan.cycling} unit="W" />
      <TomorrowOption label="Run–walk alternative" option={plan.running} unit="/km" format={paceClock} />
    </div>
    <p>{plan.adjustment}</p>
    {projection?.available && <p className="tomorrow-ratio">
      Garmin ratio if resting <b>≈{decimal(projection.estimate.ratio, 2)}</b>
      <span> · {decimal(projection.range.ratio.low, 2)}–{decimal(projection.range.ratio.high, 2)} across {projection.n} past rest-day scenarios.</span>
    </p>}
  </section>;
}

export function WorkoutAdvice({ advice }) {
  const { title, reason, state, source, date, observedAt, observationWindow, readiness, readinessStatus, readinessUpdatedAtLocal,
    recoveryMinutes, recoveryStatus, recoveryHistory, hrv, hrv7d, hrvLow, hrvHigh, sleep, sleepStatus,
    trainingStatus, acuteHigh, performance, tomorrow, restProjection } = advice;
  const stamp = observedAt || observationWindow ? conditionStamp(date, observedAt, observationWindow) : null;
  const hasHrv = hrv || Number.isFinite(hrv7d);
  const hasBaseline = [hrvLow, hrvHigh, hrv7d].every(Number.isFinite) && hrvHigh > hrvLow;
  const hasSignals = [readiness, recoveryMinutes, sleep].some(Number.isFinite) || hasHrv;
  return <DataCard className="workout-advice" data-workout-state={state} title="Recovery and workout suggestion" history="readiness"
    detail={<DetailFacts rows={[
      ["Suggestion", title, reason], ["Source", source, stamp],
      ["Readiness", Number.isFinite(readiness) ? `${readiness}/100` : null, readinessStatus],
      ["Remaining recovery", Number.isFinite(recoveryMinutes) ? duration(60 * recoveryMinutes) : null, recoveryStatus],
      ["HRV status", hrv], ["Sleep score", sleep],
      ["Cycling target evidence", tomorrow?.cycling?.evidence],
      ["Run–walk target evidence", tomorrow?.running?.evidence],
      ["Rest ratio estimate", restProjection?.available ? `${restProjection.n} historical rest-day transitions` : null,
        restProjection?.extrapolation ? "Current load is outside the sampled starting range." : null],
    ]} />}>
    <div className="workout-advice-main">
      <span>Workout suggestion</span>
      <h2>{title}</h2>
      <p>{reason}</p>
      {performance && <p className="workout-performance">
        <b>Longest ride today</b> · {duration(performance.seconds)} · {performance.watts} W · {performance.hr} bpm
      </p>}
      {trainingStatus && <p className="workout-performance">Garmin rates your training trend <b>{trainingStatus}</b>.
        {acuteHigh && " Recent load is above its usual range."}</p>}
    </div>
    {(stamp || hasSignals) && <div className="workout-advice-evidence">
      {hasSignals && <dl>
        {Number.isFinite(readiness) && <div className="workout-signal" style={{ "--signal-color": readinessColor(readiness) }}>
          <dt>Readiness</dt><dd>
            <MetricValue value={readiness} unit="/100" />
            <ReadinessGauge value={readiness} label="Workout readiness" />
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
      {stamp && <EvidenceMeta className="evidence-footer" source={source} date={date} dateLabel="Reading" observedAt={observedAt}
        observationWindow={observationWindow} />}
    </div>}
    <TomorrowWorkout plan={tomorrow} projection={restProjection} />
  </DataCard>;
}
