import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareWeeks, dailySeries, deduplicateActivities, filterActivities, jakartaDate, shiftDate, summarize, validateReport } from "../src/report.js";
import { captureReadinessIssues, reportReadinessIssues } from "../src/report-readiness.js";
import { demoReport } from "../src/demo.js";
import { openArchive, parseAccessInput, payloadFromFragment, unlockReports } from "../src/archive.js";
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

function reportOn(date, headline = date) {
  const report = structuredClone(demoReport);
  report.date = date;
  report.coverage = { start: shiftDate(date, -27), end: date, complete: true };
  report.activities = [];
  report.coaching.headline = headline;
  return report;
}

test("a full pasted email link opens on a new device and overrides an existing fragment", async () => {
  const key = randomBytes(32).toString("base64url");
  const payload = encryptArchive({ version: 1, reports: [demoReport] }, key);
  const link = `https://example.com/#key=${key}&iv=${payload.iv}&data=${payload.ciphertext}`;
  const parsed = parseAccessInput(`  ${link}  `, "#key=stale");
  assert.equal(parsed.key, key);
  const opened = await unlockReports(parsed.key, parsed.incoming);
  assert.equal(opened.reports[opened.reportIndex].date, demoReport.date);
  assert.equal(parseAccessInput(key).incoming, null);
  assert.throws(() => payloadFromFragment(`#iv=${payload.iv}`), /incomplete/);
  assert.throws(() => parseAccessInput("https://example.com/#key=invalid"));
});

test("an older email opens that exact report even when a newer report is saved", async () => {
  const key = randomBytes(32).toString("base64url");
  const older = encryptArchive({ version: 1, reports: [reportOn("2026-11-04")] }, key);
  const newer = encryptArchive({ version: 1, reports: [reportOn("2026-11-05")] }, key);
  const result = await unlockReports(key, older, [newer]);
  assert.equal(result.reports.length, 2);
  assert.equal(result.reportIndex, 1);
  assert.equal(result.reports[result.reportIndex].date, "2026-11-04");
});

test("new revisions replace cached versions and invalid saved entries are pruned", async () => {
  const key = randomBytes(32).toString("base64url");
  const old = encryptArchive({ version: 1, reports: [reportOn("2026-11-05", "Before sync")] }, key);
  const incoming = encryptArchive({ version: 1, reports: [reportOn("2026-11-05", "After sync")] }, key);
  const opened = await unlockReports(key, incoming, [null, "bad", old]);
  assert.equal(opened.reports.length, 1);
  assert.equal(opened.reports[0].coaching.headline, "After sync");
  assert.deepEqual(opened.payloads, [incoming]);
  const corrupt = { ...incoming, ciphertext: "AAAA" };
  await assert.rejects(unlockReports(key, corrupt, [old]));
});

test("the archive cap preserves the report from the email that was just opened", async () => {
  const key = randomBytes(32).toString("base64url");
  const reports = Array.from({ length: 180 }, (_, index) => reportOn(shiftDate("2026-11-05", -index)));
  const saved = encryptArchive({ version: 1, reports }, key);
  const requested = reportOn(shiftDate("2026-11-05", -180));
  const incoming = encryptArchive({ version: 1, reports: [requested] }, key);
  const opened = await unlockReports(key, incoming, [saved]);
  assert.equal(opened.reports.length, 180);
  assert.equal(opened.reports[opened.reportIndex].date, requested.date);
});

test("weekly comparisons exclude the partial capture day and require complete baselines", () => {
  const report = reportOn("2026-11-05");
  const row = (date, seconds) => ({ date, sport: "Ride", source: "Sample", movingSeconds: seconds, distanceKm: null });
  report.activities = [row("2026-11-05", 10000), row("2026-11-04", 1200), row("2026-10-28", 600)];
  const comparison = compareWeeks(report);
  assert.equal(comparison.current.seconds, 1200);
  assert.equal(comparison.previous.seconds, 600);
  assert.equal(comparison.timeChangePercent, 100);
  assert.equal(compareWeeks({ ...report, coverage: { ...report.coverage, complete: false } }).timeChangePercent, null);
  assert.equal(compareWeeks(report, "Run").timeChangePercent, null);
});

test("missing coverage stays unavailable while recorded sessions stay visible", () => {
  const report = reportOn("2026-11-05");
  report.coverage.complete = false;
  report.activities = [{ date: "2026-11-05", sport: "Ride", movingSeconds: 600 }];
  const rows = dailySeries(report, 7);
  assert.equal(rows[0].minutes, null);
  assert.equal(rows.at(-1).minutes, 10);
  assert.equal(rows.at(-1).mean, null);
  assert.equal(dailySeries(report, 7, "Run").at(-1).minutes, null);
});

test("history filters combine date, sport and search and exclude non-training by default", () => {
  const report = reportOn("2026-11-05");
  report.activities = [
    { date: "2026-11-05", sport: "Ride", name: "Morning Ride", movingSeconds: 600 },
    { date: "2026-10-20", sport: "Run", name: "Easy run", movingSeconds: 600 },
    { date: "2026-10-28", sport: "Other", name: "Presentation", classification: "non-training", movingSeconds: 600 },
  ];
  assert.equal(filterActivities(report, { days: 7 }).length, 1);
  assert.equal(filterActivities(report, { days: "all", sport: "Run", query: "EASY" }).length, 1);
  assert.equal(filterActivities(report, { includeExcluded: true }).length, 3);
  assert.equal(filterActivities(report, { query: "no match" }).length, 0);
});

test("report date boundaries follow Jakarta rather than UTC", () => {
  assert.equal(jakartaDate(new Date("2026-11-05T18:00:00Z")), "2026-11-06");
});

function readyReportFixture() {
  const report = structuredClone(demoReport);
  const { date, capturedAt } = report;
  const evidence = { date, observedAt: capturedAt };
  report.preview = false;
  report.frontierCheck = evidence;
  report.sources = report.sources.map(({ name }) => ({ name, status: "Captured", observedAt: capturedAt, frontierCheckedAt: capturedAt,
    activityCoverage: { complete: true, start: shiftDate(date, -1), through: capturedAt } }));
  // This fixture has no workouts on the report day. Verified empty coverage is valid.
  report.activities = report.activities.filter(row => row.date < date).map(row => ({ ...row, averageSpeedKph: 10 }));
  report.wellness.trainingStatusSince = shiftDate(date, -5);
  for (const group of ["sleep", "heartRate", "hrv", "readiness", "bodyBattery", "fitness"]) {
    report.wellness.provenance.datedRecovery[group] = evidence;
  }
  Object.assign(report.wellnessHistory.rows.at(-1), { hrvMs: 47, sleepMinutes: 370, provenance: { sleepNeedMinutes: { capturedAt } } });
  Object.assign(report.garminLoadHistory.rows.at(-1), { acute: report.wellness.garminAcuteLoad, chronic: report.wellness.garminChronicLoad });
  Object.assign(report.trainingMix.garminLoadFocus, { observedAt: capturedAt, sourceUrl: "https://example.com/load-focus" });
  report.trainingMix.heartRateZones.push({ date: shiftDate(date, -1), sport: "Run", zone: "Z2", activityId: "test-run", source: "Intervals.icu", seconds: 60 });
  report.intervals.provenance = { ...evidence, state: "actual" };
  const full = { fitnessPercent: 100, fatiguePercent: 100 };
  Object.assign(report.intervals.settings, { observedAt: capturedAt, timeConstants: { fitnessDays: 42, fatigueDays: 7 } });
  Object.assign(report.intervals.settings.activityTypeWeights, { Ride: full, Run: full });
  report.performance = { captureCutoffAt: capturedAt,
    records: [{ sport: "Run", date: shiftDate(date, -14), label: "5 km", value: 1700, unit: "s", status: "verified", source: "Garmin Connect" }],
    vo2History: [-1, -14].map(days => ({ sport: "Run", date: shiftDate(date, days), value: 46, source: "Garmin Connect" })),
  };
  return report;
}

test("a complete captured report accepts verified zero activity and older confirmed performance measurements", () => {
  const report = readyReportFixture();
  assert.deepEqual(reportReadinessIssues(report), []);
  delete report.coaching.actionPlan;
  assert.deepEqual(captureReadinessIssues(report), []);
  assert.deepEqual(reportReadinessIssues(report).map(issue => issue.source), ["Coaching"]);
  report.wellness.readiness = 1100;
  assert.ok(captureReadinessIssues(report)[0].fields.includes("Training readiness score and recovery time"));
});

test("report command blocks missing data before replacing any private delivery files", async t => {
  const directory = await mkdtemp(join(tmpdir(), "daily-coach-gate-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const privateDir = join(directory, ".local");
  await mkdir(privateDir);
  const previousFiles = ["archive.enc.json", "email.private.json", "report-link.private.json"];
  await Promise.all(previousFiles.map(name => writeFile(join(privateDir, name), "previous")));
  const report = readyReportFixture();
  report.wellness.readiness = null;
  report.wellness.bodyBattery = null;
  report.wellness.garminChronicLoad = null;
  report.trainingMix.garminLoadFocus.buckets[0].targetHigh = null;
  report.intervals.provenance.state = "projected";
  report.intervals.settings.timeConstants.fatigueDays = null;
  report.sources[2].activityCoverage.complete = false;
  report.activities.push({ date: report.date, sport: "Run", movingSeconds: 600, source: "Strava" });
  await writeFile(join(directory, "incomplete.json"), JSON.stringify(report));
  const script = fileURLToPath(new URL("../scripts/publish-report.mjs", import.meta.url));
  const execution = spawnSync(process.execPath, [script, "incomplete.json"], { cwd: directory, encoding: "utf8" });
  assert.equal(execution.status, 1);
  for (const label of ["Report blocked", "readiness score", "Body Battery", "Dated chronic load", "Low aerobic Load Focus", "Dated actual CTL", "time constants", "Strava: Verified activity coverage", "Current-day provider IDs", "Current run distance"]) {
    assert.ok(execution.stderr.includes(label), label);
  }
  assert.deepEqual((await readdir(privateDir)).sort(), previousFiles);
  assert.deepEqual(await Promise.all(previousFiles.map(name => readFile(join(privateDir, name), "utf8"))), ["previous", "previous", "previous"]);
});
