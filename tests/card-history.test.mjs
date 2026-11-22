import assert from "node:assert/strict";
import test from "node:test";
import { dailyChartRuns, datedHistory, filterCardHistory, historyChartSeries, resolveCardHistory } from "../src/cardHistory.js";

test("Body Battery all-history keeps dated low/high and gaps at the selected report cutoff", () => {
  const report = {
    date: "2026-06-10",
    wellnessHistory: { rows: [
      { date: "2025-04-18", bodyBatteryLow: 5, bodyBatteryHigh: 91 },
      { date: "2026-06-08", bodyBatteryLow: 0, bodyBatteryHigh: 68 },
      { date: "2026-06-09", sleepMinutes: 360 },
      { date: "2026-06-11", bodyBatteryLow: 5, bodyBatteryHigh: 90 },
    ] },
  };
  const history = resolveCardHistory(report, [], "battery");
  const lastWeek = filterCardHistory(history.rows, report.date, 7);
  assert.deepEqual(lastWeek.map(row => row.date), ["2026-06-08"]);
  assert.equal(lastWeek[0].values[0], 0);
  assert.deepEqual(filterCardHistory(history.rows, report.date, null).map(row => row.date), ["2026-06-08", "2025-04-18"]);
});

test("a source history uses only that provider and unavailable metrics remain blank", () => {
  const report = { date: "2026-06-10", baseHistory: { providerActivities: {
    Strava: [{ date: "2026-06-01", name: "Ride", distanceKm: 25 }],
    "Garmin Connect": [{ date: "2026-06-01", name: "Ride", averageHr: 148 }],
  } } };
  const history = resolveCardHistory(report, [], { kind: "source", source: "Strava" });
  assert.equal(history.rows.length, 1);
  assert.equal(history.rows[0].values[3], undefined);
});

test("history chart plots raw units and leaves an empty day between lines", () => {
  const readings = [
    { date: "2026-06-10", seconds: 900 },
    { date: "2026-06-09", seconds: 300 },
    { date: "2026-06-08", seconds: null },
    { date: "2026-06-07", seconds: 120 },
    { date: "2026-06-06", seconds: 0 },
  ];
  const history = datedHistory("Recorded time", ["Display"], readings, row => [row.seconds == null ? null : String(row.seconds)], {
    daily: true, chart: [["Minutes", row => Number.isFinite(row.seconds) ? row.seconds / 60 : null]],
  });
  const [series] = historyChartSeries(history, filterCardHistory(history.rows, "2026-06-10", 7));
  assert.equal(series.label, "Minutes");
  assert.deepEqual(series.points.map(point => point.value), [0, 2, 5, 15]);
  assert.deepEqual(dailyChartRuns(series.points).map(run => run.map(point => point.date)), [
    ["2026-06-06", "2026-06-07"], ["2026-06-09", "2026-06-10"],
  ]);
});

test("Intervals wellness readings and fitness model fields stay on distinct cards", () => {
  const report = { date: "2026-06-10", baseHistory: {
    intervalsWellness: [{ date: "2026-06-09", restingHrBpm: 52 }],
    intervalsDaily: [{ date: "2026-06-08", fitness: 19, fatigue: 25 }],
  } };
  const wellness = resolveCardHistory(report, [], "intervals-wellness");
  const load = resolveCardHistory(report, [], "intervals");
  assert.deepEqual(historyChartSeries(wellness, wellness.rows).map(series => series.label), ["Resting HR · bpm"]);
  assert.deepEqual(historyChartSeries(load, load.rows).map(series => series.label), ["CTL", "ATL"]);
});

test("weekly history respects the selected sport and excludes the report day", () => {
  const report = { date: "2026-06-10", activities: [
    { date: "2026-06-10", sport: "Ride", movingSeconds: 1500 },
    { date: "2026-06-09", sport: "Ride", movingSeconds: 600 },
    { date: "2026-06-09", sport: "Ride", movingSeconds: 600 },
    { date: "2026-06-04", sport: "Ride", movingSeconds: 600 },
    { date: "2026-06-04", sport: "Run", movingSeconds: 600 },
    { date: "2026-06-01", sport: "Ride", movingSeconds: 600 },
  ] };
  const history = resolveCardHistory(report, [], { kind: "activity-weeks", sport: "Ride", metric: "activeDays" });
  assert.deepEqual(filterCardHistory(history.rows, report.date, 7).map(row => [row.date, row.values[0]]), [["2026-06-09", 2]]);
});
