import test from "node:test";
import assert from "node:assert/strict";
import { conditionOverview, conditionStamp } from "../src/condition.js";
import { workoutAdvice } from "../src/workoutAdvice.js";

const date = "2026-04-06";
const observedAt = "2026-04-06T01:30:00Z";
const recoveryReport = (metrics = {}) => ({
  date, capturedAt: "2026-04-06T02:00:00Z",
  wellness: { date, readiness: 70, recoveryTimeMinutes: 0,
    provenance: { datedRecovery: { readiness: { observedAt }, hrv: { observedAt } } }, ...metrics },
});

test("workout advice uses a dated recovery reading and preserves zero time", () => {
  assert.equal(workoutAdvice(recoveryReport(), date).state, "planned");
  assert.equal(workoutAdvice(recoveryReport({ readiness: 24 }), date).state, "rest");
  assert.equal(workoutAdvice(recoveryReport({ readiness: 49 }), date).state, "easy");
  assert.equal(workoutAdvice(recoveryReport({ recoveryTimeMinutes: 60 }), date).state, "easy");
  assert.equal(workoutAdvice(recoveryReport({ hrvStatus: "Unbalanced" }), date).state, "easy");
  assert.equal(workoutAdvice(recoveryReport({ recoveryTimeMinutes: null }), date).state, "recheck");
});

test("historical and misdated recovery cannot produce a current workout suggestion", () => {
  assert.equal(workoutAdvice(recoveryReport({ readiness: 15 }), "2026-04-07").state, "recheck");
  assert.equal(workoutAdvice(recoveryReport({ date: "2026-04-05" }), date).state, "recheck");
  assert.equal(workoutAdvice(recoveryReport({ provenance: {} }), date).state, "recheck");
  const observationWindow = { start: observedAt, end: "2026-04-06T01:45:00Z" };
  const report = recoveryReport({ provenance: { datedRecovery: { readiness: { observationWindow } } } });
  assert.deepEqual(workoutAdvice(report, date).observationWindow, observationWindow);
  report.wellness.provenance.datedRecovery.readiness.date = "2026-04-05";
  assert.equal(workoutAdvice(report, date).state, "recheck");
});

test("zero readings are retained while absent fields stay unavailable", () => {
  const result = conditionOverview({ wellness: { readiness: 0, bodyBattery: 0, sleepScore: 0, awakeMinutes: 0 }, intervals: { fitness: 0, fatigue: 0, form: 0 } });
  assert.equal(result.primary.find(row => row.id === "readiness").value, "0");
  assert.equal(result.primary.find(row => row.id === "battery").value, "0");
  assert.equal(result.primary.find(row => row.id === "sleep").value, "Unavailable");
  assert.equal(result.overnight.find(row => row.label === "Sleep score").value, "0 / 100");
  assert.equal(result.overnight.find(row => row.label === "Awake / restless").value, "0 min");
  assert.deepEqual(result.intervals.map(row => row.value), ["0", "0", "0"]);
  assert.deepEqual(conditionOverview({}).overnight, []);
});

test("condition readings use their own capture times, never compilation time", () => {
  const report = {
    date: "2026-04-06", capturedAt: "2026-04-06T10:00:00Z", compiledAt: "2026-04-06T15:00:00Z",
    wellness: { date: "2026-04-05", readiness: 63, readinessUpdatedAtLocal: "07:25", recoveryTimeMinutes: 525,
      provenance: { datedRecovery: { readiness: { observedAt: "2026-04-05T01:30:00Z" } } } },
  };
  const result = conditionOverview(report);
  assert.equal(result.primary[0].stamp, "5 Apr · captured 08:30 WIB");
  assert.equal(result.primary.find(row => row.id === "recovery").value, "8h 45m");
  assert.match(result.primary.find(row => row.id === "recovery").context, /Snapshot 07:25/);
  assert.match(result.primary.find(row => row.id === "sleep").stamp, /capture time unrecorded/);
  assert.equal(conditionStamp(null, "2026-04-05T01:30:00Z"), "Reading date unrecorded · captured 5 Apr, 08:30 WIB");
});

test("condition readings retain capture windows when exact times are unavailable", () => {
  const observationWindow = { start: "2026-04-05T09:34:00Z", end: "2026-04-05T09:45:00Z" };
  const report = { date: "2026-04-05", wellness: { date: "2026-04-05",
    provenance: { datedRecovery: { readiness: { observationWindow } } } } };
  assert.equal(conditionOverview(report).primary[0].stamp, "5 Apr · captured 16:34–16:45 WIB");
  assert.equal(conditionStamp("2026-04-05", "2026-04-05T09:39:00Z", observationWindow), "5 Apr · captured 16:39 WIB");
  assert.match(conditionStamp("2026-04-05", null, { start: observationWindow.end, end: observationWindow.start }), /capture time unrecorded/);
});

test("Garmin and Intervals retain their own reported values and definitions", () => {
  const result = conditionOverview({ wellness: { garminLoadRatio: 1.1, garminAcuteLoad: 310, garminChronicLoad: 280 }, intervals: { fitness: 33, fatigue: 45, form: -12 } });
  assert.deepEqual(result.garminLoad.map(row => row.value), ["1.1", "310", "280"]);
  assert.deepEqual(result.intervals.map(row => row.value), ["33", "45", "-12"]);
  assert.equal(conditionOverview({ intervals: { form: 8 } }).intervals[2].value, "+8");
});

test("a history supplement does not silently refresh wellness dates or numbers", () => {
  const result = conditionOverview({ date: "2026-04-06", wellness: { bodyBattery: 62, garminAcuteLoad: 310 }, garminLoadHistory: { observedAt: "2026-04-06T08:00:00Z", rows: [{ date: "2026-04-06", acute: 300, chronic: 280 }] } });
  assert.equal(result.primary.find(row => row.id === "battery").value, "62");
  assert.match(result.primary.find(row => row.id === "battery").stamp, /Reading date unrecorded/);
  assert.equal(result.garminLoad.find(row => row.id === "acute").value, "310");
  assert.match(result.garminLoadStamp, /capture time unrecorded/);
  assert.match(result.garminLoadContext, /Chronic: Reading date unrecorded/);
});

test("a matching dated history pair dates only load, and status attention is metric-specific", () => {
  const result = conditionOverview({ date: "2026-04-06", wellness: { readiness: 85, readinessStatus: "High", garminLoadRatio: 1.4, garminLoadRatioStatus: "High", garminAcuteLoad: 310, garminChronicLoad: 280 }, garminLoadHistory: { observedAt: "2026-04-06T08:00:00Z", rows: [{ date: "2026-04-06", acute: 310, chronic: 280 }] } });
  assert.match(result.garminLoadContext, /Chronic: 6 Apr · captured 15:00 WIB/);
  assert.match(result.garminLoadContext, /Ratio: Reading date unrecorded/);
  assert.match(result.primary[0].stamp, /Reading date unrecorded/);
  assert.equal(result.primary[0].attention, false);
  assert.equal(result.garminLoad[0].attention, true);
});

test("workout charts use captured HRV and the current recovery reading with historical gaps", () => {
  const report = {
    ...recoveryReport({ hrvStatus: "Balanced", hrv7dMs: 60, hrvBaselineLowMs: 40, hrvBaselineHighMs: 65, recoveryTimeMinutes: 960 }),
    wellnessHistory: { rows: [{ date: "2026-04-04", recoveryTimeMinutes: 0 }, { date, recoveryTimeMinutes: 1800 }] },
  };
  const advice = workoutAdvice(report, date);
  assert.deepEqual([advice.hrv7d, advice.hrvLow, advice.hrvHigh], [60, 40, 65]);
  assert.deepEqual(advice.recoveryHistory.slice(-3).map(row => row.minutes), [0, null, 960]);
  delete report.wellness.provenance.datedRecovery.hrv;
  assert.equal(workoutAdvice(report, date).hrv7d, null);
  assert.equal(workoutAdvice(report, "2026-04-07").recoveryHistory, undefined);
});
