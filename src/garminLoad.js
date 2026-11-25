import { decimal, shiftDate } from "./report.js";

// Garmin Connect's ratio band. The personalized acute band is stored per day.
export const connectRatioRange = { low: 0.8, high: 1.5 };
export const connectLoadGuide = "https://support.garmin.com/en-SG/?faq=SEkNpdGyhR917js0qQL3Q6";
const valid = value => Number.isFinite(value) && value >= 0;
const isDated = (reading, date) => (reading?.metricDate ?? reading?.date) === date;

export const garminLoadWindowDays = 42;

export function garminLoadWindow(report) {
  const end = report.date;
  const start = shiftDate(end, 1 - garminLoadWindowDays);
  const byDate = new Map();
  for (const row of report.garminLoadHistory?.rows || []) {
    if (!row?.date || row.date < start || row.date > end || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)
      || !Number.isFinite(Date.parse(row.date)) || shiftDate(row.date, 0) !== row.date) continue;
    if (![row.acute, row.chronic, row.ratio].some(valid) && !optimalAcuteRange(row)) continue;
    byDate.set(row.date, row);
  }
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    start, end, rows,
    pairedDays: rows.filter(row => valid(row.acute) && valid(row.chronic)).length,
    bandDays: rows.filter(optimalAcuteRange).length,
    ratioDays: rows.filter(row => valid(row.ratio)).length,
  };
}

export function optimalAcuteRange(row) {
  return valid(row?.optimalLow) && valid(row?.optimalHigh) && row.optimalHigh > row.optimalLow
    ? { low: row.optimalLow, high: row.optimalHigh } : null;
}

export function rangeLabel(range) {
  return range ? `${decimal(range.low)}–${decimal(range.high)}` : null;
}

export function garminLoadReading(report, row) {
  const w = report.wellness || {};
  const evidence = w.provenance?.currentLoadContext;
  const current = row?.date === report.date && (w.date ?? report.date) === report.date;
  const range = optimalAcuteRange(row);
  const acute = row?.acute ?? (current ? w.garminAcuteLoad : null);
  const ratio = row?.ratio ?? (current ? w.garminLoadRatio : null);
  const acuteStatus = row?.acuteStatus ?? (current && isDated(evidence?.acute, row.date) ? w.garminAcuteLoadStatus : null);
  const ratioStatus = row?.ratioStatus ?? (current && isDated(evidence?.ratio, row.date) ? w.garminLoadRatioStatus : null);
  const high = (label, value, limit, status, unit, approximate = false) => {
    if (!/^(?:high(?: ratio)?|very high)$/i.test(status || "") && !(valid(value) && limit && value > limit.high)) return null;
    return valid(value) && limit && value > limit.high
      ? `${label} is ${approximate ? "about " : ""}${decimal(value - limit.high)}${unit} above Garmin’s upper limit.`
      : `Garmin rated ${label.toLowerCase()} high.`;
  };
  return {
    acute, ratio, acuteStatus, ratioStatus, range,
    acuteNote: high("Acute load", acute, range, acuteStatus, " points", true),
    ratioNote: high("Load ratio", ratio, connectRatioRange, ratioStatus, ""),
  };
}
