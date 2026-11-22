import { shiftDate } from "./report.js";
import { rangeFor } from "./pacing.js";

export const PREDICTION_DAYS = 42;
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
  const rows = seed.filter(block => {
    if (!eligibleBlock(block, mode, first, report.date)) return false;
    const id = JSON.stringify([block.date, block.activityId, block.startSeconds ?? 0]);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map(block => ({ ...block, value: block[mode.field], x: effort(mode, block[mode.field]),
    hrBpm: key === "runningPower" ? block.runningPowerHrBpm : block.hrBpm }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startSeconds ?? 0) - (b.startSeconds ?? 0));
  const cohorts = groupOn(rows, row => JSON.stringify([row.source, row.device, row.environment, row.conditions || null]));
  const groups = [...cohorts].map(([id, observations]) => {
    const { source, device, environment, conditions } = observations[0];
    return { id, source, device, environment, conditions, rows: observations, dates: groupOn(observations, row => row.date).size };
  }).sort((a, b) => b.dates - a.dates || b.rows.at(-1).date.localeCompare(a.rows.at(-1).date));
  // Whole-session readings are an inspectable reference and never enter the fit.
  const context = (report.activities || []).flatMap(activity => {
    if (activity.sport !== mode.sport || activity.classification === "non-training" || activity.planned
      || !validDay(activity.date) || activity.date < first || activity.date > report.date) return [];
    const value = { powerWatts: activity.measuredPowerWatts, paceSecondsPerKm: activity.averagePaceSeconds,
      runningPowerWatts: activity.averageRunningPowerWatts }[mode.field];
    if (!values[mode.field](value) || !finiteIn(activity.averageHr, 35, 235)) return [];
    return [{ date: activity.date, value, hrBpm: activity.averageHr, source: activity.source,
      sourceUrl: activity.sourceUrl, durationSeconds: activity.timerSeconds ?? activity.movingSeconds }];
  });
  return { groups, rows, context, first, last: report.date };
}

function chronologicalErrors(days, target) {
  const earlier = new Map(), errors = [];
  for (const [date, rows] of days) {
    const test = dayRepresentative(rows);
    if (earlier.size >= 3 && distance(target, test) <= target * SIMILAR_EFFORT) {
      const matched = comparisonDays(earlier, test.x);
      if (matched.length) {
        const reference = [...earlier.values()].slice(-7).map(day => dayRepresentative(day).hrBpm);
        errors.push({
          error: Math.abs(median(matched.map(row => row.hrBpm)) - test.hrBpm),
          baselineError: Math.abs(median(reference) - test.hrBpm),
        });
      }
    }
    earlier.set(date, rows);
  }
  const mean = key => errors.length ? errors.reduce((sum, row) => sum + row[key], 0) / errors.length : null;
  return { tests: errors.length, meanError: mean("error"), baselineError: mean("baselineError") };
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
  const validation = chronologicalErrors(days, x);
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
