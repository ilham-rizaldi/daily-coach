import assert from "node:assert/strict";
import test from "node:test";
import { shiftDate } from "../src/report.js";
import { parseScenarioPace, predictEffortAtCeiling, predictHeartRate, predictionDataset } from "../src/prediction.js";

const end = "2026-04-25";
const ride = (date, watts, hr, extra = {}) => ({
  date, activityId: date, startSeconds: 300, source: "Test recording", device: "Bike",
  environment: "outdoor", powerWatts: watts, hrBpm: hr, durationSeconds: 480,
  pairedFraction: 0.98, sport: "Ride", ...extra,
});
const groupFor = (rows, key = "cycling") => predictionDataset({ date: end, predictionEvidence: { blocks: rows } }, key).groups[0];

test("only verified paired blocks count, with one observation per day and no extrapolation", () => {
  const first = shiftDate(end, -2);
  const rows = [
    ride(first, 100, 115), ride(first, 102, 119, { startSeconds: 810 }),
    ride(first, 102, 119, { startSeconds: 810 }),
    ride(end, 109, 129), ride(end, 90, 50, { startSeconds: 810, pairedFraction: 0.89 }),
    ride(shiftDate(end, 1), 102, 135), ride(shiftDate(end, -42), 100, 164),
    ride(end, 113, 80, { startSeconds: 1100, environment: "indoor" }),
  ];
  const group = groupFor(rows);
  assert.equal(group.rows.length, 3);
  const prediction = predictHeartRate(group, "cycling", 105);
  assert.equal(prediction.bpm, 124);
  assert.equal(prediction.confidence, "Low");
  assert.equal(prediction.matched.length, 2);
  assert.deepEqual(prediction.range, [119, 129]);
  assert.equal(predictHeartRate(group, "cycling", 115).bpm, undefined);
  assert.equal(predictHeartRate(groupFor(rows.slice(0, 2)), "cycling", 101).confidence, "Insufficient");
});

test("chronological checks withhold an effort estimate when it fails the simple HR benchmark", () => {
  const flat = Array.from({ length: 10 }, (_, index) => ride(shiftDate(end, index - 10), 100, 130));
  const forecast = predictHeartRate(groupFor(flat), "cycling", 100);
  assert.equal(forecast.confidence, "Insufficient");
  assert.equal(forecast.bpm, undefined);
  assert.equal(forecast.validation.tests, 7);
  assert.equal(forecast.validation.baselineError, 0);
});

test("running pace and watch power each use their paired measurements", () => {
  const runs = [ride(shiftDate(end, -3), 100, 120), ride(end, 100, 140)].map((row, index) => ({
    ...row, device: "Watch", sport: "Run", paceSecondsPerKm: 500 + index * 20,
    runningPowerWatts: 180 + index * 20, runningPowerHrBpm: 125 + index * 20,
  }));
  assert.equal(parseScenarioPace("8:30"), 510);
  assert.ok(Number.isNaN(parseScenarioPace("8:60")));
  assert.equal(predictHeartRate(groupFor(runs, "running"), "running", 510).bpm, 130);
  assert.equal(predictHeartRate(groupFor(runs, "runningPower"), "runningPower", 190).bpm, 135);
});

test("recorded older blocks remain visible in history and cannot support a current prediction", () => {
  const history = [ride(shiftDate(end, -50), 105, 120), ride(end, 105, 123)];
  const group = groupFor(history);
  assert.equal(group.historyRows.length, 2);
  assert.equal(group.dates, 1);
  assert.equal(predictHeartRate(group, "cycling", 105).confidence, "Insufficient");
  assert.equal(predictEffortAtCeiling(group, "cycling", 140).effortRange, undefined);
});

test("ceilings return supported cycling watts and running pace only within observed effort", () => {
  const blocks = [ride(shiftDate(end, -3), 100, 118), ride(end, 110, 130)];
  const group = groupFor(blocks);
  const target = predictEffortAtCeiling(group, "cycling", 135);
  assert.deepEqual(target.effortRange, [100, 110]);
  assert.deepEqual(target.range, [118, 130]);
  assert.equal(target.confidence, "Low");
  assert.equal(target.validation.tests, 0);
  assert.equal(predictEffortAtCeiling(group, "cycling", 129).effortRange, undefined);
  assert.equal(predictEffortAtCeiling(group, "cycling", NaN).confidence, "Insufficient");

  const run = groupFor(blocks.map((block, index) => ({ ...block, sport: "Run", paceSecondsPerKm: 545 - index * 20 })), "running");
  const pace = predictEffortAtCeiling(run, "running", 135);
  assert.deepEqual(pace.effortRange, [525, 545]);
  assert.equal(pace.value, 525);
});

test("ceiling targets require independent days and are withheld after a later overshoot", () => {
  const bpm = [118, 119, 120, 130, 120, 120, 120, 120, 120, 120, 120];
  const blocks = bpm.map((hr, index) => ride(shiftDate(end, index - bpm.length + 1), 100, hr));
  const atRisk = predictEffortAtCeiling(groupFor(blocks), "cycling", 125);
  assert.equal(atRisk.effortRange, undefined);
  assert.equal(atRisk.confidence, "Insufficient");
  assert.equal(atRisk.validation.overshoots, 1);
  assert.equal(predictEffortAtCeiling(groupFor([ride(end, 100, 120), ride(end, 105, 120, { startSeconds: 900 })]),
    "cycling", 125).confidence, "Insufficient");

  const tested = predictEffortAtCeiling(groupFor(blocks.filter(row => row.hrBpm < 125)), "cycling", 125);
  assert.equal(tested.confidence, "Medium");
  assert.equal(tested.validation.overshoots, 0);
  assert.equal(tested.validation.tests, 7);
});
