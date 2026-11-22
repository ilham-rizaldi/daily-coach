import { decimal, duration, shiftDate } from "./report.js";
import { paceClock, rangeFor, targetEvidence } from "./pacing.js";

const present = value => value != null && value !== "" && (typeof value !== "number" || Number.isFinite(value));
const minuteText = value => Number.isFinite(value) ? duration(value * 60) : null;
const day = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;
const rangeText = values => rangeFor(values)?.join("–");
const numberText = value => Number.isFinite(value) ? decimal(value) : null;
const clockText = value => Number.isFinite(value) ? paceClock(value) : null;

export function datedHistory(caption, columns, entries, read, dateOf = row => row.date) {
  return { caption, columns, rows: (entries || []).flatMap(row => {
    const date = dateOf(row);
    const values = read(row);
    return day(date) && values.some(present) ? [{ date, values, precision: row.precision }] : [];
  }) };
}

export function filterCardHistory(rows, end, days) {
  if (!day(end)) return [];
  const start = days == null ? "" : shiftDate(end, 1 - days);
  return (rows || []).filter(row => day(row.date) && row.date >= start && row.date <= end)
    .slice().sort((a, b) => b.date.localeCompare(a.date));
}

const wellnessMetrics = {
  battery: ["Body Battery · Garmin Connect", ["Low", "High", "Sleep charge"],
    row => [row.bodyBatteryLow, row.bodyBatteryHigh, row.bodyBatteryCharge]],
  hrv: ["HRV · Garmin Connect", ["Overnight · ms", "7d · ms", "Baseline · ms"],
    row => [row.hrvMs, row.hrv7dMs, present(row.hrvLowMs) && present(row.hrvHighMs) ? `${row.hrvLowMs}–${row.hrvHighMs}` : null]],
  "resting-hr": ["Resting heart rate · Garmin Connect", ["RHR · bpm"], row => [row.rhrBpm]],
  sleep: ["Sleep · Garmin Connect", ["Asleep", "Sleep need", "Score", "Deep", "REM"],
    row => [minuteText(row.sleepMinutes), minuteText(row.sleepNeedMinutes), row.sleepScore, minuteText(row.deepSleepMinutes), minuteText(row.remSleepMinutes)]],
  readiness: ["Readiness · Garmin Connect", ["Readiness /100", "Status"], row => [row.readiness, row.readinessStatus]],
  recovery: ["Remaining recovery at capture · Garmin Connect", ["Time", "Status"], row => [minuteText(row.recoveryTimeMinutes), row.recoveryTimeStatus]],
  vitals: ["Overnight vitals · Garmin Connect", ["SpO₂ · %", "Respiration · br/min", "Awake"],
    row => [row.averageSpo2, row.averageRespiration, minuteText(row.awakeMinutes)]],
  adaptation: ["Adaptation · Garmin Connect", ["VO₂ max", "Heat · %", "Training status"],
    row => [row.vo2Max, row.heatAcclimationPercent, row.trainingStatus]],
};

function reportSnapshots(report, reports) {
  const snapshots = [report, ...(reports || []), ...(report.baseHistory?.snapshots || [])];
  const unique = new Map();
  for (const row of snapshots) {
    if (row?.date <= report.date && day(row.date) && !unique.has(row.date)) unique.set(row.date, row);
  }
  return [...unique.values()];
}

function garminWellness(report, snapshots) {
  const byDate = new Map();
  for (const item of [...snapshots].reverse()) {
    const w = item.wellness;
    if (!w) continue;
    const date = w.date || w.provenance?.datedRecovery?.date || item.date;
    byDate.set(date, { ...byDate.get(date), ...w, date, hrvMs: w.rawHrvMs, rhrBpm: w.restingHr,
      hrvLowMs: w.hrvBaselineLowMs, hrvHighMs: w.hrvBaselineHighMs,
      bodyBatteryLow: w.bodyBatteryDailyLow, bodyBatteryHigh: w.bodyBatteryDailyHigh, bodyBatteryCharge: w.bodyBatteryChange });
  }
  for (const row of report.wellnessHistory?.rows || []) {
    byDate.set(row.date, { ...byDate.get(row.date), ...row });
  }
  return [...byDate.values()];
}

function activityHistory(report, sport, metric) {
  const rows = [...(report.activities || []), ...(report.baseHistory?.additionalActivities || [])].filter(row =>
    (!sport || row.sport === sport) && !row.planned && row.classification !== "non-training");
  const read = {
    hrBpm: ["Avg HR · bpm", row => row.averageHr],
    powerWatts: ["Avg power · W", row => sport === "Run" ? row.averageRunningPowerWatts : row.measuredPowerWatts],
    paceSecondsPerKm: ["Avg pace · /km", row => clockText(row.averagePaceSeconds)],
    intervalsLoad: ["Intervals TL", row => row.intervalsLoad],
  }[metric];
  const source = row => row.sources?.join(" · ") || row.source;
  if (read) return datedHistory("Recorded sessions · session averages", ["Activity", read[0], "Source"],
    rows.filter(row => present(read[1](row))), row => [row.name, read[1](row), metric === "intervalsLoad" ? "Intervals.icu" : row.source]);
  return datedHistory("Recorded training sessions", ["Activity", "Time", "Distance · km", "Avg HR · bpm", "Source"],
    rows, row => [row.name || row.sport, Number.isFinite(row.timerSeconds ?? row.movingSeconds) ? duration(row.timerSeconds ?? row.movingSeconds) : null,
      numberText(row.distanceKm), row.averageHr, source(row)]);
}

function intervalHistory(report, snapshots) {
  const unique = new Map();
  for (const row of [
    ...(report.intervals?.displayedSnapshots || []),
    ...(report.baseHistory?.intervalsDaily || []),
    ...snapshots.map(item => item.intervals).filter(Boolean),
  ]) {
    if (!day(row.date) || unique.has(row.date)) continue;
    unique.set(row.date, row);
  }
  return datedHistory("Fitness and fatigue · Intervals.icu", ["CTL", "ATL", "Form"], [...unique.values()],
    row => [numberText(row.fitness), numberText(row.fatigue), numberText(row.form)]);
}

export function resolveCardHistory(report, reports, definition) {
  if (!report || !definition) return null;
  if (typeof definition === "object" && Array.isArray(definition.rows)) return definition;
  const query = typeof definition === "string" ? { kind: definition } : definition;
  const { kind, sport, metric } = query;
  if (kind === "activities") return activityHistory(report, sport, metric);
  if (kind === "source") {
    const source = query.source;
    const records = report.baseHistory?.providerActivities?.[source] || [];
    return datedHistory(`Activities · ${source}`, ["Activity", "Time", "Km", "Avg HR", "Avg power", "TL"],
      records, row => [row.name || row.sourceType, Number.isFinite(row.timerSeconds ?? row.movingSeconds) ?
        duration(row.timerSeconds ?? row.movingSeconds) : null, numberText(row.distanceKm), row.averageHr,
      row.measuredPowerWatts ?? row.averageRunningPowerWatts, row.intervalsLoad]);
  }
  const snapshots = reportSnapshots(report, reports);
  if (wellnessMetrics[kind]) {
    return datedHistory(...wellnessMetrics[kind].slice(0, 2), garminWellness(report, snapshots), wellnessMetrics[kind][2]);
  }
  if (kind === "intervals") return intervalHistory(report, snapshots);
  if (kind === "garmin-load") {
    const unique = new Map();
    for (const item of [...snapshots].reverse()) {
      const w = item.wellness;
      if (w && Number.isFinite(w.garminAcuteLoad)) unique.set(w.date || item.date,
        { date: w.date || item.date, acute: w.garminAcuteLoad, chronic: w.garminChronicLoad });
      for (const row of item.garminLoadHistory?.rows || []) unique.set(row.date, row);
    }
    return datedHistory("Training Load · Garmin Connect", ["Acute", "Chronic"],
      [...unique.values()], row => [row.acute, row.chronic]);
  }
  if (kind === "threshold") return datedHistory("Dated threshold checks", ["Value", "Source", "Confidence"],
    snapshots.flatMap(item => (item.thresholdReview?.rows || []).filter(row => row.title === query.title)
      .map(row => ({ ...row, date: row.evidence?.date || item.thresholdReview.date }))),
    row => [[row.value, row.unit].filter(present).join(" "), row.evidence?.source, row.evidence?.confidence]);
  if (kind === "coach") return datedHistory("Saved coaching decisions", ["Decision", "Confidence"],
    snapshots.filter(item => item.coaching?.headline), row => [row.coaching.headline, row.coaching.confidence]);
  if (kind === "pacing") {
    const key = sport === "Ride" ? "cycling" : "running";
    if (!metric) return activityHistory(report, sport);
    const fields = { powerWatts: "W", hrBpm: "bpm", paceSecondsPerKm: "/km" };
    const captured = snapshots.flatMap(item => {
      const plan = item.coaching?.pacing?.[key], evidence = targetEvidence(plan?.evidence?.[metric]);
      const limits = rangeFor(plan?.[metric]);
      if (!limits || !evidence) return [];
      const value = metric === "paceSecondsPerKm" ? limits.map(clockText).join("–") : rangeText(limits);
      return [{ ...evidence, value: `${value} ${fields[metric]}` }];
    });
    const history = datedHistory("Saved pacing targets", ["Target", "Source", "Confidence"], captured,
      row => [row.value, row.source, row.confidence]);
    for (const row of activityHistory(report, sport, metric).rows) {
      history.rows.push({ date: row.date, values: [row.values[1], row.values[2], "Recorded session average"] });
    }
    history.columns[2] = "Confidence / type";
    return history;
  }
  if (kind === "load-focus") return datedHistory("Dated Load Focus windows · Garmin Connect",
    ["Bucket", "Points", "Window start", "Target"],
    snapshots.flatMap(item => {
      const focus = item.trainingMix?.garminLoadFocus;
      return focus?.buckets?.map(row => ({ ...row, date: focus.end, start: focus.start })) || [];
    }), row => [row.key, row.points, row.start, rangeText([row.targetLow, row.targetHigh])]);
  return null;
}
