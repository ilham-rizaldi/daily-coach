import { dailySeries, decimal, duration, formatDate, shiftDate, summarize } from "../src/report.js";

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

export function renderEmail(report, privateUrl) {
  const e = escapeHtml;
  const completedEnd = shiftDate(report.date, -1);
  const sevenDays = summarize(report.activities, shiftDate(report.date, -7), completedEnd);
  const twentyEightDays = summarize(report.activities, shiftDate(report.date, -28), completedEnd);
  const yesterday = summarize(report.activities, shiftDate(report.date, -1), shiftDate(report.date, -1));
  const today = summarize(report.activities, report.date, report.date);
  const session = report.coaching.nextSession;
  const wellness = report.wellness;
  const sleep = Number.isFinite(wellness.sleepMinutes) ? `${Math.floor(wellness.sleepMinutes / 60)}h ${wellness.sleepMinutes % 60}m` : "Unavailable";
  const label = "color:#bfc4ca;font-size:12px;letter-spacing:1px;text-transform:uppercase;";
  const paragraph = "margin:10px 0 18px;font-size:15px;line-height:1.65;color:#e2e4e7;";
  const heading = "margin:0 0 16px;font-size:24px;line-height:1.25;color:#f5f5f6;";
  const section = "padding:28px 0;border-top:1px solid #555b61;";
  const row = (name, value) => `<tr><td style="padding:10px 8px 10px 0;border-bottom:1px solid #3a4046;color:#c6cbd1;font-size:14px;">${e(name)}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #3a4046;color:#f3f4f5;font-size:14px;">${e(value)}</td></tr>`;
  const weekly = dailySeries({ ...report, date: completedEnd }, 7);
  const maxMinutes = Math.max(1, ...weekly.map(day => day.minutes || 0));
  const chartRows = weekly.map(day => `<tr><td style="width:64px;padding:6px 0;color:#bfc4ca;font-size:12px;">${e(formatDate(day.date))}</td><td style="padding:6px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="${Math.max(1, Math.round((day.minutes || 0) / maxMinutes * 100))}%" height="13" bgcolor="${day.minutes ? "#8db55a" : "#394137"}" style="font-size:1px;line-height:1px;">&nbsp;</td><td></td></tr></table></td><td align="right" style="width:58px;color:#f0f2f4;font-size:12px;">${e(decimal(day.minutes))} min</td></tr>`).join("");
  const metric = (name, value, detail, color = "#f5f5f6") => `<td class="metric" width="33%" valign="top" style="padding:18px 10px 18px 0;"><div style="${label}">${e(name)}</div><div style="font-size:29px;line-height:1.4;font-weight:700;color:${color};white-space:nowrap;">${e(value)}</div><div style="font-size:12px;color:#bfc4ca;line-height:1.5;">${e(detail)}</div></td>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>Daily Coach</title><style>@media(max-width:600px){.outer{padding:20px!important}.title{font-size:34px!important}.metric div{font-size:12px}.metric{padding-right:6px!important}}</style></head>
<body style="margin:0;background:#121416;font-family:Arial,Helvetica,sans-serif;color:#f5f5f6;">
<div style="display:none;font-size:1px;color:#121416;max-height:0;overflow:hidden;">${e(report.coaching.headline)}. Your daily training, recovery and next-session plan.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#121416"><tr><td align="center">
<table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;background:#1b1e22;"><tr><td class="outer" style="padding:32px;">
<table role="presentation" width="100%"><tr><td style="font-size:25px;font-weight:700;color:#f5f5f6;">Daily Coach</td><td align="right" style="font-size:12px;color:#c0f77b;">Performance Desk</td></tr></table>
<p style="${label}margin:24px 0 16px;">${e(formatDate(report.date, { weekday: "long", month: "long", year: "numeric" }))} · WIB</p>
<h1 class="title" style="font-size:42px;letter-spacing:-1.2px;line-height:1.12;margin:0 0 18px;color:#ffffff;">${e(report.coaching.headline)}</h1>
<p style="${paragraph}">${e(report.coaching.rationale)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #555b61;border-bottom:1px solid #555b61;"><tr>${metric("Sleep", sleep, `Garmin · score ${wellness.sleepScore ?? "unavailable"}`)}${metric("Readiness", wellness.readiness ?? "Unavailable", "Garmin · latest synced", "#ffc16b")}${metric("Training today", duration(today.seconds), `${today.sessions} completed session${today.sessions === 1 ? "" : "s"}`)}</tr></table>
<div style="padding:25px 0;"><span style="background:#49371e;color:#ffc16b;padding:6px 9px;font-weight:700;font-size:12px;">${e(report.coaching.confidence)}</span><p style="${paragraph}margin-top:16px;">${e(report.coaching.note)}</p><p style="font-size:12px;line-height:1.6;color:#bfc4ca;">Yesterday · ${yesterday.sessions} recorded training sessions. Today is a partial day. ${e(report.sources.find(source => source.name === "Garmin Connect")?.syncAge || "")}</p></div>
<div style="${section}"><h2 style="${heading}">Next session · ${e(formatDate(session.date))}</h2><div style="font-size:25px;font-weight:700;color:#c0f77b;">${e(session.name)}${session.minutes > 0 ? ` · ${session.minutes} minutes` : ""}</div><p style="${paragraph}">${e(session.target)}</p><p style="font-size:14px;line-height:1.6;color:#ffc16b;">${e(session.condition)}</p><table width="100%" cellspacing="0" cellpadding="0">${session.steps.map(step => row(`${step.name}${step.minutes > 0 ? ` · ${step.minutes} min` : ""}`, step.detail)).join("")}</table><p style="${paragraph}"><strong>Lower-effort alternative</strong><br>${e(session.alternative)}</p><a href="${e(privateUrl)}" style="display:inline-block;background:#c0f77b;color:#16200f;padding:15px 20px;border-radius:5px;text-decoration:none;font-size:16px;font-weight:700;">Open my full coaching report</a></div>
<div style="${section}"><h2 style="${heading}">The latest seven completed days</h2><p style="font-size:12px;color:#bfc4ca;line-height:1.6;">${e(formatDate(sevenDays.start))} to ${e(formatDate(sevenDays.end))} · Recorded training minutes</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${chartRows}</table><table width="100%" cellspacing="0" cellpadding="0" style="margin-top:15px;">${row("Training time", duration(sevenDays.seconds))}${row("Sessions / active days", `${sevenDays.sessions} / ${sevenDays.activeDays}`)}${row("Recorded distance", `${decimal(sevenDays.distanceKm, 2)} km · ${sevenDays.missingDistance} missing distances`)}${row("Known Intervals load", `${sevenDays.knownLoad} · ${sevenDays.missingLoad} session${sevenDays.missingLoad === 1 ? "" : "s"} missing load`)}</table><p style="font-size:12px;line-height:1.6;color:#bfc4ca;">28-day context (${e(formatDate(twentyEightDays.start))} to ${e(formatDate(twentyEightDays.end))}) · ${e(duration(twentyEightDays.seconds))} across ${twentyEightDays.sessions} sessions. Today is shown separately as a partial day. Distance totals include available values.</p></div>
<div style="${section}"><h2 style="${heading}">Recovery and load</h2><table width="100%" cellspacing="0" cellpadding="0">${row("Resting heart rate", `${wellness.restingHr ?? "Unavailable"} bpm · 7-day mean ${wellness.restingHr7d ?? "unavailable"}`)}${row("HRV status", wellness.hrvStatus || "Unavailable")}${row("Body Battery", wellness.bodyBattery ?? "Unavailable")}${row("Intervals fitness / fatigue / form", `${report.intervals.fitness ?? "Unavailable"} / ${report.intervals.fatigue ?? "Unavailable"} / ${report.intervals.form ?? "Unavailable"}`)}${row("Garmin acute / chronic load", `${wellness.garminAcuteLoad ?? "Unavailable"} / ${wellness.garminChronicLoad ?? "Unavailable"}`)}${row("Garmin load ratio", wellness.garminLoadRatio ?? "Unavailable")}</table></div>
<div style="${section}"><h2 style="${heading}">Coach interpretation</h2>${report.coaching.findings.map(finding => `<h3 style="font-size:18px;color:#f5f5f6;margin:22px 0 8px;">${e(finding.title)}</h3><p style="${paragraph}">${e(finding.evidence)}</p><p style="font-size:14px;line-height:1.6;color:#bfc4ca;">${e(finding.implication)}</p>`).join("")}</div>
<div style="${section}"><h2 style="${heading}">Adjustments and feedback</h2>${report.coaching.adjustments.map(item => `<p style="${paragraph}">${e(item)}</p>`).join("")}<p style="${paragraph}color:#c0f77b;font-weight:700;">${e(report.coaching.feedback)}</p></div>
<div style="${section}"><h2 style="font-size:18px;color:#f5f5f6;margin:0 0 12px;">Sources and data checks</h2>${report.sources.map(source => `<p style="font-size:12px;line-height:1.6;color:#bfc4ca;"><strong style="color:#f0f2f4;">${e(source.name)}</strong> · ${e(source.status)}<br>${e(source.detail)}<br>Observed ${e(source.observedAt)}${source.syncAge ? ` · ${e(source.syncAge)}` : ""}</p>`).join("")}${report.quality.map(item => `<p style="font-size:12px;line-height:1.6;color:#bfc4ca;">${e(item)}</p>`).join("")}${report.coaching.references.map(reference => `<p style="font-size:12px;"><a href="${e(reference.url)}" style="color:#c0f77b;">${e(reference.title)}</a></p>`).join("")}<p style="font-size:12px;line-height:1.6;color:#bfc4ca;">This private link opens this report. Reports you open are saved encrypted in this browser. Keep the original email for access on another device. Report compiled ${e(new Date(report.compiledAt || report.capturedAt).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }))} WIB.</p></div>
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    `DAILY COACH · ${report.date} · WIB`, report.coaching.headline, report.coaching.rationale,
    `Sleep ${sleep}. Readiness ${wellness.readiness ?? "unavailable"}. ${report.coaching.note}`,
    `Next session ${session.date}: ${session.name}${session.minutes > 0 ? `, ${session.minutes} minutes` : ""}. ${session.target}. ${session.condition}`,
    ...session.steps.map(step => `${step.name}${step.minutes > 0 ? `, ${step.minutes} minutes` : ""}. ${step.detail}`),
    `Alternative. ${session.alternative}`,
    `Latest 7 completed days. ${duration(sevenDays.seconds)}, ${sevenDays.sessions} sessions, ${decimal(sevenDays.distanceKm, 2)} recorded km. ${sevenDays.missingDistance} missing distances.`,
    ...report.coaching.findings.map(finding => `${finding.title}. ${finding.evidence} ${finding.implication}`),
    ...report.coaching.adjustments, report.coaching.feedback,
    `Open the full private report. ${privateUrl}`,
    ...report.quality,
  ].join("\n\n");
  return { subject: `Daily Coach | ${report.date} | ${report.coaching.headline}`, html, text };
}
