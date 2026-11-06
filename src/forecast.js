import { shiftDate } from "./report.js";

// Intervals-style exponential daily load model. This is deliberately separate
// from Garmin's proprietary weighted acute/chronic-load calculation.
export const DEFAULT_TIME_CONSTANTS = { fitnessDays: 42, fatigueDays: 7 };

const finiteNonnegative = value => Number.isFinite(value) && value >= 0;
const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

function quantile(values, fraction) {
  if (!values.length) return null;
  const position = (values.length - 1) * fraction;
  const lower = Math.floor(position);
  return values[lower] + (values[Math.ceil(position)] - values[lower]) * (position - lower);
}

function activityLoad(activity) {
  // The native list load precedes the viewer's generic field: strength may
  // intentionally have null generic load and nonzero native HRSS.
  if (finiteNonnegative(activity.intervalsListLoad)) return activity.intervalsListLoad;
  if (finiteNonnegative(activity.intervalsLoad)) return activity.intervalsLoad;
  return null;
}

export function historicalLoadRate(report, sport) {
  const date = report?.date;
  if (!validDate(date)) return { available: false, n: 0, low: null, median: null, high: null, error: "A valid report date is needed." };
  const window = { start: shiftDate(date, -42), end: shiftDate(date, -1) };
  const rows = (report.activities || []).filter(activity => activity.sport === sport
    && activity.classification !== "non-training" && validDate(activity.date)
    && activity.date >= window.start && activity.date <= window.end);
  let excludedMissing = 0;
  let excludedShort = 0;
  const samples = [];
  for (const activity of rows) {
    const seconds = finiteNonnegative(activity.timerSeconds) ? activity.timerSeconds : activity.movingSeconds;
    const load = activityLoad(activity);
    if (!finiteNonnegative(seconds) || load === null) { excludedMissing++; continue; }
    if (seconds < 15 * 60) { excludedShort++; continue; }
    samples.push({ date: activity.date, name: activity.name || sport, minutes: seconds / 60, load, rate: load * 3600 / seconds });
  }
  const rates = samples.map(sample => sample.rate).sort((a, b) => a - b);
  return {
    available: rates.length > 0, n: rates.length,
    low: quantile(rates, 0.25), median: quantile(rates, 0.5), high: quantile(rates, 0.75),
    minimum: rates[0] ?? null, maximum: rates.at(-1) ?? null,
    unit: "Intervals load/hour", window, excludedMissing, excludedShort,
    examples: samples.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3),
    durationBasis: "Recorded session timer, including pauses and strength rest; legacy reports use their canonical session duration.",
    rangeDefinition: "25th–75th percentiles of observed same-sport load rates, not an intensity classification or confidence interval.",
    sparse: rates.length < 3,
  };
}

export function contributionWeights(report, sport) {
  if (sport === "Rest") return { fitness: 0, fatigue: 0, source: "No planned training load", assumed: false };
  const type = { "Weight Training": "WeightTraining", Ride: "Ride", Run: "Run" }[sport] || sport;
  const setting = report?.intervals?.settings?.activityTypeWeights?.[type];
  if (finiteNonnegative(setting?.fitnessPercent) && finiteNonnegative(setting?.fatiguePercent)) {
    return { fitness: setting.fitnessPercent / 100, fatigue: setting.fatiguePercent / 100, source: "Captured Intervals sport contribution settings", assumed: false };
  }
  const observations = (report?.activities || []).filter(activity => activity.sport === sport && activity.classification !== "non-training"
    && activity.date <= report.date && activityLoad(activity) > 0
    && finiteNonnegative(activity.intervalsFitnessLoad) && finiteNonnegative(activity.intervalsFatigueLoad))
    .map(activity => ({ fitness: activity.intervalsFitnessLoad / activityLoad(activity), fatigue: activity.intervalsFatigueLoad / activityLoad(activity) }));
  if (observations.length && observations.every(value => Math.abs(value.fitness - observations[0].fitness) < 1e-6
    && Math.abs(value.fatigue - observations[0].fatigue) < 1e-6)) {
    return { ...observations[0], source: `Observed named contributions in ${observations.length} captured ${sport} records`, assumed: false };
  }
  return { fitness: 1, fatigue: 1, source: "Equal fitness/fatigue contribution assumed; sport weights were not captured", assumed: true };
}

export function estimateSessionLoad(report, { sport, minutes } = {}) {
  const weights = contributionWeights(report, sport);
  if (sport === "Rest") return { available: true, low: 0, mid: 0, high: 0, weights, history: null };
  if (!finiteNonnegative(minutes) || !sport) return { available: false, low: null, mid: null, high: null, weights, history: null, error: "Enter non-negative planned minutes and a sport." };
  const history = historicalLoadRate(report, sport);
  if (!history.available) return { available: false, low: null, mid: null, high: null, weights, history, error: "No usable same-sport load history. Enter a load estimate manually." };
  return { available: true, low: history.low * minutes / 60, mid: history.median * minutes / 60, high: history.high * minutes / 60, weights, history };
}

function state(fitness, fatigue) {
  return { fitness, fatigue, form: fitness - fatigue, ratio: fitness > 0 ? fatigue / fitness : null };
}

function projectedRange(states) {
  return Object.fromEntries(["fitness", "fatigue", "form", "ratio"].map(key => {
    const values = states.map(value => value[key]).filter(Number.isFinite);
    return [key, values.length ? { low: Math.min(...values), high: Math.max(...values) } : { low: null, high: null }];
  }));
}

export function projectTomorrow(report, options = {}) {
  const {
    todayLoad = 0, todayFitnessWeight = 1, todayFatigueWeight = 1,
    loadLow, load, loadHigh, fitnessWeight = 1, fatigueWeight = 1,
    fitnessDays = DEFAULT_TIME_CONSTANTS.fitnessDays, fatigueDays = DEFAULT_TIME_CONSTANTS.fatigueDays,
  } = options;
  const source = report?.intervals;
  if (!validDate(report?.date)) return { available: false, error: "A valid report date is needed." };
  const sourceDate = source?.date || source?.observedDate;
  if (sourceDate && (!validDate(sourceDate) || sourceDate !== report.date)) return { available: false, error: "Intervals baseline date differs from the report date. Refresh the dated baseline before forecasting tomorrow." };
  if (!finiteNonnegative(source?.fitness) || !finiteNonnegative(source?.fatigue)) return { available: false, error: "A dated Intervals fitness and fatigue baseline is needed. Garmin values cannot substitute for it." };
  const lowLoad = loadLow === undefined ? load : loadLow;
  const highLoad = loadHigh === undefined ? load : loadHigh;
  if (![todayLoad, lowLoad, load, highLoad].every(finiteNonnegative)) return { available: false, error: "Enter non-negative numeric load values; blank or unavailable values are not zero." };
  if (lowLoad > load || highLoad < load) return { available: false, error: "The low estimate must not exceed the central estimate, and the high estimate must not be below it." };
  if (![todayFitnessWeight, todayFatigueWeight, fitnessWeight, fatigueWeight].every(finiteNonnegative)) return { available: false, error: "Fitness and fatigue contribution weights must be non-negative numbers." };
  if (![fitnessDays, fatigueDays].every(value => Number.isFinite(value) && value >= 1 && value <= 365)) return { available: false, error: "Time constants must be between 1 and 365 days." };
  const fitnessDecay = Math.exp(-1 / fitnessDays);
  const fatigueDecay = Math.exp(-1 / fatigueDays);
  const baseline = {
    ...state(source.fitness, source.fatigue), date: sourceDate || report.date,
    dateVerified: Boolean(sourceDate), observedAt: source.provenance?.observedAt || null,
  };
  // The date's marker already contains today's decay and already-recorded load.
  // Only the remaining load's weighted delta belongs here. Do not decay twice.
  const todayAdjusted = state(baseline.fitness + (1 - fitnessDecay) * todayLoad * todayFitnessWeight,
    baseline.fatigue + (1 - fatigueDecay) * todayLoad * todayFatigueWeight);
  const apply = plannedLoad => state(todayAdjusted.fitness * fitnessDecay + (1 - fitnessDecay) * plannedLoad * fitnessWeight,
    todayAdjusted.fatigue * fatigueDecay + (1 - fatigueDecay) * plannedLoad * fatigueWeight);
  const rest = apply(0);
  const low = apply(lowLoad);
  const mid = apply(load);
  const high = apply(highLoad);
  if ([todayAdjusted, rest, low, mid, high].some(value => !Number.isFinite(value.fitness) || !Number.isFinite(value.fatigue))) return { available: false, error: "Load values are too large to model." };
  const assumptions = [
    "Intervals-style model only. The ATL/CTL ratio is not Garmin's load ratio or a safety threshold.",
    `Time constants assumed or user-selected: fatigue ${fatigueDays} days, fitness ${fitnessDays} days. The athlete's actual constants were not verified.`,
    "Baseline is treated as the report-date snapshot with its daily decay and already-recorded load included. Today's input adds only remaining, unrecorded training.",
    "Form here means absolute end-of-day CTL minus ATL. It may differ from a provider's start-of-day or percentage-form display.",
    "Load-range outputs vary only the entered planned load. Rounded source values, settings, future recovery and model error are not included in that range.",
  ];
  if (!baseline.dateVerified) assumptions.push("The baseline measurement date was not captured; the report date is assumed. Refresh it before using this as a current forecast.");
  return {
    available: true, date: shiftDate(report.date, 1), baseline,
    todayAdjusted, rest, low, mid, high, range: projectedRange([low, mid, high]),
    startOfTomorrowForm: todayAdjusted.form,
    loads: { today: todayLoad, low: lowLoad, mid: load, high: highLoad },
    fitnessDays, fatigueDays, assumptions,
    formula: "CTL(next) = CTL × exp(−1/fitness days) + fitness load × (1 − exp(−1/fitness days)); ATL uses fatigue days and fatigue load.",
  };
}
