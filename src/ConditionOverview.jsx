import { decimal, formatDate, shiftDate } from "./report.js";
import { conditionOverview, conditionStamp } from "./condition.js";
import { BatteryRangeChart, BaselineMeter, isScore, palette, ReadinessGauge, ScoreArc, ScoreRing, SleepStages, readinessColor, statusColor } from "./MetricGraphics.jsx";
import { DurationValue, MetricValue } from "./Readout.jsx";
import { DataCard, DetailFacts, DetailTable } from "./CardDetails.jsx";
import { recoverySeries } from "./performance.js";
import { SleepDetail } from "./SleepDetail.jsx";
import { connectRatioRange, garminLoadReading, garminLoadWindow, garminLoadWindowDays, rangeLabel } from "./garminLoad.js";
import { GarminLoadChart, GarminLoadRanges } from "./GarminLoadChart.jsx";
import { EvidenceMeta } from "./EvidenceMeta.jsx";
import { FitnessHistoryChart } from "./CardHistoryChart.jsx";
import { filterCardHistory, resolveCardHistory } from "./cardHistory.js";

const num = value => Number.isFinite(value) ? decimal(value) : null;
const time = value => Number.isFinite(value) && value >= 0 ? <DurationValue seconds={value * 60} /> : null;
const nonNegative = value => Number.isFinite(value) && value >= 0;
const isBatteryRange = (low, high) => Number.isFinite(low) && Number.isFinite(high) && low >= 0 && low <= high && high <= 100;

function NotRecorded() {
  return <small style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>Not recorded</small>;
}

function Tile({ id, label, value, unit, color, status, children, detail, stamp, valueSize, readings, source, period, history, popup, indicator }) {
  const readout = value == null ? <NotRecorded /> : <MetricValue as="strong" value={value} unit={unit} style={{ color, fontSize: valueSize }} />;
  return <DataCard as="div" definition className="body-tile" data-metric={id} title={label} history={id}
    detail={popup || <><DetailFacts rows={[
      [label, value == null ? "Not recorded" : <MetricValue value={value} unit={unit} />],
      ["Source", source], ["Reading", stamp], ["Status", status], ...readings,
    ]} />{history}</>}>
    <dt>{label}{period && <span className="battery-range-period">{period}</span>}</dt>
    <dd>
      {indicator ? <div className="body-tile-readout">{readout}{indicator}</div> : readout}
      {children}
      {(status || detail) && <div className="body-tile-meta">
        {status && <span style={{ color }}>{status}</span>}
        {detail && <span>{detail}</span>}
      </div>}
    </dd>
  </DataCard>;
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

function GarminLoadCard({ report, data, source }) {
  const history = garminLoadWindow(report);
  const wellness = report.wellness || {};
  const latest = history.rows.findLast(row => nonNegative(row.acute) || nonNegative(row.chronic) || nonNegative(row.ratio));
  const date = latest?.date ?? wellness.date;
  const reading = garminLoadReading(report, latest || (date ? { date } : null));
  const values = latest ? [reading.acute, latest.chronic, reading.ratio]
    : [wellness.garminAcuteLoad, wellness.garminChronicLoad, wellness.garminLoadRatio];
  const labels = ["Acute", "Chronic", "Ratio"];
  const previous = latest && history.rows.find(row => row.date === shiftDate(latest.date, -1));
  const previousValues = previous ? [previous.acute, previous.chronic, previous.ratio] : [];
  const changes = values.map((value, i) => {
    if (!nonNegative(value) || !nonNegative(previousValues[i])) return null;
    const delta = Number((value - previousValues[i]).toFixed(1));
    return `${delta < 0 ? "−" : delta > 0 ? "+" : ""}${decimal(Math.abs(delta))}`;
  });
  const showChange = changes.some(change => change != null);
  return <DataCard as="section" className="body-load-panel" aria-labelledby="body-garmin-load" title="Training Load"
    history="garmin-load" initialHistoryDays={garminLoadWindowDays}
    detail={<DetailFacts rows={[
      ["Source", source], ["Reading", date ? formatDate(date, { year: "numeric" }) : null],
      ...labels.map((label, i) => [label, num(values[i]), i === 0 ? reading.acuteStatus : i === 2 ? reading.ratioStatus : null]),
      ["Acute load capture", date === (wellness.date || report.date) ? data.garminLoadStamp : null],
      ["Chronic and ratio captures", date === (wellness.date || report.date) ? data.garminLoadContext : null],
      ["Acute optimal range", rangeLabel(reading.range), "Approximate bounds from the dated Garmin chart"],
      ["Ratio optimal range", rangeLabel(connectRatioRange), "Garmin Connect"],
    ]} />}>
    <h3 id="body-garmin-load">Training Load <EvidenceMeta source={source} /></h3>
    <dl className="body-stat-row">
      <Stat label="Acute" value={num(values[0])} detail={reading.acuteStatus} color={palette.blue} />
      <Stat label="Chronic" value={num(values[1])} color={palette.orange} />
      <Stat label="Ratio" value={num(values[2])} detail={reading.ratioStatus} color={reading.ratioStatus ? statusColor(reading.ratioStatus) : palette.purple} />
    </dl>
    <div className="load-card-context">
      {date && values.some(nonNegative) && <EvidenceMeta date={date} dateLabel="Latest" />}
      {showChange && <span>vs <time dateTime={previous.date}>{formatDate(previous.date)}</time>
        {changes.map((change, i) => change != null && <span key={labels[i]}>{labels[i]} <b>{change}</b></span>)}
      </span>}
    </div>
    <GarminLoadRanges range={reading.range} />
    <GarminLoadChart window={history} compact />
    {(reading.acuteNote || reading.ratioNote) && <div className="load-attention">
      <strong>Above optimal</strong><div>{reading.acuteNote && <p>{reading.acuteNote}</p>}
        {reading.ratioNote && <p>{reading.ratioNote}</p>}</div>
    </div>}
  </DataCard>;
}

function FitnessCard({ report, stamp }) {
  const source = report.preview ? "Illustrative Intervals.icu data" : "Intervals.icu";
  const history = resolveCardHistory(report, [], "intervals");
  const rows = filterCardHistory(history.rows, report.date, 42);
  const latest = rows[0] || filterCardHistory(history.rows, report.date, null)[0];
  const [fitness, fatigue, form] = latest?.plot ?? [];
  return <DataCard as="section" className="body-fitness-panel" aria-labelledby="body-fitness" title="Fitness" history="intervals" initialHistoryDays={42}
    detail={<DetailFacts rows={[
      ["Source", source], ["Reading", latest?.date === report.intervals?.date ? stamp : latest?.date],
      ["Form", "Fitness minus Fatigue for dates with both values when the export omits Form."],
    ]} />}>
    <h3 id="body-fitness">Fitness <EvidenceMeta source={source} date={latest?.date} dateLabel="Latest" /></h3>
    <dl className="body-stat-row">
      <Stat label="Fitness" value={num(fitness)} color={palette.blue} />
      <Stat label="Fatigue" value={num(fatigue)} color={palette.purple} />
      <Stat label="Form" value={Number.isFinite(form) ? `${form > 0 ? "+" : ""}${decimal(form)}` : null} color={palette.green} />
    </dl>
    {rows.length > 0 && <FitnessHistoryChart history={history} rows={rows} first={shiftDate(report.date, -41)} last={report.date} compact />}
    {!report.preview && <a className="fitness-source-link" href="https://intervals.icu/fitness" target="_blank" rel="noreferrer">Open Fitness in Intervals.icu ↗</a>}
  </DataCard>;
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
  const w = report.wellness || {};
  const data = conditionOverview(report);
  const source = report.preview ? "Illustrative Garmin data" : "Garmin Connect";
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
  const batteryDays = 28;
  const batteryHistory = recoverySeries(report, batteryDays).map(row =>
    row.date === report.date && dailyRange ? { ...row, bodyBatteryRange: batteryRange } : row);
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
  const sleepScore = isScore(sleepContext.sleepScore) ? sleepContext.sleepScore : null;
  const heat = w.heatAcclimationPercent;
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
    <div className="condition-heading"><h2 id="condition-title">Body metrics</h2><EvidenceMeta source={source} /></div>
    <dl className="body-primary">
      <Tile id="readiness" label="Readiness" source={source} value={num(w.readiness)} unit="/100" color={readinessColor(w.readiness)} status={w.readinessStatus} detail={w.readinessUpdatedAtLocal} stamp={stamp("readiness")}
        readings={[["Device update", w.readinessUpdatedAtLocal && `${w.readinessUpdatedAtLocal} WIB`], ["Recovery time", time(w.recoveryTimeMinutes)], ["Recent sleep scores", w.recentSleepScoresStatus], ["Recent stress", w.recentStressStatus]]}>
        <ReadinessGauge value={w.readiness} />
      </Tile>
      <Tile id="battery" label={showBatteryRange ? "Body Battery · range" : "Body Battery"} period="28d"
        history={<DetailTable caption="Recorded daily Body Battery ranges" columns={["Date", "Low", "High"]}
          rows={batteryHistory.filter(row => row.bodyBatteryRange).reverse().map(row => [formatDate(row.date), ...row.bodyBatteryRange])} />}
        source={source} readings={[["Daily low", num(batteryRange?.[0])], ["Daily high", num(batteryRange?.[1])], ["Charge / drain", batteryDelta], ["Sleep recharge", wellnessDate === report.date ? num(w.bodyBatteryChange) : null]]}
        value={showBatteryRange ? batteryRange.map(value => decimal(value)).join("–") : measuredBattery ? num(w.bodyBattery) : null}
        valueSize={showBatteryRange ? "clamp(28px, 2.8vw, 38px)" : undefined}
        unit={measuredBattery ? "/100" : undefined} color={palette.blue} detail={batteryDelta} stamp={batteryStamp}>
        <BatteryRangeChart rows={batteryHistory} days={batteryDays} />
      </Tile>
      <Tile id="hrv" label={hrv === rollingHrv ? "HRV · 7d" : "HRV · overnight"} value={num(hrv.value)} unit="ms" source={source}
        readings={[["7-day average", num(hrv7d) && `${num(hrv7d)} ms`], ["Baseline", showHrvMeter ? `${hrvLow}–${hrvHigh} ms` : null], ["Highest 5-minute HRV", hrv.fromHistory && wellnessDate !== report.date ? null : num(w.highest5MinuteHrvMs) && `${num(w.highest5MinuteHrvMs)} ms`]]}
        color={statusColor(hrvStatus)} status={hrvStatus} stamp={hrv.stamp}
        detail={hrv === overnight && Number.isFinite(hrv7d) && !showHrvMeter ? `7d ${decimal(hrv7d)} ms` : null}>
        <BaselineMeter low={hrvLow} high={hrvHigh} value={hrv7d} status={hrvStatus} />
      </Tile>
      <Tile id="resting-hr" label="Resting heart rate" value={num(restingHr.value)} unit="bpm" color={palette.red} source={source}
        readings={[["7-day resting HR", num(heartRateContext.restingHr7d) && `${heartRateContext.restingHr7d} bpm`], ["Overnight HR", overnightHeartRate && `${overnightHeartRate} bpm`], ["Daily high HR", num(heartRateContext.highHr) && `${heartRateContext.highHr} bpm`]]}
        detail={Number.isFinite(heartRateContext.restingHr7d) ? `7d ${heartRateContext.restingHr7d}` : null} stamp={restingHr.stamp}>
        <div className="rhr-context"><span>Overnight HR</span>{overnightHeartRate == null
          ? <NotRecorded /> : <MetricValue as="b" value={overnightHeartRate} unit="bpm" />}</div>
      </Tile>
      <Tile id="sleep" label="Sleep" value={time(sleep.value)} color={palette.light} source={source}
        popup={<SleepDetail wellness={sleepContext} total={sleep.value} readingDate={sleep.fromHistory ? day?.date : wellnessDate}
          stamp={sleep.stamp} source={source} sourceUrl={sleepContext.provenance?.datedRecovery?.sleep?.sourceUrl} />}
        indicator={sleepScore != null && <ScoreRing value={sleepScore} label="Sleep score" caption="Score" color={palette.light} />}
        detail={sleepContext.bedTimeLocal && sleepContext.wakeTimeLocal ? `${sleepContext.bedTimeLocal}–${sleepContext.wakeTimeLocal}` : null} stamp={sleep.stamp}>
        <AvailableSleepStages wellness={sleepContext} />
      </Tile>
      <Tile id="recovery" label="Recovery" value={time(w.recoveryTimeMinutes)} color={statusColor(w.recoveryTimeStatus)} status={w.recoveryTimeStatus} detail={w.readinessUpdatedAtLocal ? `@ ${w.readinessUpdatedAtLocal}` : null} stamp={stamp("recovery")} source={source} readings={[["Recent stress", w.recentStressStatus], ["Recent sleep scores", w.recentSleepScoresStatus]]}><div className="recovery-tags">{w.recentStressStatus && <span>Stress <b>{w.recentStressStatus}</b></span>}{w.recentSleepScoresStatus && <span>Sleep <b>{w.recentSleepScoresStatus}</b></span>}</div></Tile>
    </dl>
    <div className="body-secondary">
      <GarminLoadCard report={report} data={data} source={source} />
      <FitnessCard report={report} stamp={data.intervalsStamp} />
      <DataCard as="section" className="body-vitals-panel" aria-labelledby="body-vitals" title="Vitals" history="vitals" detail={<DetailFacts rows={[["Source", source], ["Reading", data.overnightStamp], ...data.overnight.map(item => [item.label, item.value, item.context])]} />}><h3 id="body-vitals">Vitals</h3><dl className="body-stat-row"><Stat label="SpO₂" value={num(w.averageSpo2)} unit="%" detail={Number.isFinite(w.lowestSpo2)?`Min ${w.lowestSpo2}%`:null} color={palette.blue} /><Stat label="RR" value={num(w.averageRespiration)} unit="br/min" detail={Number.isFinite(w.minimumRespiration)?`Min ${w.minimumRespiration}`:null} /><Stat label="Awake" value={num(w.awakeMinutes)} unit="min" detail={Number.isFinite(w.restlessMoments)?`${w.restlessMoments} restless`:null} /></dl></DataCard>
      <DataCard as="section" aria-labelledby="body-adaptation" title="Adaptation · Garmin" history="adaptation" detail={<DetailFacts rows={[["Source", source], ["Training status capture", data.fitnessStamp], ...data.fitness.map(item => [item.label, item.value, item.context])]} />}>
        <h3 id="body-adaptation">Adaptation · Garmin</h3>
        <dl className="body-stat-row adaptation-measures">
          <Stat label="VO₂ max" value={num(w.vo2Max)} detail={w.vo2MaxCategory} color={palette.blue} />
          {isScore(heat) ? <div className="adaptation-heat">
            <dt>Heat acclimation</dt>
            <dd><ScoreArc label="Heat acclimation" value={heat} color={palette.orange} />
              {w.heatAcclimationTrend && <span>{w.heatAcclimationTrend}</span>}
            </dd>
          </div> : <Stat label="Heat acclimation" value={null} detail={w.heatAcclimationTrend} />}
        </dl>
        <div className="adaptation-status">{w.trainingStatus && <span style={{ color: statusColor(w.trainingStatus) }}>{w.trainingStatus}</span>}{w.loadFocus && <span>{w.loadFocus}</span>}</div>
      </DataCard>
    </div>
    {extraReadings.length > 0 && <details className="check-in-panel body-more">
      <summary>More body metrics</summary>
      <dl className="body-stat-row">{extraReadings.map(([label, value, unit]) => <Stat key={label} label={label} value={value} unit={unit} />)}</dl>
    </details>}
  </section>;
}
