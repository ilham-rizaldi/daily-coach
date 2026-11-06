import test from "node:test";
import assert from "node:assert/strict";
import { contributionWeights, estimateSessionLoad, historicalLoadRate, projectTomorrow } from "../src/forecast.js";

const report = {
  date: "2026-04-10", intervals: { date: "2026-04-10", fitness: 35, fatigue: 42 },
  // Deliberately incompatible scales ensure Garmin never becomes a fallback.
  wellness: { garminAcuteLoad: 800, garminChronicLoad: 600 },
  activities: [],
};

test("rest forecasts one next-day decay and never uses Garmin load", () => {
  const projected = projectTomorrow(report, { load: 0 });
  assert.equal(projected.date, "2026-04-11");
  assert.ok(Math.abs(projected.mid.fitness - 34.17650903) < 1e-7);
  assert.ok(Math.abs(projected.mid.fatigue - 36.40887179) < 1e-7);
  assert.ok(projected.mid.ratio > 1 && projected.mid.ratio < 1.1);
  assert.equal(projected.baseline.fitness, 35);
  assert.equal(projected.startOfTomorrowForm, -7);
});

test("remaining today is only an added delta, with one decay into tomorrow", () => {
  const addedToday = projectTomorrow(report, { todayLoad: 40, load: 0 });
  const addedTomorrow = projectTomorrow(report, { todayLoad: 0, load: 40 });
  assert.ok(addedToday.mid.fitness > projectTomorrow(report, { load: 0 }).mid.fitness);
  assert.ok(addedToday.mid.fitness < addedTomorrow.mid.fitness);
  assert.ok(addedToday.mid.fatigue < addedTomorrow.mid.fatigue);
  // New load today influences tomorrow, but less than the same load tomorrow.
  assert.ok(Math.abs(addedToday.todayAdjusted.fitness - 35.94113253) < 1e-7);
  assert.ok(Math.abs(addedToday.todayAdjusted.fatigue - 47.32488401) < 1e-7);
});

test("strength fatigue-only setting changes fatigue without adding model fitness", () => {
  const strengthReport = { ...report, intervals: { ...report.intervals, settings: { activityTypeWeights: { WeightTraining: { fitnessPercent: 0, fatiguePercent: 100 } } } } };
  const weights = contributionWeights(strengthReport, "Weight Training");
  const rest = projectTomorrow(strengthReport, { load: 0 });
  const strength = projectTomorrow(strengthReport, { load: 30, fitnessWeight: weights.fitness, fatigueWeight: weights.fatigue });
  assert.equal(weights.assumed, false);
  assert.equal(strength.mid.fitness, rest.mid.fitness);
  assert.ok(strength.mid.fatigue > rest.mid.fatigue);
  assert.ok(strength.mid.form < rest.mid.form);
  assert.deepEqual(contributionWeights(report, "Rest"), { fitness: 0, fatigue: 0, source: "No planned training load", assumed: false });
});

test("historical estimates omit current/future/excluded/missing and short sessions, retain real zero", () => {
  const activity = (date, load, extra = {}) => ({ date, sport: "Ride", name: "Illustrative ride", timerSeconds: 3600, intervalsListLoad: load, ...extra });
  const historyReport = { ...report, activities: [
    activity("2026-04-01", 20), activity("2026-04-02", 40), activity("2026-04-03", 60), activity("2026-04-04", 0),
    activity("2026-04-10", 999), activity("2026-04-11", 999), activity("2026-02-01", 999),
    activity("2026-04-05", 999, { classification: "non-training" }),
    activity("2026-04-06", null), activity("2026-04-07", 5, { timerSeconds: 120 }),
    activity("2026-04-08", 999, { sport: "Run" }),
  ] };
  const rates = historicalLoadRate(historyReport, "Ride");
  assert.equal(rates.n, 4);
  assert.equal(rates.median, 30);
  assert.equal(rates.low, 15);
  assert.equal(rates.high, 45);
  assert.equal(rates.minimum, 0);
  assert.equal(rates.excludedMissing, 1);
  assert.equal(rates.excludedShort, 1);
  const planned = estimateSessionLoad(historyReport, { sport: "Ride", minutes: 30 });
  assert.equal(planned.mid, 15);
  assert.equal(planned.low, 7.5);
  assert.equal(planned.high, 22.5);
});

test("canonical session timer controls calibration instead of paused moving time", () => {
  const rates = historicalLoadRate({ ...report, activities: [{ date: "2026-04-01", sport: "Run", timerSeconds: 3600, movingSeconds: 1800, intervalsListTimeSeconds: 1800, intervalsLoad: 30 }] }, "Run");
  assert.equal(rates.median, 30);
  assert.equal(rates.sparse, true);
});

test("missing load and source baseline stay unavailable instead of becoming zero", () => {
  assert.equal(estimateSessionLoad(report, { sport: "Ride", minutes: 30 }).available, false);
  assert.equal(projectTomorrow({ ...report, intervals: {} }, { load: 20 }).available, false);
  for (const load of [null, "", "20", -1, NaN, Infinity]) assert.equal(projectTomorrow(report, { load }).available, false);
  for (const minutes of [null, "", -1, NaN]) assert.equal(estimateSessionLoad(report, { sport: "Ride", minutes }).available, false);
});

test("invalid ranges, dates and time constants cannot produce a numeric forecast", () => {
  assert.equal(projectTomorrow(report, { load: 20, loadLow: 30 }).available, false);
  assert.equal(projectTomorrow(report, { load: 20, loadHigh: 10 }).available, false);
  for (const days of [0, -7, 366, null, "", NaN]) assert.equal(projectTomorrow(report, { load: 20, fitnessDays: days }).available, false);
  assert.equal(projectTomorrow({ ...report, intervals: { ...report.intervals, date: "2026-04-09" } }, { load: 20 }).available, false);
  assert.equal(projectTomorrow({ ...report, intervals: { ...report.intervals, date: "2026-04-11" } }, { load: 20 }).available, false);
  assert.equal(projectTomorrow({ ...report, date: "2026-02-30" }, { load: 20 }).available, false);
});

test("zero fitness produces no ratio and missing measurement date is disclosed", () => {
  const empty = projectTomorrow({ ...report, intervals: { fitness: 0, fatigue: 0 } }, { load: 0 });
  assert.equal(empty.available, true);
  assert.equal(empty.mid.ratio, null);
  assert.equal(empty.baseline.dateVerified, false);
  assert.ok(empty.assumptions.some(value => value.includes("date was not captured")));
});

test("range envelopes preserve lower and upper ratio order for fatigue-only contribution", () => {
  const result = projectTomorrow(report, { loadLow: 10, load: 30, loadHigh: 50, fitnessWeight: 0, fatigueWeight: 1 });
  assert.ok(result.range.ratio.low < result.range.ratio.high);
  assert.ok(result.range.form.low < result.range.form.high);
  assert.equal(result.range.form.low, result.high.form);
});
