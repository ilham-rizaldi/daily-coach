import { shiftDate } from "./report.js";
import { rangeFor } from "./pacing.js";

export const PREDICTION_DAYS = 42;
export const HR_CEILING_MIN = 35;
export const HR_CEILING_MAX = 235;
const SIMILAR_EFFORT = 0.15;
const MIN_PAIRED_FRACTION = 0.9;
const MIN_BLOCK_SECONDS = 8 * 60;

export const predictionModes = {
  cycling: { sport: "Ride", label: "Cycling power", field: "powerWatts", unit: "W", defaultValue: 100 },
  running: { sport: "Run", label: "Running pace", field: "paceSecondsPerKm", unit: "/km", defaultValue: 600 },
  runningPower: { sport: "Run", label: "Running power", field: "runningPowerWatts", unit: "W", defaultValue: 180 },
};

const finiteIn = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const validDay = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const values = {
  powerWatts: value => finiteIn(value, 1, 1500),
  paceSecondsPerKm: value => finiteIn(value, 150, 1800),
  runningPowerWatts: value => finiteIn(value, 1, 1000),
};

function effort(mode, value) {
  return mode.field === "paceSecondsPerKm" ? 1000 / value : value;
}

function median(items) {
  const ordered = [...items].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  if (!ordered.length) return null;
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function groupOn(rows, getKey) {
  const groups = new Map();
  for (const row of rows) {
    const key = getKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function dayRepresentative(rows) {
  const midpoint = median(rows.map(row => row.x));
  return rows.reduce((best, row) => Math.abs(row.x - midpoint) < Math.abs(best.x - midpoint) ? row : best);
}

function distance(x, row) {
  return Math.abs(x - row.x);
}

// Each day contributes at most one observation. The effort and recording
// metadata select neighbors. Heart rate never affects which neighbor is used.
function comparisonDays(days, x) {
  const matches = [];
  for (const observations of days.values()) {
    const best = observations.reduce((closest, row) => distance(x, row) < distance(x, closest) ? row : closest);
    if (distance(x, best) <= x * SIMILAR_EFFORT) matches.push(best);
  }
  const choices = matches.sort((a, b) => distance(x, a) - distance(x, b) || b.date.localeCompare(a.date));
  const closest = choices.slice(0, 7);
  // Distinct days can both touch the same wattage or pace exactly.
  return closest.length >= 2 && closest.some(row => row.x <= x) && closest.some(row => row.x >= x) ? closest : [];
}

function eligibleBlock(block, mode, first, last) {
  const value = block?.[mode.field];
  const hr = mode.field === "runningPowerWatts" ? block?.runningPowerHrBpm : block?.hrBpm;
  return block?.sport === mode.sport && validDay(block.date) && block.date >= first && block.date <= last
    && block.activityId && block.source && block.device && ["outdoor", "indoor"].includes(block.environment)
    && finiteIn(block.durationSeconds, MIN_BLOCK_SECONDS, 4 * 3600)
    && finiteIn(block.pairedFraction, MIN_PAIRED_FRACTION, 1)
    && finiteIn(hr, 35, 235) && values[mode.field](value);
}

export function predictionDataset(report, key) {
  const mode = predictionModes[key];
  if (!mode || !validDay(report?.date)) return { groups: [], rows: [], context: [], first: null, last: null };
  const first = shiftDate(report.date, 1 - PREDICTION_DAYS);
  const seed = Array.isArray(report.predictionEvidence?.blocks) ? report.predictionEvidence.blocks : [];
  const seen = new Set();
  const history = seed.filter(block => {
    if (!eligibleBlock(block, mode, "", report.date)) return false;
    const id = JSON.stringify([block.date, block.activityId, block.startSeconds ?? 0]);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map(block => ({ ...block, value: block[mode.field], x: effort(mode, block[mode.field]),
    hrBpm: key === "runningPower" ? block.runningPowerHrBpm : block.hrBpm }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startSeconds ?? 0) - (b.startSeconds ?? 0));
  const rows = history.filter(row => row.date >= first);
  const cohorts = groupOn(history, row => JSON.stringify([row.source, row.device, row.environment, row.conditions || null]));
  const groups = [...cohorts].map(([id, historyRows]) => {
    const { source, device, environment, conditions } = historyRows[0];
    const observations = historyRows.filter(row => row.date >= first);
    return { id, source, device, environment, conditions, historyRows, rows: observations, dates: groupOn(observations, row => row.date).size };
  }).sort((a, b) => b.dates - a.dates || b.historyRows.at(-1).date.localeCompare(a.historyRows.at(-1).date));
  // Whole-session readings are an inspectable reference and never enter the fit.
  const context = (report.activities || []).flatMap(activity => {
    if (activity.sport !== mode.sport || activity.classification === "non-training" || activity.planned
      || !validDay(activity.date) || activity.date > report.date) return [];
    const value = { powerWatts: activity.measuredPowerWatts, paceSecondsPerKm: activity.averagePaceSeconds,
      runningPowerWatts: activity.averageRunningPowerWatts }[mode.field];
    if (!values[mode.field](value) || !finiteIn(activity.averageHr, 35, 235)) return [];
    return [{ date: activity.date, value, hrBpm: activity.averageHr, source: activity.source,
      activityId: activity.externalIds?.garmin ?? activity.externalIds?.intervals ?? activity.externalIds?.strava,
      environment: activity.environment,
      sourceUrl: activity.sourceUrl, durationSeconds: activity.timerSeconds ?? activity.movingSeconds }];
  });
  return { groups, rows, context, first, last: report.date };
}

function chronologicalChecks(days) {
  const earlier = new Map(), checks = [];
  for (const [date, rows] of days) {
    const test = dayRepresentative(rows);
    if (earlier.size >= 3) {
      const matched = comparisonDays(earlier, test.x);
      if (matched.length) {
        const reference = [...earlier.values()].slice(-7).map(day => dayRepresentative(day).hrBpm);
        const outcomes = matched.map(row => row.hrBpm);
        checks.push({
          ...test, estimatedHr: median(outcomes), maxHr: Math.max(...outcomes), baselineHr: median(reference),
        });
      }
    }
    earlier.set(date, rows);
  }
  return checks;
}

function forwardValidation(checks, target) {
  const rows = checks.filter(row => distance(target, row) <= target * SIMILAR_EFFORT);
  const error = key => rows.length ? rows.reduce((sum, row) => sum + Math.abs(row[key] - row.hrBpm), 0) / rows.length : null;
  return { tests: rows.length, meanError: error("estimatedHr"), baselineError: error("baselineHr"), rows };
}

export function predictHeartRate(group, key, value) {
  const mode = predictionModes[key];
  if (!mode || !values[mode.field](value)) {
    return { confidence: "Insufficient", reason: "Enter a valid effort to see an estimate." };
  }
  const days = groupOn(group?.rows || [], row => row.date);
  const x = effort(mode, value);
  const matched = comparisonDays(days, x);
  if (!matched.length) {
    const reason = days.size < 2
      ? "Two comparable steady sessions on different days are needed."
      : "No two nearby days bracket this effort. Try one of the observed efforts.";
    return { confidence: "Insufficient", reason, matched };
  }
  const outcomes = matched.map(row => row.hrBpm);
  const validation = forwardValidation(chronologicalChecks(days), x);
  const range = [Math.min(...outcomes), Math.max(...outcomes)];
  if (validation.tests >= 4 && validation.meanError >= validation.baselineError) {
    return {
      confidence: "Insufficient", reason: "The effort model did not improve on the recent HR median in later sessions.",
      matched, validation, range,
    };
  }
  const confident = validation.tests >= 4 && matched.length >= 3 && validation.meanError <= 8;
  const high = confident && validation.tests >= 8 && matched.length >= 5 && validation.meanError <= 5 && Boolean(group.conditions);
  return {
    bpm: median(outcomes), range, matched, validation, confidence: high ? "High" : confident ? "Medium" : "Low",
    reason: validation.tests < 4 ? "Provisional estimate until more later sessions can test it."
      : !confident ? "Later tests show limited accuracy or few comparable days."
        : !group.conditions ? "Tested on later sessions. Route and weather may differ." : "Tested on later sessions under comparable conditions.",
  };
}

export function predictEffortAtCeiling(group, key, ceiling) {
  const unavailable = reason => ({ confidence: "Insufficient", reason });
  const mode = predictionModes[key];
  if (!mode || !finiteIn(ceiling, HR_CEILING_MIN, HR_CEILING_MAX)) {
    return unavailable(`Enter an HR ceiling from ${HR_CEILING_MIN} to ${HR_CEILING_MAX} bpm.`);
  }
  const rows = group?.rows || [];
  const days = groupOn(rows, row => row.date);
  if (days.size < 2) return unavailable("Two comparable steady sessions on different days are needed.");

  const checks = chronologicalChecks(days).filter(row => row.maxHr <= ceiling);
  const candidates = [...new Map(rows.map(row => [row.x, row])).values()].sort((a, b) => b.x - a.x);
  const supported = [];
  let failed;
  for (const candidate of candidates) {
    if (supported.length && distance(supported[0].x, candidate) > supported[0].x * SIMILAR_EFFORT) break;
    const matched = comparisonDays(days, candidate.x);
    const outcomes = matched.map(row => row.hrBpm);
    if (!matched.length || Math.max(...outcomes) > ceiling) {
      if (supported.length) break;
      continue;
    }
    const later = checks.filter(row => distance(candidate.x, row) <= candidate.x * SIMILAR_EFFORT);
    const overshoots = later.filter(row => row.hrBpm > ceiling).length;
    const validation = { tests: later.length, overshoots, rows: later };
    if (overshoots) {
      failed ||= { matched, validation, range: [Math.min(...outcomes), Math.max(...outcomes)] };
      if (supported.length) break;
      continue;
    }
    const high = later.length >= 8 && matched.length >= 5 && Boolean(group.conditions);
    const medium = later.length >= 4 && matched.length >= 3;
    supported.push({
      x: candidate.x, value: candidate.value, matched, validation,
      range: [Math.min(...outcomes), Math.max(...outcomes)],
      confidence: high ? "High" : medium ? "Medium" : "Low",
    });
  }

  if (!supported.length) return failed
    ? { ...unavailable("Comparable later sessions went over this ceiling."), ...failed }
    : unavailable("No comparable efforts stayed at or below this ceiling across the supporting days.");
  const [highest] = supported;
  const last = supported.at(-1);
  // The endpoints come from adjacent supported observations. The time-ordered
  // checks shown in the result describe the highest intensity in that band.
  const confidence = ["Low", "Medium", "High"].find(level => supported.some(item => item.confidence === level));
  return {
    ...highest, effortRange: [Math.min(highest.value, last.value), Math.max(highest.value, last.value)], confidence,
    reason: confidence === "Low" ? "Provisional target from recorded efforts. Recheck HR as you settle in."
      : "Comparable later sessions stayed within this ceiling. Recheck HR as you settle in.",
  };
}

export function suggestedEffort(report, key, group) {
  const mode = predictionModes[key];
  const sport = mode.sport === "Ride" ? "cycling" : "running";
  const range = rangeFor(report.coaching?.pacing?.[sport]?.[key === "runningPower" ? "powerWatts" : mode.field]);
  const suggested = range ? Math.round((range[0] + range[1]) / 2) : mode.defaultValue;
  if (!group?.rows?.length) return suggested;
  const days = groupOn(group.rows, row => row.date);
  if (comparisonDays(days, effort(mode, suggested)).length) return suggested;
  // Keep the preferred effort unless another measured effort is supported on
  // multiple days. This does not change the report's pacing prescription.
  const nearby = [...group.rows].sort((a, b) => Math.abs(a.value - suggested) - Math.abs(b.value - suggested))
    .find(row => comparisonDays(days, row.x).length);
  return nearby ? nearby.value : suggested;
}

export function parseScenarioPace(value) {
  const match = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

export const EXTENDED_PREDICTION_DAYS = 84;

function blockSourceRank(row) {
  if (row.source === "Garmin original FIT") return 3;
  if (row.source === "Garmin Connect TCX") return 2;
  return 1;
}

export function automaticPredictionDataset(report, key) {
  const mode = predictionModes[key];
  const standard = predictionDataset(report, key);
  if (!mode || !standard.last) return { ...standard, cohort: null };
  const first = shiftDate(report.date, 1 - EXTENDED_PREDICTION_DAYS);
  const sessions = new Map();
  const copies = new Map();
  for (const activity of report.activities ?? []) {
    const ids = activity.externalIds ?? {};
    const key = ids.garmin ?? ids.strava ?? ids.intervals;
    if (!key) continue;
    for (const id of Object.values(ids).filter(Boolean)) {
      copies.set(String(id), String(key));
      sessions.set(String(id), activity);
    }
  }
  const byActivity = new Map();
  for (const block of report.predictionEvidence?.blocks ?? []) {
    const short = finiteIn(block.durationSeconds, 300, MIN_BLOCK_SECONDS - 1) && block.hrWindowSeconds === 180;
    if (!eligibleBlock(short ? { ...block, durationSeconds: MIN_BLOCK_SECONDS } : block, mode, first, report.date)) continue;
    const id = String(block.activityId), activity = sessions.get(id);
    if (activity?.classification === "non-training" || activity?.planned) continue;
    const keyId = copies.get(id) ?? id;
    const bucket = JSON.stringify([block.date, keyId]);
    const sourceRank = blockSourceRank(block);
    const selection = byActivity.get(bucket);
    if (!selection || sourceRank > selection.rank) byActivity.set(bucket, { rank: sourceRank, rows: new Map() });
    const chosen = byActivity.get(bucket);
    if (chosen.rank === sourceRank && !chosen.rows.has(block.startSeconds ?? 0)) chosen.rows.set(block.startSeconds ?? 0, block);
  }
  const history = [...byActivity.values()].flatMap(item => [...item.rows.values()]).map(block => ({
    ...block, value: block[mode.field], x: effort(mode, block[mode.field]),
    hrBpm: key === "runningPower" ? block.runningPowerHrBpm : block.hrBpm,
    peakHrBpm: key === "runningPower" ? block.runningPowerPeakHrBpm : block.peakHrBpm,
  })).sort((a, b) => a.date.localeCompare(b.date) || a.startSeconds - b.startSeconds);
  const profiles = groupOn(history, row => JSON.stringify([row.device, row.environment]));
  const cohorts = [...profiles.values()].map(historyRows => {
    const { device, environment } = historyRows.at(-1);
    const recent = historyRows.filter(row => row.date >= standard.first);
    const recentDays = groupOn(recent, row => row.date).size;
    const conditions = [...new Set(historyRows.map(row => row.conditions))];
    return { device, environment, recent, historyRows, recentDays, dates: groupOn(historyRows, row => row.date).size,
      conditions: conditions.length === 1 ? conditions[0] : null };
  }).sort((a, b) => Number(b.recentDays > 0) - Number(a.recentDays > 0)
      || Number(b.environment === "outdoor") - Number(a.environment === "outdoor")
      || b.recentDays - a.recentDays || b.dates - a.dates);
  const cohort = cohorts[0] ?? null;
  const recorders = new Map((report.baseHistory?.garminNativeRecordings?.files ?? [])
    .map(row => [String(row.activityId), row]));
  const context = standard.context.filter(row => {
    if (row.date < first) return false;
    const recorder = recorders.get(String(row.activityId));
    const environment = recorder?.date === row.date ? recorder.environment : row.environment;
    return cohort ? environment === cohort.environment && (!recorder || recorder.device === cohort.device)
      : environment === "outdoor";
  });
  return { ...standard, first, cohort, context };
}

const isShort = row => row.durationSeconds < MIN_BLOCK_SECONDS;
const withoutForecast = reason => ({ confidence: "Insufficient", reason });

function evidenceLevels(cohort) {
  if (!cohort) return [];
  return [cohort.recent.filter(row => !isShort(row)), cohort.recent, cohort.historyRows];
}

export function automaticHeartRate(data, key, value) {
  const mode = predictionModes[key];
  if (!mode || !values[mode.field](value)) return withoutForecast("Enter a valid effort to see an estimate.");
  const { cohort } = data;
  for (const [index, rows] of evidenceLevels(cohort).entries()) {
    const result = predictHeartRate({ ...cohort, rows }, key, value);
    if (Number.isFinite(result.bpm)) {
      if (index === 0) return { ...result, kind: "estimate", method: "Recent steady blocks" };
      return { ...result, kind: "estimate", confidence: "Low",
        method: index === 1 ? "Recent steady blocks including shorter efforts" : "Extended steady-block history",
        reason: "Provisional estimate from a wider set of recorded efforts." };
    }
    if (result.validation?.tests >= 4 && result.matched?.length && result.range) {
      return { ...result, bpm: median(result.matched.map(row => row.hrBpm)), kind: "reference",
        method: "Matched HR median", reason: "Later tests favored a simple historical reference." };
    }
  }
  const target = effort(mode, value);
  const nearby = (rows, limit) => rows.filter(row => Math.abs(row.x - target) <= target * limit);
  const sessionDays = groupOn(nearby(data.context.map(row => ({ ...row, x: effort(mode, row.value) })), SIMILAR_EFFORT),
    row => row.date);
  const sessionMatches = [...sessionDays.values()].map(rows => rows.reduce((best, row) =>
    distance(target, row) < distance(target, best) ? row : best));
  if (sessionMatches.length >= 2) {
    const hr = sessionMatches.map(row => row.hrBpm);
    return { kind: "reference", bpm: median(hr), confidence: "Insufficient", range: [Math.min(...hr), Math.max(...hr)],
      matched: sessionMatches, method: "Whole-session averages", reason: "Similar session averages show how HR varied over the full workout." };
  }
  const raw = nearby(cohort?.historyRows ?? [], 0.1).sort((a, b) =>
    distance(target, a) - distance(target, b) || b.date.localeCompare(a.date));
  if (raw[0]) return { kind: "reference", bpm: raw[0].hrBpm, confidence: "Insufficient", matched: [raw[0]],
    method: "Nearest recorded steady effort", reason: "One similar recording gives a reference for your requested effort." };
  return withoutForecast("No comparable recorded efforts near this input.");
}

export function automaticCeiling(data, key, ceiling) {
  if (!predictionModes[key] || !finiteIn(ceiling, HR_CEILING_MIN, HR_CEILING_MAX)) {
    return withoutForecast(`Enter an HR ceiling from ${HR_CEILING_MIN} to ${HR_CEILING_MAX} bpm.`);
  }
  const { cohort } = data;
  const peaks = (cohort?.historyRows ?? []).filter(row =>
    finiteIn(row.peakHrBpm, 35, 235) && row.peakHrBpm >= row.hrBpm);
  const atSimilarEffort = (candidate, row) => distance(candidate.x, row) <= candidate.x * 0.08;
  const corroborated = candidate => peaks.every(row => !atSimilarEffort(candidate, row) || row.peakHrBpm <= ceiling);
  for (const [index, rows] of evidenceLevels(cohort).entries()) {
    const pool = rows.filter(row => peaks.includes(row)).map(row => ({ ...row, hrBpm: row.peakHrBpm }));
    const result = predictEffortAtCeiling({ ...cohort, rows: pool }, key, ceiling);
    if (result.effortRange && result.effortRange.every(value =>
      corroborated({ x: effort(predictionModes[key], value) }))) {
      return { ...result, kind: "estimate", method: "Measured peak HR across steady blocks",
        confidence: index === 0 ? result.confidence : "Low",
        reason: "A provisional range supported by measured peaks. Check HR as you settle in." };
    }
  }
  const reference = peaks.filter(row => row.peakHrBpm <= ceiling && corroborated(row))
    .sort((a, b) => b.date.localeCompare(a.date) || b.x - a.x)[0];
  if (reference) return { kind: "reference", value: reference.value, range: [reference.peakHrBpm, reference.peakHrBpm],
    confidence: "Insufficient", matched: [reference], method: "Observed effort and peak HR",
    reason: "A recorded example under this ceiling. More comparable days are needed for a pacing target." };
  const example = peaks.filter(row => row.peakHrBpm <= ceiling)
    .sort((a, b) => b.date.localeCompare(a.date) || b.x - a.x)[0];
  if (example) return { kind: "reference", value: example.value, range: [example.peakHrBpm, example.peakHrBpm],
    confidence: "Insufficient", matched: [example], method: "Observed effort and peak HR",
    reason: "This block stayed under the ceiling. Other similar blocks exceeded it." };
  return withoutForecast("No measured steady-block peaks support this ceiling.");
}
