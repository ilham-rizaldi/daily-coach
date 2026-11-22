import assert from "node:assert/strict";
import test from "node:test";
import { compareWorkBlock, garminPacingWorkout, paceClock, pacingWorkoutSignature, rangeFor, reviewMetrics, targetEvidence } from "../src/pacing.js";

const date = "2026-11-22";
const activity = { sport: "Run", date, externalIds: { garmin: "1", strava: "2" }, averageHr: 146 };
const review = {
  sport: "Run", date, activity: { provider: "garmin", id: "1" },
  plan: { date: "2026-11-20", hrBpm: [130, 145], paceSecondsPerKm: [570, 660], powerWatts: [160, 200] },
  workBlock: { source: "Garmin", scope: "steady-work", seconds: 1200, hrBpm: 140, paceSecondsPerKm: 560 },
};

test("the Garmin link targets the saved workout for the exact sport and pacing plan", () => {
  const plan = { stepsMinutes: [5, 30, 5], powerWatts: [100, 110], hrBpm: [125, 145] };
  const url = new URL(`/app/workout/${1}?workoutType=cycling`, "https://connect.garmin.com").href;
  plan.garminWorkout = { url, signature: pacingWorkoutSignature(plan, "Ride") };
  assert.equal(garminPacingWorkout(plan, "Ride").url, url);
  assert.equal(garminPacingWorkout({ ...plan, powerWatts: [105, 115] }, "Ride"), null);
  assert.equal(garminPacingWorkout(plan, "Run"), null);
  assert.equal(garminPacingWorkout({ ...plan, garminWorkout: { ...plan.garminWorkout, url: url.replace("connect.garmin.com", "example.com") } }, "Ride"), null);
});

test("work-block comparison uses the matched plan and omits missing stream values", () => {
  const comparison = compareWorkBlock(activity, [review]);
  assert.deepEqual(comparison.rows.map(row => [row.key, row.value, row.status]), [
    ["hrBpm", 140, "In range"], ["paceSecondsPerKm", 560, "Faster"],
  ]);
  assert.equal(paceClock(599.8), "10:00");
});

test("activity identity, sport, date, pre-existing plan and work scope are required", () => {
  assert.equal(compareWorkBlock(activity), null);
  for (const patch of [
    { activity: { provider: "strava", id: "1" } },
    { sport: "Ride" },
    { date: "2026-11-21" },
    { plan: { ...review.plan, date: "2026-11-23" } },
    { plan: { ...review.plan, date } },
    { workBlock: { ...review.workBlock, scope: "whole-session" } },
  ]) assert.equal(compareWorkBlock(activity, [{ ...review, ...patch }]), null);
});

test("historical targets and activities do not gain missing provenance or substitute estimated watts", () => {
  assert.equal(rangeFor([100, 70]), null);
  assert.equal(targetEvidence({ source: "Garmin", date }), null);
  assert.equal(targetEvidence({ source: "Garmin", date, confidence: "Low" }).date, date);
  assert.deepEqual(reviewMetrics({ sport: "Ride", measuredPowerWatts: 84, stravaEstimatedPowerWatts: 90 }), [["Average power", 84, "W", "power"]]);
  assert.deepEqual(reviewMetrics({ sport: "Run", measuredPowerWatts: 84, averageRunningPowerWatts: 157 }), [["Average run power (est.)", 157, "W", "power"]]);
});
