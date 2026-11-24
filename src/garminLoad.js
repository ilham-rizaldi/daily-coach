import { decimal } from "./report.js";

// Garmin Connect's ratio band. The personalized acute band is stored per day.
export const connectRatioRange = { low: 0.8, high: 1.5 };
export const connectLoadGuide = "https://support.garmin.com/en-SG/?faq=SEkNpdGyhR917js0qQL3Q6";
const valid = value => Number.isFinite(value) && value >= 0;
const isDated = (reading, date) => (reading?.metricDate ?? reading?.date) === date;

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
