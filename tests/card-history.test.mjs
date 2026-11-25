import assert from "node:assert/strict";
import test from "node:test";
import { dailyChartRuns, datedHistory, filterCardHistory, historyChartSeries, resolveCardHistory } from "../src/cardHistory.js";
import { garminLoadWindow } from "../src/garminLoad.js";

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
  const report = { date: "2026-06-10", intervals: {
    date: "2026-06-10", fitness: 24, fatigue: 39, form: -15,
    displayedSnapshots: [{ date: "2026-06-08", fitness: 20, fatigue: 20, modelState: "unverified" }],
  }, baseHistory: {
    intervalsWellness: [{ date: "2026-06-09", restingHrBpm: 52 }],
    intervalsDaily: [
      { date: "2026-06-08", fitness: 19.5, fatigue: 25 },
      { date: "2026-06-10", fitness: 25, fatigue: 40 },
      { date: "2026-06-11", fitness: 24, fatigue: 35 },
    ],
  } };
  const wellness = resolveCardHistory(report, [], "intervals-wellness");
  const load = resolveCardHistory(report, [], "intervals");
  assert.deepEqual(historyChartSeries(wellness, wellness.rows).map(series => series.label), ["Resting HR · bpm"]);
  const rows = filterCardHistory(load.rows, report.date, null);
  assert.deepEqual(rows.map(row => [row.date, row.plot]), [
    ["2026-06-10", [24, 39, -15]], ["2026-06-08", [19.5, 25, -5.5]],
  ]);
  assert.deepEqual(historyChartSeries(load, rows).map(series => series.label), ["Fitness", "Fatigue", "Form"]);
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

test("Garmin load history retains dated bands and provider ratios without backfilling gaps", () => {
  const report = {
    date: "2026-11-24",
    wellness: { date: "2026-11-24", garminAcuteLoad: 630, garminChronicLoad: 390, garminLoadRatio: 1.5 },
    garminLoadHistory: { rows: [
      { date: "2026-11-22", acute: 500, chronic: 350 },
      { date: "2026-11-23", acute: 580, chronic: 365, ratio: null, optimalLow: 300, optimalHigh: 500 },
      { date: "2026-11-24", acute: 650, chronic: 395, ratio: 1.6, optimalLow: 310, optimalHigh: 580 },
    ] },
  };
  const history = resolveCardHistory(report, [], "garmin-load");
  const rows = filterCardHistory(history.rows, report.date, 7);
  assert.deepEqual(rows.map(row => row.values), [
    [650, 395, 1.6, "≈310–580"], [580, 365, null, "≈300–500"], [500, 350, undefined, null],
  ]);
  assert.deepEqual(history.chartBands.Ratio, { low: 0.8, high: 1.5 });
  assert.deepEqual(history.chartBands.Acute.map(range => range.date).sort(), ["2026-11-23", "2026-11-24"]);
});

test("the Garmin chart counts each recorded series separately within the 42-day report window", () => {
  const report = { date: "2026-11-25", garminLoadHistory: { rows: [
    { date: "2026-11-25", acute: 570, chronic: 388, ratio: 1.4, optimalLow: 310, optimalHigh: 582 },
    { date: "2026-11-24", acute: 660, chronic: 395, ratio: null },
    { date: "2026-11-23", ratio: 1.5 },
    { date: "2026-10-15", chronic: 480 },
    { date: "2026-10-14", acute: 450, chronic: 470, ratio: 1.0 },
    { date: "2026-11-26", acute: 500, chronic: 380, ratio: 1.3 },
  ] } };
  const { start, end, rows, pairedDays, bandDays, ratioDays } = garminLoadWindow(report);
  assert.deepEqual([start, end], ["2026-10-15", "2026-11-25"]);
  assert.deepEqual([pairedDays, bandDays, ratioDays], [2, 1, 2]);
  assert.deepEqual(rows.map(row => [row.date, row.ratio]), [
    ["2026-10-15", undefined], ["2026-11-23", 1.5], ["2026-11-24", null], ["2026-11-25", 1.4],
  ]);
});

test("Training Status histories preserve distinct VO₂ series, real HRV dates and recorded heat and load", () => {
  const report = { date: "2026-11-25", wellness: { date: "2026-11-25", vo2Max: 43, heatAcclimationPercent: 100 },
    baseHistory: { snapshots: [
      { date: "2026-11-20", wellness: { date: "2026-11-20", heatAcclimationPercent: 70 } },
    ] },
    wellnessHistory: { rows: [{ date: "2026-11-22", hrv7dMs: 58, hrvLowMs: 45, hrvHighMs: 68 }, { date: "2026-11-23", hrvMs: 62 }] },
    garminLoadHistory: { rows: [{ date: "2026-11-21", acute: 434, optimalLow: 265, optimalHigh: 500 }] },
    performance: { vo2History: [
      { date: "2026-11-10", sport: "General", value: 43.4, source: "Garmin Connect" },
      { date: "2026-11-16", sport: "Cycling", value: 41.8, source: "Garmin Connect" },
    ] },
  };
  const get = metric => resolveCardHistory(report, [], { kind: "training-status", metric });
  const vo2 = get("vo2");
  assert.deepEqual(historyChartSeries(vo2, filterCardHistory(vo2.rows, report.date, null)).map(item => [item.label, item.points.map(point => point.value)]),
    [["Training Status reading", [43]], ["General", [43.4]], ["Cycling", [41.8]]]);
  const hrv = get("hrv7d");
  assert.deepEqual(hrv.rows.map(row => [row.date, row.values[0]]), [["2026-11-22", 58]]);
  assert.deepEqual(hrv.chartBands["7-day HRV · ms"], [{ date: "2026-11-22", low: 45, high: 68 }]);
  assert.deepEqual(get("heat").rows.map(row => [row.date, row.values[0]]), [["2026-11-20", 70], ["2026-11-25", 100]]);
  assert.deepEqual(get("acute").rows.map(row => [row.date, row.values[0]]), [["2026-11-21", 434]]);
});
