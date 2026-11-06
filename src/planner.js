import { shiftDate } from "./report.js";
import { contributionWeights, DEFAULT_TIME_CONSTANTS, estimateSessionLoad } from "./forecast.js";

export const PLANNER_SPORTS = ["Rest", "Ride", "Run", "Weight Training"];
const nonnegative = value => Number.isFinite(value) && value >= 0;
const dateValid = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const state = (fitness, fatigue) => ({ fitness, fatigue, form: fitness - fatigue, ratio: fitness > 0 ? fatigue / fitness : null });

export function restWeek(report) {
  if (!dateValid(report?.date)) return [];
  return Array.from({ length: 7 }, (_, index) => ({ date: shiftDate(report.date, index + 1), sport: "Rest", minutes: 0, effort: "easy" }));
}

function session(report, plan) {
  if (!plan || !PLANNER_SPORTS.includes(plan.sport)) return { available: false, error: "Select a sport" };
  const minutes = plan.sport === "Rest" ? 0 : plan.minutes;
  if (plan.sport !== "Rest" && (!Number.isFinite(minutes) || minutes <= 0 || minutes > 600)) return { available: false, error: "Duration: 1–600 min" };
  const estimate = estimateSessionLoad(report, { sport: plan.sport, minutes, effort: plan.effort });
  if (!estimate.available) return { ...estimate, error: "Sport load history unavailable" };
  return { ...estimate, minutes, weights: contributionWeights(report, plan.sport) };
}

// Every session has one uncertain load shared by CTL and ATL. Exact TSB bounds
// choose endpoints using the sign of each CTL-minus-ATL coefficient; independent
// CTL/ATL endpoints would discard that covariance and exaggerate the spread.
function envelope(base, terms) {
  let fitnessLow = base.fitness, fitnessHigh = base.fitness;
  let fatigueLow = base.fatigue, fatigueHigh = base.fatigue;
  let formLow = base.form, formHigh = base.form;
  for (const { fitness, fatigue, low, high } of terms) {
    fitnessLow += fitness * low; fitnessHigh += fitness * high;
    fatigueLow += fatigue * low; fatigueHigh += fatigue * high;
    const difference = fitness - fatigue;
    formLow += difference * (difference < 0 ? high : low);
    formHigh += difference * (difference < 0 ? low : high);
  }
  // ATL/CTL is linear-fractional in the load vector; with positive CTL,
  // extrema over this finite box occur at a corner (at most 2^8 here).
  const ratios = [];
  let undefinedRatio = false;
  for (let mask = 0; mask < 2 ** terms.length; mask++) {
    let fitness = base.fitness, fatigue = base.fatigue;
    terms.forEach((term, index) => {
      const load = mask & 2 ** index ? term.high : term.low;
      fitness += term.fitness * load; fatigue += term.fatigue * load;
    });
    if (fitness > 0) ratios.push(fatigue / fitness);
    else if (fatigue > 0) undefinedRatio = true;
  }
  return {
    fitness: { low: fitnessLow, high: fitnessHigh },
    fatigue: { low: fatigueLow, high: fatigueHigh },
    form: { low: formLow, high: formHigh },
    ratio: { low: ratios.length ? Math.min(...ratios) : null, high: ratios.length && !undefinedRatio ? Math.max(...ratios) : null },
  };
}

export function projectWeek(report, plans, options = {}) {
  const { fitnessDays = DEFAULT_TIME_CONSTANTS.fitnessDays, fatigueDays = DEFAULT_TIME_CONSTANTS.fatigueDays, todayPlan = null } = options;
  if (!dateValid(report?.date)) return { available: false, error: "Report date unavailable", rows: [] };
  const source = report.intervals;
  const sourceDate = source?.date || source?.observedDate;
  if (!dateValid(sourceDate) || sourceDate !== report.date || ![source?.fitness, source?.fatigue].every(nonnegative)) return { available: false, error: "Dated Intervals baseline required", rows: [] };
  if (![fitnessDays, fatigueDays].every(value => Number.isFinite(value) && value >= 1 && value <= 365)) return { available: false, error: "Time constants: 1–365 d", rows: [] };
  if (!Array.isArray(plans) || plans.length !== 7 || plans.some((plan, index) => plan?.date !== shiftDate(report.date, index + 1))) return { available: false, error: "Seven consecutive future dates required", rows: [] };

  const estimates = plans.map(plan => session(report, plan));
  const today = session(report, todayPlan || { sport: "Rest", minutes: 0, effort: "easy" });
  const failed = estimates.findIndex(estimate => !estimate.available);
  if (!today.available || failed >= 0) return { available: false, error: !today.available ? `Today: ${today.error}` : `${plans[failed].date}: ${estimates[failed].error}`, rows: [], estimates, today };

  const fitnessDecay = Math.exp(-1 / fitnessDays), fatigueDecay = Math.exp(-1 / fatigueDays);
  const baseline = { ...state(source.fitness, source.fatigue), date: sourceDate, observedAt: source.provenance?.observedAt || null };
  const todayAdjusted = state(baseline.fitness + (1 - fitnessDecay) * today.mid * today.weights.fitness,
    baseline.fatigue + (1 - fatigueDecay) * today.mid * today.weights.fatigue);
  const todayRange = envelope(baseline, [{ low: today.low, high: today.high,
    fitness: (1 - fitnessDecay) * today.weights.fitness, fatigue: (1 - fatigueDecay) * today.weights.fatigue }]);
  const rows = plans.map((plan, index) => {
    const day = index + 1;
    const base = state(baseline.fitness * fitnessDecay ** day, baseline.fatigue * fatigueDecay ** day);
    const terms = [{ low: today.low, mid: today.mid, high: today.high,
      fitness: (1 - fitnessDecay) * today.weights.fitness * fitnessDecay ** day,
      fatigue: (1 - fatigueDecay) * today.weights.fatigue * fatigueDecay ** day }];
    estimates.slice(0, day).forEach((estimate, prior) => terms.push({ low: estimate.low, mid: estimate.mid, high: estimate.high,
      fitness: (1 - fitnessDecay) * estimate.weights.fitness * fitnessDecay ** (index - prior),
      fatigue: (1 - fatigueDecay) * estimate.weights.fatigue * fatigueDecay ** (index - prior) }));
    const mid = state(base.fitness + terms.reduce((sum, term) => sum + term.fitness * term.mid, 0),
      base.fatigue + terms.reduce((sum, term) => sum + term.fatigue * term.mid, 0));
    const rest = state(todayAdjusted.fitness * fitnessDecay ** day, todayAdjusted.fatigue * fatigueDecay ** day);
    return { date: plan.date, plan, estimate: estimates[index], mid, rest, range: envelope(base, terms) };
  });
  if (rows.some(row => ![row.mid.fitness, row.mid.fatigue, row.range.fitness.high, row.range.fatigue.high].every(Number.isFinite))) return { available: false, error: "Load values exceed model range", rows: [], estimates, today };
  return {
    available: true, baseline, todayAdjusted, todayRange, today, rows, fitnessDays, fatigueDays,
    totals: {
      minutes: estimates.reduce((sum, estimate) => sum + estimate.minutes, 0),
      sessions: plans.filter(plan => plan.sport !== "Rest").length,
      load: estimates.reduce((sum, estimate) => sum + estimate.mid, 0),
      low: estimates.reduce((sum, estimate) => sum + estimate.low, 0),
      high: estimates.reduce((sum, estimate) => sum + estimate.high, 0),
    },
    rangeDefinition: "Independent daily historical load-rate scenarios propagated through the Intervals model. TSB bounds preserve each session's shared CTL/ATL load. Not a confidence interval.",
    restDefinition: "No planned load over the next seven dates; today's additional session is held at its central estimate.",
  };
}
