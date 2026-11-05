export const DAY = 86400000;

export function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function formatDate(date, options = {}) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...options, timeZone: "Asia/Jakarta" }).format(new Date(`${date}T12:00:00Z`));
}

export function duration(seconds) {
  if (!Number.isFinite(seconds)) return "Unavailable";
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
}

export function decimal(value, places = 1) {
  return Number.isFinite(value) ? value.toLocaleString("en-GB", { maximumFractionDigits: places }) : "Unavailable";
}

export function deduplicateActivities(activities) {
  const result = [];
  for (const activity of activities) {
    if (!activity.date || !activity.sport || !Number.isFinite(activity.movingSeconds) || activity.movingSeconds < 0) {
      throw new Error("Every activity needs a date, sport, and non-negative movingSeconds.");
    }
    const identity = activity.externalIds || {};
    const match = result.find(existing => {
      const ids = existing.externalIds || {};
      if (Object.keys(identity).some(provider => identity[provider] && identity[provider] === ids[provider])) return true;
      if (existing.source === activity.source || existing.sport !== activity.sport) return false;
      if (!existing.startedAt || !activity.startedAt) return false;
      const startDifference = Math.abs(Date.parse(existing.startedAt) - Date.parse(activity.startedAt));
      const timeDifference = Math.abs(existing.movingSeconds - activity.movingSeconds);
      const distancesAgree = !Number.isFinite(existing.distanceKm) || !Number.isFinite(activity.distanceKm)
        || Math.abs(existing.distanceKm - activity.distanceKm) <= Math.max(0.05, existing.distanceKm * 0.02);
      return startDifference <= 120000 && timeDifference <= Math.max(10, existing.movingSeconds * 0.03) && distancesAgree;
    });
    if (match) {
      match.sources = [...new Set([...(match.sources || [match.source]), ...(activity.sources || [activity.source])])];
      match.externalIds = { ...identity, ...match.externalIds };
      match.reconciliations = [...(match.reconciliations || []), { source: activity.source, distanceKm: activity.distanceKm, movingSeconds: activity.movingSeconds }];
    } else {
      result.push({ ...activity, sources: activity.sources || [activity.source] });
    }
  }
  return result.sort((a, b) => b.date.localeCompare(a.date));
}

export function summarize(activities, start, end) {
  const entries = activities.filter(a => a.date >= start && a.date <= end && a.classification !== "non-training");
  const bySport = ["Ride", "Run", "Weight Training", "Other"].map(sport => {
    const rows = entries.filter(a => sport === "Other" ? !["Ride", "Run", "Weight Training"].includes(a.sport) : a.sport === sport);
    return { sport, sessions: rows.length, seconds: rows.reduce((sum, a) => sum + a.movingSeconds, 0), distanceKm: rows.reduce((sum, a) => sum + (a.distanceKm || 0), 0) };
  }).filter(row => row.sessions > 0);
  return {
    start, end, sessions: entries.length,
    activeDays: new Set(entries.map(a => a.date)).size,
    seconds: entries.reduce((sum, a) => sum + a.movingSeconds, 0),
    distanceKm: entries.reduce((sum, a) => sum + (a.distanceKm || 0), 0),
    missingDistance: entries.filter(a => ["Ride", "Run"].includes(a.sport) && !Number.isFinite(a.distanceKm)).length,
    knownLoad: entries.reduce((sum, a) => sum + (a.intervalsLoad || 0), 0),
    missingLoad: entries.filter(a => !Number.isFinite(a.intervalsLoad)).length,
    bySport,
  };
}

export function jakartaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function coversWindow(report, start, end) {
  return report.coverage.complete === true && start >= report.coverage.start && end <= report.coverage.end;
}

export function filterActivities(report, { days = "all", sport = "All", query = "", includeExcluded = false } = {}) {
  const start = days === "all" ? report.coverage.start : shiftDate(report.date, 1 - Number(days));
  const search = query.trim().toLocaleLowerCase();
  return report.activities.filter(activity => activity.date >= start && activity.date <= report.date
    && (includeExcluded || activity.classification !== "non-training")
    && (sport === "All" || activity.sport === sport)
    && (!search || `${activity.name} ${activity.sport} ${activity.date}`.toLocaleLowerCase().includes(search)))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function compareWeeks(report, sport = "All") {
  const end = shiftDate(report.date, -1);
  const previousEnd = shiftDate(end, -7);
  const activities = report.activities.filter(activity => sport === "All" || activity.sport === sport);
  const current = summarize(activities, shiftDate(end, -6), end);
  const previous = summarize(activities, shiftDate(previousEnd, -6), previousEnd);
  const comparable = coversWindow(report, current.start, current.end) && coversWindow(report, previous.start, previous.end);
  return {
    current, previous, comparable,
    timeChangePercent: comparable && previous.seconds > 0 ? (current.seconds - previous.seconds) / previous.seconds * 100 : null,
    sessionChange: comparable ? current.sessions - previous.sessions : null,
    activeDayChange: comparable ? current.activeDays - previous.activeDays : null,
  };
}

export function dailySeries(report, days = 28, sport = "All") {
  const training = report.activities.filter(a => a.classification !== "non-training" && (sport === "All" || a.sport === sport));
  return Array.from({ length: days }, (_, index) => {
    const date = shiftDate(report.date, index - days + 1);
    const rows = training.filter(a => a.date === date);
    const known = date >= report.coverage.start && date <= report.coverage.end && (report.coverage.complete === true || rows.length > 0);
    const minutes = known ? rows.reduce((sum, a) => sum + a.movingSeconds / 60, 0) : null;
    const windowStart = shiftDate(date, -6);
    const meanKnown = coversWindow(report, windowStart, date);
    const mean = meanKnown ? training.filter(a => a.date >= windowStart && a.date <= date).reduce((sum, a) => sum + a.movingSeconds / 60, 0) / 7 : null;
    return { date, label: formatDate(date), minutes, mean };
  });
}

export function validateReport(report) {
  if (report.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(report.date || "")) throw new Error("Invalid report schema or date.");
  if (!report.coverage?.start || !report.coverage?.end || report.coverage.end > report.date) throw new Error("Invalid data coverage.");
  if (!Array.isArray(report.activities) || !Array.isArray(report.sources)) throw new Error("Missing activities or sources.");
  if (!report.coaching?.headline || !report.coaching?.nextSession?.steps?.length) throw new Error("Missing coaching decision or session steps.");
  if (report.coaching.nextSession.steps.reduce((sum, step) => sum + step.minutes, 0) !== report.coaching.nextSession.minutes) throw new Error("Session steps do not match the prescribed duration.");
  const activities = deduplicateActivities(report.activities);
  if (activities.some(a => a.date > report.date)) throw new Error("Future activities must be separated from completed training.");
  return { ...report, activities };
}
