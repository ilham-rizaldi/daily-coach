import { shiftDate } from "./report.js";

const date = "2026-11-05";
const minutes = [30, 50, 40, 30, 45, 50, 60, 100, 45, 40, 35, 50, 40, 60, 55, 70, 80, 160, 60, 50, 30, 60, 50, 55, 30, 45, 90, 42];

export const demoReport = {
  schemaVersion: 1, date, capturedAt: "2026-11-05T09:24:00+07:00", athlete: "Riezaldd", preview: true,
  coverage: { start: "2026-09-01", end: date, complete: true, note: "Illustrative training history for layout preview." },
  activities: minutes.map((value, index) => ({ source: "Sample", externalIds: { sample: String(index) }, date: shiftDate(date, index - 27), sport: "Ride", name: "Sample endurance ride", movingSeconds: value * 60, distanceKm: null, averageHr: null, intervalsLoad: null })),
  wellness: { sleepMinutes: 370, sleepScore: null, readiness: 48, bodyBattery: null, hrvStatus: null, restingHr: null, restingHr7d: null, garminAcuteLoad: null, garminChronicLoad: null, garminLoadRatio: null },
  intervals: { fitness: null, fatigue: null, form: null },
  sources: ["Garmin Connect", "Intervals.icu", "Strava"].map(name => ({ name, status: "Sample", observedAt: "09.24 WIB", detail: "Illustrative data." })),
  coaching: {
    headline: "Keep the next session easy", rationale: "Readiness is low after a moderate recent ride and short sleep, so an easy session will support recovery and keep you on track.", confidence: "Sample assessment",
    note: "Do an easy ride of about 35 minutes at a comfortable, conversational effort. Keep it relaxed and focus on feeling smooth. If you still feel low on energy, rest instead and reassess tomorrow.",
    nextSession: { date: shiftDate(date, 1), name: "Easy ride", minutes: 35, target: "Comfortable conversational effort", alternative: "Rest and reassess.", condition: "Illustrative prescription for design preview.", steps: [{ name: "Warm-up", minutes: 8, detail: "Start gently." }, { name: "Main set", minutes: 20, detail: "Keep the effort conversational." }, { name: "Cool-down", minutes: 7, detail: "Ease off gradually." }] },
    findings: [], adjustments: [], feedback: "How did the session feel?", references: [],
  },
  quality: ["All values in this preview are illustrative."],
};
