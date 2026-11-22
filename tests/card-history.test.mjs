import assert from "node:assert/strict";
import test from "node:test";
import { filterCardHistory, resolveCardHistory } from "../src/cardHistory.js";

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
