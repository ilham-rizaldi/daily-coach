import { shiftDate } from "./report.js";

const nonnegative = value => Number.isFinite(value) && value >= 0;
const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

function extent(values) {
  return { low: Math.min(...values), high: Math.max(...values) };
}

// A low-confidence empirical analogy, never a reconstruction of Garmin's
// undisclosed weighting. Each acute/chronic transition stays paired so its
// projected ratio always agrees with its projected numerator and denominator.
export function projectGarminRest(report) {
  const unavailable = error => ({ available: false, error, n: 0, samples: [], confidence: "Low" });
  if (!validDate(report?.date)) return unavailable("A valid report date is needed for the Garmin rest estimate.");
  const history = report.garminLoadHistory;
  if (!Array.isArray(history?.rows) || history.rows.length < 2) {
    return unavailable("This report does not contain dated Garmin acute/chronic history. Open an updated report with daily load history.");
  }
  const dates = new Set();
  for (const row of history.rows) {
    if (!row || !validDate(row.date) || !nonnegative(row.acute) || !nonnegative(row.chronic) || dates.has(row.date)) {
      return unavailable("Garmin history needs unique valid dates and non-negative numeric acute/chronic values.");
    }
    dates.add(row.date);
  }
  const rows = [...history.rows].sort((a, b) => a.date.localeCompare(b.date));
  const current = rows.at(-1);
  if (current.date !== report.date) return unavailable("The latest Garmin load-history date must match the report date. Refresh the dated source history.");
  if (current.chronic <= 0) return unavailable("A positive Garmin chronic load is needed to estimate a ratio.");
  for (const [field, value] of [["garminAcuteLoad", current.acute], ["garminChronicLoad", current.chronic]]) {
    const observed = report.wellness?.[field];
    if (observed != null && (!nonnegative(observed) || Math.abs(observed - value) > 0.01)) {
      return unavailable("Current Garmin values and the latest dated history disagree. Refresh them before forecasting.");
    }
  }
  const coverage = report.coverage;
  if (coverage?.complete !== true || !validDate(coverage.start) || !validDate(coverage.end)
    || coverage.start > coverage.end || !Array.isArray(report.activities)
    || report.activities.some(activity => !validDate(activity?.date))) {
    return unavailable("Complete dated activity coverage is needed to identify days with no new recorded activity load.");
  }
  // Include even locally excluded/non-training recordings: Garmin may still
  // have included their exercise load in its source model.
  const activityDates = new Set(report.activities.map(activity => activity.date));
  const oldest = shiftDate(report.date, -56);
  const baseline = {
    date: current.date, acute: current.acute, chronic: current.chronic,
    ratio: current.acute / current.chronic,
    displayRatio: nonnegative(report.wellness?.garminLoadRatio) ? report.wellness.garminLoadRatio : current.acute / current.chronic,
  };
  const samples = [];
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1];
    const next = rows[index];
    if (next.date >= report.date || next.date < oldest || shiftDate(previous.date, 1) !== next.date
      || next.date < coverage.start || next.date > coverage.end || activityDates.has(next.date)
      || previous.acute <= 0 || previous.chronic <= 0 || next.chronic <= 0) continue;
    const acuteFactor = next.acute / previous.acute;
    const chronicFactor = next.chronic / previous.chronic;
    const acute = baseline.acute * acuteFactor;
    const chronic = baseline.chronic * chronicFactor;
    const ratio = acute / chronic;
    if (![acuteFactor, chronicFactor, acute, chronic, ratio].every(Number.isFinite)) continue;
    samples.push({
      date: next.date, fromDate: previous.date,
      fromAcute: previous.acute, fromChronic: previous.chronic, fromRatio: previous.acute / previous.chronic,
      toAcute: next.acute, toChronic: next.chronic,
      acuteFactor, chronicFactor, ratioFactor: acuteFactor / chronicFactor,
      projected: { acute, chronic, ratio },
    });
  }
  if (samples.length < 3) return {
    ...unavailable("At least three completed, consecutive-day Garmin transitions with no new recorded activity are needed."),
    baseline, date: shiftDate(report.date, 1), n: samples.length, samples,
  };
  const ordered = [...samples].sort((a, b) => a.projected.ratio - b.projected.ratio);
  const middle = (ordered.length - 1) / 2;
  const medianRatio = (ordered[Math.floor(middle)].projected.ratio + ordered[Math.ceil(middle)].projected.ratio) / 2;
  // With an even sample count pick the real paired transition closest to the
  // median; prefer the more recent transition if equally close.
  const central = [...samples].sort((a, b) => Math.abs(a.projected.ratio - medianRatio) - Math.abs(b.projected.ratio - medianRatio)
    || b.date.localeCompare(a.date))[0];
  const anchorRange = {
    acute: extent(samples.map(sample => sample.fromAcute)),
    chronic: extent(samples.map(sample => sample.fromChronic)),
    ratio: extent(samples.map(sample => sample.fromRatio)),
  };
  const extrapolation = ["acute", "chronic", "ratio"].some(key => baseline[key] < anchorRange[key].low || baseline[key] > anchorRange[key].high);
  const reasons = [
    "Empirical analogy from completed days with no recorded activity, not Garmin's official forecast or an identified decay formula.",
    "Assumes no new exercise load after this source snapshot through the next day. Unrecorded, unsynced or newly completed activity invalidates that assumption.",
    "The range is the minimum and maximum of historical paired scenarios, not a confidence interval or a guaranteed bound.",
    "Activity-age distributions and Garmin's undisclosed weights can differ from the sampled days; rounded chart scores add uncertainty.",
    "Both acute and chronic load change. The ratio can rise on a day without training when chronic load falls faster.",
  ];
  if (extrapolation) reasons.push("The current load state lies outside at least one historical anchor range; this is an extrapolation with low confidence.");
  return {
    available: true, date: shiftDate(report.date, 1), baseline,
    estimate: { ...central.projected },
    representativeDate: central.date, medianRatio,
    range: Object.fromEntries(["acute", "chronic", "ratio"].map(key => [key, extent(samples.map(sample => sample.projected[key]))])),
    n: samples.length, samples, confidence: "Low", extrapolation, anchorRange, reasons,
    method: "Paired empirical Garmin no-new-recorded-activity transitions, previous 56 days; current partial day excluded.",
    sourceUrl: history.sourceUrl || null, observedAt: history.observedAt || null,
  };
}
