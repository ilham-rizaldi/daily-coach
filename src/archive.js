import { validateReport } from "./report.js";

export async function openArchive(key, payload) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Error("Use the complete private link from your coaching email.");
  if (payload.version !== 1 || payload.algorithm !== "AES-256-GCM") throw new Error("This archive format is unsupported.");
  const decode = value => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("raw", decode(key), "AES-GCM", false, ["decrypt"]);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(payload.iv), additionalData: new TextEncoder().encode("daily-coach-v1") }, cryptoKey, decode(payload.ciphertext));
  } catch {
    throw new Error("The access key could not unlock this archive. Open the latest private link from your coaching email.");
  }
  if (payload.compression === "gzip") {
    const stream = new Blob([plaintext]).stream().pipeThrough(new DecompressionStream("gzip"));
    plaintext = await new Response(stream).arrayBuffer();
  }
  const archive = JSON.parse(new TextDecoder().decode(plaintext));
  if (!Array.isArray(archive.reports) || !archive.reports.length) throw new Error("The archive has no reports yet.");
  return archive;
}

export function payloadFromFragment(fragment) {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  const ciphertext = params.get("data");
  const iv = params.get("iv");
  if (!ciphertext && !iv) return null;
  if (!ciphertext || !iv) throw new Error("This private report link is incomplete. Copy the full link from your coaching email.");
  if (ciphertext.length > 2000000 || !/^[A-Za-z0-9_-]+$/.test(ciphertext) || !/^[A-Za-z0-9_-]{16}$/.test(iv)) {
    throw new Error("This private report link is incomplete or invalid.");
  }
  return { version: 1, algorithm: "AES-256-GCM", compression: "gzip", iv, ciphertext };
}

export function parseAccessInput(value, currentFragment = "") {
  const input = String(value || "").trim();
  let fragment = currentFragment;
  let key = input;
  if (input.startsWith("#")) {
    fragment = input;
    key = "";
  } else if (/^https?:\/\//i.test(input)) {
    try { fragment = new URL(input).hash; } catch { throw new Error("Copy the complete private link from your coaching email."); }
    key = "";
  }
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  key ||= params.get("key") || "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Error("Paste the complete private link from your email, or enter its 43-character access key.");
  return { key, incoming: payloadFromFragment(fragment) };
}

export async function unlockReports(key, incoming, stored = []) {
  const saved = Array.isArray(stored) ? stored.slice(0, 360) : [];
  const candidates = incoming ? [incoming, ...saved.filter(item => item?.iv !== incoming.iv)] : saved;
  const byDate = {};
  let selectedDate;
  for (const payload of candidates) {
    try {
      const archive = await openArchive(key, payload);
      const validated = archive.reports.map(validateReport);
      if (payload === incoming) selectedDate = validated[0]?.date;
      for (const report of validated) {
        if (!byDate[report.date]) byDate[report.date] = { report, payload };
      }
    } catch (error) {
      if (payload === incoming) throw error;
    }
  }
  let reports = Object.values(byDate).map(item => item.report).sort((a, b) => b.date.localeCompare(a.date));
  if (reports.length > 180) {
    const selected = reports.find(report => report.date === selectedDate);
    reports = reports.slice(0, 180);
    if (selected && !reports.includes(selected)) reports = [...reports.slice(0, 179), selected].sort((a, b) => b.date.localeCompare(a.date));
  }
  if (!reports.length) throw new Error("No saved report is available on this device. Paste the complete private link from your coaching email.");
  const reportPayloads = Object.fromEntries(reports.map(report => [report.date, byDate[report.date].payload]));
  const payloads = [...new Set(Object.values(reportPayloads))];
  return { reports, reportPayloads, payloads, reportIndex: Math.max(0, reports.findIndex(report => report.date === selectedDate)) };
}
