import assert from "node:assert/strict";
import test from "node:test";
import { strengthSummary } from "../src/strength.js";

const lift = (exercise, weightKg, reps) => ({ exercise, weightKg, reps });

test("strength volume uses each dated Garmin session once and keeps unlogged volume unavailable", () => {
  const date = "2026-01-20";
  const report = {
    date,
    baseHistory: {
      strengthVolume: {
        sessionDetails: [
          { activityId: "1", date, volumeKg: 100_000 },
          { activityId: "4", date: "2026-01-21", volumeKg: 450_000 },
        ],
      },
      providerActivities: {
        "Garmin Connect": [
          { id: "1", date, sourceType: "strength_training", strengthVolumeKg: 100_000 },
          { id: "2", date, sourceType: "strength_training" },
          { id: "3", date, sourceType: "indoor_rowing" },
        ],
      },
    },
  };
  const summary = strengthSummary(report);
  assert.equal(summary.volumeKg, 100_000);
  assert.equal(summary.sessions.length, 2);
  assert.equal(summary.measured, 1);
  assert.equal(summary.unlocked, 250);
  assert.equal(summary.next, 300);
  assert.equal(summary.remainingKg, 19_700);
  assert.equal(strengthSummary({ date }).volumeKg, null);
});

test("strength records rank weight before reps and do not assign anonymous sets to exercises", () => {
  const report = {
    date: "2026-01-20",
    baseHistory: { strengthVolume: { sessionDetails: [
      { activityId: "2", date: "2026-01-20", volumeKg: 2_540,
        exerciseSets: [lift("Barbell Deadlift", 120, 2), lift(null, 300, 5), lift("Box Jump", null, 5)] },
      { activityId: "1", date: "2026-01-15", volumeKg: 2_890,
        exerciseSets: [lift("Barbell Deadlift", 120, 3), lift("Barbell Deadlift", 110, 6),
          lift("Leg Press", 145, 10), lift("Curl", null, 15), lift("Snatch", 200, 0)] },
    ] } },
  };
  const summary = strengthSummary(report);
  assert.deepEqual(summary.records.map(row => [row.exercise, row.weightKg, row.reps, row.date]), [
    ["Leg Press", 145, 10, "2026-01-15"],
    ["Barbell Deadlift", 120, 3, "2026-01-15"],
  ]);
  assert.deepEqual(summary.equipment.map(row => row[0]), ["barbell", "box", "leg-press"]);
  assert.equal(summary.unassignedSets, 1);
  assert.equal(summary.unassigned.weightKg, 300);
});
