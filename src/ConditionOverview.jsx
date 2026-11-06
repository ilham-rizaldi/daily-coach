import { decimal, duration } from "./report.js";
import { conditionOverview } from "./condition.js";
import { BaselineMeter, LoadHistory, palette, ScoreMeter, SleepStages, statusColor } from "./MetricGraphics.jsx";
import { DurationValue } from "./Readout.jsx";

const num = value => Number.isFinite(value) ? decimal(value) : "—";
const time = value => <DurationValue seconds={Number.isFinite(value) ? value * 60 : NaN} />;

function Tile({ id, label, value, unit, color, status, children, detail, stamp }) {
  return <div className="body-tile" data-metric={id} title={stamp}>
    <dt>{label}</dt><dd><strong className="metric-value" style={{color}}><span className="metric-number">{value}</span>{unit && <small className={unit === "%" || unit === "/100" ? "metric-unit metric-unit-tight" : "metric-unit"}>{unit}</small>}</strong>
    {children}<div className="body-tile-meta"><span style={{color}}>{status}</span>{detail && <span>{detail}</span>}</div></dd>
  </div>;
}

function Stat({ label, value, unit, detail, color }) {
  return <div><dt>{label}</dt><dd style={{color}}><strong className="metric-value"><span className="metric-number">{value}</span>{unit && <small className={unit === "%" || unit === "/100" ? "metric-unit metric-unit-tight" : "metric-unit"}>{unit}</small>}</strong>{detail && <span>{detail}</span>}</dd></div>;
}

export function ConditionOverview({ report }) {
  const w = report.wellness || {}, intervals = report.intervals || {};
  const data = conditionOverview(report);
  const stamp = id => data.primary.find(item=>item.id===id)?.stamp;
  const hrvLow = w.hrvBaselineLowMs ?? w.hrvBaselineMs?.[0], hrvHigh = w.hrvBaselineHighMs ?? w.hrvBaselineMs?.[1];
  return <section className="condition-overview body-overview" aria-labelledby="condition-title">
    <div className="condition-heading"><h2 id="condition-title">Body metrics</h2><span className="metric-provider">Garmin{report.preview ? " · Demo" : ""}</span></div>
    <dl className="body-primary">
      <Tile id="readiness" label="Readiness" value={num(w.readiness)} unit="/100" color={statusColor(w.readinessStatus,"readiness")} status={w.readinessStatus} detail={w.readinessUpdatedAtLocal} stamp={stamp("readiness")}><ScoreMeter label="Readiness" value={w.readiness} readiness /></Tile>
      <Tile id="battery" label="Body Battery" value={num(w.bodyBattery)} unit="/100" color={palette.blue} detail={Number.isFinite(w.bodyBatteryCharged) && Number.isFinite(w.bodyBatteryDrained) ? `↑${w.bodyBatteryCharged} ↓${w.bodyBatteryDrained}` : null} stamp={stamp("battery")}><ScoreMeter label="Body Battery" value={w.bodyBattery} /></Tile>
      <Tile id="hrv" label="HRV · overnight" value={num(w.rawHrvMs)} unit="ms" color={statusColor(w.hrvStatus)} status={w.hrvStatus} stamp={stamp("hrv")}><BaselineMeter low={hrvLow} high={hrvHigh} value={w.hrv7dMs} status={w.hrvStatus} /></Tile>
      <Tile id="resting-hr" label="RHR" value={num(w.restingHr)} unit="bpm" color={palette.red} detail={Number.isFinite(w.restingHr7d) ? `7d ${w.restingHr7d}` : null} stamp={stamp("resting-hr")}><div className="rhr-context"><span>Overnight HR</span><b className="metric-value"><span className="metric-number">{num(w.averageOvernightHr)}</span><small className="metric-unit">bpm</small></b></div></Tile>
      <Tile id="sleep" label="Sleep" value={time(w.sleepMinutes)} color={palette.light} status={Number.isFinite(w.sleepScore) ? `Score ${w.sleepScore}` : null} detail={w.bedTimeLocal && w.wakeTimeLocal ? `${w.bedTimeLocal}–${w.wakeTimeLocal}` : null} stamp={stamp("sleep")}><SleepStages wellness={w} /></Tile>
      <Tile id="recovery" label="Recovery" value={time(w.recoveryTimeMinutes)} color={statusColor(w.recoveryTimeStatus)} status={w.recoveryTimeStatus} detail={w.readinessUpdatedAtLocal ? `@ ${w.readinessUpdatedAtLocal}` : null} stamp={stamp("recovery")}><div className="recovery-tags">{w.recentStressStatus && <span>Stress <b>{w.recentStressStatus}</b></span>}{w.recentSleepScoresStatus && <span>Sleep <b>{w.recentSleepScoresStatus}</b></span>}</div></Tile>
    </dl>
    <div className="body-secondary">
      <section className="body-load-panel" aria-labelledby="body-garmin-load"><h3 id="body-garmin-load">Garmin load <span className="status-dot" style={{color:statusColor(w.garminLoadRatioStatus)}}>{w.garminLoadRatioStatus}</span></h3>
        <dl className="body-stat-row"><Stat label="Acute" value={num(w.garminAcuteLoad)} color={palette.blue} /><Stat label="Chronic" value={num(w.garminChronicLoad)} color={palette.orange} /><Stat label="Ratio" value={num(w.garminLoadRatio)} color={statusColor(w.garminLoadRatioStatus)} /></dl><LoadHistory rows={report.garminLoadHistory?.rows} />
      </section>
      <section aria-labelledby="body-intervals"><h3 id="body-intervals">Intervals.icu</h3><dl className="body-stat-row"><Stat label="CTL" value={num(intervals.fitness)} color={palette.blue} /><Stat label="ATL" value={num(intervals.fatigue)} color={palette.purple} /><Stat label="Form" value={Number.isFinite(intervals.form) ? `${intervals.form>0?"+":""}${decimal(intervals.form)}` : "—"} color={palette.orange} /></dl></section>
      <section aria-labelledby="body-vitals"><h3 id="body-vitals">Vitals</h3><dl className="body-stat-row"><Stat label="SpO₂" value={num(w.averageSpo2)} unit="%" detail={Number.isFinite(w.lowestSpo2)?`Min ${w.lowestSpo2}%`:null} color={palette.blue} /><Stat label="RR" value={num(w.averageRespiration)} unit="br/min" detail={Number.isFinite(w.minimumRespiration)?`Min ${w.minimumRespiration}`:null} /><Stat label="Awake" value={num(w.awakeMinutes)} unit="min" detail={Number.isFinite(w.restlessMoments)?`${w.restlessMoments} restless`:null} /></dl></section>
      <section aria-labelledby="body-adaptation"><h3 id="body-adaptation">Adaptation · Garmin</h3><dl className="body-stat-row"><Stat label="VO₂ max" value={num(w.vo2Max)} detail={w.vo2MaxCategory} color={palette.blue} /><Stat label="Heat" value={num(w.heatAcclimationPercent)} unit="%" detail={w.heatAcclimationTrend} color={palette.orange} /></dl><ScoreMeter label="Heat acclimation" value={w.heatAcclimationPercent} color={palette.orange} /><div className="adaptation-status">{w.trainingStatus && <span style={{color:statusColor(w.trainingStatus)}}>{w.trainingStatus}</span>}{w.loadFocus && <span>{w.loadFocus}</span>}</div></section>
    </div>
  </section>;
}
