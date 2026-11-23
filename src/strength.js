const milestones = [10, 25, 50, 100, 150, 200, 250, 300, 500, 750, 1000];
const nonnegative = value => Number.isFinite(value) && value >= 0;
const validDate = date => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date));
const kg = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
export const formatKg = value => kg.format(value);

const equipmentRules = [
  ["barbell", /\bBarbell\b/i],
  ["dumbbell", /\bDumbbell\b/i],
  ["kettlebell", /\bKettlebell\b/i],
  ["cable", /\bCable\b/i],
  ["pull-up", /^Pull-up$/i],
  ["box", /^Box Jump$/i],
  ["band", /^Banded\b/i],
  ["leg-press", /^Leg Press$/i],
  ["pulldown", /^Lat Pull-down$/i],
  ["leg-curl", /^Leg Curl$/i],
  ["bench", /^Bench Press$/i],
];

export const equipmentTypes = [
  ["barbell", "Barbell", 1], ["dumbbell", "Dumbbell", 2], ["kettlebell", "Kettlebell", 3],
  ["cable", "Cable station", 4], ["pull-up", "Pull-up bar", 5], ["box", "Plyo box", 6],
  ["band", "Resistance band", 7], ["leg-press", "Leg press", 8], ["pulldown", "Lat pulldown", 9],
  ["leg-curl", "Leg curl", 10], ["bench", "Weight bench", 11],
];

function equipmentFor(exercise) {
  return equipmentRules.find(([, pattern]) => pattern.test(exercise))?.[0] ?? null;
}

export function strengthSummary(report) {
  const history = report?.baseHistory?.strengthVolume;
  const byId = new Map();
  const insert = row => {
    if (!row?.activityId || !validDate(row.date) || row.date > report.date) return;
    const id = String(row.activityId);
    const saved = byId.get(id);
    byId.set(id, saved ? {
      ...saved,
      name: saved.name || row.name,
      volumeKg: saved.volumeKg ?? row.volumeKg,
      sets: saved.sets ?? row.sets,
      reps: saved.reps ?? row.reps,
    } : row);
  };
  for (const row of history?.sessionDetails ?? []) insert(row);
  for (const row of report?.baseHistory?.providerActivities?.["Garmin Connect"] ?? []) {
    if (row.sourceType === "strength_training") insert({
      activityId: row.id, date: row.date, name: row.name, volumeKg: row.strengthVolumeKg,
      sets: row.totalSets, reps: row.totalReps,
    });
  }
  for (const row of report?.activities ?? []) {
    if (row.sport === "Weight Training" && nonnegative(row.strengthVolumeKg)) insert({
      activityId: row.externalIds?.garmin, date: row.date, name: row.name,
      volumeKg: row.strengthVolumeKg, sets: row.totalSets, reps: row.totalReps,
    });
  }
  const sessions = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date) || String(b.activityId).localeCompare(String(a.activityId)));
  const measured = sessions.filter(row => nonnegative(row.volumeKg));
  const volumeKg = measured.length ? measured.reduce((total, row) => total + row.volumeKg, 0) : null;
  const best = measured.reduce((top, row) => !top || row.volumeKg > top.volumeKg ? row : top, null);
  const records = new Map();
  const equipment = new Set();
  let unassigned = null;
  let unassignedSets = 0;
  let sessionsWithSets = 0;
  function pickBest(current, item) {
    if (!current || item.weightKg > current.weightKg) return item;
    if (item.weightKg === current.weightKg && item.reps > current.reps) return item;
    return current;
  }
  for (const session of sessions) {
    if (!session.exerciseSets?.length) continue;
    sessionsWithSets++;
    for (const row of session.exerciseSets) {
      const exercise = typeof row.exercise === "string" ? row.exercise.trim() : "";
      const tool = exercise && equipmentFor(exercise);
      if (tool) equipment.add(tool);
      if (!Number.isFinite(row.weightKg) || row.weightKg <= 0 || !Number.isFinite(row.reps) || row.reps <= 0) continue;
      const lift = { ...row, exercise, tool, date: session.date, activityId: session.activityId };
      if (!exercise) {
        unassigned = pickBest(unassigned, lift);
        unassignedSets++;
      } else {
        const key = exercise.toLowerCase();
        records.set(key, pickBest(records.get(key), lift));
      }
    }
  }
  const unit = 399;
  const equivalents = volumeKg == null ? null : volumeKg / unit;
  const next = equivalents == null ? null : milestones.find(milestone => milestone > equivalents)
    ?? (Math.floor(equivalents / 250) + 1) * 250;
  const unlocked = equivalents == null ? null : milestones.filter(milestone => milestone <= equivalents).at(-1);
  return {
    sessions, measured: measured.length, volumeKg, best, equivalents, next, unlocked,
    remainingKg: next == null ? null : next * unit - volumeKg,
    records: [...records.values()].sort((a, b) => b.weightKg - a.weightKg || a.exercise.localeCompare(b.exercise)),
    unassigned, unassignedSets, sessionsWithSets, equipment: equipmentTypes.filter(([key]) => equipment.has(key)),
  };
}
