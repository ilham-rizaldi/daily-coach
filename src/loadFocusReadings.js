import { rangeFor, targetEvidence } from "./pacing.js";
import { inPredictionDuration, predictionDataset, predictionDurations } from "./prediction.js";

const nativeFit = "Garmin original FIT";
const recordedSource = "Garmin Connect";
const steadyDuration = predictionDurations.find(band => band.id === "steady");
const validDay = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const within = (value, low, high) => Number.isFinite(value) && value >= low && value <= high;

function benefitBucket(label) {
  const benefit = typeof label === "string" ? label.trim().toLowerCase() : "";
  if (!benefit) return null;
  if (/\(low aerobic\)$|^(recovery|base|low aerobic)$/.test(benefit)) return "lowAerobic";
  if (/\(high aerobic\)$|^(tempo|threshold|vo[₂2] max|high aerobic)$/.test(benefit)) return "highAerobic";
  if (/\(anaerobic\)$|^(anaerobic|anaerobic capacity|sprint)$/.test(benefit)) return "anaerobic";
  return "other";
}

function easyCeiling(plan, end) {
  const evidence = targetEvidence(plan?.evidence?.hrBpm);
  const range = rangeFor(plan?.hrBpm);
  if (!range || !validDay(evidence?.date) || evidence.date > end || !within(plan.hrCeiling, range[1], 235)) return null;
  return { average: range[1], peak: plan.hrCeiling };
}

function summarize(rows, scope) {
  const values = key => {
    const entries = rows.map(row => row[key]).filter(Number.isFinite);
    return entries.length ? [Math.min(...entries), Math.max(...entries)] : null;
  };
  const first = rows[0], last = rows.at(-1);
  return {
    scope, rows, value: values("value"), hr: values("hrBpm"), source: first.source,
    first: first.date, last: last.date, environment: first.environment,
  };
}

function bestPerDay(rows, sport) {
  const days = new Map();
  for (const row of rows) {
    const old = days.get(row.date);
    if (!old || (sport === "cycling" ? row.value > old.value : row.value < old.value)) days.set(row.date, row);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function bestCohort(cohorts) {
  return cohorts.filter(rows => rows.length)
    .sort((a, b) => b.length - a.length || b.at(-1).date.localeCompare(a.at(-1).date))[0];
}

export function loadFocusReadings(report, start, end) {
  if (!validDay(start) || !validDay(end) || !validDay(report?.date) || start > end || end > report.date) return {};
  const inWindow = date => validDay(date) && start <= date && date <= end;
  const identity = (sport, date, id) => JSON.stringify([sport, date, String(id)]);
  const activities = new Map();
  const blocked = new Set();
  for (const activity of report.activities || []) {
    const id = activity?.externalIds?.garmin;
    if (!id || !inWindow(activity.date)) continue;
    const key = identity(activity.sport, activity.date, id);
    if (activity.classification === "non-training" || activity.planned) {
      blocked.add(key);
      continue;
    }
    const source = activity.provenance?.fields?.garminPrimaryBenefit?.source || activity.provenance?.garmin?.source || activity.source;
    const bucket = source === recordedSource ? benefitBucket(activity.garminPrimaryBenefit) : null;
    const existing = activities.get(key);
    if (existing?.bucket && bucket && existing.bucket !== bucket) blocked.add(key);
    if (!existing?.bucket) activities.set(key, { activity, bucket });
  }
  const result = { lowAerobic: {}, highAerobic: {}, anaerobic: {} };
  for (const sport of ["cycling", "running"]) {
    const ceiling = easyCeiling(report.coaching?.pacing?.[sport], end);
    const { groups } = predictionDataset(report, sport);
    const nativeGroups = groups.filter(group => group.source === nativeFit).map(group => group.historyRows.flatMap(row => {
      const key = identity(row.sport, row.date, row.activityId);
      if (!inWindow(row.date) || blocked.has(key) || !inPredictionDuration(row, steadyDuration)) return [];
      return [{ ...row, bucket: activities.get(key)?.bucket ?? null }];
    }));
    const high = bestCohort(nativeGroups.map(rows => bestPerDay(rows.filter(row => row.bucket === "highAerobic"), sport)));
    if (high) result.highAerobic[sport] = summarize(high, "steady");
    const easy = row => ceiling && row.hrBpm <= ceiling.average && within(row.peakHrBpm, row.hrBpm, ceiling.peak);
    const low = bestCohort(nativeGroups.map(rows => bestPerDay(rows.filter(row => row.bucket === "lowAerobic" && easy(row)), sport)));
    const easyMatch = low ? null : bestCohort(nativeGroups.map(rows => bestPerDay(rows.filter(row => row.bucket == null && easy(row)), sport)));
    if (low || easyMatch) result.lowAerobic[sport] = summarize(low || easyMatch, low ? "steady" : "easy-match");

    const shortGroups = new Map();
    for (const workout of report.benchmarks?.workouts || []) {
      if (workout?.source !== recordedSource || !inWindow(workout.date) || !workout.activityId) continue;
      const key = identity(sport === "cycling" ? "Ride" : "Run", workout.date, workout.activityId);
      const entry = activities.get(key);
      if (blocked.has(key) || entry?.bucket !== "anaerobic") continue;
      const environment = entry.activity.environment || null;
      if (!shortGroups.has(environment)) shortGroups.set(environment, []);
      for (const rep of workout.intervals || []) {
        if (rep?.classification !== "work" || !within(rep.seconds, 10, 120)) continue;
        const value = sport === "cycling" ? rep.averagePowerWatts : rep.averagePaceSeconds;
        if (!(sport === "cycling" ? within(value, 1, 1500) : within(value, 120, 1800))) continue;
        shortGroups.get(environment).push({
          date: workout.date, durationSeconds: rep.seconds, value, environment, source: workout.source,
          sourceUrl: workout.sourceUrl, hrBpm: within(rep.averageHr, 35, 235) ? rep.averageHr : null,
        });
      }
    }
    const short = bestCohort([...shortGroups.values()].map(rows => bestPerDay(rows, sport)));
    if (short) result.anaerobic[sport] = summarize(short, "short-rep");
  }
  return result;
}
