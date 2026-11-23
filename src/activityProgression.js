const garmin = "Garmin Connect";
const text = value => typeof value === "string" ? value.trim() : "";
const token = value => text(value).replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[ _]+/g, "-");
const positive = value => Number.isFinite(value) && value > 0;

export function dayOf(value) {
  const date = text(value).slice(0, 10), timestamp = Date.parse(`${date}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === date ? date : null;
}

export function sportOf(value) {
  const sport = token(value);
  if (["cycling", "ride", "bike", "biking", "virtual-ride", "indoor-cycling"].includes(sport)) return "Cycling";
  if (["running", "run", "virtual-run", "treadmill-running", "indoor-running"].includes(sport)) return "Running";
  return null;
}

const indoor = new Set(["indoor", "indoor-cycling", "indoor-ride", "indoor-running", "indoor-run",
  "treadmill", "treadmill-running", "virtual-ride", "virtual-cycling", "virtual-run", "virtual-running"]);
const outdoor = new Set(["outdoor", "outdoor-ride", "outdoor-run", "road-cycling", "road-biking", "road-running",
  "mountain-biking", "mountain-bike-ride", "gravel-cycling", "gravel-biking", "gravel-ride",
  "trail-running", "trail-run", "track-running", "track-run"]);
export const activityEnvironments = ["Outdoor", "Indoor"];
export const speedMethods = { timer: "Garmin timer", recorded: "Recorded average", moving: "Moving time", displayed: "Displayed pace" };
export const paceSeconds = speedKph => 3600 / speedKph;

function namedEnvironment(value) {
  const label = token(value?.typeKey ?? value);
  return indoor.has(label) ? "Indoor" : outdoor.has(label) ? "Outdoor" : null;
}

function activityEnvironment(activity, archive, fitEnvironment) {
  const raw = activity?.providerActivityTypes;
  const providerTypes = typeof raw === "string" ? [raw] : Object.values(raw ?? {});
  const labels = [activity?.environment, activity?.courseType, activity?.activityType, activity?.sourceType,
    ...providerTypes, archive?.sourceType];
  const explicit = new Set(labels.map(namedEnvironment).filter(Boolean));
  if (explicit.size > 1) return null;
  return [...explicit][0] ?? namedEnvironment(fitEnvironment)
    ?? (archive?.hasGpsTrack === true ? "Outdoor" : null);
}

function startAt(row) {
  if (row.startedAt) return Date.parse(row.startedAt);
  return Date.parse(`${row.sourceLocalStart ?? ""}+07:00`);
}

function excluded(row) {
  return row.classification === "non-training" || row.planned === true
    || ["planned", "scheduled", "future", "in-progress", "cancelled", "excluded"].includes(token(row.status));
}

function belongsToReport(row, report, cutoff) {
  const date = dayOf(row.date);
  if (!date || date > report.date || excluded(row)) return false;
  return !Number.isFinite(cutoff) || [startAt(row), Date.parse(row.endedAt)].every(time =>
    !Number.isFinite(time) || time <= cutoff);
}

function archiveMatch(activity, byId, byDate) {
  const id = activity.externalIds?.garmin;
  if (id != null) {
    const candidate = byId.get(String(id));
    return candidate?.date === activity.date ? candidate : undefined;
  }
  const started = startAt(activity);
  if (!Number.isFinite(started) || !positive(activity.distanceKm) || !positive(activity.timerSeconds)) return;
  const sport = sportOf(activity.sport);
  const candidates = (byDate.get(activity.date) ?? []).filter(row =>
    (excluded(activity) || sport === sportOf(row.sport))
    && Math.abs(startAt(row) - started) <= 15000
    && Math.abs(row.distanceKm - activity.distanceKm) <= Math.max(0.08, activity.distanceKm * 0.02)
    && Math.abs(row.timerSeconds - activity.timerSeconds) <= Math.max(15, activity.timerSeconds * 0.03));
  if (candidates.length === 1) return candidates[0];
}

function garminReading(activity) {
  const distance = activity.distanceKm, timer = activity.timerSeconds;
  if (positive(distance) && positive(timer)) {
    return { source: garmin, basis: "timer", distance, value: distance * 3600 / timer };
  }
}

function activityReading(row, sport) {
  const source = text(row.source);
  if (!source) return;
  const distance = token(row.distanceKind) === "recorded" && positive(row.distanceKm) ? row.distanceKm : null;
  if (source === garmin && distance && positive(row.timerSeconds)) return garminReading(row);
  if (sport === "Running" && positive(row.averagePaceSeconds)) {
    return { source, basis: "recorded", distance, value: 3600 / row.averagePaceSeconds };
  }
  if (positive(row.averageSpeedKph)) return { source, basis: "recorded", distance, value: row.averageSpeedKph };
  if (distance && positive(row.providerMovingSeconds)) {
    return { source, basis: "moving", distance, value: distance * 3600 / row.providerMovingSeconds };
  }
  if (sport === "Running") {
    const match = /^(\d{1,2}):([0-5]\d)\s*(?:min)?\/km$/.exec(text(row.provenance?.displayedPace));
    const seconds = match ? Number(match[1]) * 60 + Number(match[2]) : 0;
    if (seconds > 0) return { source, basis: "displayed", distance, value: 3600 / seconds };
  }
}

function groupPriority(group) {
  return group.source === garmin && group.basis === "timer" ? 1 : 0;
}

export function activitySpeedSeries(report) {
  const cutoff = Date.parse(report.capturedAt);
  const canonical = report.activities ?? [];
  const archive = (report.baseHistory?.providerActivities?.[garmin] ?? [])
    .filter(row => row.id != null && belongsToReport(row, report, cutoff));
  const byId = new Map(archive.map(row => [String(row.id), row]));
  const byDate = new Map();
  for (const row of byId.values()) {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  }
  const fit = new Map((report.baseHistory?.garminNativeRecordings?.files ?? [])
    .filter(row => row.activityId && row.date && namedEnvironment(row.environment))
    .map(row => [String(row.activityId), row]));
  const paired = canonical.map(row => [row, archiveMatch(row, byId, byDate)]);
  const used = new Set(paired.filter(([row]) => excluded(row)).map(([row, match]) => String(match?.id ?? row.externalIds?.garmin ?? "")));
  const groups = new Map();
  function add(row, match, reading, sport, id = "") {
    if (!reading || !sport || !positive(reading.value)) return;
    const evidence = fit.get(id);
    const scope = activityEnvironment(row, match, evidence?.date === row.date ? evidence.environment : null);
    if (!scope) return;
    const start = startAt(row);
    const at = Number.isFinite(start) ? start : Date.parse(`${row.date}T12:00:00Z`);
    const { basis, source, value, distance } = reading;
    const key = JSON.stringify([sport, scope, source, basis]);
    if (!groups.has(key)) groups.set(key, { key, sport, scope, source, basis, points: [] });
    groups.get(key).points.push({ date: row.date, at, distance, value, activityId: id || null, name: text(row.name) });
  }
  for (const [row, match] of paired) {
    if (!belongsToReport(row, report, cutoff)) continue;
    const id = String(match?.id ?? row.externalIds?.garmin ?? "");
    if (id && used.has(id)) continue;
    if (id) used.add(id);
    const sport = sportOf(row.sport);
    add(row, match, (match && garminReading(match)) || activityReading(row, sport), sport, id);
  }
  for (const [id, row] of byId) {
    if (!used.has(id)) add(row, row, garminReading(row), sportOf(row.sport), id);
  }
  const sorted = [...groups.values()];
  for (const group of sorted) group.points.sort((a, b) => a.at - b.at);
  sorted.sort((a, b) => groupPriority(b) - groupPriority(a) || b.points.length - a.points.length
    || b.points.at(-1).at - a.points.at(-1).at);
  const seen = new Set();
  return sorted.filter(group => {
    const key = `${group.sport} ${group.scope}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
