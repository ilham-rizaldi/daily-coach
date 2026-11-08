import { decimal } from "./report.js";
import { conditionOverview, conditionStamp } from "./condition.js";
import { BaselineMeter, LoadHistory, palette, ScoreMeter, SleepStages, statusColor } from "./MetricGraphics.jsx";
import { DurationValue, MetricValue } from "./Readout.jsx";

const num = value => Number.isFinite(value) ? decimal(value) : null;
const time = value => Number.isFinite(value) && value >= 0 ? <DurationValue seconds={value * 60} /> : null;
const nonNegative = value => Number.isFinite(value) && value >= 0;
const isBatteryRange = (low, high) => Number.isFinite(low) && Number.isFinite(high) && low >= 0 && low <= high && high <= 100;

function NotRecorded() {
  return <small style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>Not recorded</small>;
}

function Tile({ id, label, value, unit, color, status, children, detail, stamp, valueSize }) {
  return <div className="body-tile" data-metric={id} title={stamp}>
    <dt>{label}</dt>
    <dd>
      {value == null ? <NotRecorded /> : <MetricValue as="strong" value={value} unit={unit} style={{ color, fontSize: valueSize }} />}
      {children}
      {(status || detail) && <div className="body-tile-meta">
        {status && <span style={{ color }}>{status}</span>}
        {detail && <span>{detail}</span>}
      </div>}
    </dd>
  </div>;
}

function Stat({ label, value, unit, detail, color }) {
  return <div>
    <dt>{label}</dt>
    <dd>
      {value == null ? <NotRecorded /> : <MetricValue as="strong" value={value} unit={unit} style={{ color }} />}
      {detail && <span>{detail}</span>}
    </dd>
  </div>;
}

function AvailableSleepStages({ wellness }) {
  const stages = [
    ["Deep", wellness.deepSleepMinutes, palette.deep],
    ["Light", wellness.lightSleepMinutes, palette.light],
    ["REM", wellness.remSleepMinutes, palette.rem],
  ].filter(([, value]) => Number.isFinite(value) && value >= 0);
  if (stages.length === 3 && stages.some(([, value]) => value > 0)) return <SleepStages wellness={wellness} />;
  if (!stages.length) return null;
  return <div className="sleep-stage-key">
    {stages.map(([label, value, color]) => <span key={label}>
      <i style={{ background: color }} />{label} <b>{decimal(value, 0)}m</b>
    </span>)}
  </div>;
}

export function ConditionOverview({ report }) {
  const w = report.wellness || {}, intervals = report.intervals || {};
  const data = conditionOverview(report);
  const stamp = id => data.primary.find(item => item.id === id)?.stamp;
  const historyRows = report.wellnessHistory?.rows;
  const day = Array.isArray(historyRows) ? historyRows.find(row => row?.date === report.date) : undefined;
  const wellnessDate = w.date || w.provenance?.datedRecovery?.date || report.date;
  const reading = (id, value, field) => {
    if (nonNegative(value)) return { value, stamp: stamp(id), fromHistory: false };
    if (!nonNegative(day?.[field])) return { value: null, stamp: stamp(id), fromHistory: false };
    return { value: day[field], stamp: conditionStamp(day.date, day.provenance?.[field]?.capturedAt), fromHistory: true };
  };
  const measuredBattery = nonNegative(w.bodyBattery) && w.bodyBattery <= 100;
  const dailyRange = wellnessDate === report.date && isBatteryRange(w.bodyBatteryDailyLow, w.bodyBatteryDailyHigh);
  const historicalRange = isBatteryRange(day?.bodyBatteryLow, day?.bodyBatteryHigh);
  const batteryRange = dailyRange ? [w.bodyBatteryDailyLow, w.bodyBatteryDailyHigh]
    : historicalRange ? [day.bodyBatteryLow, day.bodyBatteryHigh] : null;
  const showBatteryRange = !measuredBattery && batteryRange !== null;
  const batteryDelta = showBatteryRange && wellnessDate !== report.date ? null : [
    Number.isFinite(w.bodyBatteryCharged) ? `↑${decimal(w.bodyBatteryCharged)}` : null,
    Number.isFinite(w.bodyBatteryDrained) ? `↓${decimal(w.bodyBatteryDrained)}` : null,
  ].filter(Boolean).join(" ");
  const batteryHighCapture = day?.provenance?.bodyBatteryHigh?.capturedAt;
  const batteryLowCapture = day?.provenance?.bodyBatteryLow?.capturedAt;
  const rangeCapture = batteryHighCapture === batteryLowCapture ? batteryHighCapture : undefined;
  const batteryStamp = showBatteryRange && !dailyRange ? conditionStamp(day.date, rangeCapture) : stamp("battery");
  const overnight = reading("hrv", w.rawHrvMs, "hrvMs");
  const rollingHrv = reading("hrv", w.hrv7dMs, "hrv7dMs");
  const hrv = overnight.value == null && rollingHrv.value != null ? rollingHrv : overnight;
  const sameHrvDate = overnight.fromHistory === rollingHrv.fromHistory || wellnessDate === report.date;
  const hrv7d = sameHrvDate || hrv === rollingHrv ? rollingHrv.value : null;
  const hrvLow = rollingHrv.fromHistory ? day.hrvLowMs : w.hrvBaselineLowMs ?? w.hrvBaselineMs?.[0];
  const hrvHigh = rollingHrv.fromHistory ? day.hrvHighMs : w.hrvBaselineHighMs ?? w.hrvBaselineMs?.[1];
  const hrvStatus = hrv.fromHistory && wellnessDate !== report.date ? null : w.hrvStatus;
  const showHrvMeter = Number.isFinite(hrvLow) && Number.isFinite(hrvHigh) && hrvHigh > hrvLow && Number.isFinite(hrv7d);
  const restingHr = reading("resting-hr", w.restingHr, "rhrBpm");
  const heartRateContext = restingHr.fromHistory && wellnessDate !== report.date ? {} : w;
  const overnightHeartRate = num(heartRateContext.averageOvernightHr);
  const sleep = reading("sleep", w.sleepMinutes, "sleepMinutes");
  const sleepContext = sleep.fromHistory && wellnessDate !== report.date ? {} : w;
  const extraReadings = [
    ["Peak 5-min HRV", num(w.highest5MinuteHrvMs), "ms"],
    ["Daily high HR", num(w.highHr), "bpm"],
    ["Body Battery range", !showBatteryRange && batteryRange ? batteryRange.map(decimalValue => decimal(decimalValue)).join("–") : null],
    ["Sleep recharge", Number.isFinite(w.bodyBatteryChange) ? `${w.bodyBatteryChange > 0 ? "+" : ""}${decimal(w.bodyBatteryChange)}` : null],
    ["Sleep stress", num(w.sleepStress)],
    ["Sleep need", time(w.sleepNeedMinutes)],
    ["Next sleep need", time(w.nextSleepNeedMinutes)],
    ["Nap", time(w.napMinutes)],
  ].filter(([, value]) => value != null);
  return <section className="condition-overview body-overview" aria-labelledby="condition-title">
    <div className="condition-heading"><h2 id="condition-title">Body metrics</h2><span className="metric-provider">Garmin{report.preview ? " · Demo" : ""}</span></div>
    <dl className="body-primary">
      <Tile id="readiness" label="Readiness" value={num(w.readiness)} unit="/100" color={statusColor(w.readinessStatus,"readiness")} status={w.readinessStatus} detail={w.readinessUpdatedAtLocal} stamp={stamp("readiness")}><ScoreMeter label="Readiness" value={w.readiness} readiness /></Tile>
      <Tile id="battery" label={showBatteryRange ? "Body Battery · range" : "Body Battery"}
        value={showBatteryRange ? batteryRange.map(value => decimal(value)).join("–") : measuredBattery ? num(w.bodyBattery) : null}
        valueSize={showBatteryRange ? "clamp(28px, 2.8vw, 38px)" : undefined}
        unit={measuredBattery ? "/100" : undefined} color={palette.blue} detail={batteryDelta} stamp={batteryStamp}>
        <ScoreMeter label="Body Battery" value={measuredBattery ? w.bodyBattery : null} />
      </Tile>
      <Tile id="hrv" label={hrv === rollingHrv ? "HRV · 7d" : "HRV · overnight"} value={num(hrv.value)} unit="ms"
        color={statusColor(hrvStatus)} status={hrvStatus} stamp={hrv.stamp}
        detail={hrv === overnight && Number.isFinite(hrv7d) && !showHrvMeter ? `7d ${decimal(hrv7d)} ms` : null}>
        <BaselineMeter low={hrvLow} high={hrvHigh} value={hrv7d} status={hrvStatus} />
      </Tile>
      <Tile id="resting-hr" label="RHR" value={num(restingHr.value)} unit="bpm" color={palette.red}
        detail={Number.isFinite(heartRateContext.restingHr7d) ? `7d ${heartRateContext.restingHr7d}` : null} stamp={restingHr.stamp}>
        <div className="rhr-context"><span>Overnight HR</span>{overnightHeartRate == null
          ? <NotRecorded /> : <MetricValue as="b" value={overnightHeartRate} unit="bpm" />}</div>
      </Tile>
      <Tile id="sleep" label="Sleep" value={time(sleep.value)} color={palette.light}
        status={Number.isFinite(sleepContext.sleepScore) ? `Score ${sleepContext.sleepScore}` : null}
        detail={sleepContext.bedTimeLocal && sleepContext.wakeTimeLocal ? `${sleepContext.bedTimeLocal}–${sleepContext.wakeTimeLocal}` : null} stamp={sleep.stamp}>
        <AvailableSleepStages wellness={sleepContext} />
      </Tile>
      <Tile id="recovery" label="Recovery" value={time(w.recoveryTimeMinutes)} color={statusColor(w.recoveryTimeStatus)} status={w.recoveryTimeStatus} detail={w.readinessUpdatedAtLocal ? `@ ${w.readinessUpdatedAtLocal}` : null} stamp={stamp("recovery")}><div className="recovery-tags">{w.recentStressStatus && <span>Stress <b>{w.recentStressStatus}</b></span>}{w.recentSleepScoresStatus && <span>Sleep <b>{w.recentSleepScoresStatus}</b></span>}</div></Tile>
    </dl>
    <div className="body-secondary">
      <section className="body-load-panel" aria-labelledby="body-garmin-load"><h3 id="body-garmin-load">Garmin load <span className="status-dot" style={{color:statusColor(w.garminLoadRatioStatus)}}>{w.garminLoadRatioStatus}</span></h3>
        <dl className="body-stat-row"><Stat label="Acute" value={num(w.garminAcuteLoad)} color={palette.blue} /><Stat label="Chronic" value={num(w.garminChronicLoad)} color={palette.orange} /><Stat label="Ratio" value={num(w.garminLoadRatio)} detail={w.provenance?.currentLoadContext?.ratio?.basis?.startsWith("Calculated") ? "Calculated" : null} color={statusColor(w.garminLoadRatioStatus)} /></dl><LoadHistory rows={report.garminLoadHistory?.rows} />
      </section>
      <section aria-labelledby="body-intervals"><h3 id="body-intervals">Intervals.icu</h3><dl className="body-stat-row"><Stat label="CTL" value={num(intervals.fitness)} color={palette.blue} /><Stat label="ATL" value={num(intervals.fatigue)} color={palette.purple} /><Stat label="Form" value={Number.isFinite(intervals.form) ? `${intervals.form>0?"+":""}${decimal(intervals.form)}` : null} color={palette.orange} /></dl></section>
      <section aria-labelledby="body-vitals"><h3 id="body-vitals">Vitals</h3><dl className="body-stat-row"><Stat label="SpO₂" value={num(w.averageSpo2)} unit="%" detail={Number.isFinite(w.lowestSpo2)?`Min ${w.lowestSpo2}%`:null} color={palette.blue} /><Stat label="RR" value={num(w.averageRespiration)} unit="br/min" detail={Number.isFinite(w.minimumRespiration)?`Min ${w.minimumRespiration}`:null} /><Stat label="Awake" value={num(w.awakeMinutes)} unit="min" detail={Number.isFinite(w.restlessMoments)?`${w.restlessMoments} restless`:null} /></dl></section>
      <section aria-labelledby="body-adaptation"><h3 id="body-adaptation">Adaptation · Garmin</h3><dl className="body-stat-row"><Stat label="VO₂ max" value={num(w.vo2Max)} detail={w.vo2MaxCategory} color={palette.blue} /><Stat label="Heat" value={num(w.heatAcclimationPercent)} unit="%" detail={w.heatAcclimationTrend} color={palette.orange} /></dl><ScoreMeter label="Heat acclimation" value={w.heatAcclimationPercent} color={palette.orange} /><div className="adaptation-status">{w.trainingStatus && <span style={{color:statusColor(w.trainingStatus)}}>{w.trainingStatus}</span>}{w.loadFocus && <span>{w.loadFocus}</span>}</div></section>
    </div>
    {extraReadings.length > 0 && <details className="check-in-panel body-more">
      <summary>More body metrics</summary>
      <dl className="body-stat-row">{extraReadings.map(([label, value, unit]) => <Stat key={label} label={label} value={value} unit={unit} />)}</dl>
    </details>}
  </section>;
}
