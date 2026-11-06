import { shiftDate } from "./report.js";

const date = "2026-11-05";
const minutes = [30, 50, 40, 30, 45, 50, 60, 100, 45, 40, 35, 50, 40, 60, 55, 70, 80, 160, 60, 50, 30, 60, 50, 55, 30, 45, 90, 42];

export const demoReport = {
  schemaVersion: 1, date, capturedAt: "2026-11-05T09:24:00+07:00", athlete: "Riezaldd", preview: true,
  coverage: { start: "2026-09-01", end: date, complete: true, note: "Illustrative training history for layout preview." },
  activities: minutes.map((value, index) => ({ source: "Sample", externalIds: { sample: String(index) }, date: shiftDate(date, index - 27), sport: index % 7 === 0 ? "Weight Training" : index % 7 === 1 ? "Run" : "Ride", name: "Illustrative training session", movingSeconds: value * 60, distanceKm: null, averageHr: null, intervalsLoad: value * (0.5 + index % 4 / 10), intervalsListLoad: value * (0.5 + index % 4 / 10) })).filter((_, index) => index % 7 !== 6),
  wellness: { sleepMinutes: 370, sleepScore: null, readiness: 48, bodyBattery: null, hrvStatus: null, restingHr: null, restingHr7d: null, garminAcuteLoad: 350, garminChronicLoad: 300, garminLoadRatio: 1.2 },
  intervals: { date, fitness: 35, fatigue: 42, form: -7, settings: { activityTypeWeights: { WeightTraining: { fitnessPercent: 0, fatiguePercent: 100 } } } },
  garminLoadHistory: { observedAt: "2026-11-05T09:24:00+07:00", sourceUrl: "https://connect.garmin.com/app/report", method: "Illustrative values only", rows: minutes.map((_, index) => ({ date: shiftDate(date, index - 27), acute: index === 27 ? 350 : [300, 330, 360, 350, 340, 320, 280][index % 7], chronic: 354 - index * 2 })) },
  sources: ["Garmin Connect", "Intervals.icu", "Strava"].map(name => ({ name, status: "Sample", observedAt: "09.24 WIB", detail: "Illustrative data." })),
  coaching: {
    headline: "Keep the next session easy", rationale: "Readiness is low after a moderate recent ride and short sleep, so an easy session will support recovery and keep you on track.", confidence: "Sample assessment",
    note: "Do an easy ride of about 35 minutes at a comfortable, conversational effort. Keep it relaxed and focus on feeling smooth. If you still feel low on energy, rest instead and reassess tomorrow.",
    nextSession: { date: shiftDate(date, 1), name: "Easy ride", minutes: 35, target: "Comfortable conversational effort", alternative: "Rest and reassess.", condition: "Illustrative prescription for design preview.", steps: [{ name: "Warm-up", minutes: 8, detail: "Start gently." }, { name: "Main set", minutes: 20, detail: "Keep the effort conversational." }, { name: "Cool-down", minutes: 7, detail: "Ease off gradually." }] },
    findings: [], adjustments: [], feedback: "How did the session feel?", references: [],
  },
  quality: ["All values in this preview are illustrative."],
};
