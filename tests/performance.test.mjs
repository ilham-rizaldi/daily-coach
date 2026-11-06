import test from "node:test";
import assert from "node:assert/strict";
import { recoverySeries, cyclingProgression, trainingPlacement } from "../src/performance.js";

test("recovery dates stay aligned, absent readings stay gaps, invalid and future dates are excluded", () => {
  const report = { date: "2026-04-10", wellnessHistory: { rows: [{ date: "2026-04-10", hrvMs: 50, hrv7dMs: 48, hrvLowMs: 40, hrvHighMs: 60 }, { date: "2026-04-08", sleepMinutes: 400, sleepNeedMinutes: 450, bodyBatteryHigh: 85, bodyBatteryLow: 15 }, { date: "2026-04-11", hrvMs: 999 }, { date: "2026-02-30", hrvMs: 999 }] } };
  const rows = recoverySeries(report, 7);
  assert.equal(rows.length, 7); assert.equal(rows[0].date, "2026-04-04"); assert.equal(rows.at(-1).hrvMs, 50);
  assert.equal(rows.find(row => row.date === "2026-04-09").hrvMs, null);
  assert.equal(rows.find(row => row.date === "2026-04-08").sleepGap, -50);
  assert.deepEqual(rows.find(row => row.date === "2026-04-08").bodyBatteryRange, [15, 85]);
  assert.deepEqual(rows.at(-1).hrvBand, [40, 60]);
  assert.equal(recoverySeries({ date: "2026-02-30" }).length, 0);
});

test("RHR deviation uses at least seven preceding readings, excludes current reading and old history", () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ date: `2026-04-0${i + 1}`, rhrBpm: 50 + i }));
  rows.push({ date: "2026-03-01", rhrBpm: 999 }, { date: "2026-04-08", rhrBpm: 60 }, { date: "2026-04-09", rhrBpm: 999 });
  const series = recoverySeries({ date: "2026-04-08", wellnessHistory: { rows } }, 7);
  assert.equal(series.at(-1).rhrBaseline, 53); assert.equal(series.at(-1).rhrDelta, 7); assert.equal(series.at(-1).rhrBaselineN, 7);
  assert.equal(series.at(-2).rhrBaseline, null); assert.equal(series.at(-2).rhrDelta, null);
});

test("inconsistent ranges and conflicting duplicate readings remain unavailable", () => {
  const report = { date: "2026-04-08", wellnessHistory: { rows: [{ date: "2026-04-08", hrvMs: 40, bodyBatteryLow: 95, bodyBatteryHigh: 80 }, { date: "2026-04-08", hrvMs: 50, bodyBatteryLow: 95, bodyBatteryHigh: 80 }] } };
  const row = recoverySeries(report, 7).at(-1);
  assert.equal(row.hrvMs, null); assert.equal(row.bodyBatteryRange, null);
});

test("cycling blocks are disjoint completed seven-day periods with correct timers and sport scope", () => {
  const report = { date: "2026-04-15", coverage: { start: "2026-03-01", end: "2026-04-14", complete: true }, activities: [
    { date: "2026-04-14", sport: "Ride", timerSeconds: 7200, movingSeconds: 3600, intervalsListLoad: 80 },
    { date: "2026-04-08", sport: "Ride", movingSeconds: 1800, intervalsLoad: 20 },
    { date: "2026-04-07", sport: "Ride", movingSeconds: 3600, intervalsLoad: 40 },
    { date: "2026-04-14", sport: "Weight Training", movingSeconds: 3600, intervalsListLoad: 100 },
    { date: "2026-04-14", sport: "Ride", movingSeconds: 99999, intervalsLoad: 999, classification: "non-training" },
    { date: "2026-04-15", sport: "Ride", movingSeconds: 99999, intervalsLoad: 999 },
  ] };
  const rows = cyclingProgression(report, 2);
  assert.equal(rows[0].start, "2026-04-01"); assert.equal(rows[0].end, "2026-04-07");
  assert.equal(rows[1].start, "2026-04-08"); assert.equal(rows[1].end, "2026-04-14");
  assert.equal(rows[1].hours, 2.5); assert.equal(rows[1].longestMinutes, 120); assert.equal(rows[1].sessions, 2);
  assert.equal(rows[1].load, 100); assert.equal(rows[1].strengthSessions, 1); assert.equal(rows[0].load, 40);
});

test("missing load is not zero; no-training zero requires complete source coverage", () => {
  const report = { date: "2026-04-15", coverage: { start: "2026-04-08", end: "2026-04-14", complete: true }, activities: [
    { date: "2026-04-14", sport: "Ride", movingSeconds: 3600, intervalsLoad: 40 },
    { date: "2026-04-12", sport: "Ride", movingSeconds: 3600, intervalsLoad: null },
  ] };
  const rows = cyclingProgression(report, 2);
  assert.equal(rows[0].sessions, null); assert.equal(rows[0].hours, null); assert.equal(rows[0].load, null);
  assert.equal(rows[1].load, null); assert.equal(rows[1].knownLoad, 40); assert.equal(rows[1].missingLoad, 1);
  const empty = cyclingProgression({ ...report, activities: [] }, 1)[0];
  assert.equal(empty.hours, 0); assert.equal(empty.load, 0); assert.equal(empty.longestMinutes, 0);
});

test("placement retains multiple sports, excludes capture date and excluded recordings", () => {
  const rows = trainingPlacement({ date: "2026-04-15", coverage: { start: "2026-04-01", end: "2026-04-14", complete: true }, activities: [
    { date: "2026-04-14", sport: "Ride" }, { date: "2026-04-14", sport: "Weight Training" },
    { date: "2026-04-14", sport: "Row" }, { date: "2026-04-14", sport: "Ride", classification: "non-training" },
    { date: "2026-04-15", sport: "Ride" },
  ] }, 7);
  assert.equal(rows.at(-1).date, "2026-04-14");
  assert.deepEqual([rows.at(-1).rides, rows.at(-1).strength, rows.at(-1).other], [1, 1, 1]);
});
