export const CHECKIN_STORAGE_KEY = "daily-coach-session-checkins-v1";
const AAD = new TextEncoder().encode("daily-coach-session-checkins-v1");
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const ratingNames = ["rpe", "legSoreness", "fatigue"];

export function activityAliases(activity) {
  const ids = Object.entries(activity.externalIds || {})
    .filter(([, id]) => (typeof id === "string" && id.trim()) || Number.isFinite(id))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, id]) => `${provider}:${id}`);
  if (activity.source && activity.startedAt && Number.isFinite(Date.parse(activity.startedAt))) {
    ids.push(`session:${activity.source}:${activity.startedAt}:${activity.sport}`);
  }
  return [...new Set(ids)];
}

export function activityIdentity(activity) {
  const aliases = activityAliases(activity);
  return aliases.find(id => id.startsWith("garmin:")) || aliases.find(id => id.startsWith("strava:")) || aliases[0] || null;
}

export function completedCheckInActivities(report) {
  return (report.activities || []).filter(activity => activity.classification !== "non-training"
    && datePattern.test(activity.date || "") && activity.date <= report.date && activityIdentity(activity))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
}

export function sessionMinutes(activity) {
  const seconds = Number.isFinite(activity.timerSeconds) ? activity.timerSeconds : activity.movingSeconds;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds / 60 : null;
}

export function validateRatings(values) {
  const ratings = Object.fromEntries(ratingNames.map(name => {
    const value = values?.[name];
    return [name, value === "" || value === null || value === undefined || typeof value === "boolean" ? null : Number(value)];
  }));
  if (ratingNames.some(name => !Number.isFinite(ratings[name]) || ratings[name] < 0 || ratings[name] > 10)) {
    throw new Error("Rate all three: 0–10");
  }
  return ratings;
}

export function findCheckIn(entries, activity) {
  const aliases = activityAliases(activity);
  return entries.find(entry => entry.aliases.some(id => aliases.includes(id))) || null;
}

export function createCheckIn(activity, values, now = new Date().toISOString()) {
  const ratings = validateRatings(values);
  const id = activityIdentity(activity);
  const minutes = sessionMinutes(activity);
  if (!id || activity.classification === "non-training" || !datePattern.test(activity.date || "") || minutes === null) {
    throw new Error("Session data unavailable");
  }
  return { id, aliases: activityAliases(activity), date: activity.date, sport: activity.sport,
    durationMinutes: minutes, ...ratings, sRpeLoad: minutes * ratings.rpe, updatedAt: now };
}

export function updateCheckInEntries(entries, activity, values, now) {
  const entry = createCheckIn(activity, values, now);
  const existing = findCheckIn(entries, activity);
  if (existing) {
    entry.id = existing.id;
    entry.aliases = [...new Set([...existing.aliases, ...entry.aliases])];
  }
  return [...entries.filter(item => item !== existing), entry]
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}

function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length > 2000) throw new Error("Check-in archive invalid");
  for (const entry of entries) {
    if (!entry || typeof entry.id !== "string" || !entry.id || !Array.isArray(entry.aliases)
      || !entry.aliases.length || entry.aliases.some(id => typeof id !== "string" || !id)
      || !datePattern.test(entry.date || "") || typeof entry.sport !== "string"
      || !Number.isFinite(entry.durationMinutes) || entry.durationMinutes < 0
      || !Number.isFinite(Date.parse(entry.updatedAt))) throw new Error("Check-in archive invalid");
    validateRatings(entry);
    if (!Number.isFinite(entry.sRpeLoad) || Math.abs(entry.sRpeLoad - entry.durationMinutes * entry.rpe) > 1e-8) {
      throw new Error("Check-in archive invalid");
    }
  }
  return entries;
}

function decode(value) {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
}

function encode(bytes) {
  let text = "";
  for (let index = 0; index < bytes.length; index += 16384) text += String.fromCharCode(...bytes.subarray(index, index + 16384));
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function importKey(key, usage) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(key || "")) throw new Error("Check-in access unavailable");
  return crypto.subtle.importKey("raw", decode(key), "AES-GCM", false, [usage]);
}

export async function encryptCheckIns(entries, key) {
  validateEntries(entries);
  const cryptoKey = await importKey(key, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, cryptoKey,
    new TextEncoder().encode(JSON.stringify({ version: 1, entries })));
  return { version: 1, algorithm: "AES-256-GCM", iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
}

export async function decryptCheckIns(payload, key) {
  if (payload?.version !== 1 || payload.algorithm !== "AES-256-GCM"
    || !/^[A-Za-z0-9_-]{16}$/.test(payload.iv || "")
    || !/^[A-Za-z0-9_-]+$/.test(payload.ciphertext || "") || payload.ciphertext.length > 2000000) {
    throw new Error("Check-in archive invalid");
  }
  const cryptoKey = await importKey(key, "decrypt");
  let data;
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(payload.iv), additionalData: AAD }, cryptoKey, decode(payload.ciphertext));
    data = JSON.parse(new TextDecoder().decode(plaintext));
  } catch { throw new Error("Check-in archive could not open"); }
  if (data.version !== 1) throw new Error("Check-in archive invalid");
  return validateEntries(data.entries);
}

export async function persistCheckInVault(storage, key, entries, isCurrent = () => true) {
  validateEntries(entries);
  const previous = storage.getItem(CHECKIN_STORAGE_KEY);
  // A different key or corrupted vault must never be silently overwritten.
  if (previous) await decryptCheckIns(JSON.parse(previous), key);
  const payload = await encryptCheckIns(entries, key);
  if (!isCurrent()) return false;
  if (storage.getItem(CHECKIN_STORAGE_KEY) !== previous) throw new Error("Check-ins changed; reopen this page");
  storage.setItem(CHECKIN_STORAGE_KEY, JSON.stringify(payload));
  return true;
}

export async function persistCheckIn(storage, key, entries, activity, values, isCurrent = () => true) {
  const updated = updateCheckInEntries(entries, activity, values);
  return await persistCheckInVault(storage, key, updated, isCurrent) ? updated : null;
}
