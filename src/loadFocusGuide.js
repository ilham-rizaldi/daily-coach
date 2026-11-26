export const loadFocusGuide = {
  lowAerobic: {
    cycling: ["Power Z1–Z2", "Easy spin or steady endurance"],
    running: ["HR Z1–Z2", "Conversational run or run–walk"],
  },
  highAerobic: {
    cycling: ["Power Z3–Z5", "Tempo, threshold or longer VO₂ intervals"],
    running: ["HR Z3–Z4", "Tempo or threshold. Longer VO₂ reps may reach Z5."],
  },
  anaerobic: {
    cycling: ["Power Z6", "Short hard reps with easy recoveries. Sprints can reach Z7."],
    running: ["Pace + perceived effort", "Short fast reps with easy recoveries"],
  },
};

export const loadFocusGuideSources = [
  { title: "Garmin Training Load Focus", url: "https://www.garmin.com/en-US/garmin-technology/running-science/physiological-measurements/training-load-focus/" },
  { title: "Garmin Training Effect", url: "https://support.garmin.com/en-US/?faq=Vi2undejXR5Mmq662o4lO9" },
  { title: "Garmin five-zone heart-rate model", url: "https://support.garmin.com/en-US/?faq=w8qlOr7BQ16Z82HVrevpw9" },
  { title: "Coggan cycling power zones", url: "https://www.trainingpeaks.com/blog/power-training-levels/" },
  { title: "Seiler & Kjerland · endurance intensity distribution", url: "https://pubmed.ncbi.nlm.nih.gov/16430681/" },
];

export const loadFocusGuideMethod = "Cycling uses Coggan’s seven power zones. Running uses a five-zone HR guide for sustained work. For short reps, use pace or power and perceived effort because heart rate rises with a delay. Garmin classifies the session by Training Effect. One session can span several zones.";

export function loadFocusAction(bucket, status) {
  if (status === "above") return bucket === "lowAerobic"
    ? "Ease back on endurance volume."
    : "Space out hard sessions.";
  if (status === "within") return "Keep your planned frequency.";
  if (status === "below") return "Consider this in your next plan after checking recovery.";
  return null;
}
