import test from "node:test";
import assert from "node:assert/strict";
import { loadFocusReadings } from "../src/loadFocusReadings.js";

const start = "2026-11-01", end = "2026-11-26";
const activity = (id, date, sport, garminPrimaryBenefit, extra) => ({
  date, sport, garminPrimaryBenefit, source: "Garmin Connect", externalIds: { garmin: id }, ...extra,
});
const fit = (activityId, date, sport, value, hrBpm, peakHrBpm, extra) => ({
  activityId, date, sport, hrBpm, peakHrBpm, pairedFraction: 0.99, durationSeconds: 480,
  [sport === "Ride" ? "powerWatts" : "paceSecondsPerKm"]: value,
  device: "Recorder", source: "Garmin original FIT", environment: "outdoor", ...extra,
});

test("steady observations respect the window, Garmin benefits, recording group and one effort per day", () => {
  const activities = [
    activity("a", "2026-11-20", "Ride", "Tempo (High Aerobic)"),
    activity("b", "2026-11-21", "Ride", "Threshold (High Aerobic)"),
    activity("c", "2026-11-22", "Ride", "No Benefit"),
    activity("d", "2026-11-24", "Ride", "Tempo", { classification: "non-training" }),
  ];
  const blocks = [
    fit("a", "2026-11-20", "Ride", 140, 160, 165),
    fit("a", "2026-11-20", "Ride", 152, 165, 171, { startSeconds: 500 }),
    fit("b", "2026-11-21", "Ride", 144, 162, 170),
    fit("b", "2026-11-21", "Ride", 190, 180, 188, { startSeconds: 500, environment: "indoor" }),
    fit("c", "2026-11-22", "Ride", 200, 182, 192),
    fit("d", "2026-11-24", "Ride", 200, 182, 192),
  ];
  const result = loadFocusReadings({ date: end, activities, predictionEvidence: { blocks } }, start, end);
  assert.deepEqual(result.highAerobic.cycling.value, [144, 152]);
  assert.deepEqual(result.highAerobic.cycling.hr, [162, 165]);
  assert.equal(result.highAerobic.cycling.rows.length, 2);
  assert.deepEqual(loadFocusReadings({ date: end, activities, predictionEvidence: { blocks } }, "2026-11-23", end).highAerobic, {});
});

test("an easy HR match requires measured peak HR within the dated pacing guardrail", () => {
  const date = "2026-11-20";
  const blocks = [
    fit("a", date, "Run", 600, 139, 148),
    fit("a", date, "Run", 560, 138, 156, { startSeconds: 500 }),
    fit("a", date, "Run", 520, 120, null, { startSeconds: 900 }),
    fit("b", date, "Run", 510, 141, 147),
  ];
  const running = { hrBpm: [130, 145], hrCeiling: 150, evidence: { hrBpm: { source: "Garmin Connect", date } } };
  const report = { date: end, activities: [activity("b", date, "Run", "Tempo")], predictionEvidence: { blocks }, coaching: { pacing: { running } } };
  const result = loadFocusReadings(report, start, end).lowAerobic.running;
  assert.equal(result.scope, "easy-match");
  assert.deepEqual(result.value, [600, 600]);
  assert.equal(result.rows.length, 1);
  running.evidence.hrBpm.date = "2026-11-27";
  assert.equal(loadFocusReadings(report, start, end).lowAerobic.running, undefined);
});

test("anaerobic readings need a labelled short work rep in a Garmin-classified workout", () => {
  const date = "2026-11-20";
  const activities = [activity("a", date, "Ride", "Sprint (Anaerobic)")];
  const intervals = [
    { classification: "lap", seconds: 30, averagePowerWatts: 500, averageHr: 180 },
    { classification: "work", seconds: 300, averagePowerWatts: 340, averageHr: 184 },
  ];
  const report = { date: end, activities, benchmarks: { workouts: [{ source: "Garmin Connect", activityId: "a", date, intervals }] } };
  assert.deepEqual(loadFocusReadings(report, start, end).anaerobic, {});
  intervals.push({ classification: "work", seconds: 30, averagePowerWatts: 330 });
  const result = loadFocusReadings(report, start, end).anaerobic.cycling;
  assert.deepEqual(result.value, [330, 330]);
  assert.equal(result.hr, null);
});
