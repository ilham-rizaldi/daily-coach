import { coversWindow, formatDate, shiftDate } from "./report.js";

const finite = value => Number.isFinite(value) ? value : null;
const positive = value => Number.isFinite(value) && value >= 0 ? value : null;
const validDate = date => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && Number.isFinite(Date.parse(`${date}T12:00:00Z`))
  && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null;
}

function historyRows(report) {
  const byDate = new Map();
  const fields = ["hrvMs", "hrv7dMs", "hrvLowMs", "hrvHighMs", "rhrBpm", "sleepMinutes", "sleepNeedMinutes", "bodyBatteryHigh", "bodyBatteryLow", "bodyBatteryCharge"];
  for (const row of report?.wellnessHistory?.rows || []) {
    if (!validDate(row?.date) || row.date > report.date) continue;
    const previous = byDate.get(row.date);
    const normalized = { date: row.date };
    for (const field of fields) {
      const value = positive(row[field]);
      // Conflicting duplicate dated observations cannot silently become one reading.
      normalized[field] = previous && previous[field] !== value ? null : value;
    }
    byDate.set(row.date, normalized);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function recoverySeries(report, days = 28) {
  if (!validDate(report?.date) || ![7, 28, 56].includes(days)) return [];
  const history = historyRows(report), byDate = new Map(history.map(row => [row.date, row]));
  return Array.from({ length: days }, (_, index) => {
    const date = shiftDate(report.date, index - days + 1), row = byDate.get(date) || {};
    const previous = history.filter(item => item.date >= shiftDate(date, -28) && item.date < date && Number.isFinite(item.rhrBpm));
    const rhrBaseline = previous.length >= 7 ? median(previous.map(item => item.rhrBpm)) : null;
    const hrvBand = Number.isFinite(row.hrvLowMs) && Number.isFinite(row.hrvHighMs) && row.hrvLowMs <= row.hrvHighMs ? [row.hrvLowMs, row.hrvHighMs] : null;
    const bodyBatteryRange = Number.isFinite(row.bodyBatteryLow) && Number.isFinite(row.bodyBatteryHigh)
      && row.bodyBatteryLow <= row.bodyBatteryHigh && row.bodyBatteryHigh <= 100 ? [row.bodyBatteryLow, row.bodyBatteryHigh] : null;
    return {
      date, label: formatDate(date), hrvMs: finite(row.hrvMs), hrv7dMs: finite(row.hrv7dMs), hrvBand,
      rhrBpm: finite(row.rhrBpm), rhrBaseline, rhrBaselineN: previous.length,
      rhrDelta: Number.isFinite(row.rhrBpm) && rhrBaseline !== null ? row.rhrBpm - rhrBaseline : null,
      sleepMinutes: finite(row.sleepMinutes), sleepNeedMinutes: finite(row.sleepNeedMinutes),
      sleepGap: Number.isFinite(row.sleepMinutes) && Number.isFinite(row.sleepNeedMinutes) ? row.sleepMinutes - row.sleepNeedMinutes : null,
      bodyBatteryRange, bodyBatteryHigh: bodyBatteryRange?.[1] ?? null, bodyBatteryLow: bodyBatteryRange?.[0] ?? null,
      bodyBatteryCharge: finite(row.bodyBatteryCharge),
    };
  });
}

const sessionSeconds = activity => positive(activity.timerSeconds) ?? positive(activity.movingSeconds);
const sessionLoad = activity => positive(activity.intervalsListLoad) ?? positive(activity.intervalsLoad);

export function cyclingProgression(report, blocks = 6) {
  if (!validDate(report?.date) || !Number.isInteger(blocks) || blocks < 1 || blocks > 52) return [];
  const activities = (report.activities || []).filter(activity => activity.classification !== "non-training"
    && validDate(activity.date) && activity.date < report.date);
  return Array.from({ length: blocks }, (_, index) => {
    const end = shiftDate(report.date, -1 - (blocks - index - 1) * 7), start = shiftDate(end, -6);
    const rows = activities.filter(activity => activity.date >= start && activity.date <= end);
    const rides = rows.filter(activity => activity.sport === "Ride"), complete = Boolean(report.coverage && coversWindow(report, start, end));
    const timers = rides.map(sessionSeconds), loads = rides.map(sessionLoad);
    const missingDuration = timers.filter(value => value === null).length, missingLoad = loads.filter(value => value === null).length;
    const knownSeconds = timers.reduce((sum, value) => sum + (value ?? 0), 0), knownLoad = loads.reduce((sum, value) => sum + (value ?? 0), 0);
    const observed = rides.length > 0 || complete;
    return {
      start, end, label: formatDate(end), complete, sessions: observed ? rides.length : null,
      hours: observed && !missingDuration ? knownSeconds / 3600 : null,
      longestMinutes: observed && !missingDuration ? Math.max(0, ...timers) / 60 : null,
      load: observed && !missingLoad ? knownLoad : null, knownLoad: observed ? knownLoad : null,
      missingLoad, missingDuration, partial: !complete,
      strengthSessions: rows.some(activity => activity.sport === "Weight Training") || complete
        ? rows.filter(activity => activity.sport === "Weight Training").length : null,
    };
  });
}

export function trainingPlacement(report, days = 28) {
  if (!validDate(report?.date) || !Number.isInteger(days) || days < 1 || days > 56) return [];
  return Array.from({ length: days }, (_, index) => {
    const date = shiftDate(report.date, index - days), rows = (report.activities || []).filter(activity => activity.date === date && activity.classification !== "non-training");
    const complete = Boolean(report.coverage && coversWindow(report, date, date));
    return { date, label: formatDate(date), weekday: formatDate(date, { weekday: "short" }).split(",")[0], complete,
      rides: rows.filter(activity => activity.sport === "Ride").length,
      strength: rows.filter(activity => activity.sport === "Weight Training").length,
      other: rows.filter(activity => !["Ride", "Weight Training"].includes(activity.sport)).length };
  });
}
