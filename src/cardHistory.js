import { coversWindow, DAY, decimal, duration, shiftDate } from "./report.js";
import { connectRatioRange, optimalAcuteRange, rangeLabel } from "./garminLoad.js";
import { paceClock, rangeFor, targetEvidence } from "./pacing.js";

const present = value => value != null && value !== "" && (typeof value !== "number" || Number.isFinite(value));
const minuteText = value => Number.isFinite(value) ? duration(value * 60) : null;
const day = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;
const rangeText = values => rangeFor(values)?.join("–");
const numberText = value => Number.isFinite(value) ? decimal(value) : null;
const clockText = value => Number.isFinite(value) ? paceClock(value) : null;

export function datedHistory(caption, columns, entries, read, { chart, daily = false } = {}) {
  return { caption, columns, daily, chart: chart?.map(([label]) => label), rows: (entries || []).flatMap(row => {
    const date = row.date;
    const values = read(row);
    if (!day(date) || !values.some(present)) return [];
    const plot = chart?.map(([, value]) => value(row));
    return [{ date, values, precision: row.precision, plot }];
  }) };
}

export function filterCardHistory(rows, end, days) {
  if (!day(end)) return [];
  const start = days == null ? "" : shiftDate(end, 1 - days);
  return (rows || []).filter(row => day(row.date) && row.date >= start && row.date <= end)
    .slice().sort((a, b) => b.date.localeCompare(a.date));
}

export function historyChartSeries(history, rows) {
  const labels = history?.chart || history?.columns || [];
  return labels.flatMap((label, index) => {
    const points = rows.flatMap(row => {
      const value = (history.chart ? row.plot : row.values)?.[index];
      return Number.isFinite(value) ? [{ date: row.date, precision: row.precision, value }] : [];
    }).reverse();
    return points.length ? [{ label, points }] : [];
  });
}

export function dailyChartRuns(points) {
  const groups = new Map();
  for (const point of points) {
    if (!groups.has(point.date)) groups.set(point.date, []);
    groups.get(point.date).push(point);
  }
  const runs = [];
  let run = [];
  for (const [date, group] of groups) {
    if (group.length !== 1 || (run.length && shiftDate(run.at(-1).date, 1) !== date)) {
      if (run.length > 1) runs.push(run);
      run = [];
    }
    if (group.length === 1) run.push(group[0]);
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

const wellnessMetrics = {
  battery: ["Body Battery · Garmin Connect", ["Low", "High", "Sleep charge"],
    row => [row.bodyBatteryLow, row.bodyBatteryHigh, row.bodyBatteryCharge]],
  hrv: ["HRV · Garmin Connect", ["Overnight · ms", "7d · ms", "Baseline · ms"],
    row => [row.hrvMs, row.hrv7dMs, present(row.hrvLowMs) && present(row.hrvHighMs) ? `${row.hrvLowMs}–${row.hrvHighMs}` : null]],
  "resting-hr": ["Resting heart rate · Garmin Connect", ["RHR · bpm"], row => [row.rhrBpm]],
  sleep: ["Sleep · Garmin Connect", ["Asleep", "Sleep need", "Score", "Deep", "REM"],
    row => [minuteText(row.sleepMinutes), minuteText(row.sleepNeedMinutes), row.sleepScore, minuteText(row.deepSleepMinutes), minuteText(row.remSleepMinutes)],
    [["Asleep · min", row => row.sleepMinutes], ["Sleep need · min", row => row.sleepNeedMinutes], ["Sleep score", row => row.sleepScore],
      ["Deep sleep · min", row => row.deepSleepMinutes], ["REM sleep · min", row => row.remSleepMinutes]]],
  readiness: ["Readiness · Garmin Connect", ["Readiness /100", "Status"], row => [row.readiness, row.readinessStatus]],
  recovery: ["Remaining recovery at capture · Garmin Connect", ["Time", "Status"], row => [minuteText(row.recoveryTimeMinutes), row.recoveryTimeStatus],
    [["Remaining recovery · h", row => Number.isFinite(row.recoveryTimeMinutes) ? row.recoveryTimeMinutes / 60 : null]]],
  vitals: ["Overnight vitals · Garmin Connect", ["SpO₂ · %", "Respiration · br/min", "Awake"],
    row => [row.averageSpo2, row.averageRespiration, minuteText(row.awakeMinutes)],
    [["SpO₂ · %", row => row.averageSpo2], ["Respiration · br/min", row => row.averageRespiration], ["Awake · min", row => row.awakeMinutes]]],
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

function trainingActivities(report, sport) {
  return [...(report.activities || []), ...(report.baseHistory?.additionalActivities || [])].filter(row =>
    (!sport || sport === "All" || (sport === "Other" ? !["Ride", "Run", "Weight Training"].includes(row.sport) : row.sport === sport))
    && !row.planned && row.classification !== "non-training");
}

function activityHistory(report, sport, metric) {
  const rows = trainingActivities(report, sport);
  const read = {
    hrBpm: ["Avg HR · bpm", row => row.averageHr],
    powerWatts: ["Avg power · W", row => sport === "Run" ? row.averageRunningPowerWatts : row.measuredPowerWatts],
    paceSecondsPerKm: ["Avg pace · /km", row => clockText(row.averagePaceSeconds), ["Avg pace · sec/km", row => row.averagePaceSeconds]],
    intervalsLoad: ["Intervals TL", row => row.intervalsLoad],
  }[metric];
  const source = row => row.sources?.join(" · ") || row.source;
  if (read) return datedHistory("Recorded sessions · session averages", ["Activity", read[0], "Source"],
    rows.filter(row => present(read[1](row))), row => [row.name, read[1](row), metric === "intervalsLoad" ? "Intervals.icu" : row.source],
    { chart: [read[2] || [read[0], read[1]]] });
  return datedHistory("Recorded training sessions", ["Activity", "Time", "Distance · km", "Avg HR · bpm", "Source"],
    rows, row => [row.name || row.sport, Number.isFinite(row.timerSeconds ?? row.movingSeconds) ? duration(row.timerSeconds ?? row.movingSeconds) : null,
      numberText(row.distanceKm), row.averageHr, source(row)], { chart: activityChart });
}

function activityTotalsHistory(report, query) {
  const { sport, kind, metric } = query;
  const weekly = kind === "activity-weeks";
  const end = weekly ? shiftDate(report.date, -1) : report.date;
  const buckets = new Map();
  const totalDay = date => weekly ? shiftDate(end, -7 * Math.floor((Date.parse(end) - Date.parse(date)) / (7 * DAY))) : date;
  for (const row of trainingActivities(report, sport)) {
    if (!day(row.date) || row.date > end) continue;
    const stamp = totalDay(row.date);
    if (!buckets.has(stamp)) buckets.set(stamp, []);
    buckets.get(stamp).push(row);
  }
  // Only dates inside the report's verified coverage can acquire a recorded
  // zero-workout bucket. Missing capture outside that range stays blank.
  const step = weekly ? 7 : 1;
  if (report.coverage?.complete) {
    for (let stamp = end; stamp >= report.coverage.start; stamp = shiftDate(stamp, -step)) {
      if (!buckets.has(stamp) && coversWindow(report, shiftDate(stamp, 1 - step), stamp)) buckets.set(stamp, []);
    }
  }
  const label = {
    duration: "Duration · min", sessions: "Sessions", activeDays: "Active days",
    longest: "Longest recorded session · min", intervalsLoad: "Recorded Intervals TL",
  }[metric];
  const rows = [...buckets].map(([date, entries]) => {
    const seconds = entries.map(row => row.timerSeconds ?? row.movingSeconds).filter(Number.isFinite);
    const loads = entries.map(row => row.intervalsLoad).filter(Number.isFinite);
    const durationKnown = seconds.length === entries.length;
    const value = {
      duration: durationKnown ? seconds.reduce((sum, time) => sum + time, 0) / 60 : null,
      sessions: entries.length,
      activeDays: new Set(entries.map(row => row.date)).size,
      longest: seconds.length ? Math.max(...seconds) / 60 : null,
      intervalsLoad: loads.length ? loads.reduce((sum, load) => sum + load, 0) : null,
    }[metric];
    const complete = report.coverage && coversWindow(report, shiftDate(date, 1 - step), date);
    const coverage = date === report.date ? "Report day through capture" : complete ? "Complete" : "Captured sessions";
    return { date, value, coverage: metric === "intervalsLoad" && loads.length < entries.length ?
      `${loads.length}/${entries.length} loads recorded` : coverage };
  }).filter(row => Number.isFinite(row.value));
  return datedHistory(weekly ? "Recorded training · seven-day period ending on date shown" : "Recorded training by day",
    [label, "Coverage"], rows, row => [Number(row.value.toFixed(1)), row.coverage], { daily: !weekly });
}

const activityChart = [
  ["Session duration · min", row => Number.isFinite(row.timerSeconds ?? row.movingSeconds) ? (row.timerSeconds ?? row.movingSeconds) / 60 : null],
  ["Distance · km", row => row.distanceKm],
  ["Avg HR · bpm", row => row.averageHr],
];

function intervalHistory(report, snapshots) {
  const unique = new Map();
  for (const row of [
    report.intervals,
    ...(report.intervals?.displayedSnapshots || []),
    ...(report.baseHistory?.intervalsDaily || []),
    ...snapshots.map(item => item.intervals).filter(Boolean),
  ]) {
    if (!day(row?.date) || row.date > report.date || unique.has(row.date)
      || row.modelState === "unverified" || row.provenance?.state === "unverified"
      || ![row.fitness, row.fatigue, row.form].some(Number.isFinite)) continue;
    unique.set(row.date, row);
  }
  const form = row => Number.isFinite(row.form) ? row.form :
    Number.isFinite(row.fitness) && Number.isFinite(row.fatigue) ? row.fitness - row.fatigue : null;
  const chart = [["Fitness", row => row.fitness], ["Fatigue", row => row.fatigue], ["Form", form]];
  const history = datedHistory("Fitness history · Intervals.icu", chart.map(([label]) => label), [...unique.values()],
    row => chart.map(([, read]) => numberText(read(row))), { daily: true, chart });
  return { ...history, visual: "fitness" };
}

export function resolveCardHistory(report, reports, definition) {
  if (!report || !definition) return null;
  if (typeof definition === "object" && Array.isArray(definition.rows)) return definition;
  const query = typeof definition === "string" ? { kind: definition } : definition;
  const { kind, sport, metric } = query;
  if (kind === "activity-days" || kind === "activity-weeks") return activityTotalsHistory(report, query);
  if (kind === "activities") return activityHistory(report, sport, metric);
  if (kind === "source") {
    const source = query.source;
    const records = report.baseHistory?.providerActivities?.[source] || [];
    return datedHistory(`Activities · ${source}`, ["Activity", "Time", "Km", "Avg HR", "Avg power", "TL"],
      records, row => [row.name || row.sourceType, Number.isFinite(row.timerSeconds ?? row.movingSeconds) ?
        duration(row.timerSeconds ?? row.movingSeconds) : null, numberText(row.distanceKm), row.averageHr,
      row.measuredPowerWatts ?? row.averageRunningPowerWatts, row.intervalsLoad], { chart: [
        ...activityChart, ["Avg power · W", row => row.measuredPowerWatts ?? row.averageRunningPowerWatts],
        ["Intervals TL", row => row.intervalsLoad],
      ] });
  }
  if (kind === "intervals-wellness") {
    const rows = report.baseHistory?.intervalsWellness || [];
    return datedHistory("Wellness · Intervals.icu",
      ["Resting HR · bpm", "HRV · ms", "Asleep", "Sleeping HR · bpm", "Steps", "Sleep score"],
      rows, row => [row.restingHrBpm, row.hrvMs, Number.isFinite(row.sleepSeconds) ? duration(row.sleepSeconds) : null,
        row.sleepingHrBpm, row.steps, row.sleepScore], { daily: true, chart: [
        ["Resting HR · bpm", row => row.restingHrBpm], ["HRV · ms", row => row.hrvMs],
        ["Asleep · min", row => Number.isFinite(row.sleepSeconds) ? row.sleepSeconds / 60 : null],
        ["Sleeping HR · bpm", row => row.sleepingHrBpm], ["Steps", row => row.steps], ["Sleep score", row => row.sleepScore],
      ] });
  }
  const snapshots = reportSnapshots(report, reports);
  if (wellnessMetrics[kind]) {
    const [caption, columns, read, chart] = wellnessMetrics[kind];
    return datedHistory(caption, columns, garminWellness(report, snapshots), read, { chart, daily: true });
  }
  if (kind === "intervals") return intervalHistory(report, snapshots);
  if (kind === "training-status") {
    const rows = garminWellness(report, snapshots).filter(row => row.trainingStatus);
    return datedHistory("Training Status snapshots · Garmin Connect",
      ["Status", "Load Focus", "VO₂ max", "7-day HRV · ms", "Acute load", "Heat · %"],
      rows, row => [row.trainingStatus, row.loadFocus, row.vo2Max, row.hrv7dMs, row.garminAcuteLoad, row.heatAcclimationPercent]);
  }
  if (kind === "garmin-load") {
    const unique = new Map();
    for (const item of [...snapshots].reverse()) {
      const w = item.wellness;
      if (w && Number.isFinite(w.garminAcuteLoad)) unique.set(w.date || item.date,
        { date: w.date || item.date, acute: w.garminAcuteLoad, chronic: w.garminChronicLoad, ratio: w.garminLoadRatio });
      for (const row of item.garminLoadHistory?.rows || []) {
        const merged = { ...unique.get(row.date), ...row };
        if (row.ratio === undefined && unique.get(row.date)?.acute !== row.acute) delete merged.ratio;
        unique.set(row.date, merged);
      }
    }
    const entries = [...unique.values()];
    const history = datedHistory("Training Load · Garmin Connect", ["Acute", "Chronic", "Ratio", "Acute optimal range"],
      entries, row => {
        const range = rangeLabel(optimalAcuteRange(row));
        return [row.acute, row.chronic, row.ratio, range ? `≈${range}` : null];
      }, { daily: true });
    history.chartBands = {
      Acute: entries.flatMap(row => {
        const range = optimalAcuteRange(row);
        return range ? [{ date: row.date, ...range }] : [];
      }),
      Ratio: connectRatioRange,
    };
    return history;
  }
  if (kind === "threshold") return datedHistory("Dated threshold checks", ["Value", "Source", "Basis"],
    snapshots.flatMap(item => (item.thresholdReview?.rows || []).filter(row => row.title === query.title)
      .map(row => ({ ...row, date: row.evidence?.date || item.thresholdReview.date }))),
    row => [[row.value, row.unit].filter(present).join(" "), row.evidence?.source, row.evidence?.reason],
    { chart: [["Threshold reading", row => row.value]] });
  if (kind === "coach") return datedHistory("Saved coaching decisions", ["Decision", "Why"],
    snapshots.filter(item => item.coaching?.headline), row => [row.coaching.headline, row.coaching.actionPlan?.why?.join(" · ")]);
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
    const history = datedHistory("Pacing targets and recorded sessions", ["Reading", "Source", "Type"], captured,
      row => [row.value, row.source, "Suggested target"]);
    const sessions = activityHistory(report, sport, metric);
    history.chart = sessions.chart;
    for (const row of sessions.rows) {
      history.rows.push({ ...row, values: [`${row.values[1]} ${fields[metric]}`, row.values[2], "Recorded session average"] });
    }
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
