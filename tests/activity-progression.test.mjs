import test from "node:test";
import assert from "node:assert/strict";
import { activityComparisons, activitySpeedSeries, paceSeconds } from "../src/activityProgression.js";

const date = "2026-11-23";
const garmin = "Garmin Connect";
const activity = (d, fields = {}) => ({
  date: d, sport: "Ride", source: garmin, distanceKind: "recorded", distanceKm: 20, timerSeconds: 2400,
  startedAt: `${d}T07:00:00+07:00`, ...fields,
});
const summary = (id, d, sourceType, fields = {}) => ({
  id, date: d, sourceType, sport: "Ride", distanceKm: 20, timerSeconds: 2400,
  sourceLocalStart: `${d}T07:00:00`, ...fields,
});
const reportWith = (activities, archive, native = []) => ({
  date, capturedAt: "2026-11-23T03:00:00Z", activities,
  baseHistory: { providerActivities: { [garmin]: archive }, garminNativeRecordings: { files: native } },
});

test("rejoins the latest canonical activity to Garmin archive metadata and plots it once", () => {
  const archive = [
    summary("1", "2026-11-22", "road_biking", { distanceKm: 20.01 }),
    summary("2", "2026-11-03", "indoor_cycling"),
    summary("3", "2026-09-20", "road_biking"),
    summary("4", "2026-11-24", "road_biking"),
  ];
  const groups = activitySpeedSeries(reportWith([activity("2026-11-22", { externalIds: { garmin: "1" } })], archive));
  const outside = groups.find(row => row.scope === "Outdoor");
  assert.equal(outside.basis, "timer");
  assert.deepEqual(outside.points.map(row => row.date), ["2026-09-20", "2026-11-22"]);
  assert.equal(outside.points.at(-1).value, 20.01 * 3600 / 2400);
  assert.equal(groups.find(row => row.scope === "Indoor").points[0].activityId, "2");
});

test("indoor labels take precedence over virtual GPS, generic runs need measured GPS or FIT evidence", () => {
  const run = { sport: "Run" };
  const archive = [
    summary("1", "2026-11-05", "treadmill_running", run),
    summary("2", "2026-11-14", "running", { ...run, hasGpsTrack: true, distanceKm: 11, timerSeconds: 6600 }),
    summary("3", "2026-11-20", "running", run),
    summary("4", "2026-10-01", "virtual_ride", { hasGpsTrack: true }),
  ];
  const groups = activitySpeedSeries(reportWith([], archive));
  const running = groups.find(row => row.sport === "Running" && row.scope === "Outdoor");
  assert.deepEqual(running.points.map(row => row.activityId), ["2"]);
  assert.equal(paceSeconds(running.points[0].value), 600);
  assert.equal(groups.find(row => row.sport === "Running" && row.scope === "Indoor").points[0].activityId, "1");
  assert.equal(groups.find(row => row.sport === "Cycling").scope, "Indoor");
  const fromFit = activitySpeedSeries(reportWith([], archive, [{ activityId: "3", date: "2026-11-20", environment: "outdoor" }]));
  assert.equal(fromFit.find(row => row.sport === "Running" && row.scope === "Outdoor").points.at(-1).activityId, "3");
});

test("recognizes an ID-less archive match without duplicating it or restoring an excluded recording", () => {
  const rows = [
    activity("2026-11-05", { sport: "Run" }),
    activity("2026-10-28", { sport: "Workout", classification: "non-training" }),
  ];
  const archive = [
    summary("1", "2026-11-05", "treadmill_running", { sport: "Run" }),
    summary("2", "2026-10-28", "treadmill_running", { sport: "Run" }),
  ];
  const groups = activitySpeedSeries(reportWith(rows, archive));
  assert.deepEqual(groups.flatMap(group => group.points.map(row => row.activityId)), ["1"]);
});

test("a distance belongs to one whole-session group and keeps exact marathon boundaries", () => {
  const points = [4.99, 5, 9.99, 10, 21.0975, 42.195, null].map(distance => ({ distance, date, at: 1 }));
  const { bins, selected } = activityComparisons(points, "Running", "distance", date);
  assert.deepEqual(bins.map(bin => bin.points.map(row => row.distance)), [[4.99], [5, 9.99], [10], [], [21.0975], [42.195]]);
  assert.equal(selected.min, 5);
});

test("ride duration uses recorded time and switches independently of the distance range", () => {
  const points = [
    { distance: 20, seconds: 1799, at: 1, date },
    { distance: 30, seconds: 1800, at: 2, date },
    { distance: 40, seconds: 3600, at: 3, date },
    { distance: 100, seconds: 7200, at: 4, date },
    { distance: 20, at: 5, date },
  ];
  const byTime = activityComparisons(points, "Cycling", "duration", date, "1800");
  const byDistance = activityComparisons(points, "Cycling", "distance", date, "20");
  assert.deepEqual(byTime.bins.map(bin => bin.points.length), [1, 1, 1, 1]);
  assert.equal(byTime.selected.points[0].distance, 30);
  assert.equal(byDistance.selected.points.length, 2);
});
