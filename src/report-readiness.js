import { jakartaDate, shiftDate } from "./report.js";

const providers = ["Garmin Connect", "Intervals.icu", "Strava"];
const capturedStatuses = new Set(["captured", "complete", "verified"]);
const recordStatuses = new Set(["accepted", "confirmed", "current", "recorded", "verified", "official"]);
const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === "string" ? value.trim() : "";
const present = value => Boolean(text(value)) && !/^(?:unavailable|unknown|not (?:recorded|captured|measured|available)|n\/?a|[-–—]+)$/i.test(text(value));
const positive = value => Number.isFinite(value) && value > 0;
const nonnegative = value => Number.isFinite(value) && value >= 0;
const percentage = value => nonnegative(value) && value <= 100;
const observed = entry => entry?.observedAt ?? entry?.observationWindow?.end;
const calendarDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;
const observationDay = value => /T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value ?? "") && Number.isFinite(Date.parse(value))
  ? jakartaDate(new Date(value)) : "";
const dateOf = entry => entry?.metricDate ?? entry?.measurementDate ?? entry?.date;
const identifier = value => present(value) || positive(value);
const activityIds = row => Object.values(row.externalIds ?? {}).filter(identifier).map(String);
const recordedSpeed = row => positive(row.averageSpeedKph) || (row.distanceKind === "recorded" && positive(row.distanceKm)
  && (positive(row.timerSeconds) || positive(row.providerMovingSeconds)));
const boundedWellnessFields = new Set(["sleepScore", "averageSpo2", "lowestSpo2", "readiness", "bodyBattery", "bodyBatteryDailyLow", "bodyBatteryDailyHigh", "heatAcclimationPercent"]);

const recoveryGroups = [
  ["sleep", "Sleep duration, score, stages, timing and overnight vitals", [
    "sleepMinutes", "sleepScore", "deepSleepMinutes", "lightSleepMinutes", "remSleepMinutes", "awakeMinutes", "restlessMoments",
    "averageOvernightHr", "averageSpo2", "lowestSpo2", "averageRespiration", "minimumRespiration",
  ], ["bedTimeLocal", "wakeTimeLocal"]],
  ["heartRate", "Resting HR, 7-day resting HR and daily high HR", ["restingHr", "restingHr7d", "highHr"], []],
  ["hrv", "Overnight HRV, 7-day HRV and baseline", ["rawHrvMs", "hrv7dMs", "hrvBaselineLowMs", "hrvBaselineHighMs", "highest5MinuteHrvMs"], ["hrvStatus"]],
  ["readiness", "Training readiness score and recovery time", ["readiness", "recoveryTimeMinutes"], ["readinessStatus", "readinessUpdatedAtLocal", "recoveryTimeStatus"]],
  ["bodyBattery", "Body Battery current, daily range and charge/drain", ["bodyBattery", "bodyBatteryDailyLow", "bodyBatteryDailyHigh", "bodyBatteryCharged", "bodyBatteryDrained"], []],
  ["fitness", "Training status, recent stress/sleep and heat acclimation", ["heatAcclimationPercent"], [
    "trainingStatus", "trainingStatusSince", "recentStressStatus", "recentSleepScoresStatus", "heatAcclimationTrend",
  ]],
];

export function captureReadinessIssues(report) {
  const date = report?.date;
  if (!calendarDay(date) || report.preview) return [{ source: "Report", fields: ["Dated personal source capture"] }];
  const issues = new Map();
  const require = (source, field, passed) => {
    if (!passed) issues.set(source, [...(issues.get(source) ?? []), field]);
  };
  const captureTime = Date.parse(report.capturedAt);
  const checked = value => observationDay(value) >= date && Date.parse(value) <= captureTime;
  const currentReading = entry => dateOf(entry) === date && checked(observed(entry));
  const historical = value => calendarDay(value) && value <= date;
  require("Report", "Report capture time", checked(report.capturedAt));

  for (const provider of providers) {
    const source = list(report.sources).find(row => row?.name === provider);
    const unresolvedFollowup = Date.parse(observed(source?.followup)) > Date.parse(observed(source))
      && !capturedStatuses.has(text(source.followup.status).toLowerCase());
    require(provider, "Complete authenticated source capture", capturedStatuses.has(text(source?.status).toLowerCase())
      && checked(observed(source)) && !unresolvedFollowup);
    require(provider, "Verified activity coverage through the report date", source?.activityCoverage?.complete === true
      && calendarDay(source.activityCoverage.start) && source.activityCoverage.start <= shiftDate(date, -1)
      && checked(source.activityCoverage.through) && checked(source.frontierCheckedAt)
      && Date.parse(source.activityCoverage.through) <= Date.parse(source.frontierCheckedAt));
  }
  const activities = list(report.activities);
  const today = activities.filter(row => row?.date === date);
  require("Activities", "42 completed days and current-day reconciliation", report.coverage?.complete === true
    && calendarDay(report.coverage.start) && report.coverage.start <= shiftDate(date, -42)
    && calendarDay(report.coverage.end) && report.coverage.end >= shiftDate(date, -1)
    && checked(observed(report.frontierCheck)));
  require("Activities", "Current-day provider IDs, start times, timer and metric provenance", today.every(row =>
    activityIds(row).length > 0 && observationDay(row.startedAt) === date
    && positive(row.timerSeconds) && Number.isFinite(row.elapsedSeconds) && row.elapsedSeconds >= row.timerSeconds
    && providers.includes(row.source) && Object.keys(row.provenance ?? {}).length > 0));

  const wellness = report.wellness ?? {};
  const recovery = wellness.provenance?.datedRecovery ?? {};
  for (const [group, label, numbers, descriptions] of recoveryGroups) {
    require("Garmin Connect", label, wellness.date === date && currentReading(recovery[group])
      && numbers.every(field => (boundedWellnessFields.has(field) ? percentage : nonnegative)(wellness[field]))
      && descriptions.every(field => present(wellness[field])));
  }
  const recoveryHistory = report.wellnessHistory;
  const priorDays = new Set(list(recoveryHistory?.rows).filter(row => historical(row?.date) && row.date < date && positive(row.rhrBpm)).map(row => row.date));
  const dailyRecovery = list(recoveryHistory?.rows).find(row => row?.date === date);
  const sleepNeedEvidence = dailyRecovery?.provenance?.sleepNeedMinutes;
  require("Garmin Connect", "Dated recovery history and same-night sleep need", present(recoveryHistory?.source) && priorDays.size >= 7
    && positive(dailyRecovery?.sleepNeedMinutes) && positive(dailyRecovery?.sleepMinutes) && positive(dailyRecovery?.hrvMs)
    && positive(dailyRecovery?.rhrBpm) && percentage(dailyRecovery?.bodyBatteryHigh) && percentage(dailyRecovery?.bodyBatteryLow)
    && checked(observed(sleepNeedEvidence) ?? sleepNeedEvidence?.capturedAt));

  const load = wellness.provenance?.currentLoadContext ?? {};
  for (const [key, field, label] of [
    ["acute", "garminAcuteLoad", "Dated acute load"],
    ["chronic", "garminChronicLoad", "Dated chronic load"],
    ["ratio", "garminLoadRatio", "Dated acute/chronic load ratio"],
  ]) {
    require("Garmin Connect", label, currentReading(load[key]) && nonnegative(wellness[field]));
  }
  const loadHistory = report.garminLoadHistory;
  const datedLoads = list(loadHistory?.rows).filter(row => historical(row?.date) && nonnegative(row.acute) && nonnegative(row.chronic));
  require("Garmin Connect", "Dated acute/chronic load history through the report date", checked(observed(loadHistory))
    && present(loadHistory?.sourceUrl) && new Set(datedLoads.map(row => row.date)).size >= 2
    && datedLoads.some(row => row.date === date && row.acute === wellness.garminAcuteLoad && row.chronic === wellness.garminChronicLoad));
  const focus = report.trainingMix?.garminLoadFocus;
  require("Garmin Connect", "Current Load Focus window", historical(focus?.start) && focus?.end === date && checked(observed(focus)) && present(focus?.sourceUrl));
  for (const [key, label] of [["lowAerobic", "Low aerobic"], ["highAerobic", "High aerobic"], ["anaerobic", "Anaerobic"]]) {
    const row = list(focus?.buckets).find(bucket => bucket?.key === key);
    require("Garmin Connect", `${label} Load Focus points and target range`, nonnegative(row?.points) && nonnegative(row?.targetLow)
      && nonnegative(row?.targetHigh) && row.targetHigh >= row.targetLow);
  }

  const intervals = report.intervals ?? {};
  require("Intervals.icu", "Dated actual CTL, ATL and TSB", intervals.date === date && dateOf(intervals.provenance) === date
    && intervals.provenance?.state === "actual" && checked(observed(intervals.provenance))
    && nonnegative(intervals.fitness) && nonnegative(intervals.fatigue) && Number.isFinite(intervals.form));
  const settings = intervals.settings;
  require("Intervals.icu", "Verified ride, run and strength contribution settings", checked(observed(settings))
    && ["Ride", "Run", "WeightTraining"].every(sport => {
      const weights = settings?.activityTypeWeights?.[sport];
      return nonnegative(weights?.fitnessPercent) && nonnegative(weights?.fatiguePercent);
    }));
  require("Intervals.icu", "Verified CTL and ATL time constants", checked(observed(settings))
    && [settings?.timeConstants?.fitnessDays, settings?.timeConstants?.fatigueDays].every(days => Number.isFinite(days) && days >= 1 && days <= 365));
  const workouts = list(report.benchmarks?.workouts);
  const confirmedUnmeasured = (activity, field) => {
    const evidence = activity.measurementChecks?.[field];
    return evidence?.status === "not-measured" && providers.includes(evidence.source) && currentReading(evidence);
  };
  for (const sport of ["Ride", "Run"]) {
    const sportActivities = activities.filter(row => row?.sport === sport && historical(row.date) && row.classification !== "non-training" && !row.planned);
    const currentSportActivities = sportActivities.filter(row => row.date === date);
    const latestSportDay = sportActivities.map(row => row.date).sort().at(-1);
    const speedRows = sportActivities.filter(recordedSpeed);
    require("Activities", `${sport} average speed or pace progression`, new Set(speedRows.map(row => row.date)).size >= 2
      && speedRows.some(row => row.date === latestSportDay));
    require("Activities", `Current ${sport.toLowerCase()} distance, speed or pace, HR, load and laps`, currentSportActivities.every(row => {
      const hasRecordedLaps = Number.isInteger(row.laps) && row.laps > 0 && workouts.some(workout => workout?.date === date
        && providers.includes(workout.source) && activityIds(row).includes(String(workout.activityId))
        && list(workout.intervals).length === row.laps && workout.intervals.every(interval => positive(interval?.seconds)));
      return positive(row.distanceKm) && recordedSpeed(row) && positive(row.averageHr) && positive(row.maxHr) && row.maxHr >= row.averageHr
        && (nonnegative(row.intervalsLoad) || nonnegative(row.intervalsListLoad))
        && (hasRecordedLaps || row.laps === 0 && confirmedUnmeasured(row, "laps"));
    }));
    require("Activities", `Current ${sport.toLowerCase()} cadence and power source check`, currentSportActivities.every(row => {
      const cadence = sport === "Run" ? row.averageRunCadence : row.averageCadenceRpm ?? row.averageBikeCadenceRpm;
      const power = sport === "Run" ? row.averageRunningPowerWatts : row.measuredPowerWatts ?? row.averagePowerWatts ?? row.averageCyclingPowerWatts;
      return (positive(cadence) || confirmedUnmeasured(row, "cadence")) && (positive(power) || confirmedUnmeasured(row, "power"));
    }));
    const zones = list(report.trainingMix?.heartRateZones).filter(row => row?.sport === sport && historical(row.date)
      && present(row.source) && row.activityId != null && /^[Zz]?[1-7]$/.test(row.zone ?? "") && positive(row.seconds));
    require("Intervals.icu", `${sport} HR time in zones`, zones.length > 0 && currentSportActivities.every(row =>
      zones.some(zone => zone.date === date && activityIds(row).includes(String(zone.activityId)))));
  }

  const performance = report.performance;
  require("Performance", "Current verification of dated PR and VO₂ max history", checked(performance?.captureCutoffAt ?? observed(performance)));
  require("Performance", "Provider-confirmed personal records", list(performance?.records).some(row => historical(row?.date)
    && present(row.source) && present(row.label) && present(row.unit) && recordStatuses.has(text(row.status).toLowerCase())
    && (positive(row.value) || /\d/.test(text(row.value)))));
  const vo2 = list(performance?.vo2History).filter(row => historical(row?.precision === "month" ? `${text(row.date).slice(0, 7)}-01` : row?.date)
    && present(row.source) && present(row.sport) && positive(row.value));
  require("Performance", "Dated VO₂ max trend", vo2.some(row => vo2.some(previous => previous.source === row.source
    && previous.sport === row.sport && previous.date !== row.date)));
  require("Performance", "Verified segment efforts and workout lap or interval details", list(report.benchmarks?.segments).some(row => historical(row?.date)
    && present(row.source) && row.segmentId != null && positive(row.elapsedSeconds)) && workouts.some(row => historical(row?.date)
    && present(row.source) && row.activityId != null && list(row.intervals).some(interval => positive(interval?.seconds))));
  return Array.from(issues, ([source, fields]) => ({ source, fields }));
}

export function reportReadinessIssues(report) {
  const issues = captureReadinessIssues(report);
  if (issues.length) return issues;
  const plan = report.coaching?.actionPlan;
  const hasCoaching = present(plan?.title) && list(plan?.why).some(present)
    && list(plan?.sections).some(section => list(section?.items).some(present)) && list(plan?.referenceIds).length > 0
    && plan.referenceIds.every(id => list(report.coaching?.research).some(row => row?.id === id && present(row.citation) && present(row.url)));
  return hasCoaching ? [] : [{ source: "Coaching", fields: ["Action plan, data signals and linked research"] }];
}

export function assertReportReady(report) {
  const issues = reportReadinessIssues(report);
  if (issues.length) throw new Error(`Report blocked. Complete the missing capture before preparing a report.\n${issues.map(({ source, fields }) => `- ${source}: ${fields.join("; ")}`).join("\n")}`);
}
