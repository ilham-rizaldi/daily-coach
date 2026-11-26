import assert from "node:assert/strict";
import test from "node:test";
import { shiftDate } from "../src/report.js";
import { automaticCeiling, automaticHeartRate, automaticPredictionDataset, parseScenarioPace, predictEffortAtCeiling, predictHeartRate, predictionAudit, predictionDataset, predictionDurations } from "../src/prediction.js";

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

test("automatic prediction uses shorter verified blocks without counting linked exports twice", () => {
  const first = shiftDate(end, -2);
  const report = { date: end, activities: [{ externalIds: { garmin: "g1", intervals: "i1" } }],
    predictionEvidence: { blocks: [
      ride(first, 90, 120, { activityId: "g1", source: "Garmin original FIT" }),
      ride(first, 91, 120, { activityId: "i1", source: "Intervals.icu FIT" }),
      ride(end, 98, 140, { durationSeconds: 300, hrWindowSeconds: 180 }),
      ride(end, 102, 99, { durationSeconds: 300, startSeconds: 900, hrWindowSeconds: 60 }),
      ride(end, 95, 65, { durationSeconds: 360, hrWindowSeconds: 180, startSeconds: 330, environment: "indoor" }),
    ] } };
  const data = automaticPredictionDataset(report, "cycling");
  assert.equal(data.cohort.historyRows.length, 2);
  assert.equal(data.cohort.environment, "outdoor");
  const forecast = automaticHeartRate(data, "cycling", 95);
  assert.equal(forecast.bpm, 130);
  assert.equal(forecast.confidence, "Low");
  assert.equal(forecast.kind, "estimate");
});

test("an observed ceiling example uses measured peaks and stays a reference on one day", () => {
  const first = shiftDate(end, -2);
  const withBlocks = blocks => automaticPredictionDataset({ date: end, predictionEvidence: { blocks } }, "cycling");
  const firstBlock = ride(first, 90, 115, { peakHrBpm: 128 });
  const next = ride(end, 90, 118, { peakHrBpm: 152 });
  const cap = automaticCeiling(withBlocks([firstBlock, next]), "cycling", 140);
  assert.equal(cap.kind, "reference");
  assert.equal(cap.value, 90);
  assert.deepEqual(cap.range, [128, 128]);
  assert.equal(cap.effortRange, undefined);
  assert.match(cap.reason, /similar blocks exceeded/);
  assert.equal(automaticCeiling(withBlocks([ride(end, 90, 115)]), "cycling", 140).value, undefined);
  assert.equal(automaticCeiling(withBlocks([firstBlock, { ...next, peakHrBpm: 132 }]), "cycling", 140).kind, "estimate");
});

test("duration selects independent efforts and an unobserved ceiling provides a dated reference only", () => {
  const short = { id: "short", min: 300, max: 480 };
  const longer = { id: "long", min: 720, max: 1200 };
  const first = shiftDate(end, -3);
  const data = automaticPredictionDataset({ date: end, predictionEvidence: { blocks: [
    ride(first, 100, 120, { durationSeconds: 360, hrWindowSeconds: 180, peakHrBpm: 130 }),
    ride(end, 100, 140, { durationSeconds: 360, hrWindowSeconds: 180, peakHrBpm: 150 }),
    ride(first, 100, 146, { durationSeconds: 720, hrWindowSeconds: 300, peakHrBpm: 160 }),
    ride(end, 100, 156, { durationSeconds: 720, hrWindowSeconds: 300, peakHrBpm: 166 }),
  ] } }, "cycling");
  assert.equal(data.cohort.historyRows.length, 4);
  assert.equal(automaticHeartRate(data, "cycling", 100, short).bpm, 130);
  assert.equal(automaticHeartRate(data, "cycling", 100, longer).bpm, 151);
  const noCap = automaticCeiling(data, "cycling", 100, longer);
  assert.equal(noCap.effortRange, undefined);
  assert.equal(noCap.value, undefined);
  assert.deepEqual([noCap.closest.date, noCap.closest.peakHrBpm, noCap.closest.durationSeconds], [first, 160, 720]);
  const noEffort = automaticHeartRate(data, "cycling", 150, longer);
  assert.equal(noEffort.bpm, undefined);
  assert.equal(noEffort.closest.value, 100);
});

test("the prediction audit only trains on earlier dates and same-duration blocks", () => {
  const day = delta => shiftDate(end, delta);
  const report = { date: end, predictionEvidence: { blocks: [
    ride(day(-3), 95, 125, { peakHrBpm: 130 }),
    ride(day(-2), 105, 135, { peakHrBpm: 140 }),
    ride(day(-2), 100, 64, { durationSeconds: 720, startSeconds: 900, peakHrBpm: 70 }),
    ride(day(-1), 100, 134, { peakHrBpm: 150 }),
    ride(end, 100, 185, { peakHrBpm: 190 }),
  ] } };
  const data = automaticPredictionDataset(report, "cycling");
  const audit = predictionAudit(data, "cycling", 150);
  assert.deepEqual(audit.rows.slice(0, 3).map(row => [row.estimate, row.baseline]), [[null, null], [null, null], [130, 130]]);
  assert.equal(audit.rows[2].matchedDays, 2);
  assert.equal(audit.overshoots, 1);
  assert.equal(audit.measured, 4);
  assert.equal(predictionAudit(data, "cycling", 150, predictionDurations.find(b => b.id === "long")).rows.length, 1);
});

test("the ceiling rate uses the highest measured peak once per local date", () => {
  const first = shiftDate(end, -2);
  const blocks = [
    ride(first, 100, 124, { peakHrBpm: 149 }),
    ride(first, 105, 125, { startSeconds: 810, peakHrBpm: 155 }),
    ride(shiftDate(end, -1), 104, 125, { peakHrBpm: 150 }),
    ride(end, 104, 125),
  ];
  const data = automaticPredictionDataset({ date: end, predictionEvidence: { blocks } }, "cycling");
  const audit = predictionAudit(data, "cycling", 150);
  assert.deepEqual(audit.rows.map(row => [row.peak, row.over, row.measuredPeaks]), [[155, true, 2], [150, false, 1], [null, null, 0]]);
  assert.equal(audit.measured, 2);
  assert.equal(audit.overshoots, 1);
  assert.equal(predictionAudit(data, "cycling", 156).overshoots, 0);
  assert.equal(predictionAudit(data, "cycling", NaN).overshoots, null);
});

test("the automatic audit uses a duration with a test when the standard band has none", () => {
  const data = automaticPredictionDataset({ date: end, predictionEvidence: { blocks: [
    ride(shiftDate(end, -3), 95, 125, { durationSeconds: 720 }),
    ride(shiftDate(end, -2), 105, 135, { durationSeconds: 720 }),
    ride(shiftDate(end, -1), 100, 131, { durationSeconds: 720 }),
    ride(end, 110, 130),
  ] } }, "cycling");
  assert.equal(predictionAudit(data, "cycling", 150).band.id, "long");
  assert.equal(predictionAudit(data, "cycling", 150).compared, 1);
});
