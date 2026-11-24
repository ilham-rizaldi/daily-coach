import { projectGarminRest } from "./garminForecast.js";
import { duration, jakartaDate, shiftDate } from "./report.js";

const status = value => typeof value === "string" ? value.trim().toLowerCase() : "";

function datedCapture(reading, date, capturedAt) {
  if ((reading?.date || reading?.metricDate || date) !== date) return null;
  const valid = value => {
    const time = Date.parse(value);
    return Number.isFinite(time) && time <= Date.parse(capturedAt) && jakartaDate(new Date(time)) === date;
  };
  if (valid(reading?.observedAt)) return { observedAt: reading.observedAt };
  const window = reading?.observationWindow;
  if (valid(window?.start) && valid(window?.end) && Date.parse(window.start) <= Date.parse(window.end)) {
    return { observationWindow: window };
  }
  return null;
}

function recoverySnapshots(rows, date, current) {
  const recorded = new Map((rows ?? []).map(row => [row.date, row.recoveryTimeMinutes]));
  return Array.from({ length: 7 }, (_, index) => {
    const day = shiftDate(date, index - 6);
    const minutes = day === date ? current : recorded.get(day);
    return { date: day, minutes: Number.isFinite(minutes) && minutes >= 0 ? minutes : null };
  });
}

export function workoutAdvice(report, today) {
  const date = report?.date;
  const wellness = report?.wellness;
  const recovery = wellness?.provenance?.datedRecovery;
  const sameDay = date && (wellness?.date || recovery?.date) === date && (!recovery?.date || recovery.date === date);
  const capture = sameDay ? datedCapture(recovery?.readiness, date, report.capturedAt) : null;
  const source = report?.preview ? "Illustrative recovery" : "Garmin Connect";
  const base = { date, ...capture, source };
  if (!report?.preview && date !== today) return {
    ...base, state: "recheck", title: "Recheck recovery", reason: "Check your latest sleep and readiness before choosing a session. This report shows an earlier reading.",
  };
  if (!capture) return {
    ...base, state: "recheck", title: "Recheck recovery", reason: "Sync your device and check today’s readiness before picking a workout.",
  };

  const readiness = wellness.readiness >= 1 && wellness.readiness <= 100 && Number.isFinite(wellness.readiness) ? wellness.readiness : null;
  const recoveryMinutes = wellness.recoveryTimeMinutes >= 0 && Number.isFinite(wellness.recoveryTimeMinutes)
    ? wellness.recoveryTimeMinutes : null;
  const readinessStatus = status(wellness.readinessStatus);
  const hasHrv = datedCapture(recovery?.hrv, date, report.capturedAt);
  const hrv = hasHrv ? wellness.hrvStatus : null;
  const sleep = datedCapture(recovery?.sleep, date, report.capturedAt) && Number.isFinite(wellness.sleepScore)
    && wellness.sleepScore >= 0 && wellness.sleepScore <= 100 ? wellness.sleepScore : null;
  const nextDate = shiftDate(date, 1);
  const tomorrow = report.coaching?.tomorrow?.date === nextDate ? report.coaching.tomorrow : null;
  const restProjection = tomorrow ? projectGarminRest(report) : null;
  const performance = (report.activities ?? []).filter(row => row.date === date && row.sport === "Ride"
    && row.classification !== "non-training" && !row.planned && Number.isFinite(row.timerSeconds)
    && row.timerSeconds > 0 && Number.isFinite(row.measuredPowerWatts) && Number.isFinite(row.averageHr))
    .sort((a, b) => b.timerSeconds - a.timerSeconds)[0];
  const sleepMinutes = sleep != null && Number.isFinite(wellness.sleepMinutes) && wellness.sleepMinutes > 0
    ? wellness.sleepMinutes : null;
  const sleepNeed = datedCapture(wellness.provenance?.fields?.sleepNeedMinutes, date, report.capturedAt)
    && Number.isFinite(wellness.sleepNeedMinutes) && wellness.sleepNeedMinutes > 0 ? wellness.sleepNeedMinutes : null;
  const restReason = sleepMinutes != null && sleepNeed != null && sleepMinutes < sleepNeed
    ? `You slept ${duration(sleepMinutes * 60)} against a ${duration(sleepNeed * 60)} Garmin sleep need.`
    : readiness != null ? `Garmin recorded readiness at ${readiness}/100.` : "Garmin flagged poor recovery.";
  const signals = {
    tomorrow, restProjection,
    performance: performance ? { seconds: performance.timerSeconds, watts: performance.measuredPowerWatts, hr: performance.averageHr } : null,
    trainingStatus: datedCapture(recovery?.fitness, date, report.capturedAt) ? wellness.trainingStatus : null,
    acuteHigh: datedCapture(wellness.provenance?.currentLoadContext?.acute, date, report.capturedAt)
      && /^high$|^very high$/.test(status(wellness.garminAcuteLoadStatus)),
    readiness, readinessStatus: wellness.readinessStatus, readinessUpdatedAtLocal: wellness.readinessUpdatedAtLocal,
    recoveryMinutes, recoveryStatus: wellness.recoveryTimeStatus,
    recoveryHistory: recoverySnapshots(report.wellnessHistory?.rows, date, recoveryMinutes),
    hrv, hrv7d: hasHrv ? wellness.hrv7dMs : null,
    hrvLow: hasHrv ? wellness.hrvBaselineLowMs ?? wellness.hrvBaselineMs?.[0] : null,
    hrvHigh: hasHrv ? wellness.hrvBaselineHighMs ?? wellness.hrvBaselineMs?.[1] : null,
    sleep, sleepStatus: sleep == null ? null : wellness.sleepScoreStatus,
  };

  if ((readiness !== null && readiness <= 24) || ["poor", "very low"].includes(readinessStatus)) return {
    ...base, ...signals, state: "rest", title: "Rest and reassess",
    reason: `${restReason} Skip structured training and reassess after a fresh recovery check.`,
  };
  if (readiness === null || recoveryMinutes === null) return {
    ...base, ...signals, state: "recheck", title: "Recheck recovery", reason: "Check both readiness and remaining recovery time before choosing your effort.",
  };

  const reasons = [];
  if (readiness < 50 || readinessStatus === "low") reasons.push("Low readiness");
  if (recoveryMinutes > 0) reasons.push("Recovery time remaining");
  if (["low", "poor", "unbalanced"].includes(status(hrv))) reasons.push(`HRV ${status(hrv)}`);
  if (status(wellness.recentSleepScoresStatus) === "poor") reasons.push("Poor recent sleep");
  if (signals.acuteHigh) reasons.push("High acute load");
  if (reasons.length) return {
    ...base, ...signals, state: "easy", title: "Keep it easy",
    reason: `Choose a conversational spin or run–walk. Rest if the warm-up feels unusually hard. Recovery signals include ${reasons.map(reason => reason.toLowerCase()).join(", ")}.`,
  };
  return {
    ...base, ...signals, state: "planned", title: "Review your planned session",
    reason: "Readiness was at least Moderate and the recovery timer was clear. Start gradually and adjust if the warm-up feels harder than usual.",
  };
}
