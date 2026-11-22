export const pacingMetrics = [
  { key: "powerWatts", label: "Power", unit: "W", tone: "power" },
  { key: "hrBpm", label: "Heart rate", unit: "bpm", tone: "hr" },
  { key: "paceSecondsPerKm", label: "Pace", unit: "/km", tone: "pace" },
];

export const pacingSports = [
  { key: "cycling", sport: "Ride", label: "Cycling" },
  { key: "running", sport: "Run", label: "Running" },
];

export function paceClock(seconds) {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

const positive = value => Number.isFinite(value) && value > 0;
const usableDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));

export function rangeFor(value) {
  return Array.isArray(value) && value.length === 2 && value.every(positive) && value[0] <= value[1] ? value : null;
}

export function targetEvidence(target) {
  if (!target?.source || !usableDate(target.date) || !["Low", "Medium", "High"].includes(target.confidence)) return null;
  return target;
}

export function pacingWorkoutSignature(plan, sport) {
  return JSON.stringify([sport, plan?.stepsMinutes, plan?.powerWatts, plan?.hrBpm, plan?.paceSecondsPerKm]);
}

export function garminPacingWorkout(plan, sport) {
  const saved = plan?.garminWorkout;
  const type = { Ride: "cycling", Run: "running" }[sport];
  if (!saved?.url || !type || saved.signature !== pacingWorkoutSignature(plan, sport)) return null;
  try {
    const url = new URL(saved.url);
    if (url.origin !== "https://connect.garmin.com" || url.username || url.password
      || !/^\/app\/workout\/\d+$/.test(url.pathname) || url.searchParams.get("workoutType") !== type) return null;
    return { name: saved.name || "Saved Garmin workout", url: `${url.origin}${url.pathname}?workoutType=${type}` };
  } catch {
    return null;
  }
}

export function compareWorkBlock(activity, reviews = []) {
  if (!Array.isArray(reviews)) return null;
  const match = reviews.find(review => review?.activity?.provider && review.activity.id
    && activity.externalIds?.[review.activity.provider] === review.activity.id
    && activity.sport === review.sport && review.date === activity.date);
  if (!match || !match.workBlock || !match.plan || !usableDate(match.plan.date) || match.plan.date > activity.date) return null;
  const { workBlock, plan } = match;
  if (plan.date === activity.date && !(Date.parse(plan.createdAt) < Date.parse(activity.startedAt))) return null;
  if (!positive(workBlock.seconds) || !workBlock.source || workBlock.scope !== "steady-work") return null;
  const rows = pacingMetrics.filter(metric => metric.key !== "paceSecondsPerKm" || activity.sport === "Run").flatMap(metric => {
    const target = rangeFor(plan[metric.key]);
    const value = workBlock[metric.key];
    if (!target || !positive(value)) return [];
    let status = "In range";
    if (value < target[0]) status = metric.key === "paceSecondsPerKm" ? "Faster" : "Below";
    if (value > target[1]) status = metric.key === "paceSecondsPerKm" ? "Slower" : "Above";
    return [{ ...metric, target, value, status }];
  });
  return { plan, workBlock, rows };
}

export function reviewMetrics(activity) {
  const isRun = activity.sport === "Run";
  const recordedPower = [activity.measuredPowerWatts, activity.averageCyclingPowerWatts, activity.averagePowerWatts].find(positive);
  const rows = [
    ["Average HR", activity.averageHr, "bpm", "hr"],
    ["Max HR", activity.maxHr, "bpm", "hr"],
    ...isRun ? [
      ["Average pace", activity.averagePaceSeconds, "/km", "pace"],
      ["Average run power (est.)", activity.averageRunningPowerWatts, "W", "power"],
    ] : [
      ["Average power", recordedPower, "W", "power"],
      ["Normalized power", activity.normalizedPowerWatts ?? activity.normalizedCyclingPowerWatts, "W", "power"],
    ],
    ["Elevation gain", activity.elevationMeters, "m"],
    ["Laps", activity.laps, ""],
    ["Recorded RPE", activity.recordedRpe, "/10"],
  ];
  return rows.filter(([, value]) => Number.isFinite(value) && value >= 0);
}
