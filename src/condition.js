import { decimal, duration, formatDate } from "./report.js";

const present = value => Number.isFinite(value) || (typeof value === "string" && value.trim() !== "");
const join = values => values.filter(Boolean).join(" · ");
const number = (value, unit = "", signed = false) => Number.isFinite(value)
  ? `${signed && value > 0 ? "+" : ""}${decimal(value)}${unit ? ` ${unit}` : ""}` : null;
const minutes = value => Number.isFinite(value) ? duration(value * 60) : null;

export function conditionStamp(date, observedAt) {
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date || "") && Number.isFinite(Date.parse(`${date}T12:00:00Z`));
  const validCapture = observedAt && Number.isFinite(Date.parse(observedAt));
  const dateLabel = validDate ? formatDate(date) : "Reading date unrecorded";
  if (!validCapture) return `${dateLabel} · capture time unrecorded`;
  const capture = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", ...(validDate ? {} : { day: "numeric", month: "short" }),
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(observedAt));
  return `${dateLabel} · captured ${capture} WIB`;
}

export function conditionOverview(report) {
  const w = report.wellness || {};
  const recovery = w.provenance?.datedRecovery || {};
  const load = w.provenance?.currentLoadContext || {};
  const i = report.intervals || {};
  const date = w.date || recovery.date;
  const matchingLoadRows = (report.garminLoadHistory?.rows || []).filter(row => row?.date === report.date
    && Number.isFinite(w.garminAcuteLoad) && Number.isFinite(w.garminChronicLoad)
    && row.acute === w.garminAcuteLoad && row.chronic === w.garminChronicLoad);
  const datedLoadPair = matchingLoadRows.length === 1 ? matchingLoadRows[0] : null;
  const chronicDate = load.chronic?.date || load.chronic?.metricDate || datedLoadPair?.date;
  const chronicCapturedAt = (load.chronic?.date || load.chronic?.metricDate) ? load.chronic?.observedAt
    : datedLoadPair ? report.garminLoadHistory.observedAt : load.chronic?.observedAt;
  const stamp = type => conditionStamp(date, recovery[type]?.observedAt);
  const status = value => present(value) ? value : null;
  const card = (id, label, value, unit, context, captured, sourceStatus) => ({
    id, label, value: present(value) ? String(value) : "Unavailable", unit: present(value) ? unit : "",
    context: context || (present(value) ? "Recorded value" : "Not recorded in this report"), stamp: captured, status: sourceStatus,
    attention: id === "readiness" ? /^(low|very low|poor)$/i.test(sourceStatus || "")
      : ["acute", "ratio"].includes(id) && /^(high|very high)$/i.test(sourceStatus || ""),
  });
  const baselineLow = w.hrvBaselineLowMs ?? w.hrvBaselineMs?.[0];
  const baselineHigh = w.hrvBaselineHighMs ?? w.hrvBaselineMs?.[1];
  const baseline = Number.isFinite(baselineLow) && Number.isFinite(baselineHigh) ? `Baseline ${decimal(baselineLow)}–${decimal(baselineHigh)} ms` : null;
  const readinessTime = w.readinessUpdatedAtLocal ? `Updated ${w.readinessUpdatedAtLocal} WIB` : null;
  const row = (label, value, context) => present(value) ? { label, value, context } : null;
  const sleepTime = present(w.bedTimeLocal) && present(w.wakeTimeLocal) ? `${w.bedTimeLocal}–${w.wakeTimeLocal}` : null;

  return {
    primary: [
      card("readiness", "Training readiness", w.readiness, "/ 100", join([status(w.readinessStatus), readinessTime]), stamp("readiness"), w.readinessStatus),
      card("battery", "Body Battery", w.bodyBattery, "/ 100", "Recorded energy reserve", stamp("bodyBattery")),
      card("hrv", "Overnight HRV", w.rawHrvMs, "ms", join([status(w.hrvStatus), Number.isFinite(w.hrv7dMs) ? `7-day avg ${decimal(w.hrv7dMs)} ms` : null, baseline]), stamp("hrv")),
      card("resting-hr", "Resting heart rate", w.restingHr, "bpm", Number.isFinite(w.restingHr7d) ? `7-day avg ${decimal(w.restingHr7d)} bpm` : "Daily resting heart rate", stamp("heartRate")),
      card("sleep", "Sleep duration", minutes(w.sleepMinutes), "", join([Number.isFinite(w.sleepScore) ? `Score ${decimal(w.sleepScore)} / 100` : null, sleepTime]), stamp("sleep")),
      card("recovery", "Recovery time", minutes(w.recoveryTimeMinutes), "", join([status(w.recoveryTimeStatus), w.readinessUpdatedAtLocal ? `Snapshot ${w.readinessUpdatedAtLocal} WIB` : "Recorded snapshot"]), stamp("readiness")),
    ],
    overnight: [
      row("Sleep score", number(w.sleepScore, "/ 100")),
      row("Sleep stages", join([Number.isFinite(w.deepSleepMinutes) ? `Deep ${minutes(w.deepSleepMinutes)}` : null, Number.isFinite(w.lightSleepMinutes) ? `Light ${minutes(w.lightSleepMinutes)}` : null, Number.isFinite(w.remSleepMinutes) ? `REM ${minutes(w.remSleepMinutes)}` : null])),
      row("Awake / restless", join([Number.isFinite(w.awakeMinutes) ? minutes(w.awakeMinutes) : null, Number.isFinite(w.restlessMoments) ? `${decimal(w.restlessMoments)} restless moments` : null])),
      row("Overnight heart rate", number(w.averageOvernightHr, "bpm")),
      row("Oxygen saturation", number(w.averageSpo2, "%"), Number.isFinite(w.lowestSpo2) ? `Lowest ${decimal(w.lowestSpo2)}%` : null),
      row("Respiration", number(w.averageRespiration, "br/min"), Number.isFinite(w.minimumRespiration) ? `Minimum ${decimal(w.minimumRespiration)} br/min` : null),
    ].filter(Boolean),
    overnightStamp: stamp("sleep"),
    garminLoad: [
      card("ratio", "Load ratio", w.garminLoadRatio, "", status(w.garminLoadRatioStatus), null, w.garminLoadRatioStatus),
      card("acute", "Acute load", w.garminAcuteLoad, "", status(w.garminAcuteLoadStatus), null, w.garminAcuteLoadStatus),
      card("chronic", "Chronic load", w.garminChronicLoad, "", "", null),
    ],
    // A matching dated history pair can date these two load values only. It does
    // not refresh other wellness readings or date the separately observed ratio.
    garminLoadStamp: conditionStamp(load.acute?.date, load.acute?.observedAt),
    garminLoadContext: `Chronic: ${conditionStamp(chronicDate, chronicCapturedAt)}. Ratio: ${conditionStamp(load.ratio?.date || load.ratio?.metricDate, load.ratio?.observedAt)}.`,
    intervals: [
      card("fitness", "Fitness", i.fitness, "", "", null),
      card("fatigue", "Fatigue", i.fatigue, "", "", null),
      card("form", "Form", number(i.form, "", true), "", "", null),
    ],
    intervalsStamp: conditionStamp(i.date, i.provenance?.observedAt),
    fitness: [
      row("Training status", status(w.trainingStatus)),
      row("Load focus", status(w.loadFocus)),
      row("VO₂ max", number(w.vo2Max, "ml/kg/min"), status(w.vo2MaxCategory)),
      row("Heat acclimation", number(w.heatAcclimationPercent, "%"), status(w.heatAcclimationTrend)),
      row("Recent stress", status(w.recentStressStatus)),
      row("Recent sleep scores", status(w.recentSleepScoresStatus)),
    ].filter(Boolean),
    fitnessStamp: conditionStamp(null, load.trainingStatusObservedAt),
    more: [
      row("Body Battery charged / drained", join([Number.isFinite(w.bodyBatteryCharged) ? `+${decimal(w.bodyBatteryCharged)} charged` : null, Number.isFinite(w.bodyBatteryDrained) ? `${decimal(w.bodyBatteryDrained)} drained` : null])),
      row("Body Battery daily range", Number.isFinite(w.bodyBatteryDailyLow) && Number.isFinite(w.bodyBatteryDailyHigh) ? `${decimal(w.bodyBatteryDailyLow)}–${decimal(w.bodyBatteryDailyHigh)}` : null),
      row("Highest 5-minute HRV", number(w.highest5MinuteHrvMs, "ms")),
      row("Daily high heart rate", number(w.highHr, "bpm")),
    ].filter(Boolean),
  };
}
