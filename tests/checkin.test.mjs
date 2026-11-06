import test from "node:test";
import assert from "node:assert/strict";
import { activityIdentity, CHECKIN_STORAGE_KEY, completedCheckInActivities, createCheckIn, decryptCheckIns, encryptCheckIns, findCheckIn, persistCheckIn, persistCheckInVault, updateCheckInEntries, validateRatings } from "../src/checkin.js";

const key = Buffer.alloc(32, 1).toString("base64url");
const wrongKey = Buffer.alloc(32, 2).toString("base64url");
const activity = { date: "2026-04-10", startedAt: "2026-04-10T08:00:00+07:00", sport: "Ride", source: "Garmin", externalIds: { garmin: "example-123", strava: "example-456" }, timerSeconds: 3600, movingSeconds: 3300 };
const ratings = { rpe: 5, legSoreness: 3, fatigue: 4 };
const time = "2026-04-10T03:00:00Z";

function memoryStorage() {
  const data = new Map(); let writes = 0;
  return { getItem: key => data.get(key) ?? null, setItem(key, value) { writes++; data.set(key, value); }, get writes() { return writes; } };
}

test("zero is a real rating, blank and missing ratings cannot become zero", () => {
  assert.deepEqual(validateRatings({ rpe: "0", legSoreness: 0, fatigue: "0" }), { rpe: 0, legSoreness: 0, fatigue: 0 });
  for (const rpe of ["", null, undefined, -1, 11, NaN, true]) assert.throws(() => validateRatings({ ...ratings, rpe }));
});

test("sRPE uses the actual timer including rest and stays in AU", () => {
  const entry = createCheckIn(activity, ratings, time);
  assert.equal(entry.durationMinutes, 60);
  assert.equal(entry.sRpeLoad, 300);
  assert.equal(entry.intervalsLoad, undefined);
  assert.equal(createCheckIn({ ...activity, timerSeconds: 0 }, { ...ratings, rpe: 0 }, time).sRpeLoad, 0);
});

test("distinct sessions on the same date retain distinct identities", () => {
  const fallback = { ...activity, externalIds: {} };
  const later = { ...fallback, startedAt: "2026-04-10T18:00:00+07:00" };
  assert.notEqual(activityIdentity(fallback), activityIdentity(later));
  const both = updateCheckInEntries(updateCheckInEntries([], fallback, ratings, time), later, ratings, time);
  assert.equal(both.length, 2);
  assert.equal(completedCheckInActivities({ date: "2026-04-10", activities: [activity, { ...later, date: "2026-04-11" }, { ...fallback, classification: "non-training" }] }).length, 1);
});

test("shared provider aliases keep a check-in when the primary provider changes", () => {
  const stravaOnly = { ...activity, externalIds: { strava: "example-456" } };
  const entries = updateCheckInEntries([], stravaOnly, ratings, time);
  assert.equal(findCheckIn(entries, activity).id, "strava:example-456");
  const updated = updateCheckInEntries(entries, activity, { ...ratings, rpe: 6 }, time);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].rpe, 6);
  assert.ok(updated[0].aliases.includes("garmin:example-123"));
});

test("check-ins round-trip encrypted and reject tampering or the wrong key", async () => {
  const entries = [createCheckIn(activity, ratings, time)];
  const payload = await encryptCheckIns(entries, key);
  assert.deepEqual(await decryptCheckIns(payload, key), entries);
  assert.ok(!JSON.stringify(payload).includes("example-123"));
  assert.ok(!JSON.stringify(payload).includes("2026-04-10"));
  await assert.rejects(decryptCheckIns(payload, wrongKey));
  const tampered = { ...payload, ciphertext: (payload.ciphertext[0] === "A" ? "B" : "A") + payload.ciphertext.slice(1) };
  await assert.rejects(decryptCheckIns(tampered, key));
});

test("invalid ratings never write to storage", async () => {
  const storage = memoryStorage();
  await assert.rejects(persistCheckIn(storage, key, [], activity, { ...ratings, rpe: "" }));
  assert.equal(storage.writes, 0);
  assert.equal(storage.getItem(CHECKIN_STORAGE_KEY), null);
});

test("a cancelled save leaves existing ciphertext intact", async () => {
  const storage = memoryStorage();
  const entries = await persistCheckIn(storage, key, [], activity, ratings);
  const previous = storage.getItem(CHECKIN_STORAGE_KEY);
  assert.equal(await persistCheckInVault(storage, key, entries, () => false), false);
  assert.equal(storage.getItem(CHECKIN_STORAGE_KEY), previous);
  assert.equal(storage.writes, 1);
});

test("wrong-key or corrupted stored vaults cannot be overwritten", async () => {
  const storage = memoryStorage();
  const entries = await persistCheckIn(storage, key, [], activity, ratings);
  const previous = storage.getItem(CHECKIN_STORAGE_KEY);
  await assert.rejects(persistCheckInVault(storage, wrongKey, entries));
  assert.equal(storage.getItem(CHECKIN_STORAGE_KEY), previous);
  storage.setItem(CHECKIN_STORAGE_KEY, "corrupted stored vault");
  await assert.rejects(persistCheckInVault(storage, key, entries));
  assert.equal(storage.getItem(CHECKIN_STORAGE_KEY), "corrupted stored vault");
});
