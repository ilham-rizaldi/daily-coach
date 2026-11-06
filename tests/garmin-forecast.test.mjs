import test from "node:test";
import assert from "node:assert/strict";
import { projectGarminRest } from "../src/garminForecast.js";

const rows = [
  { date: "2026-04-01", acute: 300, chronic: 300 },
  { date: "2026-04-02", acute: 270, chronic: 294 },
  { date: "2026-04-03", acute: 240, chronic: 288 },
  { date: "2026-04-04", acute: 210, chronic: 282 },
  { date: "2026-04-05", acute: 190, chronic: 276 },
  { date: "2026-04-06", acute: 170, chronic: 270 },
];
const report = {
  date: "2026-04-06", activities: [],
  coverage: { complete: true, start: "2026-04-01", end: "2026-04-05" },
  wellness: { garminAcuteLoad: 170, garminChronicLoad: 270, garminLoadRatio: 0.6 },
  // Intervals values must have no effect on this separate Garmin analogy.
  intervals: { fitness: 999, fatigue: 1 },
  garminLoadHistory: { sourceUrl: "https://example.test/illustrative", rows },
};

test("next-day Garmin analogy keeps its paired numerator and denominator coherent", () => {
  const result = projectGarminRest(report);
  assert.equal(result.available, true);
  assert.equal(result.date, "2026-04-07");
  assert.equal(result.n, 4);
  assert.equal(result.baseline.displayRatio, 0.6);
  assert.equal(result.estimate.ratio, result.estimate.acute / result.estimate.chronic);
  assert.ok(result.range.ratio.low <= result.estimate.ratio && result.estimate.ratio <= result.range.ratio.high);
  assert.equal(result.confidence, "Low");
  assert.ok(result.reasons.some(reason => reason.includes("not a confidence interval")));
  assert.deepEqual(projectGarminRest({ ...report, intervals: {} }).estimate, result.estimate);
});

test("current partial-day transition is excluded even when no activity appears", () => {
  const result = projectGarminRest(report);
  assert.ok(result.samples.every(sample => sample.date < report.date));
  assert.ok(!result.samples.some(sample => sample.date === "2026-04-06"));
});

test("locally excluded recordings still prevent a Garmin rest-day sample", () => {
  const result = projectGarminRest({ ...report, activities: [{ date: "2026-04-03", classification: "non-training" }] });
  assert.equal(result.available, true);
  assert.equal(result.n, 3);
  assert.ok(!result.samples.some(sample => sample.date === "2026-04-03"));
  const insufficient = projectGarminRest({ ...report, activities: [{ date: "2026-04-03" }, { date: "2026-04-04" }] });
  assert.equal(insufficient.available, false);
  assert.equal(insufficient.n, 2);
});

test("gaps and uncovered days are not assumed to be rest observations", () => {
  const gap = projectGarminRest({ ...report, garminLoadHistory: { rows: rows.filter(row => row.date !== "2026-04-03") } });
  assert.equal(gap.available, false);
  assert.equal(gap.n, 2);
  assert.equal(projectGarminRest({ ...report, coverage: { ...report.coverage, complete: false } }).available, false);
  assert.equal(projectGarminRest({ ...report, coverage: { ...report.coverage, start: "2026-04-04" } }).available, false);
  assert.equal(projectGarminRest({ ...report, activities: [{}] }).available, false);
});

test("stale, duplicate, invalid and inconsistent source anchors cannot forecast", () => {
  assert.equal(projectGarminRest({ ...report, garminLoadHistory: undefined }).available, false);
  assert.equal(projectGarminRest({ ...report, garminLoadHistory: { rows: rows.slice(0, -1) } }).available, false);
  assert.equal(projectGarminRest({ ...report, garminLoadHistory: { rows: [...rows, rows[0]] } }).available, false);
  assert.equal(projectGarminRest({ ...report, garminLoadHistory: { rows: [...rows, null] } }).available, false);
  assert.equal(projectGarminRest({ ...report, activities: [null] }).available, false);
  assert.equal(projectGarminRest({ ...report, wellness: { ...report.wellness, garminAcuteLoad: 171 } }).available, false);
  for (const acute of [null, "170", -1, NaN, Infinity]) {
    assert.equal(projectGarminRest({ ...report, garminLoadHistory: { rows: [...rows.slice(0, -1), { ...rows.at(-1), acute }] } }).available, false);
  }
  assert.equal(projectGarminRest({ ...report, date: "2026-02-30" }).available, false);
});

test("source order is normalized without changing the caller's history", () => {
  const reversed = [...rows].reverse();
  const result = projectGarminRest({ ...report, garminLoadHistory: { rows: reversed } });
  assert.equal(result.available, true);
  assert.equal(reversed[0].date, "2026-04-06");
  assert.deepEqual(result.estimate, projectGarminRest(report).estimate);
});

test("a no-training ratio can rise when chronic load falls faster", () => {
  const rising = rows.map((row, index) => ({ ...row, acute: 300 * 0.9 ** index, chronic: 300 * 0.8 ** index }));
  const result = projectGarminRest({ ...report, wellness: {}, garminLoadHistory: { rows: rising } });
  assert.equal(result.available, true);
  assert.ok(result.estimate.acute < result.baseline.acute);
  assert.ok(result.estimate.chronic < result.baseline.chronic);
  assert.ok(result.estimate.ratio > result.baseline.ratio);
});

test("zero denominators stay unavailable and extrapolation is disclosed", () => {
  const zero = projectGarminRest({ ...report, wellness: {}, garminLoadHistory: { rows: [...rows.slice(0, -1), { ...rows.at(-1), chronic: 0 }] } });
  assert.equal(zero.available, false);
  const outside = projectGarminRest({ ...report, wellness: {}, garminLoadHistory: { rows: [...rows.slice(0, -1), { ...rows.at(-1), acute: 600, chronic: 200 }] } });
  assert.equal(outside.available, true);
  assert.equal(outside.extrapolation, true);
  assert.ok(outside.reasons.some(reason => reason.includes("extrapolation")));
});
