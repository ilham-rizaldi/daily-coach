const fields = {
  hrvMs: ["overnight_hrv_ms", "ms"],
  hrv7dMs: ["hrv_7d_avg_ms", "ms"],
  hrvLowMs: ["hrv_baseline_lower_ms", "ms"],
  hrvHighMs: ["hrv_baseline_upper_ms", "ms"],
  rhrBpm: ["resting_heart_rate_bpm", "bpm"],
  sleepMinutes: ["sleep_duration_minutes", "minutes"],
  sleepNeedMinutes: ["sleep_need_minutes", "minutes"],
  bodyBatteryHigh: ["body_battery_daily_high", "score"],
  bodyBatteryLow: ["body_battery_daily_low", "score"],
  bodyBatteryCharge: ["sleep_body_battery_charge", "score_points"],
};

const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

export function attachWellnessHistory(report, capture) {
  if (!validDate(report?.date)) throw new Error("A valid report date is required.");
  if (!Array.isArray(capture?.daily_records) || capture.validation?.status !== "passed" || capture.conflicts?.length) throw new Error("A validated, conflict-free daily wellness export is required.");
  const dates = new Set();
  const rows = capture.daily_records.filter(row => validDate(row.date) && row.date <= report.date).map(row => {
    if (dates.has(row.date)) throw new Error("Duplicate wellness date.");
    dates.add(row.date);
    const out = { date: row.date, provenance: {} };
    for (const [name, [field, unit]] of Object.entries(fields)) {
      const reading = row.fields?.[field];
      if (Number.isFinite(reading?.value) && reading.unit !== unit) throw new Error(`Unexpected unit for ${field}.`);
      out[name] = Number.isFinite(reading?.value) && reading.value >= 0 ? reading.value : null;
      if (reading?.source) out.provenance[name] = { exportId: reading.source.export_id, row: reading.source.csv_row, column: reading.source.csv_column, capturedAt: reading.source.captured_file_mtime };
    }
    return out;
  }).sort((a, b) => a.date.localeCompare(b.date));
  const captures = rows.flatMap(row => Object.values(row.provenance).map(value => value.capturedAt)).filter(value => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b));
  return { ...report, wellnessHistory: { source: "Garmin Connect native daily exports", observedAt: captures.at(-1) || null, rows, validation: { status: "passed", dateCount: rows.length, sourceConflicts: 0 } } };
}
