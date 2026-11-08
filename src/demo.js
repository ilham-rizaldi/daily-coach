import { shiftDate } from "./report.js";

const date = "2026-11-05";
const minutes = [30, 50, 40, 30, 45, 50, 60, 100, 45, 40, 35, 50, 40, 60, 55, 70, 80, 160, 60, 50, 30, 60, 50, 55, 30, 45, 90, 42];
const demoZones = [1, 2, 8, 10, 15, 17, 22, 24].flatMap((index) => [0.34, 0.49, 0.17].map((share, zone) => ({
  date: shiftDate(date, index - 27), sport: index % 7 === 1 ? "Run" : "Ride", activityId: String(index),
  zone: `Z${zone + 1}`, seconds: Math.round(minutes[index] * 60 * share), source: "Illustrative",
})));

export const demoReport = {
  schemaVersion: 1, date, capturedAt: "2026-11-05T09:24:00+07:00", athlete: "Riezaldd", preview: true,
  coverage: { start: "2026-09-01", end: date, complete: true, note: "Illustrative training history for layout preview." },
  activities: minutes.map((value, index) => ({ source: "Sample", externalIds: { sample: String(index) }, date: shiftDate(date, index - 27), sport: index % 7 === 0 ? "Weight Training" : index % 7 === 1 ? "Run" : "Ride", name: "Illustrative training session", movingSeconds: value * 60, distanceKm: null, averageHr: null, intervalsLoad: value * (0.5 + index % 4 / 10), intervalsListLoad: value * (0.5 + index % 4 / 10) })).filter((_, index) => index % 7 !== 6),
  wellness: {
    date, sleepMinutes: 370, sleepScore: 76, readiness: 48, readinessStatus: "Low", readinessUpdatedAtLocal: "07:15",
    bodyBattery: 62, bodyBatteryCharged: 55, bodyBatteryDrained: 12, bodyBatteryDailyHigh: 74, bodyBatteryDailyLow: 19,
    hrvStatus: "Balanced", rawHrvMs: 47, hrv7dMs: 49, hrvBaselineLowMs: 43, hrvBaselineHighMs: 61, highest5MinuteHrvMs: 90,
    restingHr: 56, restingHr7d: 57, recoveryTimeMinutes: 540, recoveryTimeStatus: "Low Need",
    deepSleepMinutes: 80, lightSleepMinutes: 230, remSleepMinutes: 60, awakeMinutes: 19, restlessMoments: 18,
    bedTimeLocal: "00:25", wakeTimeLocal: "06:54", averageOvernightHr: 60, averageSpo2: 96, lowestSpo2: 91,
    averageRespiration: 15, minimumRespiration: 12, highHr: 118,
    garminAcuteLoad: 350, garminChronicLoad: 300, garminLoadRatio: 1.2, garminAcuteLoadStatus: "Optimal", garminLoadRatioStatus: "Optimal",
    trainingStatus: "Maintaining", loadFocus: "Balanced", vo2Max: 46, vo2MaxCategory: "Good", heatAcclimationPercent: 35, heatAcclimationTrend: "Increasing", recentStressStatus: "Low", recentSleepScoresStatus: "Fair",
    provenance: {
      datedRecovery: { date, ...Object.fromEntries(["sleep", "bodyBattery", "heartRate", "hrv", "readiness"].map(name => [name, { observedAt: "2026-11-05T09:20:00+07:00" }])) },
      currentLoadContext: { ...Object.fromEntries(["acute", "chronic", "ratio"].map(name => [name, { date, observedAt: "2026-11-05T09:20:00+07:00" }])), trainingStatusObservedAt: "2026-11-05T09:20:00+07:00" },
    },
  },
  intervals: { date, fitness: 35, fatigue: 42, form: -7, provenance: { observedAt: "2026-11-05T09:22:00+07:00" }, settings: { activityTypeWeights: { WeightTraining: { fitnessPercent: 0, fatiguePercent: 100 } } } },
  trainingMix: { heartRateZones: demoZones, garminLoadFocus: { start: shiftDate(date, -27), end: date, buckets: [
    { key: "lowAerobic", points: 438, targetLow: 350, targetHigh: 510 },
    { key: "highAerobic", points: 282, targetLow: 250, targetHigh: 420 },
    { key: "anaerobic", points: 76, targetLow: 80, targetHigh: 150 },
  ] } },
  benchmarks: {
    segments: [1463, 1422, 1382].map((elapsedSeconds, index) => ({ segmentId: "sample-route", label: "Sample loop", date: shiftDate(date, -1 - 7 * (2 - index)), elapsedSeconds, averageHr: 152 + index, source: "Illustrative" })),
    workouts: [{ activityId: "sample-run", date: shiftDate(date, -6), label: "Sample run", source: "Illustrative", intervals: [370, 364, 359, 368, 363].map((seconds, index) => ({ label: `Lap ${index + 1}`, seconds, distanceKm: 1, averagePaceSeconds: seconds, averageHr: 149 + index, classification: "lap" })) }],
  },
  garminLoadHistory: { observedAt: "2026-11-05T09:24:00+07:00", sourceUrl: "https://connect.garmin.com/app/report", method: "Illustrative values only", rows: minutes.map((_, index) => ({ date: shiftDate(date, index - 27), acute: index === 27 ? 350 : [300, 330, 360, 350, 340, 320, 280][index % 7], chronic: 354 - index * 2 })) },
  wellnessHistory: { source: "Illustrative design data", observedAt: "2026-11-05T09:24:00+07:00", rows: Array.from({ length: 56 }, (_, index) => ({ date: shiftDate(date, index - 55), hrvMs: [44, 48, 53, 41, 46, null, 50][index % 7], hrv7dMs: [47, 48, 49, 48, 47, 48, 49][index % 7], hrvLowMs: 43, hrvHighMs: 61, rhrBpm: [55, 56, 54, 59, 57, 56, 55][index % 7], sleepMinutes: [410, 385, 440, 350, 390, null, 450][index % 7], sleepNeedMinutes: 450, bodyBatteryHigh: [78, 70, 85, 59, 73, 68, 88][index % 7], bodyBatteryLow: [21, 18, 30, 12, 19, 17, 32][index % 7], bodyBatteryCharge: [60, 54, 62, 42, 55, null, 65][index % 7] })) },
  sources: ["Garmin Connect", "Intervals.icu", "Strava"].map(name => ({ name, status: "Sample", observedAt: "09.24 WIB", detail: "Illustrative data." })),
  coaching: {
    headline: "Keep the next session easy", rationale: "Readiness is low after a moderate recent ride and short sleep, so an easy session will support recovery and keep you on track.", confidence: "Sample assessment",
    actionPlan: {
      title: "Easy spin and a regular meal",
      why: ["Readiness 48/100", "Sleep 6h10m"],
      sections: [
        { kind: "training", title: "Training", items: ["Ride for 35min at conversational effort."] },
        { kind: "fuel", title: "Food & fluids", items: ["Bring water. Have a regular meal with carbohydrates and protein afterward."] },
      ],
      alternative: "Rest if fatigue is still higher than usual.",
      reassess: "Check how your legs feel before the next hard session.",
      referenceIds: ["sport-nutrition"],
    },
    research: [{ id: "sport-nutrition", citation: "Thomas et al. · Journal of the Academy of Nutrition and Dietetics · 2016", url: "https://doi.org/10.1016/j.jand.2015.12.006", application: "Adjust food and fluid intake to the demands of the session." }],
    note: "Do an easy ride of about 35 minutes at a comfortable, conversational effort. Keep it relaxed and focus on feeling smooth. If you still feel low on energy, rest instead and reassess tomorrow.",
    nextSession: { date: shiftDate(date, 1), name: "Easy ride", minutes: 35, target: "Comfortable conversational effort", alternative: "Rest and reassess.", condition: "Illustrative prescription for design preview.", steps: [{ name: "Warm-up", minutes: 8, detail: "Start gently." }, { name: "Main set", minutes: 20, detail: "Keep the effort conversational." }, { name: "Cool-down", minutes: 7, detail: "Ease off gradually." }] },
    findings: [], adjustments: [], feedback: "How did the session feel?", references: [],
  },
  quality: ["All values in this preview are illustrative."],
};
