import test from "node:test";
import assert from "node:assert/strict";
import { estimateSessionLoad, projectTomorrow } from "../src/forecast.js";
import { projectWeek, restWeek } from "../src/planner.js";

function fixture() {
  return {
    date: "2026-11-06",
    intervals: { date: "2026-11-06", fitness: 20, fatigue: 30, settings: { activityTypeWeights: {
      Ride: { fitnessPercent: 100, fatiguePercent: 100 },
      Run: { fitnessPercent: 100, fatiguePercent: 100 },
      WeightTraining: { fitnessPercent: 0, fatiguePercent: 100 },
    } } },
    activities: [
      { date: "2026-10-26", sport: "Ride", timerSeconds: 3600, movingSeconds: 3600, intervalsLoad: 30 },
      { date: "2026-10-28", sport: "Ride", timerSeconds: 3600, movingSeconds: 3600, intervalsLoad: 60 },
      { date: "2026-10-29", sport: "Ride", timerSeconds: 3600, movingSeconds: 3600, intervalsLoad: 90 },
      { date: "2026-10-30", sport: "Weight Training", timerSeconds: 1800, movingSeconds: 1800, intervalsLoad: null, intervalsListLoad: 30 },
      { date: "2026-11-01", sport: "Weight Training", timerSeconds: 1800, movingSeconds: 1800, intervalsLoad: null, intervalsListLoad: 45 },
    ],
  };
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`);

test("rest scenario advances exactly seven dates from the captured dated anchor", () => {
  const report = fixture(), plan = restWeek(report);
  assert.equal(plan[0].date, "2026-11-07");
  assert.equal(plan.at(-1).date, "2026-11-13");
  const output = projectWeek(report, plan);
  assert.equal(output.available, true);
  assert.equal(output.rows.length, 7);
  close(output.rows[0].mid.fitness, 20 * Math.exp(-1 / 42));
  close(output.rows.at(-1).mid.fatigue, 30 * Math.exp(-7 / 7));
  assert.equal(output.totals.minutes, 0);
  assert.equal(output.totals.load, 0);
  output.rows.forEach(row => {
    close(row.mid.form, row.rest.form);
    close(row.range.form.low, row.range.form.high);
  });
});

test("first-day center matches tomorrow model including only remaining-today load delta", () => {
  const report = fixture(), plans = restWeek(report);
  plans[0] = { ...plans[0], sport: "Ride", minutes: 75, effort: "hard" };
  const todayPlan = { sport: "Weight Training", minutes: 30, effort: "easy" };
  const today = estimateSessionLoad(report, todayPlan);
  const estimate = estimateSessionLoad(report, plans[0]);
  const actual = projectWeek(report, plans, { todayPlan });
  const expected = projectTomorrow(report, {
    todayLoad: today.mid, todayFitnessWeight: 0, todayFatigueWeight: 1,
    load: estimate.mid, loadLow: estimate.low, loadHigh: estimate.high,
  });
  assert.equal(actual.available, true);
  for (const key of ["fitness", "fatigue", "form", "ratio"]) close(actual.rows[0].mid[key], expected.mid[key]);
  close(actual.todayAdjusted.fitness, report.intervals.fitness);
  assert.ok(actual.todayAdjusted.fatigue > report.intervals.fatigue);
});

test("strength uses captured zero CTL and nonzero ATL contributions through the week", () => {
  const report = fixture(), plans = restWeek(report);
  plans[0] = { ...plans[0], sport: "Weight Training", minutes: 30, effort: "moderate" };
  const output = projectWeek(report, plans);
  assert.equal(output.available, true);
  output.rows.forEach(row => {
    close(row.mid.fitness, row.rest.fitness);
    assert.ok(row.mid.fatigue > row.rest.fatigue);
    assert.ok(row.mid.form < row.rest.form);
  });
});

test("each daily load interval propagates with exact correlated CTL/ATL form bounds", () => {
  const report = fixture(), plans = restWeek(report).map(plan => ({ ...plan, sport: "Ride", minutes: 60, effort: "moderate" }));
  const fitnessDays = 3, fatigueDays = 2;
  const output = projectWeek(report, plans, { fitnessDays, fatigueDays });
  assert.equal(output.available, true);
  const fDecay = Math.exp(-1 / fitnessDays), aDecay = Math.exp(-1 / fatigueDays);
  const corners = [];
  for (let mask = 0; mask < 128; mask++) {
    let fitness = report.intervals.fitness, fatigue = report.intervals.fatigue;
    for (let day = 0; day < 7; day++) {
      const estimate = output.rows[day].estimate;
      const load = mask & 2 ** day ? estimate.high : estimate.low;
      fitness = fitness * fDecay + (1 - fDecay) * load;
      fatigue = fatigue * aDecay + (1 - aDecay) * load;
    }
    corners.push({ fitness, fatigue, form: fitness - fatigue, ratio: fatigue / fitness });
  }
  const end = output.rows.at(-1);
  for (const key of ["fitness", "fatigue", "form", "ratio"]) {
    close(end.range[key].low, Math.min(...corners.map(corner => corner[key])));
    close(end.range[key].high, Math.max(...corners.map(corner => corner[key])));
    assert.ok(end.mid[key] >= end.range[key].low - 1e-10);
    assert.ok(end.mid[key] <= end.range[key].high + 1e-10);
  }
  const uniformLow = corners[0].form, uniformHigh = corners.at(-1).form;
  assert.ok(end.range.form.low < Math.min(uniformLow, uniformHigh));
  assert.ok(end.range.form.high > Math.max(uniformLow, uniformHigh));
});

test("missing sport history does not become a zero-load training session", () => {
  const report = fixture(), plans = restWeek(report);
  plans[1] = { ...plans[1], sport: "Run", minutes: 30, effort: "easy" };
  const result = projectWeek(report, plans);
  assert.equal(result.available, false);
  assert.match(result.error, /history unavailable/);
  assert.deepEqual(result.rows, []);
});

test("rejects mismatched or missing measurement dates, invalid duration and model inputs", () => {
  const report = fixture(), plans = restWeek(report);
  for (const date of [undefined, "2026-11-05", "2026-02-30"]) {
    const copy = structuredClone(report); copy.intervals.date = date;
    assert.equal(projectWeek(copy, plans).available, false);
  }
  for (const minutes of [NaN, "", 0, -1, 601]) {
    const copy = structuredClone(plans); copy[0] = { ...copy[0], sport: "Ride", minutes, effort: "easy" };
    assert.equal(projectWeek(report, copy).available, false);
  }
  assert.equal(projectWeek(report, plans, { fitnessDays: NaN }).available, false);
  assert.equal(projectWeek(report, plans, { fatigueDays: 0 }).available, false);
  const shifted = structuredClone(plans); shifted[0].date = report.date;
  assert.equal(projectWeek(report, shifted).available, false);
  const missing = structuredClone(plans); missing[0] = null;
  assert.equal(projectWeek(report, missing).available, false);
  assert.deepEqual(restWeek({ date: "2026-02-30" }), []);
});

test("today-only training retains its decay in the future-rest comparison", () => {
  const report = fixture(), plans = restWeek(report);
  const output = projectWeek(report, plans, { todayPlan: { sport: "Ride", minutes: 45, effort: "easy" } });
  assert.equal(output.available, true);
  const fDecay = Math.exp(-1 / 42), aDecay = Math.exp(-1 / 7);
  close(output.rows.at(-1).rest.fitness, output.todayAdjusted.fitness * fDecay ** 7);
  close(output.rows.at(-1).rest.fatigue, output.todayAdjusted.fatigue * aDecay ** 7);
  output.rows.forEach(row => close(row.mid.form, row.rest.form));
  assert.ok(output.rows.at(-1).range.form.high > output.rows.at(-1).range.form.low);
});
