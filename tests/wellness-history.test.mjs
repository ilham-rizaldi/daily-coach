import test from "node:test";
import assert from "node:assert/strict";
import { attachWellnessHistory } from "../src/wellnessHistory.js";

const report = { date: "2026-01-03", capturedAt: "2026-01-03T07:00:00Z", wellness: { readiness: 41 } };
const capture = rows => ({ daily_records: rows, conflicts: [], validation: { status: "passed" } });
const reading = (value, unit) => ({ value, unit, source: { export_id: "sample", csv_row: 2, csv_column: "metric", captured_file_mtime: "2026-01-03T06:00:00Z" } });

test("daily history preserves dated evidence, current wellness and capture time", () => {
  const out = attachWellnessHistory(report, capture([{ date: "2026-01-03", fields: { overnight_hrv_ms: reading(47, "ms"), body_battery_daily_low: reading(0, "score") } }, { date: "2026-01-04", fields: {} }]));
  assert.equal(out.capturedAt, report.capturedAt);
  assert.deepEqual(out.wellness, report.wellness);
  assert.equal(out.wellnessHistory.rows.length, 1);
  assert.equal(out.wellnessHistory.rows[0].hrvMs, 47);
  assert.equal(out.wellnessHistory.rows[0].bodyBatteryLow, 0);
  assert.equal(out.wellnessHistory.rows[0].sleepMinutes, null);
  assert.equal(out.wellnessHistory.rows[0].provenance.hrvMs.exportId, "sample");
});

test("conflicts, duplicate days and wrong units stop enrichment", () => {
  assert.throws(() => attachWellnessHistory(report, { ...capture([]), conflicts: [{}] }));
  assert.throws(() => attachWellnessHistory(report, capture([{ date: "2026-01-02" }, { date: "2026-01-02" }])));
  assert.throws(() => attachWellnessHistory(report, capture([{ date: "2026-01-02", fields: { overnight_hrv_ms: reading(50, "bpm") } }])));
});
