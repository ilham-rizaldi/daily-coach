import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { dailySeries, deduplicateActivities, shiftDate, summarize, validateReport } from "../src/report.js";
import { demoReport } from "../src/demo.js";
import { openArchive, payloadFromFragment } from "../src/archive.js";
import { decryptArchive, encryptArchive } from "../scripts/publish-report.mjs";
import { renderEmail } from "../scripts/email.mjs";

test("provider copies count once while distinct sessions on the same day survive", () => {
  const base = { date: "2026-11-05", sport: "Ride", movingSeconds: 2702, distanceKm: 26.28, source: "Intervals.icu", externalIds: { strava: "123" } };
  const rows = deduplicateActivities([base, { ...base, source: "Strava", movingSeconds: 2703 }, { ...base, externalIds: { strava: "456" } }]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].sources, ["Intervals.icu", "Strava"]);
});

test("missing distance is counted and an excluded recording contributes no training", () => {
  const base = { date: "2026-11-05", sport: "Ride", movingSeconds: 600, source: "Intervals.icu", distanceKm: null };
  const result = summarize([base, { ...base, movingSeconds: 2600, classification: "non-training" }], "2026-11-05", "2026-11-05");
  assert.equal(result.sessions, 1);
  assert.equal(result.seconds, 600);
  assert.equal(result.missingDistance, 1);
  assert.equal(result.missingLoad, 1);
});

test("calendar windows cross months and unknown coverage stays null", () => {
  assert.equal(shiftDate("2026-11-01", -1), "2026-10-31");
  const report = { ...demoReport, coverage: { start: "2026-11-01", end: "2026-11-05" } };
  const rows = dailySeries(report, 7);
  assert.equal(rows[0].minutes, null);
  assert.equal(rows.at(-1).mean, null);
});

test("browser and Node decrypt the authenticated archive and reject a wrong key", async () => {
  const key = randomBytes(32).toString("base64url");
  const archive = { version: 1, reports: [demoReport] };
  const payload = encryptArchive(archive, key);
  assert.deepEqual(decryptArchive(payload, key), archive);
  assert.deepEqual(await openArchive(key, payload), archive);
  await assert.rejects(openArchive(randomBytes(32).toString("base64url"), payload));
  const corrupted = { ...payload, ciphertext: payload.ciphertext.slice(0, -3) + "AAA" };
  await assert.rejects(openArchive(key, corrupted));
});

test("prescription duration must equal its actual steps and email escapes source text", () => {
  const invalid = structuredClone(demoReport);
  invalid.coaching.nextSession.minutes = 999;
  assert.throws(() => validateReport(invalid));
  const report = structuredClone(demoReport);
  report.coaching.headline = '<img src=x onerror="alert(1)">';
  const email = renderEmail(report, "https://example.com/#key=test");
  assert.ok(!email.html.includes('<img src=x'));
  assert.ok(email.html.includes('&lt;img'));
});

test("a private email link carries a complete authenticated report and rejects incomplete data", async () => {
  const key = randomBytes(32).toString("base64url");
  const archive = { version: 1, reports: [demoReport] };
  const payload = encryptArchive(archive, key);
  const link = new URL(`https://example.com/#key=${key}&iv=${payload.iv}&data=${payload.ciphertext}`);
  assert.equal(link.pathname, "/");
  assert.equal(link.search, "");
  assert.deepEqual(await openArchive(key, payloadFromFragment(link.hash)), archive);
  assert.equal(payloadFromFragment("#key=unused"), null);
  assert.throws(() => payloadFromFragment("#iv=invalid&data=broken!"));
});
